/**
 * Tabla de definición de jefes (GDD §15): un jefe = una entrada aquí, en el
 * mismo espíritu que `sim/upgrades.ts::UPGRADE_POOL` — B1-B4 solo añaden una
 * entrada a `BOSS_DEFS` + sus funciones `stepPattern`/`onPhaseChanged`, sin
 * tocar el framework de `sim/boss.ts`.
 *
 * SIN imports de React ni three.js: es contenido puro, consumido por la sim
 * (sim/boss.ts) y por el render (composición específica por jefe en
 * render/EnemyView.tsx via `bossId`).
 */

import {
  GUARDIAN_BARREL_FALL_DURATION,
  GUARDIAN_BARREL_MAX_ACTIVE,
  GUARDIAN_BARREL_RADIUS,
  GUARDIAN_BARREL_SPAWN_INTERVAL,
  GUARDIAN_BARREL_STUN_DURATION,
  GUARDIAN_BARREL_WALL_MARGIN,
  GUARDIAN_CHARGE_DAMAGE_PHASE1,
  GUARDIAN_CHARGE_DAMAGE_PHASE3,
  GUARDIAN_CHARGE_KNOCKBACK_SPEED,
  GUARDIAN_CHARGE_MAX_DURATION,
  GUARDIAN_CHARGE_SPEED,
  GUARDIAN_DETECT_RANGE,
  GUARDIAN_DOUBLE_CHARGE_PAUSE,
  GUARDIAN_DUST_INTERVAL,
  GUARDIAN_HIT_DAMAGE_CAP_FRACTION,
  GUARDIAN_MAX_HP,
  GUARDIAN_PATROL_SPEED,
  GUARDIAN_PHASE2_CHARGE_COUNT,
  GUARDIAN_RADIUS,
  GUARDIAN_RECOVER_PAUSE,
  GUARDIAN_SHARD_LIFETIME,
  GUARDIAN_SHARD_RADIUS,
  GUARDIAN_STUN_DURATION,
  GUARDIAN_TELEGRAPH_DURATION,
  QUEEN_DAMAGE_OUTSIDE_WINDOW,
  QUEEN_HIT_DAMAGE_CAP_FRACTION,
  QUEEN_LARVA_CHASE_SPEED_PHASE2,
  QUEEN_LARVA_CHASE_SPEED_PHASE3,
  QUEEN_LARVA_HP,
  QUEEN_LARVA_ID_PREFIX,
  QUEEN_LARVA_MAX,
  QUEEN_LARVA_PER_WAVE,
  QUEEN_LARVA_RADIUS,
  QUEEN_LARVA_SPEED,
  QUEEN_MAX_HP,
  QUEEN_MOVE_SPEED_PHASE1,
  QUEEN_MOVE_SPEED_PHASE2,
  QUEEN_MOVE_SPEED_PHASE3,
  QUEEN_RADIUS,
  QUEEN_TRAIL_DROP_INTERVAL,
  QUEEN_TRAIL_DROP_INTERVAL_PHASE2,
  QUEEN_TRAIL_PUDDLE_LIFETIME,
  QUEEN_TRAIL_PUDDLE_RADIUS,
  QUEEN_WANDER_INTERVAL,
  QUEEN_WAVE_INTERVAL,
} from '../content/constants';
import { applyDamageToHero, fireEnemyProjectile } from '../sim/combat';
import { pushEvent, type EventQueue } from '../sim/events';
import { explodeBarrel } from '../sim/hazards';
import { dropPotionAt } from '../sim/items';
import { barrelInAir, type AABB, type BossId, type Enemy, type World } from '../sim/world';

/**
 * Contrato de patrón de un jefe: se llama una vez por tick (mismo dt fijo que
 * el resto de la sim) mientras el jefe está vivo y la sala está en juego.
 * Debe mutar `boss` (posición/velocity/bossTimer/bossStage/bossCounter/
 * bossTelegraphUntil/bossTelegraphKind/bossVulnerable) y puede emitir
 * eventos propios (p.ej. disparos) via `events`. Cero asignaciones: solo
 * escalares y los campos ya existentes del Enemy.
 */
export type BossPatternStep = (world: World, boss: Enemy, dt: number, events: EventQueue) => void;

export interface BossDef {
  id: BossId;
  /** Nombre mostrado en la barra de vida (HUD). */
  name: string;
  /** Vida máxima (GDD §15.6). */
  maxHp: number;
  /**
   * Radio de colisión/visual (los jefes se diseñan más grandes que el 0.4 de
   * un enemigo normal y su cuerpo de render escala con el radio REAL). Si se
   * omite, se conserva el radio por defecto de createEnemy.
   */
  radius?: number;
  /**
   * Techo de daño de un único golpe del jefe al héroe, como fracción de su
   * vida MÁXIMA (GDD §15.1 punto 6: 60% en fase 1, puede escalar un poco en
   * fases posteriores, nunca hasta 100%). Índice 0/1/2 = fase 1/2/3.
   */
  hitDamageCapFraction: [number, number, number];
  /**
   * Multiplicador de daño recibido mientras NO está en ventana de
   * vulnerabilidad (GDD §15.1 punto 4). 0 = inmune fuera de ventana; un
   * valor >0 dejaría pasar daño reducido si algún jefe futuro lo necesitara.
   */
  damageOutsideWindow: number;
  /** Avance de un tick del patrón de ataque de este jefe. */
  stepPattern: BossPatternStep;
  /** Se llama una vez al cruzar a fase 2 o 3 (para resetear bossStage/timers propios del patrón). */
  onPhaseChanged?: (world: World, boss: Enemy, phase: 2 | 3) => void;
  /**
   * Se llama una vez, justo tras construir el mundo (mismo momento que fija
   * hp/maxHp/radius reales, ver `sim/boss.ts::initBossEnemies`). Punto de
   * extensión para jefes que necesitan reservar estado propio en el mundo al
   * arrancar (p.ej. la Reina del Enjambre, GDD §15.3: preasigna sus slots de
   * larva en `world.enemies`, igual espíritu que `createProjectilePool`).
   */
  onInit?: (world: World, boss: Enemy) => void;
}

// ── Jefe de pruebas (Fase B0): quieto, un ataque telegrafiado simple en ────
// bucle, ventana tras el ataque. Solo para verificar el framework; NO es un
// jefe de diseño (B1-B4 lo son). Se añade al pool de salas SOLO en dev/tests
// (ver content/rooms.ts::getRoomPool), nunca en una run normal si hay otro
// jefe disponible.

const TEST_BOSS_TELEGRAPH_DURATION = 0.8;
const TEST_BOSS_ATTACK_DURATION = 0.25;
const TEST_BOSS_VULNERABLE_DURATION = 1.4;
const TEST_BOSS_COOLDOWN_DURATION = 1.0;
const TEST_BOSS_PROJECTILE_SPEED = 4.5;
const TEST_BOSS_PROJECTILE_DAMAGE = 1;
const TEST_BOSS_PROJECTILE_RADIUS = 0.2;

/**
 * Sub-estado del ciclo del jefe de pruebas, codificado en `bossStage`
 * (escalar, sin objetos nuevos). `Enemy.bossStage` arranca en 0 (ver
 * `createEnemy` en world.ts) para TODO enemigo, jefe o no — por eso
 * `TEST_BOSS_STAGE_COOLDOWN` (que arranca un ciclo nuevo, telegrafiando el
 * primer ataque) es justamente el valor 0: el jefe de pruebas empieza su
 * vida "recién salido de un cooldown", no a mitad de telegraph.
 */
const TEST_BOSS_STAGE_COOLDOWN = 0;
const TEST_BOSS_STAGE_TELEGRAPH = 1;
const TEST_BOSS_STAGE_ATTACK = 2;
const TEST_BOSS_STAGE_VULNERABLE = 3;

function testBossStepPattern(world: World, boss: Enemy, dt: number, events: EventQueue): void {
  boss.bossTimer -= dt;
  if (boss.bossTimer > 0) return;

  switch (boss.bossStage) {
    case TEST_BOSS_STAGE_TELEGRAPH: {
      // Fin del telegraph: dispara un proyectil lento hacia el héroe (ataque
      // "simple" del jefe de pruebas) y pasa a la ventana de resolución.
      const dx = world.hero.position.x - boss.position.x;
      const dy = world.hero.position.y - boss.position.y;
      const len = Math.hypot(dx, dy) || 1;
      fireEnemyProjectile(
        world,
        boss.position.x,
        boss.position.y,
        dx / len,
        dy / len,
        TEST_BOSS_PROJECTILE_SPEED,
        TEST_BOSS_PROJECTILE_DAMAGE,
        TEST_BOSS_PROJECTILE_RADIUS,
      );
      boss.bossTelegraphUntil = 0;
      boss.bossTelegraphKind = '';
      boss.bossStage = TEST_BOSS_STAGE_ATTACK;
      boss.bossTimer = TEST_BOSS_ATTACK_DURATION;
      break;
    }
    case TEST_BOSS_STAGE_ATTACK: {
      // Ventana de vulnerabilidad explícita (GDD §15.1 punto 4): se abre justo
      // tras resolver el ataque.
      boss.bossVulnerable = true;
      boss.bossStage = TEST_BOSS_STAGE_VULNERABLE;
      boss.bossTimer = TEST_BOSS_VULNERABLE_DURATION;
      break;
    }
    case TEST_BOSS_STAGE_VULNERABLE: {
      boss.bossVulnerable = false;
      boss.bossStage = TEST_BOSS_STAGE_COOLDOWN;
      boss.bossTimer = TEST_BOSS_COOLDOWN_DURATION;
      break;
    }
    case TEST_BOSS_STAGE_COOLDOWN:
    default: {
      // Nuevo ciclo: telegrafía el próximo ataque (mínimo 0.6s exigido por
      // GDD §15.1 punto 2; el jefe de pruebas usa 0.8s, igual que Guardián).
      boss.bossTelegraphUntil = world.time + TEST_BOSS_TELEGRAPH_DURATION;
      boss.bossTelegraphKind = 'test-attack';
      pushEvent(events, 'boss-telegraph', boss.position.x, boss.position.y, 1, boss.bossTelegraphKind);
      boss.bossStage = TEST_BOSS_STAGE_TELEGRAPH;
      boss.bossTimer = TEST_BOSS_TELEGRAPH_DURATION;
      break;
    }
  }
}

// ── Guardián de Canto (GDD §15.2, Fase B1) ──────────────────────────────────
//
// Reuso de campos escalares/vectoriales de `Enemy` (ver nota en world.ts): un
// jefe nunca pasa por `stepEnemyAi` (solo por `sim/boss.ts::stepBosses`), así
// que estos campos —pensados para Dummy/Spike/Trail— quedan libres como
// almacenamiento genérico sin ampliar `Enemy` con más campos "boss*":
// - `facing`: dirección unitaria de la carga en curso (fijada al final del
//   telegraph, hacia la última posición vista del héroe; no se recalcula
//   durante la carga, GDD §15.2 "carga en línea recta").
// - `patrolTo`: siguiente esquina objetivo de la patrulla perimetral
//   (recorrido cíclico de las 4 esquinas de la sala, no ida/vuelta).
//   `patrolFrom` no se usa.
// Los barriles rodantes (GDD §15.2, playtest 2026-07-06) NO necesitan estado
// propio en el Guardián: la cadencia de aparición se deriva sin estado del
// "slot" de world.time (mismo truco que GUARDIAN_DUST_INTERVAL más abajo),
// y el barril en sí vive en `world.barrels` (pool genérico, ver hazards.ts).
// - `bossTimer`: cuenta atrás del stage actual (telegraph/pausa/duración
//   máxima de carga de seguridad/pausa de recuperación).
// - `bossStage`: GUARDIAN_STAGE_* de abajo.
// - `bossCounter`: nº de cargas YA completadas en la secuencia encadenada
//   actual (0 al iniciar; fase 2/3 encadena GUARDIAN_PHASE2_CHARGE_COUNT
//   antes de volver a patrullar, GDD §15.2).

const GUARDIAN_STAGE_PATROL = 0;
const GUARDIAN_STAGE_TELEGRAPH = 1;
const GUARDIAN_STAGE_CHARGING = 2;
const GUARDIAN_STAGE_STUNNED = 3;
/** Pausa corta entre cargas encadenadas (fase 2/3, GDD §15.2). */
const GUARDIAN_STAGE_CHAIN_PAUSE = 4;

/** Las 4 esquinas del rectángulo de patrulla perimetral, en orden cíclico (con margen respecto a la pared). */
function guardianPatrolCorners(bounds: AABB): { x: number; y: number }[] {
  const margin = GUARDIAN_RADIUS + 0.5;
  return [
    { x: bounds.minX + margin, y: bounds.minY + margin },
    { x: bounds.maxX - margin, y: bounds.minY + margin },
    { x: bounds.maxX - margin, y: bounds.maxY - margin },
    { x: bounds.minX + margin, y: bounds.maxY - margin },
  ];
}

/** Sala dueña del jefe (multi-sala) o `world.bounds` en el modo sala única de los tests. */
function guardianRoomBounds(world: World, boss: Enemy): AABB {
  if (boss.roomId === undefined) return world.bounds;
  return world.roomRuntimes.get(boss.roomId)?.bounds ?? world.bounds;
}

/**
 * Avanza la patrulla perimetral lenta hacia la esquina objetivo (`patrolTo`),
 * saltando a la siguiente al llegar.
 *
 * Evitación por deslizamiento de eje (axis-slide, fix B1.6.1 tras playtest
 * 2026-07-06): en B1.6 las rocas pasaron de las esquinas de la sala al
 * interior, así que el tramo recto patrulla-esquina puede atravesar una roca
 * (el tramo inicial desde el centro, o la recuperación tras una carga que
 * termina a mitad de arena). El movimiento recto de antes no comprobaba
 * `guardianHitsSolid`: la resolución de colisión general (physics.ts) lo
 * empujaba fuera del sólido cada frame, cancelando el avance neto → el boss
 * quedaba clavado contra la roca para siempre (nunca progresa, nunca detecta
 * al héroe). El axis-slide prueba el eje X solo, luego Y solo, y como último
 * recurso se desvía hacia el muro más cercano para retomar el perímetro.
 */
function guardianStepPatrolMove(world: World, boss: Enemy, dt: number): void {
  const dx = boss.patrolTo.x - boss.position.x;
  const dy = boss.patrolTo.y - boss.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.15) {
    const corners = guardianPatrolCorners(guardianRoomBounds(world, boss));
    // Encuentra la esquina más cercana al objetivo actual y avanza a la siguiente (recorrido cíclico).
    let nearestIndex = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < corners.length; i++) {
      const d = Math.hypot(corners[i].x - boss.patrolTo.x, corners[i].y - boss.patrolTo.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIndex = i;
      }
    }
    const next = corners[(nearestIndex + 1) % corners.length];
    boss.patrolTo.x = next.x;
    boss.patrolTo.y = next.y;
    boss.velocity.x = 0;
    boss.velocity.y = 0;
    return;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  const stepX = nx * GUARDIAN_PATROL_SPEED * dt;
  const stepY = ny * GUARDIAN_PATROL_SPEED * dt;
  const nextX = boss.position.x + stepX;
  const nextY = boss.position.y + stepY;

  if (!guardianHitsSolid(world, boss, nextX, nextY)) {
    // Camino libre: avanza recto, como siempre.
    boss.position.x = nextX;
    boss.position.y = nextY;
    boss.velocity.x = nx * GUARDIAN_PATROL_SPEED;
    boss.velocity.y = ny * GUARDIAN_PATROL_SPEED;
    return;
  }

  // Camino recto bloqueado: bordea el obstáculo por su TANGENTE
  // (circunnavegación). El simple deslizamiento por eje no basta cuando el
  // boss toca una ESQUINA convexa en diagonal — mover solo-X o solo-Y HACIA
  // el objetivo lo acerca aún más al vértice y sigue chocando (era la causa
  // del atasco permanente del playtest). Se calcula la normal "hacia fuera"
  // del sólido más cercano (rock interior o muro) y se avanza por la tangente
  // que más progresa hacia patrolTo, con un pequeño empuje normal para
  // despegar del vértice; así el boss rodea la roca hasta el corredor libre.
  let normX = 0;
  let normY = 0;
  let bestDist = Infinity;
  const obstacles = world.obstacles;
  for (let i = 0; i < obstacles.length; i++) {
    const a = obstacles[i].aabb;
    const px = boss.position.x < a.minX ? a.minX : boss.position.x > a.maxX ? a.maxX : boss.position.x;
    const py = boss.position.y < a.minY ? a.minY : boss.position.y > a.maxY ? a.maxY : boss.position.y;
    const ddx = boss.position.x - px;
    const ddy = boss.position.y - py;
    const d = Math.hypot(ddx, ddy);
    if (d < bestDist) {
      bestDist = d;
      const inv = d > 1e-4 ? 1 / d : 0;
      normX = ddx * inv;
      normY = ddy * inv;
    }
  }
  const bounds = guardianRoomBounds(world, boss);
  // Si ninguna roca está lo bastante cerca, el bloqueo es un muro: normal hacia
  // el centro de la sala (el boss está pegado al perímetro).
  if (bestDist > boss.radius + 0.4 || (normX === 0 && normY === 0)) {
    const ex = (bounds.minX + bounds.maxX) / 2 - boss.position.x;
    const ey = (bounds.minY + bounds.maxY) / 2 - boss.position.y;
    const elen = Math.hypot(ex, ey) || 1;
    normX = ex / elen;
    normY = ey / elen;
  }

  const step = GUARDIAN_PATROL_SPEED * dt;
  const push = 0.05;
  // Tangente perpendicular a la normal, orientada hacia patrolTo (la que tiene
  // producto escalar positivo con la dirección deseada). Se prueba primero esa,
  // luego la opuesta, y por último solo el empuje normal (despegar). Sin
  // asignaciones: el patrón se repite con `guardianTrySlide` sobre escalares.
  const tanX = -normY;
  const tanY = normX;
  const sign = tanX * nx + tanY * ny >= 0 ? 1 : -1;
  if (
    guardianTrySlide(world, boss, sign * tanX, sign * tanY, normX, normY, step, push) ||
    guardianTrySlide(world, boss, -sign * tanX, -sign * tanY, normX, normY, step, push) ||
    guardianTrySlide(world, boss, normX, normY, normX, normY, step, push)
  ) {
    return;
  }

  // Todo bloqueado (rarísimo): sin avance este tick.
  boss.velocity.x = 0;
  boss.velocity.y = 0;
}

/**
 * Intenta mover al Guardián por (vx,vy)·step con un empuje adicional
 * (nX,nY)·push que lo despega del vértice. Si el destino está despejado, aplica
 * el movimiento (posición + velocity para el render) y devuelve true. Solo
 * escalares: cero asignaciones.
 */
function guardianTrySlide(
  world: World,
  boss: Enemy,
  vx: number,
  vy: number,
  nX: number,
  nY: number,
  step: number,
  push: number,
): boolean {
  const tryX = boss.position.x + vx * step + nX * push;
  const tryY = boss.position.y + vy * step + nY * push;
  if (guardianHitsSolid(world, boss, tryX, tryY)) return false;
  boss.position.x = tryX;
  boss.position.y = tryY;
  boss.velocity.x = vx * GUARDIAN_PATROL_SPEED;
  boss.velocity.y = vy * GUARDIAN_PATROL_SPEED;
  return true;
}

/**
 * true si el círculo del Guardián en (x,y) solapa algún obstáculo sólido de
 * SU sala o se sale del límite de la sala. Sin mutar nada (solo detección:
 * `guardianStepPattern` decide qué hacer con el resultado — a diferencia de
 * `collideCircleAabb`/`collideInnerBounds` de physics.ts, que además
 * resuelven con reflexión elástica, aquí interesa solo saber SI choca para
 * detener la carga en seco y aturdir, nunca rebotar).
 */
function guardianHitsSolid(world: World, boss: Enemy, x: number, y: number): boolean {
  const bounds = guardianRoomBounds(world, boss);
  if (
    x - boss.radius < bounds.minX ||
    x + boss.radius > bounds.maxX ||
    y - boss.radius < bounds.minY ||
    y + boss.radius > bounds.maxY
  ) {
    return true;
  }
  const obstacles = world.obstacles;
  for (let i = 0; i < obstacles.length; i++) {
    const aabb = obstacles[i].aabb;
    const nearestX = x < aabb.minX ? aabb.minX : x > aabb.maxX ? aabb.maxX : x;
    const nearestY = y < aabb.minY ? aabb.minY : y > aabb.maxY ? aabb.maxY : y;
    const dx = x - nearestX;
    const dy = y - nearestY;
    if (dx * dx + dy * dy < boss.radius * boss.radius) return true;
  }
  return false;
}

/** Nº de barriles rodantes vivos (sin explotar) de la sala del Guardián (GDD §15.2: cap `GUARDIAN_BARREL_MAX_ACTIVE`). */
function guardianLiveBarrelCount(world: World, boss: Enemy): number {
  const barrels = world.barrels;
  let count = 0;
  for (let i = 0; i < barrels.length; i++) {
    if (!barrels[i].exploded && barrels[i].roomId === boss.roomId) count++;
  }
  return count;
}

/**
 * Los 8 puntos fijos de aparición de barriles rodantes (GDD §15.2, fix
 * B1.6.1 tras playtest 2026-07-06): las 4 esquinas de la arena + los 4 puntos
 * medios de los bordes, todos con margen `GUARDIAN_BARREL_WALL_MARGIN`
 * respecto a la pared (mismo margen que la versión anterior aleatoria). Orden
 * fijo, sin significado semántico salvo estabilidad de tests.
 */
export function guardianBarrelSpawnPoints(bounds: AABB): { x: number; y: number }[] {
  const margin = GUARDIAN_BARREL_WALL_MARGIN;
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const left = bounds.minX + margin;
  const right = bounds.maxX - margin;
  const top = bounds.minY + margin;
  const bottom = bounds.maxY - margin;
  return [
    { x: left, y: top }, // esquina NO
    { x: right, y: top }, // esquina NE
    { x: right, y: bottom }, // esquina SE
    { x: left, y: bottom }, // esquina SO
    { x: midX, y: top }, // punto medio norte
    { x: midX, y: bottom }, // punto medio sur
    { x: left, y: midY }, // punto medio oeste
    { x: right, y: midY }, // punto medio este
  ];
}

/**
 * Punto fijo de aparición de un barril rodante (GDD §15.2, fix B1.6.1 tras
 * playtest 2026-07-06: los barriles se solapaban con 2 tiradas de RNG
 * independientes — sin relación entre ellas, podían caer casi en el mismo
 * sitio). Determinista: de los 8 puntos fijos (`guardianBarrelSpawnPoints`),
 * elige el que tiene la MAYOR distancia mínima a cualquier barril vivo
 * (`!exploded`) de la sala del Guardián — "el más alejado de los barriles
 * vivos", como pide el GDD. Sin barriles vivos, cualquier punto sirve (se usa
 * el primero, empate determinista).
 */
function guardianBarrelSpawnPoint(world: World, boss: Enemy): { x: number; y: number } {
  const bounds = guardianRoomBounds(world, boss);
  const points = guardianBarrelSpawnPoints(bounds);
  const barrels = world.barrels;

  let bestPoint = points[0];
  let bestMinDist = -Infinity;
  for (let p = 0; p < points.length; p++) {
    const point = points[p];
    let minDistToLiveBarrel = Infinity;
    for (let i = 0; i < barrels.length; i++) {
      const barrel = barrels[i];
      if (barrel.exploded || barrel.roomId !== boss.roomId) continue;
      const d = Math.hypot(point.x - barrel.position.x, point.y - barrel.position.y);
      if (d < minDistToLiveBarrel) minDistToLiveBarrel = d;
    }
    if (minDistToLiveBarrel > bestMinDist) {
      bestMinDist = minDistToLiveBarrel;
      bestPoint = point;
    }
  }
  return bestPoint;
}

/**
 * Activa un barril rodante en un slot ya explotado del pool (reutiliza,
 * mismo patrón que `dropCoinAt`/`dropPotionAt` de sim/items.ts) o añade uno
 * nuevo si no hay ninguno libre (evento raro, cada ~8s, no hot path).
 *
 * Caída del cielo (GDD §15.2, playtest 2026-07-06): al spawnear fija
 * `landingAt = world.time + GUARDIAN_BARREL_FALL_DURATION`. Hasta ese
 * instante el barril está "en el aire" (sombra creciendo + cuerpo cayendo):
 * `stepBarrels`/`guardianFindLiveBarrelAt` lo ignoran (no es
 * arrollable/explotable) y el render deriva la animación de ese timestamp. El
 * evento `boss-barrel-spawn` marca el INICIO (aparición de la sombra, aviso);
 * el aterrizaje lo emite el render como `boss-barrel-land` (polvo) al detectar
 * el cruce de `landingAt`, para no acoplar el burst de polvo a un tick de sim
 * exacto (la sim corre a dt fijo, el aterrizaje visual cae entre frames).
 */
function guardianSpawnBarrel(world: World, boss: Enemy, events: EventQueue): void {
  const point = guardianBarrelSpawnPoint(world, boss);
  const landingAt = world.time + GUARDIAN_BARREL_FALL_DURATION;
  const barrels = world.barrels;
  for (let i = 0; i < barrels.length; i++) {
    if (barrels[i].exploded) {
      barrels[i].exploded = false;
      barrels[i].position.x = point.x;
      barrels[i].position.y = point.y;
      barrels[i].landingAt = landingAt;
      pushEvent(events, 'boss-barrel-spawn', point.x, point.y, 1);
      return;
    }
  }
  barrels.push({
    id: `guardian-barrel-${barrels.length}`,
    roomId: boss.roomId,
    position: { x: point.x, y: point.y },
    radius: GUARDIAN_BARREL_RADIUS,
    exploded: false,
    landingAt,
  });
  pushEvent(events, 'boss-barrel-spawn', point.x, point.y, 1);
}

/**
 * Cadencia de aparición de barriles rodantes (GDD §15.2, playtest
 * 2026-07-06): sin estado propio en el Guardián — se dispara al cruzar un
 * "slot" de `GUARDIAN_BARREL_SPAWN_INTERVAL` segundos (mismo truco que
 * `GUARDIAN_DUST_INTERVAL` en la carga), respetando el cap de vivos.
 */
function guardianStepBarrelSpawn(world: World, boss: Enemy, dt: number, events: EventQueue): void {
  const crossedSlot =
    Math.floor(world.time / GUARDIAN_BARREL_SPAWN_INTERVAL) !==
    Math.floor((world.time - dt) / GUARDIAN_BARREL_SPAWN_INTERVAL);
  if (!crossedSlot) return;
  if (guardianLiveBarrelCount(world, boss) >= GUARDIAN_BARREL_MAX_ACTIVE) return;
  guardianSpawnBarrel(world, boss, events);
}

/**
 * Barril vivo de la sala del Guardián cuyo círculo solapa (x,y) con el radio
 * del jefe (GDD §15.2: "si la carga del Guardián lo arrolla"). El Guardián NO
 * esquiva barriles (su carga es a ciegas) — este chequeo es solo para
 * resolver la colisión de la carga EN CURSO, nunca para desviarla.
 */
function guardianFindLiveBarrelAt(world: World, boss: Enemy, x: number, y: number) {
  const barrels = world.barrels;
  for (let i = 0; i < barrels.length; i++) {
    const barrel = barrels[i];
    // Barril aún cayendo del cielo (GDD §15.2): no arrollable — la carga lo
    // atraviesa hasta que aterriza (world.time >= landingAt).
    if (barrel.exploded || barrel.roomId !== boss.roomId || barrelInAir(barrel, world.time)) continue;
    const dx = x - barrel.position.x;
    const dy = y - barrel.position.y;
    const rr = boss.radius + barrel.radius;
    if (dx * dx + dy * dy <= rr * rr) return barrel;
  }
  return null;
}

/** Telegrafía el inicio de una carga (primera de la secuencia o encadenada tras la pausa corta de fase 2/3): mismo aviso en ambos casos. */
function guardianEnterTelegraph(world: World, boss: Enemy, events: EventQueue): void {
  boss.bossTelegraphKind = 'guardian-charge';
  boss.bossTelegraphUntil = world.time + GUARDIAN_TELEGRAPH_DURATION;
  boss.bossTimer = GUARDIAN_TELEGRAPH_DURATION;
  boss.bossStage = GUARDIAN_STAGE_TELEGRAPH;
  boss.velocity.x = 0;
  boss.velocity.y = 0;
  pushEvent(events, 'boss-telegraph', boss.position.x, boss.position.y, 1, boss.bossTelegraphKind);
}

/**
 * Valor de `bossTelegraphKind` durante una carga que YA golpeó al héroe:
 * flag de "un solo golpe por carga". Se usa este campo string (libre en
 * cuanto el telegraph resuelve) y NO `bossCounter`, que debe conservar
 * INTACTO el nº de cargas completadas de la secuencia encadenada — usarlo
 * también como flag de golpe lo reseteaba en cada carga y hacía que la fase
 * 2/3 encadenara cargas para siempre (bug corregido en B1).
 */
const GUARDIAN_CHARGE_HIT_FLAG = 'guardian-hit';

function guardianEnterCharge(world: World, boss: Enemy): void {
  const dx = world.hero.position.x - boss.position.x;
  const dy = world.hero.position.y - boss.position.y;
  const len = Math.hypot(dx, dy) || 1;
  boss.facing.x = dx / len;
  boss.facing.y = dy / len;
  boss.bossTelegraphUntil = 0;
  boss.bossTelegraphKind = ''; // '' = esta carga aún no golpeó al héroe
  boss.bossStage = GUARDIAN_STAGE_CHARGING;
  boss.bossTimer = GUARDIAN_CHARGE_MAX_DURATION;
}

/** `duration` por defecto GUARDIAN_STUN_DURATION (choque normal); el barril rodante (GDD §15.2) pasa GUARDIAN_BARREL_STUN_DURATION. */
function guardianEnterStunned(boss: Enemy, duration: number = GUARDIAN_STUN_DURATION): void {
  boss.velocity.x = 0;
  boss.velocity.y = 0;
  boss.bossVulnerable = true;
  boss.bossStage = GUARDIAN_STAGE_STUNNED;
  boss.bossTimer = duration;
}

/** Cuántas cargas encadenadas corresponden a la fase actual (GDD §15.2: fase 2/3 encadenan 2). */
function guardianChargesForPhase(phase: 1 | 2 | 3): number {
  return phase >= 2 ? GUARDIAN_PHASE2_CHARGE_COUNT : 1;
}

/** Campo de esquirlas de fase 3: reutiliza el pool de charcos del Trail (mismo daño de contacto al pisarlo, radio/vida propios de esquirla). */
function spawnGuardianShardField(world: World, x: number, y: number): void {
  const pool = world.puddles;
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) {
      pool[i].active = true;
      pool[i].position.x = x;
      pool[i].position.y = y;
      pool[i].radius = GUARDIAN_SHARD_RADIUS;
      pool[i].ttl = GUARDIAN_SHARD_LIFETIME;
      return;
    }
  }
}

function guardianStepPattern(world: World, boss: Enemy, dt: number, events: EventQueue): void {
  // Barriles rodantes (GDD §15.2): cadencia independiente del stage actual —
  // aparecen mientras el Guardián patrulla, telegrafía, carga o está aturdido.
  guardianStepBarrelSpawn(world, boss, dt, events);

  switch (boss.bossStage) {
    case GUARDIAN_STAGE_TELEGRAPH: {
      boss.bossTimer -= dt;
      if (boss.bossTimer <= 0) {
        guardianEnterCharge(world, boss);
      }
      break;
    }

    case GUARDIAN_STAGE_CHARGING: {
      boss.bossTimer -= dt;

      // Rastro de polvo (entregable 3): partículas periódicas mientras carga,
      // a cadencia fija comparando el "slot" de tiempo antes/después de este
      // tick (evita un contador propio: bossTimer ya cuenta la carga en sí).
      if (Math.floor(world.time / GUARDIAN_DUST_INTERVAL) !== Math.floor((world.time - dt) / GUARDIAN_DUST_INTERVAL)) {
        pushEvent(events, 'boss-charge-dust', boss.position.x, boss.position.y, GUARDIAN_CHARGE_SPEED);
      }

      const nextX = boss.position.x + boss.facing.x * GUARDIAN_CHARGE_SPEED * dt;
      const nextY = boss.position.y + boss.facing.y * GUARDIAN_CHARGE_SPEED * dt;

      // Choque contra el héroe: daño (techo compartido de jefes, GDD §15.1
      // punto 6) + empujón fuerte. La carga NO se detiene por golpear al
      // héroe (solo por chocar con un sólido, GDD §15.2), así que se aplica
      // como mucho una vez por carga (bossCounter pasa de -1 a -2, "ya
      // golpeó"); los i-frames del héroe ya evitarían el doble daño, pero sin
      // este flag el empujón se repetiría cada tick mientras siga solapado.
      const hero = world.hero;
      const rrHero = boss.radius + hero.radius;
      const dxHero = hero.position.x - nextX;
      const dyHero = hero.position.y - nextY;
      if (boss.bossTelegraphKind !== GUARDIAN_CHARGE_HIT_FLAG && dxHero * dxHero + dyHero * dyHero <= rrHero * rrHero) {
        const rawDamage = boss.bossPhase >= 3 ? GUARDIAN_CHARGE_DAMAGE_PHASE3 : GUARDIAN_CHARGE_DAMAGE_PHASE1;
        const cap = GUARDIAN_HIT_DAMAGE_CAP_FRACTION[boss.bossPhase - 1] * hero.maxHp;
        const damage = Math.min(rawDamage, Math.max(1, Math.floor(cap)));
        const wasHit = applyDamageToHero(world, damage, events);
        if (!wasHit) {
          hero.velocity.x = boss.facing.x * GUARDIAN_CHARGE_KNOCKBACK_SPEED;
          hero.velocity.y = boss.facing.y * GUARDIAN_CHARGE_KNOCKBACK_SPEED;
        }
        boss.bossTelegraphKind = GUARDIAN_CHARGE_HIT_FLAG;
      }

      // Barril rodante arrollado (GDD §15.2, playtest 2026-07-06): la carga es
      // a ciegas — el Guardián NO esquiva barriles (a diferencia de la IA
      // normal, ver ai.ts::pointInAvoidHazard) — así que se comprueba ANTES
      // que el choque contra sólidos y, si acierta, sustituye ese choque:
      // explosión normal (daño a héroe/enemigos/cadena) + daño SIN gating de
      // ventana al propio Guardián (su castigo) + aturdimiento largo.
      const rammedBarrel = guardianFindLiveBarrelAt(world, boss, nextX, nextY);
      if (rammedBarrel) {
        // Solo avanza a (nextX,nextY) si ese punto no solapa TAMBIÉN un
        // sólido (barril pegado a una roca/pared): si no, se queda donde
        // estaba, igual que el choque normal contra sólidos de abajo — nunca
        // se le deja penetrar visualmente un obstáculo.
        if (!guardianHitsSolid(world, boss, nextX, nextY)) {
          boss.position.x = nextX;
          boss.position.y = nextY;
        }
        explodeBarrel(world, rammedBarrel, events, true);
        pushEvent(events, 'boss-barrel-charge-stun', boss.position.x, boss.position.y, GUARDIAN_BARREL_STUN_DURATION);
        guardianEnterStunned(boss, GUARDIAN_BARREL_STUN_DURATION);
        break;
      }

      if (guardianHitsSolid(world, boss, nextX, nextY)) {
        // Choca contra roca/pared: se detiene en seco donde estaba (sin
        // penetrar el sólido) y queda aturdido — su ventana de vulnerabilidad.
        if (boss.bossPhase >= 3) {
          // Fase 3 (GDD §15.2): la roca/pared golpeada suelta un campo de
          // esquirlas temporal en el punto de impacto.
          spawnGuardianShardField(world, boss.position.x, boss.position.y);
          pushEvent(events, 'boss-shard-burst', boss.position.x, boss.position.y, GUARDIAN_SHARD_RADIUS);
        }
        guardianEnterStunned(boss);
        break;
      }

      boss.position.x = nextX;
      boss.position.y = nextY;
      boss.velocity.x = boss.facing.x * GUARDIAN_CHARGE_SPEED;
      boss.velocity.y = boss.facing.y * GUARDIAN_CHARGE_SPEED;

      if (boss.bossTimer <= 0) {
        // Seguridad: si por lo que sea nunca choca (sala mal formada), no se
        // queda cargando para siempre — se aturde igualmente al agotar el
        // tiempo máximo de carga.
        guardianEnterStunned(boss);
      }
      break;
    }

    case GUARDIAN_STAGE_STUNNED: {
      boss.bossTimer -= dt;
      if (boss.bossTimer <= 0) {
        boss.bossVulnerable = false;
        // bossCounter = cargas COMPLETADAS de la secuencia antes de esta
        // (puro contador desde la migración del flag de golpe a
        // bossTelegraphKind; el clamp cubre cualquier resto negativo).
        const chargesCompleted = Math.max(0, boss.bossCounter) + 1;
        const targetCharges = guardianChargesForPhase(boss.bossPhase);
        if (chargesCompleted < targetCharges) {
          boss.bossCounter = chargesCompleted;
          boss.bossStage = GUARDIAN_STAGE_CHAIN_PAUSE;
          boss.bossTimer = GUARDIAN_DOUBLE_CHARGE_PAUSE;
        } else {
          boss.bossCounter = 0;
          boss.bossStage = GUARDIAN_STAGE_PATROL;
          boss.bossTimer = GUARDIAN_RECOVER_PAUSE;
        }
      }
      break;
    }

    case GUARDIAN_STAGE_CHAIN_PAUSE: {
      boss.bossTimer -= dt;
      if (boss.bossTimer <= 0) {
        guardianEnterTelegraph(world, boss, events);
      }
      break;
    }

    case GUARDIAN_STAGE_PATROL:
    default: {
      if (boss.bossTimer > 0) {
        boss.bossTimer -= dt;
        boss.velocity.x = 0;
        boss.velocity.y = 0;
        break;
      }
      guardianStepPatrolMove(world, boss, dt);

      const dx = world.hero.position.x - boss.position.x;
      const dy = world.hero.position.y - boss.position.y;
      if (Math.hypot(dx, dy) <= GUARDIAN_DETECT_RANGE) {
        boss.bossCounter = 0;
        guardianEnterTelegraph(world, boss, events);
      }
      break;
    }
  }
}

function guardianOnPhaseChanged(world: World, boss: Enemy): void {
  // Sin reset de bossStage/timers propios: un cambio de fase a mitad de
  // patrulla/telegraph/carga no debe interrumpir el gesto en curso (GDD §15.1
  // punto 3: "intensifica, nunca sustituye a mitad"). El único efecto de
  // cruzar a fase 2/3 es que la PRÓXIMA vez que el Guardián sale de
  // STUNNED (guardianChargesForPhase) decide encadenar una segunda carga, y
  // que el daño de la carga en curso (si golpea al héroe) ya lee
  // `boss.bossPhase` actualizado (checkPhaseAndDefeat en sim/boss.ts corre
  // ANTES de que el siguiente tick vuelva a llamar a este patrón).
  //
  // Vida de recompensa (GDD §15.2, playtest 2026-07-06): al cruzar a fase 2 y
  // a fase 3, suelta una poción en su posición actual (sostiene la pelea
  // larga y premia el progreso). Reutiliza el pipeline normal de items: el
  // pickup dispara el evento 'item-pickup' de siempre, sin plumbing propio.
  dropPotionAt(world, boss.position.x, boss.position.y);
}

// ── Reina del Enjambre (GDD §15.3, Fase B2) ─────────────────────────────────
//
// Reuso de campos de `Enemy` (mismo espíritu que el Guardián, ver nota más
// arriba): la Reina NUNCA pasa por `stepEnemyAi`, así que:
// - `patrolTo`: punto de deambulación objetivo actual (elegido al azar dentro
//   de su sala cada QUEEN_WANDER_INTERVAL, o hacia el héroe en fase 3 pánico).
// - `bossTimer`: cuenta atrás hasta el próximo cambio de punto de deambulación.
// - `bossCounter`: cuenta atrás (en segundos, no ticks) hasta soltar el
//   próximo charco de rastro — comparte "reloj" con `trailDropTimer` del Trail
//   normal en espíritu, pero como campo genérico de jefe.
// - `bossTelegraphUntil`: reutilizado como reloj de cuenta atrás hasta la
//   próxima oleada de larvas (QUEEN_WAVE_INTERVAL); no es un telegraph real
//   (la Reina no tiene, GDD §15.3), pero el campo ya existe y el render lo
//   deja en paz porque `bossId==='queen'` no dibuja el anillo genérico de
//   telegraph (ver EnemyView.tsx: solo bossVulnerable pinta algo, y aquí es
//   permanente).
//
// Larvas: NO son un `BossDef` ni un `EnemyKind` nuevo — son `Enemy` normales
// de `kind:'dummy'` con `hp`/`radius` propios, viviendo como slots
// PREASIGNADOS al final de `world.enemies` (ver `queenOnInit`), igual pool
// preasignado que proyectiles/charcos. `enemy.facing` guarda su dirección de
// avance fija (fase 1, línea recta); en fase 2/3 se recalcula cada tick
// (persecución real) y no se usa `facing` como caché.

function isQueenLarva(enemy: Enemy): boolean {
  return enemy.id.startsWith(QUEEN_LARVA_ID_PREFIX);
}

/** Sala dueña de la Reina (multi-sala) o `world.bounds` en el modo sala única de los tests. */
function queenRoomBounds(world: World, boss: Enemy): AABB {
  if (boss.roomId === undefined) return world.bounds;
  return world.roomRuntimes.get(boss.roomId)?.bounds ?? world.bounds;
}

/**
 * Reserva `QUEEN_LARVA_MAX` slots de larva en `world.enemies`, inactivos
 * (hp=0) hasta que una oleada los active (GDD §15.3: "invoca larvas por
 * oleadas"). Se hace UNA vez al construir el mundo (`onInit`, llamado desde
 * `sim/boss.ts::initBossEnemies`) para que el render (`EnemyViews`, que hace
 * `.map` sobre `world.enemies` en el cuerpo del componente, no en useFrame)
 * los vea desde el primer render — evita el bug de entidades que nacen sin
 * mesh por `.push` a mitad de partida (ver nota de `BarrelViews`/`ItemViews`
 * en AGENTS.md). `collectDeadDrops` (step.ts) los marca como "ya soltaron
 * moneda" desde el primer tick (hp<=0 antes de activarse nunca): así, al
 * activarse y morir de verdad más tarde, nunca sueltan moneda — cumple GDD
 * §15.3 "sin drop de moneda" sin tocar el pipeline de drops.
 */
function queenOnInit(world: World, boss: Enemy): void {
  for (let i = 0; i < QUEEN_LARVA_MAX; i++) {
    world.enemies.push({
      id: `${QUEEN_LARVA_ID_PREFIX}${i}`,
      kind: 'dummy',
      roomId: boss.roomId,
      position: { x: boss.position.x, y: boss.position.y },
      velocity: { x: 0, y: 0 },
      radius: QUEEN_LARVA_RADIUS,
      hp: 0,
      maxHp: QUEEN_LARVA_HP,
      patrolFrom: { x: boss.position.x, y: boss.position.y },
      patrolTo: { x: boss.position.x, y: boss.position.y },
      patrolForward: true,
      chasing: false,
      facing: { x: 0, y: 1 },
      trailDropTimer: 0,
      shooterPhase: 'chase',
      shooterPhaseTimer: 0,
      hitFlashUntil: 0,
      spikeDamageCooldownUntil: 0,
      knockbackUntil: 0,
      steerBias: 0,
      bossPhase: 1,
      bossVulnerable: false,
      bossDamageOutsideWindowFactor: 0,
      bossTelegraphUntil: 0,
      bossTelegraphKind: '',
      bossTimer: 0,
      bossStage: 0,
      bossCounter: 0,
    });
  }
  // Deambulación: primer objetivo válido de inmediato (evita un tick con
  // patrolTo en su propia posición, que leería dist=0 y elegiría uno nuevo
  // igualmente, pero así queda determinista desde el primer frame).
  boss.bossTimer = QUEEN_WANDER_INTERVAL;
  queenPickWanderTarget(world, boss);
  // Vulnerable SIEMPRE (GDD §15.3: sin ventana de aturdimiento clásica) —
  // se fija una única vez aquí, no hay ningún stage que la desactive nunca.
  boss.bossVulnerable = true;
}

/** Nº de larvas vivas (hp>0) de ESTA Reina (cap de rendimiento, GDD §15.3/§15.6). */
function queenLiveLarvaCount(world: World, boss: Enemy): number {
  const enemies = world.enemies;
  let count = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (isQueenLarva(e) && e.roomId === boss.roomId && e.hp > 0) count++;
  }
  return count;
}

/** Elige un nuevo punto de deambulación dentro de la sala de la Reina (determinista vía world.rng). */
function queenPickWanderTarget(world: World, boss: Enemy): void {
  const bounds = queenRoomBounds(world, boss);
  const margin = QUEEN_RADIUS + 0.6;
  const minX = bounds.minX + margin;
  const maxX = bounds.maxX - margin;
  const minY = bounds.minY + margin;
  const maxY = bounds.maxY - margin;
  boss.patrolTo.x = maxX > minX ? minX + world.rng() * (maxX - minX) : (bounds.minX + bounds.maxX) / 2;
  boss.patrolTo.y = maxY > minY ? minY + world.rng() * (maxY - minY) : (bounds.minY + bounds.maxY) / 2;
}

/** Velocidad de desplazamiento de la Reina según fase (GDD §15.3: lenta en fase 1, más movimiento en 2/3). */
function queenMoveSpeedForPhase(phase: 1 | 2 | 3): number {
  if (phase >= 3) return QUEEN_MOVE_SPEED_PHASE3;
  if (phase === 2) return QUEEN_MOVE_SPEED_PHASE2;
  return QUEEN_MOVE_SPEED_PHASE1;
}

/** Cadencia de rastro según fase (GDD §15.3: "en fase 2 el rastro se genera más rápido"). */
function queenTrailIntervalForPhase(phase: 1 | 2 | 3): number {
  return phase >= 2 ? QUEEN_TRAIL_DROP_INTERVAL_PHASE2 : QUEEN_TRAIL_DROP_INTERVAL;
}

/**
 * Deambulación lenta (GDD §15.3: "se mueve poco, no es persecución, es
 * gestión de terreno"). Fase 3 pánico: en vez de deambular al azar, el punto
 * objetivo se re-orienta periódicamente hacia una posición que tiende a
 * rodear al héroe (offset perpendicular a la línea Reina-héroe), leyéndose
 * como "traza un rastro que busca envolver al jugador" sin necesitar un
 * sistema de rastro-dirigido aparte.
 */
function queenStepMove(world: World, boss: Enemy, dt: number): void {
  boss.bossTimer -= dt;
  if (boss.bossTimer <= 0) {
    boss.bossTimer = QUEEN_WANDER_INTERVAL;
    if (boss.bossPhase >= 3) {
      const dx = boss.position.x - world.hero.position.x;
      const dy = boss.position.y - world.hero.position.y;
      const len = Math.hypot(dx, dy) || 1;
      // Perpendicular a la línea héroe→Reina: tiende a rodear en vez de
      // acercarse/alejarse en línea recta, leyéndose como "envolvente".
      const perpX = -dy / len;
      const perpY = dx / len;
      const bounds = queenRoomBounds(world, boss);
      const spread = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.35;
      const sign = world.rng() < 0.5 ? 1 : -1;
      boss.patrolTo.x = boss.position.x + perpX * spread * sign;
      boss.patrolTo.y = boss.position.y + perpY * spread * sign;
      // Clampa dentro de bounds con margen (mismo margen que queenPickWanderTarget).
      const margin = QUEEN_RADIUS + 0.6;
      boss.patrolTo.x = Math.min(Math.max(boss.patrolTo.x, bounds.minX + margin), bounds.maxX - margin);
      boss.patrolTo.y = Math.min(Math.max(boss.patrolTo.y, bounds.minY + margin), bounds.maxY - margin);
    } else {
      queenPickWanderTarget(world, boss);
    }
  }

  const speed = queenMoveSpeedForPhase(boss.bossPhase);
  const dx = boss.patrolTo.x - boss.position.x;
  const dy = boss.patrolTo.y - boss.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.2) {
    boss.velocity.x = 0;
    boss.velocity.y = 0;
    return;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  boss.position.x += nx * speed * dt;
  boss.position.y += ny * speed * dt;
  boss.velocity.x = nx * speed;
  boss.velocity.y = ny * speed;
}

/**
 * Rastro permanente (GDD §15.3: "como el Trail, pero más grande y duradero,
 * va cerrando el espacio limpio de la arena"). Reutiliza `world.puddles`
 * (mismo pool que el Trail y las esquirlas del Guardián) con parámetros
 * PROPIOS (QUEEN_TRAIL_PUDDLE_RADIUS/QUEEN_TRAIL_PUDDLE_LIFETIME): si el pool
 * está lleno, no suelta charco este tick (degradación silenciosa, igual
 * criterio que `acquirePuddle` de ai.ts) en vez de crecer el array.
 */
function queenStepTrail(world: World, boss: Enemy, dt: number): void {
  boss.bossCounter -= dt;
  if (boss.bossCounter > 0) return;
  boss.bossCounter = queenTrailIntervalForPhase(boss.bossPhase);
  const pool = world.puddles;
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) {
      pool[i].active = true;
      pool[i].position.x = boss.position.x;
      pool[i].position.y = boss.position.y;
      pool[i].radius = QUEEN_TRAIL_PUDDLE_RADIUS;
      pool[i].ttl = QUEEN_TRAIL_PUDDLE_LIFETIME;
      return;
    }
  }
}

/** Activa hasta `QUEEN_LARVA_PER_WAVE` slots libres (hp<=0) de larva, sin superar el cap de vivas. */
function queenSpawnWave(world: World, boss: Enemy, events: EventQueue): void {
  const alreadyLive = queenLiveLarvaCount(world, boss);
  let toSpawn = Math.min(QUEEN_LARVA_PER_WAVE, QUEEN_LARVA_MAX - alreadyLive);
  if (toSpawn <= 0) return;

  const enemies = world.enemies;
  for (let i = 0; i < enemies.length && toSpawn > 0; i++) {
    const larva = enemies[i];
    if (!isQueenLarva(larva) || larva.roomId !== boss.roomId || larva.hp > 0) continue;

    larva.hp = QUEEN_LARVA_HP;
    larva.maxHp = QUEEN_LARVA_HP;
    larva.position.x = boss.position.x;
    larva.position.y = boss.position.y;
    larva.velocity.x = 0;
    larva.velocity.y = 0;
    larva.hitFlashUntil = 0;
    larva.knockbackUntil = 0;

    // Fase 1: dirección fija hacia la posición del héroe EN ESTE INSTANTE
    // (línea recta, GDD §15.3); fase 2/3 recalculan cada tick (queenStepLarvae)
    // y no leen `facing`, pero se fija igual por si la fase cambia después.
    const dx = world.hero.position.x - larva.position.x;
    const dy = world.hero.position.y - larva.position.y;
    const len = Math.hypot(dx, dy) || 1;
    larva.facing.x = dx / len;
    larva.facing.y = dy / len;

    toSpawn--;
  }
  pushEvent(events, 'boss-wave-spawn', boss.position.x, boss.position.y, QUEEN_LARVA_PER_WAVE);
}

/** Cadencia de oleadas (GDD §15.6: "oleada cada ~3s"), independiente de la cadencia del rastro. */
function queenStepWaves(world: World, boss: Enemy, dt: number, events: EventQueue): void {
  boss.bossTelegraphUntil -= dt;
  if (boss.bossTelegraphUntil > 0) return;
  boss.bossTelegraphUntil = QUEEN_WAVE_INTERVAL;
  queenSpawnWave(world, boss, events);
}

/**
 * Avanza el movimiento de todas las larvas vivas de la Reina un tick (paso
 * propio simple, GDD §15.3: no pasan por `stepEnemyAi` — no tienen detección
 * ni correa, solo avanzan hacia el héroe desde que nacen). Fase 1: línea
 * recta (`facing` fijado al nacer). Fase 2/3: persiguen de verdad (recalculan
 * dirección cada tick), más agresivas en fase 3 (más rápidas).
 */
function queenStepLarvae(world: World, boss: Enemy, dt: number): void {
  const chasing = boss.bossPhase >= 2;
  const speed =
    boss.bossPhase >= 3 ? QUEEN_LARVA_CHASE_SPEED_PHASE3 : boss.bossPhase === 2 ? QUEEN_LARVA_CHASE_SPEED_PHASE2 : QUEEN_LARVA_SPEED;

  const enemies = world.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const larva = enemies[i];
    if (!isQueenLarva(larva) || larva.roomId !== boss.roomId || larva.hp <= 0) continue;

    let dirX = larva.facing.x;
    let dirY = larva.facing.y;
    if (chasing) {
      const dx = world.hero.position.x - larva.position.x;
      const dy = world.hero.position.y - larva.position.y;
      const len = Math.hypot(dx, dy) || 1;
      dirX = dx / len;
      dirY = dy / len;
      larva.facing.x = dirX;
      larva.facing.y = dirY;
    }

    larva.position.x += dirX * speed * dt;
    larva.position.y += dirY * speed * dt;
    larva.velocity.x = dirX * speed;
    larva.velocity.y = dirY * speed;
  }
}

function queenStepPattern(world: World, boss: Enemy, dt: number, events: EventQueue): void {
  // Vulnerable SIEMPRE (GDD §15.3): no hay stage que lo desactive nunca, pero
  // se reafirma cada tick por si algún día un stepPattern futuro lo tocara.
  boss.bossVulnerable = true;

  queenStepMove(world, boss, dt);
  queenStepTrail(world, boss, dt);
  queenStepWaves(world, boss, dt, events);
  queenStepLarvae(world, boss, dt);
}

function queenOnPhaseChanged(world: World, boss: Enemy): void {
  // Igual criterio que el Guardián (GDD §15.2): sostiene la pelea larga y
  // premia el progreso con una poción en el punto del cambio de fase.
  dropPotionAt(world, boss.position.x, boss.position.y);
}

export const BOSS_DEFS: Record<BossId, BossDef> = {
  'test-boss': {
    id: 'test-boss',
    name: 'Jefe de Pruebas',
    maxHp: 12,
    hitDamageCapFraction: [0.6, 0.65, 0.7],
    damageOutsideWindow: 0,
    stepPattern: testBossStepPattern,
  },
  guardian: {
    id: 'guardian',
    name: 'Guardián de Canto',
    maxHp: GUARDIAN_MAX_HP,
    radius: GUARDIAN_RADIUS,
    hitDamageCapFraction: GUARDIAN_HIT_DAMAGE_CAP_FRACTION,
    damageOutsideWindow: 0,
    stepPattern: guardianStepPattern,
    onPhaseChanged: guardianOnPhaseChanged,
  },
  queen: {
    id: 'queen',
    name: 'Reina del Enjambre',
    maxHp: QUEEN_MAX_HP,
    radius: QUEEN_RADIUS,
    hitDamageCapFraction: QUEEN_HIT_DAMAGE_CAP_FRACTION,
    // Vulnerable SIEMPRE (GDD §15.3/§15.6: "permanente, sin aturdimiento"):
    // factor 1 = daño normal en todo momento; `queenOnInit` además fija
    // `bossVulnerable=true` de una vez, así que este factor es en la práctica
    // un cinturón de seguridad (combat.ts solo lo consulta si !bossVulnerable).
    damageOutsideWindow: QUEEN_DAMAGE_OUTSIDE_WINDOW,
    stepPattern: queenStepPattern,
    onPhaseChanged: queenOnPhaseChanged,
    onInit: queenOnInit,
  },
};

export function getBossDef(id: BossId): BossDef {
  return BOSS_DEFS[id];
}
