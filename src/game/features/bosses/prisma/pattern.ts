/**
 * El Prisma (GDD §15.4, Fase B3): escudo de color rotatorio azul→amarillo→
 * violeta→azul, con un ataque temático por color. Solo el arma del color
 * activo hace daño de verdad (gate en
 * `features/combat/combat.ts::applyDamageToEnemy`, vía
 * `Enemy.bossWeaponGateA/B`); el resto rebota con el evento
 * 'boss-immune-hit'.
 *
 * SIN ventana de vulnerabilidad (tuning post-playtest 2026-07-17, David:
 * "quita la ventana de vulnerabilidad, haz que sólo le afecten los ataques de
 * su color, pero siempre con el daño normal"): a diferencia del resto de
 * jefes (Guardián/Reina/Tormenta, que sí alternan fases "apenas daña"/"daño
 * completo"), el Prisma es dañable SIEMPRE — en cualquier momento de su
 * ciclo, telegrafiando, atacando o esperando — mientras el arma coincida con
 * su color activo. `bossVulnerable` se fija a `true` una vez en `onInit` y no
 * vuelve a tocarse: el ÚNICO filtro de daño que le queda es el gate de color
 * ya existente. Solo afecta al Prisma; el resto de jefes conserva su propia
 * ventana sin cambios (cada `pattern.ts` es independiente).
 *
 * Reuso de campos escalares/vectoriales de `Enemy` (mismo espíritu que
 * Guardián/Reina, ver sus respectivos `pattern.ts`): el Prisma nunca pasa por
 * `stepEnemyAi`, así que:
 * - `bossCounter`: índice de color ACTIVO (`PRISMA_COLOR_RAM/ARROW/SPELL`,
 *   0/1/2). Solo cambia al rotar. También sirve directamente como
 *   `Projectile.colorTag` de sus proyectiles (`PRISMA_COLOR_WEAPON[bossCounter]`
 *   ya es 'ram'|'arrow'|'spell' — mismo string que lee el render para teñir,
 *   ver `ProjectileView.tsx`).
 * - `patrolFrom.x`: world.time absoluto en el que toca la PRÓXIMA rotación de
 *   color (el "reloj maestro" del modo). `patrolFrom.y`/`patrolTo.y` no se
 *   usan.
 * - `patrolTo.x`: world.time absoluto hasta el que sigue activo el SOLAPE de
 *   fase 3 (el color anterior sigue dañando); 0/pasado = sin solape. El color
 *   anterior se DERIVA de `bossCounter` (rotación fija, no hace falta
 *   guardarlo aparte).
 * - `bossStage`: sub-máquina del ataque del color activo (IDLE/TELEGRAPH/
 *   EXECUTE, ver constantes de abajo). Los mismos 3 valores sirven para los
 *   3 modos (uno activo a la vez, sin ambigüedad).
 * - `bossTimer`: cuenta atrás dentro de `bossStage` (espera de cadencia en
 *   IDLE, duración del telegraph, duración de la embestida en EXECUTE).
 * - `bossTelegraphUntil`/`bossTelegraphKind`: compartido por DOS telegraphs
 *   que nunca coinciden en el tiempo por construcción — el de cada ataque
 *   individual (`'prisma-ram'|'prisma-arrow'|'prisma-spell'`, solo se entra
 *   desde IDLE) y el de cambio de color (`'color-change:<arma-siguiente>'`,
 *   solo se arma en IDLE dentro de los últimos `PRISMA_COLOR_TELEGRAPH_LEAD`
 *   segundos del modo, momento en el que ya no se inician ataques nuevos).
 * - `facing`: dirección de la embestida/disparo en curso (fijada al terminar
 *   el telegraph del ataque, como el Guardián).
 */

import { applyDamageToHero, applyKnockbackToHero, fireEnemyProjectile } from '@/game/features/combat/combat';
import { pushEvent, type EventQueue } from '@/engine/events';
import type { Enemy, World } from '@/game/world/types';
import { bossHitsSolid, moveBossTowardWithAvoidance } from '@/game/features/bosses/movement';
import {
  PRISMA_ARROW_BURST_COUNT,
  PRISMA_ARROW_CADENCE,
  PRISMA_ARROW_FAN_ANGLE_STEP,
  PRISMA_ARROW_RADIUS,
  PRISMA_ARROW_SPEED,
  PRISMA_ARROW_TELEGRAPH_DURATION,
  PRISMA_COLOR_ARROW,
  PRISMA_COLOR_RAM,
  PRISMA_COLOR_TELEGRAPH_LEAD,
  PRISMA_COLOR_WEAPON,
  PRISMA_HIT_DAMAGE_CAP_FRACTION,
  PRISMA_HIT_DAMAGE_PHASE1,
  PRISMA_HIT_DAMAGE_PHASE3,
  PRISMA_MODE_DURATION_PHASE1,
  PRISMA_MODE_DURATION_PHASE2,
  PRISMA_MODE_DURATION_PHASE3,
  PRISMA_PHASE2_CADENCE_MULTIPLIER,
  PRISMA_PHASE3_OVERLAP_DURATION,
  PRISMA_RAM_CADENCE,
  PRISMA_RAM_CHARGE_DURATION,
  PRISMA_RAM_CHARGE_SPEED,
  PRISMA_RAM_KNOCKBACK_SPEED,
  PRISMA_RAM_TELEGRAPH_DURATION,
  PRISMA_SPELL_ARC_COUNT,
  PRISMA_SPELL_BOUNCES,
  PRISMA_SPELL_CADENCE,
  PRISMA_SPELL_FAN_ANGLE_STEP,
  PRISMA_SPELL_RADIUS,
  PRISMA_SPELL_SPEED,
  PRISMA_SPELL_TELEGRAPH_DURATION,
  PRISMA_WIND_MOVE_SPEED,
  PRISMA_WIND_STANDOFF_DISTANCE,
  PRISMA_WIND_STRAFE_ANGULAR_SPEED,
} from './constants';

const PRISMA_ATTACK_IDLE = 0;
const PRISMA_ATTACK_TELEGRAPH = 1;
const PRISMA_ATTACK_EXECUTE = 2;

/**
 * Valor de `bossTelegraphKind` durante una embestida que YA golpeó al héroe:
 * flag de "un solo golpe por embestida" (mismo truco que
 * `GUARDIAN_CHARGE_HIT_FLAG` del Guardián). Solo se usa en EXECUTE, así que
 * nunca choca con los otros usos de `bossTelegraphKind` (IDLE/TELEGRAPH).
 */
const PRISMA_RAM_HIT_FLAG = 'prisma-ram-hit';

function prismaModeDurationForPhase(phase: 1 | 2 | 3): number {
  if (phase === 3) return PRISMA_MODE_DURATION_PHASE3;
  if (phase === 2) return PRISMA_MODE_DURATION_PHASE2;
  return PRISMA_MODE_DURATION_PHASE1;
}

function prismaCadenceForColor(colorIndex: number, phase: 1 | 2 | 3): number {
  const base =
    colorIndex === PRISMA_COLOR_RAM
      ? PRISMA_RAM_CADENCE
      : colorIndex === PRISMA_COLOR_ARROW
        ? PRISMA_ARROW_CADENCE
        : PRISMA_SPELL_CADENCE;
  return phase >= 2 ? base * PRISMA_PHASE2_CADENCE_MULTIPLIER : base;
}

/** Mismo cálculo que `bosses/lifecycle.ts::capBossHitDamage`, inline para no importarlo (evitaría un ciclo: lifecycle.ts → registry.ts → prisma/pattern.ts → lifecycle.ts). */
function prismaCapHitDamage(heroMaxHp: number, phase: 1 | 2 | 3, rawDamage: number): number {
  const cap = PRISMA_HIT_DAMAGE_CAP_FRACTION[phase - 1] * heroMaxHp;
  return Math.min(rawDamage, Math.max(1, Math.floor(cap)));
}

function prismaRawHitDamage(phase: 1 | 2 | 3): number {
  return phase >= 3 ? PRISMA_HIT_DAMAGE_PHASE3 : PRISMA_HIT_DAMAGE_PHASE1;
}

/** Arranque de un ciclo de ataque: telegrafía el color activo y fija `facing` hacia el héroe. */
function prismaEnterTelegraph(world: World, boss: Enemy, events: EventQueue): void {
  const weapon = PRISMA_COLOR_WEAPON[boss.bossCounter];
  const duration =
    weapon === 'ram' ? PRISMA_RAM_TELEGRAPH_DURATION : weapon === 'arrow' ? PRISMA_ARROW_TELEGRAPH_DURATION : PRISMA_SPELL_TELEGRAPH_DURATION;

  const dx = world.hero.position.x - boss.position.x;
  const dy = world.hero.position.y - boss.position.y;
  const len = Math.hypot(dx, dy) || 1;
  boss.facing.x = dx / len;
  boss.facing.y = dy / len;

  boss.bossTelegraphKind = `prisma-${weapon}`;
  boss.bossTelegraphUntil = world.time + duration;
  boss.bossStage = PRISMA_ATTACK_TELEGRAPH;
  boss.bossTimer = duration;
  boss.velocity.x = 0;
  boss.velocity.y = 0;
  pushEvent(events, 'boss-telegraph', boss.position.x, boss.position.y, 1, boss.bossTelegraphKind);
}

/**
 * Cierra el ataque en curso y arma la cadencia hasta el próximo intento (sin
 * ventana de vulnerabilidad que abrir, tuning post-playtest 2026-07-17: el
 * Prisma ya es dañable siempre que el color coincida, ver cabecera del
 * fichero — este helper solo devuelve el ciclo a IDLE).
 */
function prismaFinishAttack(boss: Enemy): void {
  boss.bossTelegraphUntil = 0;
  boss.bossTelegraphKind = '';
  boss.bossStage = PRISMA_ATTACK_IDLE;
  boss.bossTimer = prismaCadenceForColor(boss.bossCounter, boss.bossPhase);
  boss.velocity.x = 0;
  boss.velocity.y = 0;
}

/** Viento (amarillo/arrow, GDD §15.4): ráfaga de 3 dardos rectos en abanico hacia el héroe. */
function prismaFireArrowBurst(world: World, boss: Enemy, events: EventQueue): void {
  const dx = world.hero.position.x - boss.position.x;
  const dy = world.hero.position.y - boss.position.y;
  const len = Math.hypot(dx, dy) || 1;
  const dirX = dx / len;
  const dirY = dy / len;
  const damage = prismaCapHitDamage(world.hero.maxHp, boss.bossPhase, prismaRawHitDamage(boss.bossPhase));

  for (let i = 0; i < PRISMA_ARROW_BURST_COUNT; i++) {
    const angle = (i - (PRISMA_ARROW_BURST_COUNT - 1) / 2) * PRISMA_ARROW_FAN_ANGLE_STEP;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rDirX = dirX * cos - dirY * sin;
    const rDirY = dirX * sin + dirY * cos;
    fireEnemyProjectile(
      world,
      boss.position.x,
      boss.position.y,
      rDirX,
      rDirY,
      PRISMA_ARROW_SPEED,
      damage,
      PRISMA_ARROW_RADIUS,
      0,
      PRISMA_COLOR_WEAPON[boss.bossCounter],
    );
  }
  pushEvent(events, 'boss-telegraph', boss.position.x, boss.position.y, 0, 'prisma-arrow-fire');
}

/** Sombra (violeta/spell, GDD §15.4): 2 arcos lentos con rebote en muros. */
function prismaFireSpellArcs(world: World, boss: Enemy, events: EventQueue): void {
  const dx = world.hero.position.x - boss.position.x;
  const dy = world.hero.position.y - boss.position.y;
  const len = Math.hypot(dx, dy) || 1;
  const dirX = dx / len;
  const dirY = dy / len;
  const damage = prismaCapHitDamage(world.hero.maxHp, boss.bossPhase, prismaRawHitDamage(boss.bossPhase));

  for (let i = 0; i < PRISMA_SPELL_ARC_COUNT; i++) {
    const angle = (i - (PRISMA_SPELL_ARC_COUNT - 1) / 2) * PRISMA_SPELL_FAN_ANGLE_STEP;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rDirX = dirX * cos - dirY * sin;
    const rDirY = dirX * sin + dirY * cos;
    fireEnemyProjectile(
      world,
      boss.position.x,
      boss.position.y,
      rDirX,
      rDirY,
      PRISMA_SPELL_SPEED,
      damage,
      PRISMA_SPELL_RADIUS,
      PRISMA_SPELL_BOUNCES,
      PRISMA_COLOR_WEAPON[boss.bossCounter],
    );
  }
  pushEvent(events, 'boss-telegraph', boss.position.x, boss.position.y, 0, 'prisma-spell-fire');
}

/** Piedra (azul/ram, GDD §15.4): avanza la embestida un tick; se resuelve por choque contra sólido o por agotar el tiempo máximo. */
function prismaStepRamCharge(world: World, boss: Enemy, dt: number, events: EventQueue): void {
  boss.bossTimer -= dt;

  const nextX = boss.position.x + boss.facing.x * PRISMA_RAM_CHARGE_SPEED * dt;
  const nextY = boss.position.y + boss.facing.y * PRISMA_RAM_CHARGE_SPEED * dt;

  const hero = world.hero;
  const rr = boss.radius + hero.radius;
  const dxHero = hero.position.x - nextX;
  const dyHero = hero.position.y - nextY;
  if (boss.bossTelegraphKind !== PRISMA_RAM_HIT_FLAG && dxHero * dxHero + dyHero * dyHero <= rr * rr) {
    const damage = prismaCapHitDamage(hero.maxHp, boss.bossPhase, prismaRawHitDamage(boss.bossPhase));
    const wasHit = applyDamageToHero(world, damage, events);
    if (!wasHit) {
      applyKnockbackToHero(world, boss.facing.x * PRISMA_RAM_KNOCKBACK_SPEED, boss.facing.y * PRISMA_RAM_KNOCKBACK_SPEED);
    }
    boss.bossTelegraphKind = PRISMA_RAM_HIT_FLAG;
  }

  if (bossHitsSolid(world, boss, nextX, nextY)) {
    prismaFinishAttack(boss);
    return;
  }
  boss.position.x = nextX;
  boss.position.y = nextY;
  boss.velocity.x = boss.facing.x * PRISMA_RAM_CHARGE_SPEED;
  boss.velocity.y = boss.facing.y * PRISMA_RAM_CHARGE_SPEED;

  if (boss.bossTimer <= 0) {
    prismaFinishAttack(boss);
  }
}

/** Resuelve el fin del telegraph: dispara/embiste según el color activo. */
function prismaExecuteAttack(world: World, boss: Enemy, events: EventQueue): void {
  const weapon = PRISMA_COLOR_WEAPON[boss.bossCounter];
  boss.bossTelegraphUntil = 0;

  if (weapon === 'ram') {
    boss.bossTelegraphKind = ''; // '' = esta embestida aún no golpeó (ver PRISMA_RAM_HIT_FLAG)
    boss.bossStage = PRISMA_ATTACK_EXECUTE;
    boss.bossTimer = PRISMA_RAM_CHARGE_DURATION;
    return;
  }

  boss.bossTelegraphKind = '';
  if (weapon === 'arrow') {
    prismaFireArrowBurst(world, boss, events);
  } else {
    prismaFireSpellArcs(world, boss, events);
  }
  prismaFinishAttack(boss);
}

/** Viento (GDD §15.4 "se mueve rápido"): reposicionamiento suave orbitando al héroe; los otros dos modos se quedan quietos entre ataques. */
function prismaStepIdleMovement(world: World, boss: Enemy, dt: number): void {
  if (PRISMA_COLOR_WEAPON[boss.bossCounter] !== 'arrow') {
    boss.velocity.x = 0;
    boss.velocity.y = 0;
    return;
  }
  const angle = world.time * PRISMA_WIND_STRAFE_ANGULAR_SPEED;
  const targetX = world.hero.position.x + Math.cos(angle) * PRISMA_WIND_STANDOFF_DISTANCE;
  const targetY = world.hero.position.y + Math.sin(angle) * PRISMA_WIND_STANDOFF_DISTANCE;
  moveBossTowardWithAvoidance(world, boss, targetX, targetY, dt, PRISMA_WIND_MOVE_SPEED);
}

export function prismaOnInit(world: World, boss: Enemy): void {
  const startColor = Math.floor(world.rng() * PRISMA_COLOR_WEAPON.length);
  boss.bossCounter = startColor;
  boss.bossWeaponGateA = PRISMA_COLOR_WEAPON[startColor];
  boss.bossWeaponGateB = '';
  boss.bossStage = PRISMA_ATTACK_IDLE;
  boss.bossTimer = prismaCadenceForColor(startColor, boss.bossPhase);
  boss.patrolFrom.x = world.time + prismaModeDurationForPhase(boss.bossPhase);
  boss.patrolTo.x = 0;
  boss.bossTelegraphUntil = 0;
  boss.bossTelegraphKind = '';
  // Sin ventana de vulnerabilidad (tuning post-playtest 2026-07-17, ver
  // cabecera del fichero): fijado UNA vez aquí, `prismaStepPattern` ya no lo
  // toca — el gate de color es el único filtro de daño que le queda.
  boss.bossVulnerable = true;
}

export function prismaStepPattern(world: World, boss: Enemy, dt: number, events: EventQueue): void {
  // Sin ventana de vulnerabilidad (tuning post-playtest 2026-07-17, ver
  // cabecera del fichero): `bossVulnerable` quedó fijado a `true` en
  // `prismaOnInit` y no se toca aquí — reasertado por defensividad, por si
  // algo externo lo tocara entre ticks.
  boss.bossVulnerable = true;

  // Gate de color (GDD §15.4): el arma activa SIEMPRE gatea — es el ÚNICO
  // filtro de daño que le queda al Prisma (sin ventana que module cuánto pasa).
  boss.bossWeaponGateA = PRISMA_COLOR_WEAPON[boss.bossCounter];
  // Solape de fase 3: el color anterior (derivado de la rotación fija) sigue
  // siendo válido un rato tras el cambio.
  const previousColor = (boss.bossCounter + PRISMA_COLOR_WEAPON.length - 1) % PRISMA_COLOR_WEAPON.length;
  boss.bossWeaponGateB = boss.bossPhase >= 3 && world.time < boss.patrolTo.x ? PRISMA_COLOR_WEAPON[previousColor] : '';

  const attackActive = boss.bossStage !== PRISMA_ATTACK_IDLE;
  const remainingInMode = boss.patrolFrom.x - world.time;

  // Telegraph de cambio de color (GDD §15.4: "~1.5s antes, tartamudea"): solo
  // se arma desde IDLE (nunca corta un ataque en curso) y nunca reinicia un
  // telegraph de ataque ya en marcha (comprobado por `attackActive` arriba).
  if (!attackActive && remainingInMode > 0 && remainingInMode <= PRISMA_COLOR_TELEGRAPH_LEAD) {
    const nextColor = (boss.bossCounter + 1) % PRISMA_COLOR_WEAPON.length;
    boss.bossTelegraphKind = `color-change:${PRISMA_COLOR_WEAPON[nextColor]}`;
    boss.bossTelegraphUntil = boss.patrolFrom.x;
  }

  // Rotación: solo si no hay un ataque a mitad (deja resolver el ciclo en
  // curso; retrasa la rotación como mucho lo que dure ese ataque, GDD §15.1
  // punto 3 "nunca corta a mitad").
  if (remainingInMode <= 0 && !attackActive) {
    boss.bossCounter = (boss.bossCounter + 1) % PRISMA_COLOR_WEAPON.length;
    boss.patrolFrom.x = world.time + prismaModeDurationForPhase(boss.bossPhase);
    boss.patrolTo.x = world.time + PRISMA_PHASE3_OVERLAP_DURATION;
    boss.bossStage = PRISMA_ATTACK_IDLE;
    boss.bossTimer = prismaCadenceForColor(boss.bossCounter, boss.bossPhase);
    boss.bossTelegraphUntil = 0;
    boss.bossTelegraphKind = '';
    boss.velocity.x = 0;
    boss.velocity.y = 0;
    return;
  }

  switch (boss.bossStage) {
    case PRISMA_ATTACK_IDLE: {
      if (remainingInMode > PRISMA_COLOR_TELEGRAPH_LEAD) {
        prismaStepIdleMovement(world, boss, dt);
        boss.bossTimer -= dt;
        if (boss.bossTimer <= 0) prismaEnterTelegraph(world, boss, events);
      } else {
        // Tramo final del modo (tartamudeo de cambio de color): sin nuevos
        // ataques, el Prisma se detiene a esperar la rotación.
        boss.velocity.x = 0;
        boss.velocity.y = 0;
      }
      break;
    }
    case PRISMA_ATTACK_TELEGRAPH: {
      boss.bossTimer -= dt;
      if (boss.bossTimer <= 0) prismaExecuteAttack(world, boss, events);
      break;
    }
    case PRISMA_ATTACK_EXECUTE:
    default: {
      prismaStepRamCharge(world, boss, dt, events);
      break;
    }
  }
}

/**
 * Reajusta el reloj de rotación a la duración de la nueva fase (GDD §15.4:
 * "la rotación se acelera") sin cortar un ataque en curso (GDD §15.1 punto 3:
 * "intensifica, nunca sustituye a mitad"): solo se aplica si el Prisma está
 * IDLE en ese instante; si está a mitad de un ataque, el próximo ciclo de
 * IDLE ya calculará la cadencia con `boss.bossPhase` actualizado.
 */
export function prismaOnPhaseChanged(world: World, boss: Enemy, phase: 2 | 3): void {
  if (boss.bossStage === PRISMA_ATTACK_IDLE) {
    boss.patrolFrom.x = world.time + prismaModeDurationForPhase(phase);
  }
}
