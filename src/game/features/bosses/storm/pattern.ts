/**
 * La Tormenta (GDD §15.5, Fase B4): jefe de esquive puro. Los 3 generadores de
 * balas (espiral/anillos/ráfaga radial) con pasillo garantizado por
 * construcción viven en `./patterns.ts` (NO tocado por esta fase: cabecera =
 * CONTRATO PARA EL INTEGRADOR); este fichero monta la máquina de estados
 * alrededor: ciclo IDLE breve → telegraph propio por patrón → ejecución
 * (steppers hasta que terminan) → recarga = ventana de vulnerabilidad.
 *
 * Reuso de campos escalares de `Enemy` (mismo espíritu que Guardián/Reina/
 * Prisma, ver sus respectivos `pattern.ts`): La Tormenta nunca pasa por
 * `stepEnemyAi`, así que:
 * - `bossStage`: sub-máquina del ciclo (STORM_STAGE_IDLE/TELEGRAPH/EXECUTE/
 *   RELOAD, ver machine-constants.ts).
 * - `bossTimer`: cuenta atrás dentro de `bossStage` (idle, telegraph, recarga).
 *   Durante EXECUTE no se usa (los steppers de `patterns.ts` llevan su propio
 *   reloj en `StormState`, colgado de `world.bossState`); avanzar/terminar el
 *   patrón se decide por el valor de retorno de `stepSpiral`/`stepRings`.
 * - `bossCounter`: índice del patrón de ESTE ciclo (STORM_PATTERN_*) — el que
 *   se está telegrafiando/ejecutando, o el YA DECIDIDO para el ciclo que
 *   viene mientras el jefe todavía está en IDLE/RELOAD. Tuning post-playtest
 *   2026-07-15 (David: "telegrafía un poco más el siguiente ataque por el
 *   movimiento del aro"): la selección se ADELANTÓ de `stormEnterTelegraph`
 *   a `stormEnterReload` (se decide el próximo patrón nada más terminar el
 *   actual, no al final del idle que sigue a la recarga) para que el render
 *   (`EnemyViews.tsx`) pueda leer YA `enemy.bossCounter` durante la segunda
 *   mitad de la recarga y animar el aro en consecuencia — sin esto no había
 *   forma de insinuar el patrón antes de que arrancara su telegraph propio.
 *   No hizo falta un campo nuevo: `bossCounter` ya viaja en `Enemy` y su
 *   significado ("el patrón de este ciclo") no cambia, solo CUÁNDO se fija.
 *   Único caso en que sigue "vacío": justo tras `onInit`, antes del primer
 *   ciclo, vale -1 ("sin decidir todavía" — no hay recarga previa que lo
 *   haya podido adelantar) y es `stormEnterTelegraph` quien lo decide como
 *   fallback, igual que antes de este cambio.
 * - `bossTelegraphUntil`/`bossTelegraphKind`: telegraph estándar del
 *   framework durante TELEGRAPH (kind = STORM_TELEGRAPH_KIND[patrón]); en
 *   EXECUTE se conserva el mismo `bossTelegraphKind` (con `bossTelegraphUntil`
 *   a 0, así el anillo ámbar genérico se apaga pero el render puede seguir
 *   distinguiendo qué patrón está en marcha) y en RELOAD pasa a
 *   STORM_RELOAD_KIND (pose de recarga, GDD §15.5 "aviso visual claro"). A
 *   diferencia de `bossCounter`, este string SÍ se limpia a '' durante el
 *   tramo IDLE (ver el `case STORM_STAGE_RELOAD` de más abajo) — el render
 *   no lo necesita para insinuar el patrón (usa `bossCounter` directamente,
 *   ver arriba), así que no hacía falta tocar ese reseteo.
 * - `bossVulnerable`/`bossVulnerableUntil`: ventana de vulnerabilidad
 *   estándar (derivada del reloj absoluto cada tick, igual criterio que
 *   Prisma/Reina): SOLO abierta durante RELOAD.
 * - `patrolForward` (reutilizado como booleano libre; La Tormenta no
 *   patrulla): true = "ya encadenó este ciclo" (fase 3, GDD §15.5: espiral→
 *   anillos sin pausa antes de recargar). Se resetea a false en
 *   `stormEnterReload` (antes vivía en `stormEnterTelegraph`; se movió junto
 *   con la selección de patrón, ver arriba — el momento que importa es
 *   "antes de que la próxima EXECUTE pueda encadenar", y eso sigue
 *   cumpliéndose igual de temprano) para que el encadenado solo pueda pasar
 *   una vez por ciclo.
 *
 * Estado propio (los campos del generador: centro de emisión congelado,
 * relojes de ola de espiral/anillo) vive en `world.bossState` como
 * `StormState` (importado de `./patterns.ts`, SIN wrapper propio): una vez
 * que `'storm'` está en `BossId` (world/types.ts), `StormState` ya satisface
 * estructuralmente `BossState` (su único campo requerido es
 * `readonly bossId: BossId`), así que no hace falta ni un `extends` explícito
 * ni un tipo intermedio — solo el accessor tipado `stormState()` de abajo
 * (mismo patrón de un único `as` que `queen/columns.ts::queenState`).
 */

import { fireEnemyProjectile } from '@/game/features/combat/combat';
import { pushEvent, type EventQueue } from '@/engine/events';
import type { Rng } from '@/engine/rng';
import type { Enemy, World } from '@/game/world/types';
import { bossRoomBounds, moveBossTowardWithAvoidance } from '@/game/features/bosses/movement';
import { dropPotionAt } from '@/game/features/items/items';
import {
  createStormState,
  fireRadialBurst,
  resetRings,
  resetSpiral,
  stepRings,
  stepSpiral,
  type StormEmit,
  type StormState,
} from './patterns';
import {
  STORM_DRIFT_ANGULAR_SPEED,
  STORM_DRIFT_RADIUS,
  STORM_DRIFT_SPEED,
  STORM_HIT_DAMAGE_CAP_FRACTION,
  STORM_IDLE_DURATION_BY_PHASE,
  STORM_PATTERN_COUNT,
  STORM_PATTERN_RINGS,
  STORM_PATTERN_SPIRAL,
  STORM_RELOAD_DURATION_BY_PHASE,
  STORM_RELOAD_KIND,
  STORM_STAGE_EXECUTE,
  STORM_STAGE_IDLE,
  STORM_STAGE_RELOAD,
  STORM_STAGE_TELEGRAPH,
  STORM_TELEGRAPH_DURATION_BY_PHASE,
  STORM_TELEGRAPH_KIND,
} from './machine-constants';

/**
 * Estado vacío seguro (mismo criterio que `queen/columns.ts::EMPTY_QUEEN_STATE`):
 * nunca se muta, solo se devuelve cuando `world.bossState` todavía no es el de
 * La Tormenta (sala sin este jefe, o antes de `stormOnInit`).
 */
const EMPTY_STORM_STATE: StormState = Object.freeze(createStormState());

/** Accessor tipado del estado de La Tormenta desde el slot opaco `world.bossState` (el único `as` de este módulo). */
function stormState(world: World): StormState {
  const state = world.bossState;
  if (state !== null && state.bossId === 'storm') return state as StormState;
  return EMPTY_STORM_STATE;
}

/**
 * `StormEmit` ligado a `fireEnemyProjectile`, CREADO UNA VEZ a nivel de
 * módulo (contrato de `patterns.ts`: "reutilízalo cada tick", cero
 * asignaciones — con hasta ~30 balas emitidas en un solo tick de anillo/
 * ráfaga, crear un closure por bala sería el hot-path real). Como la firma de
 * `StormEmit` no lleva `world` (solo escalares, ver cabecera de
 * `patterns.ts`), el mundo/fase vigentes se guardan en estas dos variables de
 * módulo, reescritas (asignación simple, no allocación) al principio de cada
 * `stormStepPattern` — el mismo objeto `World` persiste mutado durante toda
 * la sesión, así que esto es seguro incluso si algún test crea varios mundos
 * secuenciales: cada `stormStepPattern` deja las variables apuntando al
 * mundo/fase correctos ANTES de que el propio tick pueda emitir nada.
 */
let stormWorldRef: World | null = null;
let stormBossPhaseRef: 1 | 2 | 3 = 1;

/**
 * Mismo cálculo que `bosses/lifecycle.ts::capBossHitDamage`, inline para no
 * importarlo (evitaría un ciclo: `storm/pattern.ts` → `lifecycle.ts` →
 * `registry.ts` → `storm/pattern.ts`; mismo criterio que
 * `prisma/pattern.ts::prismaCapHitDamage`).
 */
function stormCapHitDamage(heroMaxHp: number, phase: 1 | 2 | 3, rawDamage: number): number {
  const cap = STORM_HIT_DAMAGE_CAP_FRACTION[phase - 1] * heroMaxHp;
  return Math.min(rawDamage, Math.max(1, Math.floor(cap)));
}

const stormEmit: StormEmit = (originX, originY, dirX, dirY, speed, damage, radius) => {
  const world = stormWorldRef;
  if (!world) return;
  const capped = stormCapHitDamage(world.hero.maxHp, stormBossPhaseRef, damage);
  fireEnemyProjectile(world, originX, originY, dirX, dirY, speed, capped, radius);
};

/**
 * Deriva ambiental (GDD §15.5: "flota lentamente cerca del centro"): órbita
 * lenta y pequeña alrededor del centro de la sala, correa implícita (nunca se
 * aleja más que `STORM_DRIFT_RADIUS`). Reutiliza el movimiento genérico de
 * jefes (`moveBossTowardWithAvoidance`) igual que Guardián/Reina/Prisma; la
 * sala de La Tormenta está completamente despejada (GDD §15.5), así que la
 * evitación de obstáculos nunca entra en juego aquí, pero mantiene el mismo
 * patrón compartido en vez de escribir la posición a mano.
 */
function stormStepDrift(world: World, boss: Enemy, dt: number): void {
  const bounds = bossRoomBounds(world, boss);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const angle = world.time * STORM_DRIFT_ANGULAR_SPEED;
  const tx = cx + Math.cos(angle) * STORM_DRIFT_RADIUS;
  const ty = cy + Math.sin(angle) * STORM_DRIFT_RADIUS;
  moveBossTowardWithAvoidance(world, boss, tx, ty, dt, STORM_DRIFT_SPEED);
}

/**
 * Elige el próximo patrón con `rng`, excluyendo `previous` (GDD §15.5: nunca
 * el mismo dos veces seguidas). `previous < 0` (solo en el primer ciclo tras
 * `onInit`) no excluye nada: los 3 patrones son igual de probables la
 * primera vez.
 */
function stormPickPattern(rng: Rng, previous: number): number {
  if (previous < 0) return Math.floor(rng() * STORM_PATTERN_COUNT);
  let idx = Math.floor(rng() * (STORM_PATTERN_COUNT - 1));
  if (idx >= previous) idx += 1;
  return idx;
}

/**
 * Entra en TELEGRAPH: anuncia el patrón y arma el reloj. Normalmente el
 * patrón YA fue decidido por `stormEnterReload` al terminar el ciclo
 * anterior (`boss.bossCounter` ya trae un índice válido, ver comentario de
 * cabecera del fichero) — aquí solo se consume. El único caso en que hay que
 * decidirlo aquí es el primer ciclo tras `onInit` (`bossCounter === -1`,
 * "sin previo": no hubo recarga anterior que lo adelantara), y ese caso no
 * excluye ningún patrón (los 3 son igual de probables la primera vez, mismo
 * criterio que antes de este cambio).
 */
function stormEnterTelegraph(world: World, boss: Enemy, events: EventQueue): void {
  if (boss.bossCounter < 0) boss.bossCounter = stormPickPattern(world.rng, -1);
  const duration = STORM_TELEGRAPH_DURATION_BY_PHASE[boss.bossPhase - 1];
  boss.bossTelegraphKind = STORM_TELEGRAPH_KIND[boss.bossCounter];
  boss.bossTelegraphUntil = world.time + duration;
  boss.bossStage = STORM_STAGE_TELEGRAPH;
  boss.bossTimer = duration;
  pushEvent(events, 'boss-telegraph', boss.position.x, boss.position.y, 1, boss.bossTelegraphKind);
}

/**
 * Entra en RELOAD: cierra el telegraph/execute en curso, abre la ventana de
 * vulnerabilidad y decide YA el patrón del PRÓXIMO ciclo (tuning post-
 * playtest 2026-07-15, ver comentario de cabecera del fichero): `boss.
 * bossCounter` todavía trae el patrón que acaba de terminar de ejecutarse —
 * se lee como "previo" antes de sobrescribirlo con la nueva elección
 * (mismo criterio de exclusión que antes, solo que adelantado en el
 * tiempo), así el render ya puede leer `enemy.bossCounter` para insinuar el
 * aro desde la segunda mitad de esta misma recarga. `patrolForward` se
 * resetea aquí también (antes vivía en `stormEnterTelegraph`): tiene que
 * estar en false antes de que la próxima EXECUTE pueda encadenar en fase 3,
 * y este punto sigue siendo lo bastante temprano para eso.
 *
 * A propósito NO usa `bossTimer` para la duración de este tramo (a
 * diferencia de IDLE/TELEGRAPH): `bossVulnerableUntil` es la ÚNICA fuente de
 * verdad, releída con la MISMA comparación (`world.time < bossVulnerableUntil`)
 * tanto para derivar `bossVulnerable` (arriba, en `stormStepPattern`) como
 * para decidir cuándo sale de RELOAD (más abajo, en el propio `case
 * STORM_STAGE_RELOAD`) — dos relojes independientes (bossTimer decreciente +
 * bossVulnerableUntil absoluto) podían desincronizarse un tick y dejar
 * `bossVulnerable===true` con `bossStage` ya en IDLE (bug detectado en test).
 */
function stormEnterReload(world: World, boss: Enemy): void {
  boss.bossTelegraphUntil = 0;
  boss.bossTelegraphKind = STORM_RELOAD_KIND;
  boss.bossStage = STORM_STAGE_RELOAD;
  boss.bossVulnerableUntil = world.time + STORM_RELOAD_DURATION_BY_PHASE[boss.bossPhase - 1];
  boss.bossCounter = stormPickPattern(world.rng, boss.bossCounter);
  boss.patrolForward = false;
}

/** Fin del telegraph: arranca el patrón elegido (espiral/anillos entran en EXECUTE; la ráfaga es instantánea y va directa a RELOAD). */
function stormExecuteOrFire(world: World, boss: Enemy, state: StormState): void {
  boss.bossTelegraphUntil = 0;
  const pattern = boss.bossCounter;
  if (pattern === STORM_PATTERN_SPIRAL) {
    resetSpiral(state, boss.position.x, boss.position.y, world.rng);
    boss.bossStage = STORM_STAGE_EXECUTE;
    return;
  }
  if (pattern === STORM_PATTERN_RINGS) {
    resetRings(state, boss.position.x, boss.position.y, boss.bossPhase, world.rng);
    boss.bossStage = STORM_STAGE_EXECUTE;
    return;
  }
  // Único patrón que queda (STORM_PATTERN_BURST): ráfaga radial (GDD §15.5),
  // explosión lenta y densa de una sola ola, sin fase EXECUTE propia.
  fireRadialBurst(boss.position.x, boss.position.y, boss.bossPhase, stormEmit, world.rng);
  stormEnterReload(world, boss);
}

/** Avanza un tick el patrón en curso (espiral o anillos). Devuelve true mientras siga emitiendo. */
function stormStepActivePattern(world: World, boss: Enemy, state: StormState, dt: number): boolean {
  if (boss.bossCounter === STORM_PATTERN_SPIRAL) return stepSpiral(state, dt, boss.bossPhase, stormEmit);
  return stepRings(state, dt, boss.bossPhase, stormEmit, world.rng);
}

export function stormOnInit(world: World, boss: Enemy): void {
  world.bossState = createStormState();
  boss.bossStage = STORM_STAGE_IDLE;
  boss.bossTimer = STORM_IDLE_DURATION_BY_PHASE[boss.bossPhase - 1];
  boss.bossCounter = -1; // sin patrón previo: la 1.ª selección no excluye ninguno
  boss.bossTelegraphUntil = 0;
  boss.bossTelegraphKind = '';
  boss.bossVulnerable = false;
  boss.bossVulnerableUntil = 0;
  boss.patrolForward = false;
}

export function stormStepPattern(world: World, boss: Enemy, dt: number, events: EventQueue): void {
  stormWorldRef = world;
  stormBossPhaseRef = boss.bossPhase;

  // Ventana de vulnerabilidad estándar (igual criterio que Prisma/Reina): se
  // deriva del reloj absoluto cada tick en vez de mantener un sub-stage aparte.
  boss.bossVulnerable = world.time < boss.bossVulnerableUntil;

  stormStepDrift(world, boss, dt);

  const state = stormState(world);

  switch (boss.bossStage) {
    case STORM_STAGE_IDLE: {
      boss.bossTimer -= dt;
      if (boss.bossTimer > 0) break;
      stormEnterTelegraph(world, boss, events);
      break;
    }
    case STORM_STAGE_TELEGRAPH: {
      boss.bossTimer -= dt;
      if (boss.bossTimer > 0) break;
      stormExecuteOrFire(world, boss, state);
      break;
    }
    case STORM_STAGE_EXECUTE: {
      const stillActive = stormStepActivePattern(world, boss, state, dt);
      if (stillActive) break;

      // Fase 3 (GDD §15.5): encadena espiral→anillos sin pausa antes de
      // recargar. Solo una vez por ciclo (`patrolForward` como flag) y solo
      // en ese sentido (nunca anillos→espiral ni ráfaga, que no tiene EXECUTE).
      if (boss.bossPhase === 3 && boss.bossCounter === STORM_PATTERN_SPIRAL && !boss.patrolForward) {
        boss.patrolForward = true;
        boss.bossCounter = STORM_PATTERN_RINGS;
        boss.bossTelegraphKind = STORM_TELEGRAPH_KIND[STORM_PATTERN_RINGS];
        resetRings(state, boss.position.x, boss.position.y, boss.bossPhase, world.rng);
        break; // sigue en EXECUTE, sin telegraph ni recarga intermedia
      }

      stormEnterReload(world, boss);
      break;
    }
    case STORM_STAGE_RELOAD:
    default: {
      // Misma condición que deriva `boss.bossVulnerable` arriba (NO un
      // `bossTimer` aparte, ver comentario de `stormEnterReload`): garantiza
      // que el tick en que `bossVulnerable` pasa a false es EXACTAMENTE el
      // mismo en que `bossStage` sale de RELOAD, sin desfase de un tick.
      if (world.time < boss.bossVulnerableUntil) break;
      boss.bossStage = STORM_STAGE_IDLE;
      boss.bossTimer = STORM_IDLE_DURATION_BY_PHASE[boss.bossPhase - 1];
      boss.bossTelegraphKind = '';
      break;
    }
  }
}

/**
 * Cambio de fase (GDD §15.5, Fase B4 del plan: "onPhaseChanged resetea limpio
 * el ciclo"): a diferencia del Guardián/Prisma (que nunca cortan una carga o
 * disparo ya en marcha, GDD §15.1 punto 3), interrumpir un patrón de balas a
 * mitad no deja al jugador en una posición insegura — las balas ya emitidas
 * siguen su vuelo igual (mueren solas por muro/ttl, ver `patterns.ts`) y el
 * único efecto de cortar es que la ráfaga/anillo en curso emite menos olas de
 * las previstas, nunca de más. Se reinicia a IDLE con el idle/telegraph de la
 * fase nueva, así el primer patrón tras el cambio de fase ya refleja su
 * densidad/cadencia sin arrastrar timers de la fase anterior.
 *
 * Vida de recompensa (mismo criterio que Guardián/Reina, GDD §15.2/§15.3):
 * suelta una poción al cruzar a fase 2 y a fase 3 — sostiene una pelea de
 * puro esquive sin ventanas de golpe frecuentes.
 */
export function stormOnPhaseChanged(world: World, boss: Enemy): void {
  boss.bossStage = STORM_STAGE_IDLE;
  boss.bossTimer = STORM_IDLE_DURATION_BY_PHASE[boss.bossPhase - 1];
  boss.bossTelegraphUntil = 0;
  boss.bossTelegraphKind = '';
  boss.bossVulnerableUntil = 0;
  boss.patrolForward = false;
  dropPotionAt(world, boss.position.x, boss.position.y);
}
