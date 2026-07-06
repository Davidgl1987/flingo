/**
 * Framework de jefes (GDD §15.1, Fase B0 de docs/plans/BOSSES_PLAN.md).
 *
 * Contratos implementados aquí (comunes a cualquier jefe futuro; B1-B4 solo
 * añaden una entrada a `content/bosses.ts` + sus `stepPattern`):
 *  - Fases por umbral de vida (66%/33%) con evento `boss-phase-changed`.
 *  - Telegraph (aviso ≥0.6s) y ventana de vulnerabilidad explícita, ya
 *    representados como campos escalares en `Enemy` (world.ts) y mutados por
 *    el `stepPattern` de cada jefe.
 *  - Regla de daño por ventana: fuera de ventana, daño reducido/nulo según
 *    `BossDef.damageOutsideWindow`.
 *  - Techo de daño de un único golpe del jefe al héroe (helper compartido).
 *  - Puerta sellada al entrar en la sala de jefe; clímax + apertura + victory
 *    al morir (reutiliza el pipeline de juice existente vía eventos).
 *
 * SIN imports de React ni three.js. `content/bosses.ts` es la única pieza
 * "de contenido" que este módulo conoce (igual que sim/upgrades.ts conoce
 * su propio pool, aunque ese vive en el mismo fichero por historia; aquí se
 * separa en content/ porque el GDD pide una tabla por jefe ampliable sin
 * tocar el framework).
 */

import { getBossDef } from '../content/bosses';
import { closeConnection } from './dungeon-world';
import { pushEvent, type EventQueue } from './events';
import type { BossId, Enemy, World } from './world';

/** true si el enemigo dado es un jefe vivo o muerto (kind==='boss'), para narrowing en los llamadores. */
export function isBoss(enemy: Enemy): enemy is Enemy & { bossId: BossId } {
  return enemy.kind === 'boss' && enemy.bossId !== undefined;
}

/**
 * Se llama una vez, justo tras construir el mundo (world.ts::createWorld /
 * dungeon-world.ts::createDungeonWorld no pueden importar content/bosses.ts
 * sin crear un ciclo: sim/ → content/ está permitido, content/ → sim/ está
 * permitido, pero world.ts es sim/ y bosses.ts importa sim/world.ts, así que
 * world.ts NO puede importar bosses.ts de vuelta). Sobrescribe hp/maxHp del
 * placeholder de `createEnemy` con el valor real de `BossDef.maxHp`.
 */
export function initBossEnemies(world: World): void {
  // No se puede iterar `world.enemies` directamente con un `for...of` mientras
  // `onInit` le hace `.push` (la Reina, GDD §15.3, reserva sus slots de larva
  // aquí): un `for` clásico sobre el array vivo bastaría, pero como `onInit`
  // solo debe ver al jefe ya inicializado (hp/radius reales) se resuelve en
  // dos pasadas separadas, sin ambigüedad sobre qué entradas son "el jefe".
  const bosses = world.enemies.filter(isBoss);
  for (const enemy of bosses) {
    const def = getBossDef(enemy.bossId);
    enemy.maxHp = def.maxHp;
    enemy.hp = def.maxHp;
    // Radio real del jefe (colisión Y render escalan con él): sin esto el
    // Guardián colisionaba y se veía como un enemigo normal de 0.4 (bug B1).
    if (def.radius !== undefined) enemy.radius = def.radius;
    enemy.bossDamageOutsideWindowFactor = def.damageOutsideWindow;
  }
  for (const enemy of bosses) {
    getBossDef(enemy.bossId).onInit?.(world, enemy);
  }
}

/** Umbrales de fase (GDD §15.1 punto 3): 66% → fase 2, 33% → fase 3. */
const PHASE_2_THRESHOLD = 0.66;
const PHASE_3_THRESHOLD = 0.33;

function phaseForHpFraction(fraction: number): 1 | 2 | 3 {
  if (fraction <= PHASE_3_THRESHOLD) return 3;
  if (fraction <= PHASE_2_THRESHOLD) return 2;
  return 1;
}

/**
 * Comprueba el umbral de vida del jefe y aplica el cambio de fase si
 * corresponde; si acaba de morir (hp llega a 0 este tick), emite el clímax
 * `boss-defeated` una única vez. Se llama cada tick para TODO jefe vivo,
 * después de que combat.ts/hazards.ts ya hayan resuelto cualquier daño de ese
 * tick (mismo patrón que `collectDeadDrops` en step.ts: reacciona a hp<=0 en
 * vez de interceptar cada llamada a applyDamageToEnemy, que ya es boss-aware
 * por sí sola vía `bossDamageOutsideWindowFactor`, ver combat.ts).
 */
function checkPhaseAndDefeat(world: World, boss: Enemy, events: EventQueue): void {
  if (boss.hp <= 0) {
    // world.bossDefeatedEmitted: guarda por id qué jefes ya emitieron su
    // clímax, para no repetirlo en cada tick tras la muerte (el jefe sigue
    // en world.enemies, solo invisible, igual que cualquier otro enemigo).
    if (world.bossDefeatedEmitted.has(boss.id)) return;
    world.bossDefeatedEmitted.add(boss.id);
    pushEvent(events, 'boss-defeated', boss.position.x, boss.position.y, 1);
    return;
  }

  const fraction = boss.hp / boss.maxHp;
  const nextPhase = phaseForHpFraction(fraction);
  if (nextPhase === boss.bossPhase) return;

  boss.bossPhase = nextPhase;
  pushEvent(events, 'boss-phase-changed', boss.position.x, boss.position.y, nextPhase, String(nextPhase));

  if (boss.bossId !== undefined && (nextPhase === 2 || nextPhase === 3)) {
    getBossDef(boss.bossId).onPhaseChanged?.(world, boss, nextPhase);
  }
}

/**
 * Techo de daño de un único golpe de jefe al héroe (GDD §15.1 punto 6):
 * fracción de la vida MÁXIMA del héroe según la fase actual del jefe.
 * Helper compartido: cada `stepPattern` debe pasar su daño bruto por aquí
 * antes de llamar a `applyDamageToHero`.
 */
export function capBossHitDamage(heroMaxHp: number, boss: Enemy, rawDamage: number): number {
  if (boss.bossId === undefined) return rawDamage;
  const def = getBossDef(boss.bossId);
  const cap = def.hitDamageCapFraction[boss.bossPhase - 1] * heroMaxHp;
  return Math.min(rawDamage, Math.max(1, Math.floor(cap)));
}

/**
 * Avanza el patrón de todos los jefes vivos de la sala actual un tick y
 * comprueba fase/derrota de TODO jefe (vivo o recién muerto este tick).
 */
export function stepBosses(world: World, dt: number, events: EventQueue): void {
  for (const enemy of world.enemies) {
    if (!isBoss(enemy)) continue;

    if (enemy.hp > 0) {
      // Contención por sala (mismo criterio que el resto de la IA, ver
      // ai.ts canAggro): un jefe fuera de la sala actual del héroe no
      // avanza su patrón — no aplica en la práctica porque el jefe vive
      // solo en su propia sala de jefe, pero mantiene el invariante si
      // algún jefe futuro compartiera sala con otras entidades multi-sala.
      if (enemy.roomId === undefined || enemy.roomId === world.currentRoomId) {
        getBossDef(enemy.bossId).stepPattern(world, enemy, dt, events);
      }
    }

    checkPhaseAndDefeat(world, enemy, events);
  }
}

/**
 * Sellado de la sala de jefe (GDD §15.1 punto 7): en cuanto el héroe está
 * físicamente dentro de la sala de jefe (ya con la puerta de llave abierta,
 * ver stepBossDoorKeyCheck en step.ts) y el jefe sigue vivo, se cierra la
 * conexión de nuevo — no hay ir y volver a por mejoras a mitad combate. Es
 * idempotente (closeConnection no hace nada si ya está cerrada) y barato de
 * llamar cada tick: sin cambios, no reconstruye nada.
 */
export function stepBossDoorSeal(world: World, events: EventQueue): void {
  const dungeon = world.dungeon;
  if (!dungeon) return;
  if (world.currentRoomId !== dungeon.bossRoomId) return;

  const runtime = world.roomRuntimes.get(dungeon.bossRoomId);
  if (!runtime) return;

  const bossAlive = world.enemies.some((e) => e.roomId === dungeon.bossRoomId && isBoss(e) && e.hp > 0);
  if (!bossAlive) return;

  for (const door of runtime.doors) {
    if (!door.open) continue;
    closeConnection(world, door.connectionIndex);
    pushEvent(events, 'boss-door-sealed', door.center.x, door.center.y, 1);
  }
}
