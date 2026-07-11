/**
 * Guardián de Canto (GDD §15.2, Fase B1).
 *
 * Reuso de campos escalares/vectoriales de `Enemy` (ver nota en world.ts): un
 * jefe nunca pasa por `stepEnemyAi` (solo por `lifecycle.ts::stepBosses`), así
 * que estos campos —pensados para Dummy/Spike/Trail— quedan libres como
 * almacenamiento genérico sin ampliar `Enemy` con más campos "boss*":
 * - `facing`: dirección unitaria de la carga en curso (fijada al final del
 *   telegraph, hacia la última posición vista del héroe; no se recalcula
 *   durante la carga, GDD §15.2 "carga en línea recta").
 * - `patrolTo`: siguiente esquina objetivo de la patrulla perimetral
 *   (recorrido cíclico de las 4 esquinas de la sala, no ida/vuelta).
 *   `patrolFrom` no se usa.
 * Los barriles rodantes (GDD §15.2, playtest 2026-07-06) NO necesitan estado
 * propio en el Guardián: la cadencia de aparición se deriva sin estado del
 * "slot" de world.time (mismo truco que GUARDIAN_DUST_INTERVAL más abajo),
 * y el barril en sí vive en `world.barrels` (pool genérico, ver hazards.ts).
 * - `bossTimer`: cuenta atrás del stage actual (telegraph/pausa/duración
 *   máxima de carga de seguridad/pausa de recuperación).
 * - `bossStage`: GUARDIAN_STAGE_* de abajo.
 * - `bossCounter`: nº de cargas YA completadas en la secuencia encadenada
 *   actual (0 al iniciar; fase 2/3 encadena GUARDIAN_PHASE2_CHARGE_COUNT
 *   antes de volver a patrullar, GDD §15.2).
 */

import { applyDamageToHero } from '@/game/sim/combat';
import { pushEvent, type EventQueue } from '@/game/sim/events';
import { explodeBarrel } from '@/game/sim/hazards';
import { dropPotionAt } from '@/game/sim/items';
import type { AABB, Enemy, World } from '@/game/sim/world';
import { bossHitsSolid, bossRoomBounds, moveBossTowardWithAvoidance } from '../movement';
import { guardianFindLiveBarrelAt, guardianStepBarrelSpawn } from './barrels';
import {
  GUARDIAN_BARREL_STUN_DURATION,
  GUARDIAN_CHARGE_DAMAGE_PHASE1,
  GUARDIAN_CHARGE_DAMAGE_PHASE3,
  GUARDIAN_CHARGE_KNOCKBACK_SPEED,
  GUARDIAN_CHARGE_MAX_DURATION,
  GUARDIAN_CHARGE_SPEED,
  GUARDIAN_DETECT_RANGE,
  GUARDIAN_DOUBLE_CHARGE_PAUSE,
  GUARDIAN_DUST_INTERVAL,
  GUARDIAN_HIT_DAMAGE_CAP_FRACTION,
  GUARDIAN_MIN_CHARGE_CLEARANCE,
  GUARDIAN_PATROL_SPEED,
  GUARDIAN_PHASE2_CHARGE_COUNT,
  GUARDIAN_RADIUS,
  GUARDIAN_RECOVER_PAUSE,
  GUARDIAN_SHARD_LIFETIME,
  GUARDIAN_SHARD_RADIUS,
  GUARDIAN_STUN_DURATION,
  GUARDIAN_TELEGRAPH_DURATION,
} from './constants';

const GUARDIAN_STAGE_PATROL = 0;
const GUARDIAN_STAGE_TELEGRAPH = 1;
const GUARDIAN_STAGE_CHARGING = 2;
const GUARDIAN_STAGE_STUNNED = 3;
/** Pausa corta entre cargas encadenadas (fase 2/3, GDD §15.2). */
const GUARDIAN_STAGE_CHAIN_PAUSE = 4;
/**
 * Reposicionamiento antes de cargar (GDD §15.2, playtest 2026-07-06 "no carga
 * si tiene una roca/muro demasiado cerca"): el héroe ya está detectado pero el
 * recorrido de carga hacia él está bloqueado a corta distancia — en vez de
 * telegrafiar, el Guardián se mueve (a velocidad de patrulla) hacia el centro
 * de su sala buscando línea despejada, y reintenta la comprobación cada tick.
 * Evita el exploit de estrellarlo una y otra vez contra una roca pegada
 * mientras el héroe le pega gratis al lado.
 */
const GUARDIAN_STAGE_REPOSITION = 5;

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

/**
 * Avanza la patrulla perimetral lenta hacia la esquina objetivo (`patrolTo`),
 * saltando a la siguiente al llegar.
 *
 * Evitación por deslizamiento de eje (axis-slide, fix B1.6.1 tras playtest
 * 2026-07-06): en B1.6 las rocas pasaron de las esquinas de la sala al
 * interior, así que el tramo recto patrulla-esquina puede atravesar una roca
 * (el tramo inicial desde el centro, o la recuperación tras una carga que
 * termina a mitad de arena). El movimiento recto de antes no comprobaba
 * `bossHitsSolid`: la resolución de colisión general (physics.ts) lo
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
    const corners = guardianPatrolCorners(bossRoomBounds(world, boss));
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
  moveBossTowardWithAvoidance(world, boss, boss.patrolTo.x, boss.patrolTo.y, dt, GUARDIAN_PATROL_SPEED);
}

/** Nº de puntos de muestreo a lo largo de GUARDIAN_MIN_CHARGE_CLEARANCE al comprobar recorrido de carga despejado. */
const GUARDIAN_CHARGE_CLEARANCE_SAMPLES = 6;

/**
 * true si el Guardián tiene recorrido despejado de al menos
 * GUARDIAN_MIN_CHARGE_CLEARANCE unidades en la dirección (dirX,dirY) desde su
 * posición actual (GDD §15.2, playtest 2026-07-06 "no carga si tiene una
 * roca/muro demasiado cerca"): sondea varios puntos a lo largo de esa
 * distancia con `bossHitsSolid` — si CUALQUIERA de ellos solapa un sólido,
 * el recorrido no está despejado (la carga chocaría casi de inmediato, junto
 * al héroe, dejando al Guardián aturdido a bocajarro donde el jugador le pega
 * gratis). Sin asignaciones: solo escalares en un bucle fijo.
 */
function guardianChargePathClear(world: World, boss: Enemy, dirX: number, dirY: number): boolean {
  for (let i = 1; i <= GUARDIAN_CHARGE_CLEARANCE_SAMPLES; i++) {
    const d = (GUARDIAN_MIN_CHARGE_CLEARANCE * i) / GUARDIAN_CHARGE_CLEARANCE_SAMPLES;
    const x = boss.position.x + dirX * d;
    const y = boss.position.y + dirY * d;
    if (bossHitsSolid(world, boss, x, y)) return false;
  }
  return true;
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
      // Slot reciclado del pool compartido: puede venir de un charco de la
      // Reina (slows=true, rediseño 2026-07-10). La esquirla solo hace daño
      // de contacto — resetea explícitamente.
      pool[i].slows = false;
      return;
    }
  }
}

/**
 * Decide si el Guardián puede telegrafiar una carga ya mismo o si debe
 * reposicionarse antes (GDD §15.2, playtest 2026-07-06 "no carga si tiene una
 * roca/muro demasiado cerca en la dirección de tiro"): comprueba
 * `guardianChargePathClear` en la dirección hacia la posición ACTUAL del
 * héroe. Con recorrido despejado, telegrafía normal (comportamiento intacto:
 * su ventana sigue siendo estrellarse tras el aviso). Sin recorrido, entra en
 * GUARDIAN_STAGE_REPOSITION en vez de telegrafiar — nunca se aturde pegado a
 * una roca a bocajarro del héroe. Se llama tanto desde PATROL (primera carga
 * de la secuencia) como desde CHAIN_PAUSE/REPOSITION (reintentos y cargas
 * encadenadas de fase 2/3), sin tocar `bossCounter` (ya gestionado por cada
 * llamador).
 */
function guardianTryEnterChargeOrReposition(world: World, boss: Enemy, events: EventQueue): void {
  const dx = world.hero.position.x - boss.position.x;
  const dy = world.hero.position.y - boss.position.y;
  const len = Math.hypot(dx, dy) || 1;
  const dirX = dx / len;
  const dirY = dy / len;

  if (guardianChargePathClear(world, boss, dirX, dirY)) {
    guardianEnterTelegraph(world, boss, events);
  } else {
    boss.bossStage = GUARDIAN_STAGE_REPOSITION;
    boss.velocity.x = 0;
    boss.velocity.y = 0;
  }
}

export function guardianStepPattern(world: World, boss: Enemy, dt: number, events: EventQueue): void {
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
        if (!bossHitsSolid(world, boss, nextX, nextY)) {
          boss.position.x = nextX;
          boss.position.y = nextY;
        }
        explodeBarrel(world, rammedBarrel, events, true);
        // El barril castiga fuerte (GDD §15.2, playtest 2026-07-06): la
        // explosión ya le aplica su daño de barril (GUARDIAN_BARREL_DAMAGE_FRACTION,
        // el mayor de los tres modos de daño del Guardián) al jefe vía
        // `explodeBarrel`/`applyDamageToEnemy` con bypass de ventana — ver
        // `sim/hazards.ts::explodeBarrel` y `enemy.bossBarrelDamage`.
        pushEvent(events, 'boss-barrel-charge-stun', boss.position.x, boss.position.y, GUARDIAN_BARREL_STUN_DURATION);
        guardianEnterStunned(boss, GUARDIAN_BARREL_STUN_DURATION);
        break;
      }

      if (bossHitsSolid(world, boss, nextX, nextY)) {
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
        guardianTryEnterChargeOrReposition(world, boss, events);
      }
      break;
    }

    case GUARDIAN_STAGE_REPOSITION: {
      // Se mueve (a velocidad de patrulla) hacia el centro de su sala buscando
      // línea despejada hacia el héroe (GDD §15.2, playtest 2026-07-06): no
      // toca `patrolTo` (el ciclo de esquinas de la patrulla normal queda
      // intacto para cuando vuelva a patrullar de verdad).
      const bounds = bossRoomBounds(world, boss);
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      moveBossTowardWithAvoidance(world, boss, centerX, centerY, dt, GUARDIAN_PATROL_SPEED);
      guardianTryEnterChargeOrReposition(world, boss, events);
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
        guardianTryEnterChargeOrReposition(world, boss, events);
      }
      break;
    }
  }
}

export function guardianOnPhaseChanged(world: World, boss: Enemy): void {
  // Sin reset de bossStage/timers propios: un cambio de fase a mitad de
  // patrulla/telegraph/carga no debe interrumpir el gesto en curso (GDD §15.1
  // punto 3: "intensifica, nunca sustituye a mitad"). El único efecto de
  // cruzar a fase 2/3 es que la PRÓXIMA vez que el Guardián sale de
  // STUNNED (guardianChargesForPhase) decide encadenar una segunda carga, y
  // que el daño de la carga en curso (si golpea al héroe) ya lee
  // `boss.bossPhase` actualizado (checkPhaseAndDefeat en lifecycle.ts corre
  // ANTES de que el siguiente tick vuelva a llamar a este patrón).
  //
  // Vida de recompensa (GDD §15.2, playtest 2026-07-06): al cruzar a fase 2 y
  // a fase 3, suelta una poción en su posición actual (sostiene la pelea
  // larga y premia el progreso). Reutiliza el pipeline normal de items: el
  // pickup dispara el evento 'item-pickup' de siempre, sin plumbing propio.
  dropPotionAt(world, boss.position.x, boss.position.y);
}
