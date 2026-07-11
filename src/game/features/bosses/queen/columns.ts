/**
 * Columnas de la Reina del Enjambre (GDD §15.3 rediseño 2026-07-10,
 * docs/plans/QUEEN_REDESIGN_PLAN.md): su vida real está en las columnas de su
 * sala, no en su cuerpo. Embestidas del héroe contra ellas y conteo de
 * columnas rotas (usado por `queen/pattern.ts::queenStepMove` para acelerar
 * su persecución).
 */

import { RAM_SPEED_THRESHOLD } from '@/game/features/combat/constants';
import { applyDamageToEnemy } from '@/game/features/combat/combat';
import { pushEvent, type EventQueue } from '@/engine/events';
import type { Vec2 } from '@/engine/geometry';
import type { BossState, Enemy, World } from '@/game/world/types';
import { QUEEN_COLUMN_DAMAGE_FRACTION, QUEEN_COLUMN_HIT_COOLDOWN, QUEEN_COLUMN_STUN_DURATION, QUEEN_COLUMN_TOUCH_SKIN, QUEEN_LARVA_ID_PREFIX } from './constants';

/**
 * Columna destructible de la sala de la Reina (GDD §15.3 rediseño 2026-07-10):
 * su vida ESTÁ en estas columnas. Se rompe solo a embestidas (2 golpes; hp
 * 2→1 agrietada→0 rota). Al romperse se retira su Obstacle sólido de
 * world.obstacles y baja la vida del jefe.
 */
export interface QueenColumn {
  id: string; // mismo id que su Obstacle en world.obstacles
  position: Vec2; // centro
  halfW: number;
  halfH: number;
  hp: number; // QUEEN_COLUMN_HP → 1 (agrietada) → 0 (rota)
  broken: boolean;
  roomId?: string;
}

/**
 * Estado propio de la Reina del Enjambre en el slot opaco `World.bossState`
 * (GDD §15.3): su vida vive en `columns`. El core no conoce este tipo — solo
 * ve `BossState`; `queenState` es el ÚNICO sitio que hace el type-guard.
 */
export interface QueenState extends BossState {
  bossId: 'queen';
  columns: QueenColumn[];
}

/**
 * Estado vacío seguro que devuelve `queenState` cuando el mundo aún no tiene a
 * la Reina inicializada (sala sin reina, o antes de `queenOnInit`). Congelado
 * para que un consumidor no lo mute por accidente: solo se lee (longitud 0 →
 * todos los bucles no hacen nada). Así `QueenColumnsView` puede montar siempre
 * (GameRoot lo monta incondicionalmente) sin romper en salas sin reina.
 */
const EMPTY_QUEEN_STATE: QueenState = Object.freeze({
  bossId: 'queen' as const,
  columns: [] as QueenColumn[],
});

/**
 * Accessor tipado del estado de la Reina desde el slot opaco `world.bossState`
 * (type-guard sobre `bossId`, el ÚNICO `as` del feature). Devuelve el estado
 * vivo si la Reina está inicializada, o `EMPTY_QUEEN_STATE` (vacío seguro) si
 * no — nunca null, para que los consumidores lean `.columns` sin comprobar.
 */
export function queenState(world: World): QueenState {
  const state = world.bossState;
  if (state !== null && state.bossId === 'queen') return state as QueenState;
  return EMPTY_QUEEN_STATE;
}

/** Nº de columnas ROTAS de la sala de la Reina (playtest 2026-07-10: su persecución acelera con esto). */
export function queenBrokenColumnCount(world: World, boss: Enemy): number {
  const columns = queenState(world).columns;
  let count = 0;
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    if (c.broken && (c.roomId === undefined || c.roomId === boss.roomId)) count++;
  }
  return count;
}

/**
 * Embestidas del héroe contra las columnas de la Reina (GDD §15.3 rediseño
 * 2026-07-10): solo la embestida (velocidad ≥ RAM_SPEED_THRESHOLD) resta vida
 * a una columna; 2 golpes la rompen (el 1.º la agrieta). Al romperse se retira
 * su Obstacle sólido y el jefe pierde QUEEN_COLUMN_DAMAGE_FRACTION de su vida.
 * Cooldown por columna (mismo mapa de contacto) para que un choque cuente 1 vez.
 */
export function stepQueenColumns(world: World, cooldowns: Map<string, number>, events: EventQueue): void {
  const columns = queenState(world).columns;
  if (columns.length === 0) return;

  const hero = world.hero;
  const speed = Math.hypot(hero.velocity.x, hero.velocity.y);
  const ramming = speed >= RAM_SPEED_THRESHOLD;

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (col.broken) continue;
    if (col.roomId !== undefined && col.roomId !== world.currentRoomId) continue;

    // Solapamiento círculo(héroe)-vs-AABB(columna). `stepHeroPhysics` ya
    // resuelve esta colisión (la columna sigue siendo un Obstacle sólido
    // mientras no está rota) ANTES de este paso en el mismo tick: al llegar
    // aquí el héroe queda exactamente tangente al borde (push-out), no
    // solapado — de ahí el margen QUEEN_COLUMN_TOUCH_SKIN (ver constants.ts).
    const minX = col.position.x - col.halfW;
    const maxX = col.position.x + col.halfW;
    const minY = col.position.y - col.halfH;
    const maxY = col.position.y + col.halfH;
    const nearestX = hero.position.x < minX ? minX : hero.position.x > maxX ? maxX : hero.position.x;
    const nearestY = hero.position.y < minY ? minY : hero.position.y > maxY ? maxY : hero.position.y;
    const dx = hero.position.x - nearestX;
    const dy = hero.position.y - nearestY;
    const rr = hero.radius + QUEEN_COLUMN_TOUCH_SKIN;
    if (dx * dx + dy * dy > rr * rr) continue;
    if (!ramming) continue;

    const lastHit = cooldowns.get(col.id) ?? -Infinity;
    if (world.time - lastHit < QUEEN_COLUMN_HIT_COOLDOWN) continue;
    cooldowns.set(col.id, world.time);

    col.hp -= 1;
    if (col.hp > 0) {
      // Cada golpe que NO rompe avisa (hp 2 y 1 con QUEEN_COLUMN_HP=3): el
      // render deriva el aspecto de daño de `col.hp`.
      pushEvent(events, 'boss-column-cracked', col.position.x, col.position.y, 1);
    }
    if (col.hp <= 0) {
      col.broken = true;
      const idx = world.obstacles.findIndex((o) => o.id === col.id);
      if (idx >= 0) world.obstacles.splice(idx, 1);

      // Sus guardianas caen con ella (rediseño 2026-07-10): las larvas
      // guardianas (chasing=false) ancladas (patrolFrom) al centro de esta
      // columna mueren al romperla — "la columna cae y su defensora con ella".
      for (let g = 0; g < world.enemies.length; g++) {
        const e = world.enemies[g];
        if (e.hp <= 0 || e.chasing || !e.id.startsWith(QUEEN_LARVA_ID_PREFIX)) continue;
        if (Math.abs(e.patrolFrom.x - col.position.x) < 0.01 && Math.abs(e.patrolFrom.y - col.position.y) < 0.01) {
          e.hp = 0;
        }
      }

      const boss = world.enemies.find(
        (e) => e.kind === 'boss' && e.bossId === 'queen' && (e.roomId === undefined || e.roomId === col.roomId),
      );
      if (boss && boss.hp > 0) {
        applyDamageToEnemy(world, boss, boss.maxHp * QUEEN_COLUMN_DAMAGE_FRACTION, 0, 0, events, true);
        // La Reina queda ATURDIDA (vulnerable, daño completo) un rato tras
        // romperle una columna (playtest 2026-07-10: "si le atacas justo al
        // romper una columna, ahí sí le haces más daño"). Si con ESTA rotura ya
        // no le queda ninguna columna en pie, pasa a vulnerable PERMANENTE
        // (Infinity): el último 1/3 de vida se remata a golpes normales.
        const anyLeft = columns.some(
          (c) => !c.broken && (c.roomId === undefined || c.roomId === col.roomId),
        );
        boss.bossVulnerableUntil = anyLeft ? world.time + QUEEN_COLUMN_STUN_DURATION : Infinity;
        if (!anyLeft) pushEvent(events, 'boss-columns-cleared', boss.position.x, boss.position.y, 1);
      }
      pushEvent(events, 'boss-column-broken', col.position.x, col.position.y, 1);
    }
  }
}
