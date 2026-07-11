/**
 * Larvas de la Reina del Enjambre (GDD §15.3, rediseño 2026-07-10): conviven
 * dos roles — PERSEGUIDORAS (nacen del boss, persiguen al héroe) y GUARDIANAS
 * (nacen de una columna, la orbitan y embisten). NO son un `BossDef` ni un
 * `EnemyKind` nuevo — son `Enemy` normales de `kind:'dummy'` con `hp`/`radius`
 * propios, viviendo como slots PREASIGNADOS al final de `world.enemies` (ver
 * `queen/pattern.ts::queenOnInit`), igual pool preasignado que
 * proyectiles/charcos.
 */

import { pushEvent, type EventQueue } from '@/game/sim/events';
import type { Enemy, World } from '@/game/sim/world';
import {
  QUEEN_CHASER_PER_WAVE_BY_PHASE,
  QUEEN_GUARDIAN_CHARGE_COOLDOWN,
  QUEEN_GUARDIAN_CHARGE_DURATION,
  QUEEN_GUARDIAN_CHARGE_RANGE,
  QUEEN_GUARDIAN_CHARGE_SPEED,
  QUEEN_GUARDIAN_MAX,
  QUEEN_GUARDIAN_ORBIT_RADIUS,
  QUEEN_GUARDIAN_SPAWN_INTERVAL,
  QUEEN_GUARDIAN_SPEED,
  QUEEN_GUARDIAN_TELEGRAPH,
  QUEEN_LARVA_CHASE_SPEED_PHASE2,
  QUEEN_LARVA_CHASE_SPEED_PHASE3,
  QUEEN_LARVA_HP,
  QUEEN_LARVA_ID_PREFIX,
  QUEEN_LARVA_MAX,
  QUEEN_LARVA_SPEED,
} from './constants';

export function isQueenLarva(enemy: Enemy): boolean {
  return enemy.id.startsWith(QUEEN_LARVA_ID_PREFIX);
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

/**
 * Perseguidoras: nacen del BOSS cada oleada y persiguen al héroe (rediseño
 * 2026-07-10). Su número escala con la fase (`QUEEN_CHASER_PER_WAVE_BY_PHASE` =
 * 1/2/3), respetando el cap TOTAL de larvas vivas (`QUEEN_LARVA_MAX`).
 */
export function queenSpawnChasers(world: World, boss: Enemy, events: EventQueue): void {
  const total = queenLiveLarvaCount(world, boss);
  let toSpawn = Math.min(QUEEN_CHASER_PER_WAVE_BY_PHASE[boss.bossPhase - 1], QUEEN_LARVA_MAX - total);
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
    larva.chasing = true; // rol: perseguidora

    const dx = world.hero.position.x - larva.position.x;
    const dy = world.hero.position.y - larva.position.y;
    const len = Math.hypot(dx, dy) || 1;
    larva.facing.x = dx / len;
    larva.facing.y = dy / len;

    toSpawn--;
  }
  pushEvent(events, 'boss-wave-spawn', boss.position.x, boss.position.y, 1);
}

/** Nº de guardianas vivas (larvas con `chasing=false`) de esta Reina. */
function queenLiveGuardianCount(world: World, boss: Enemy): number {
  const enemies = world.enemies;
  let count = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (isQueenLarva(e) && e.roomId === boss.roomId && e.hp > 0 && !e.chasing) count++;
  }
  return count;
}

/** true si alguna guardiana viva está anclada (`patrolFrom`) al centro de la columna `col`. */
function queenColumnHasGuardian(world: World, boss: Enemy, cx: number, cy: number): boolean {
  const enemies = world.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!isQueenLarva(e) || e.roomId !== boss.roomId || e.hp <= 0 || e.chasing) continue;
    if (Math.abs(e.patrolFrom.x - cx) < 0.01 && Math.abs(e.patrolFrom.y - cy) < 0.01) return true;
  }
  return false;
}

/**
 * Activa un slot de larva libre como GUARDIANA de la columna `col` (playtest
 * 2026-07-10): nace en el borde de su órbita, con `chasing=false`, `patrolFrom`
 * anclado a la columna y su máquina de embestida en reposo (`bossStage=0` +
 * cooldown inicial en `bossTimer`, para que no cargue nada más nacer). Devuelve
 * true si había un slot libre.
 */
export function queenActivateGuardian(
  world: World,
  boss: Enemy,
  col: { position: { x: number; y: number } },
  events: EventQueue | null,
): boolean {
  const enemies = world.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const larva = enemies[i];
    if (!isQueenLarva(larva) || larva.roomId !== boss.roomId || larva.hp > 0) continue;
    larva.hp = QUEEN_LARVA_HP;
    larva.maxHp = QUEEN_LARVA_HP;
    larva.position.x = col.position.x + QUEEN_GUARDIAN_ORBIT_RADIUS;
    larva.position.y = col.position.y;
    larva.velocity.x = 0;
    larva.velocity.y = 0;
    larva.hitFlashUntil = 0;
    larva.knockbackUntil = 0;
    larva.chasing = false; // rol: guardiana
    larva.patrolFrom.x = col.position.x; // ancla = su columna
    larva.patrolFrom.y = col.position.y;
    larva.bossStage = 0; // máquina de embestida: 0=orbita
    larva.bossTimer = QUEEN_GUARDIAN_CHARGE_COOLDOWN; // no carga nada más nacer
    if (events) pushEvent(events, 'boss-wave-spawn', col.position.x, col.position.y, 1);
    return true;
  }
  return false;
}

/**
 * Guardianas: defienden las columnas (playtest 2026-07-10). El grueso nace ya
 * en `queenOnInit` (A1: cada columna con defensora desde el segundo 1); este
 * paso solo REPONE, cada `QUEEN_GUARDIAN_SPAWN_INTERVAL`, una guardiana (de 1 en
 * 1) a una columna intacta que se quedó sin defensora, dentro del cupo.
 */
export function queenStepGuardians(world: World, boss: Enemy, dt: number, events: EventQueue): void {
  boss.bossTimer -= dt;
  if (boss.bossTimer > 0) return;
  boss.bossTimer = QUEEN_GUARDIAN_SPAWN_INTERVAL;

  if (queenLiveGuardianCount(world, boss) >= QUEEN_GUARDIAN_MAX) return;
  if (queenLiveLarvaCount(world, boss) >= QUEEN_LARVA_MAX) return;

  const columns = world.queenColumns;
  for (let c = 0; c < columns.length; c++) {
    const col = columns[c];
    if (col.broken) continue;
    if (col.roomId !== undefined && col.roomId !== boss.roomId) continue;
    if (queenColumnHasGuardian(world, boss, col.position.x, col.position.y)) continue;
    queenActivateGuardian(world, boss, col, events);
    return; // una por tick de cadencia (o no había slot libre)
  }
}

/**
 * Movimiento de las larvas vivas (rediseño 2026-07-10): bifurca por rol.
 * PERSEGUIDORA (`chasing=true`) recalcula rumbo al héroe cada tick, más rápida
 * por fase. GUARDIANA (`chasing=false`) ORBITA su columna ancla (`patrolFrom`)
 * a velocidad lenta y radio `QUEEN_GUARDIAN_ORBIT_RADIUS` — ronda su columna en
 * vez de perseguir. No pasan por `stepEnemyAi` (sin detección ni correa).
 */
export function queenStepLarvae(world: World, boss: Enemy, dt: number, events: EventQueue): void {
  const chaseSpeed =
    boss.bossPhase >= 3 ? QUEEN_LARVA_CHASE_SPEED_PHASE3 : boss.bossPhase === 2 ? QUEEN_LARVA_CHASE_SPEED_PHASE2 : QUEEN_LARVA_SPEED;

  const enemies = world.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const larva = enemies[i];
    if (!isQueenLarva(larva) || larva.roomId !== boss.roomId || larva.hp <= 0) continue;

    let dirX: number;
    let dirY: number;
    let speed: number;
    if (larva.chasing) {
      const dx = world.hero.position.x - larva.position.x;
      const dy = world.hero.position.y - larva.position.y;
      const len = Math.hypot(dx, dy) || 1;
      dirX = dx / len;
      dirY = dy / len;
      speed = chaseSpeed;
    } else if (larva.bossStage === 2) {
      // GUARDIANA cargando: avanza recto en el rumbo fijado al telegrafiar
      // (esquivable). El daño al héroe lo resuelve el contacto genérico.
      larva.bossTimer -= dt;
      dirX = larva.facing.x;
      dirY = larva.facing.y;
      speed = QUEEN_GUARDIAN_CHARGE_SPEED;
      if (larva.bossTimer <= 0) {
        larva.bossStage = 0;
        larva.bossTimer = QUEEN_GUARDIAN_CHARGE_COOLDOWN; // descanso antes de otra carga
      }
    } else if (larva.bossStage === 1) {
      // GUARDIANA telegrafiando: encara al héroe pero NO se mueve (aviso).
      larva.bossTimer -= dt;
      const dxh = world.hero.position.x - larva.position.x;
      const dyh = world.hero.position.y - larva.position.y;
      const lenh = Math.hypot(dxh, dyh) || 1;
      dirX = dxh / lenh;
      dirY = dyh / lenh;
      speed = 0;
      if (larva.bossTimer <= 0) {
        larva.facing.x = dirX; // fija el rumbo de carga hacia el héroe (ahora)
        larva.facing.y = dirY;
        larva.bossStage = 2;
        larva.bossTimer = QUEEN_GUARDIAN_CHARGE_DURATION;
      }
    } else {
      // GUARDIANA en reposo: orbita su ancla; si el héroe se acerca y el cooldown
      // venció, telegrafía una embestida (playtest 2026-07-10).
      larva.bossTimer -= dt;
      const ax = larva.position.x - larva.patrolFrom.x;
      const ay = larva.position.y - larva.patrolFrom.y;
      const dist = Math.hypot(ax, ay);
      const inv = dist > 1e-6 ? 1 / dist : 0;
      if (dist > QUEEN_GUARDIAN_ORBIT_RADIUS + 0.1) {
        dirX = -ax * inv; // acercarse al ancla
        dirY = -ay * inv;
      } else {
        dirX = -ay * inv; // tangente (girar alrededor)
        dirY = ax * inv;
      }
      speed = QUEEN_GUARDIAN_SPEED;
      const dxh = world.hero.position.x - larva.position.x;
      const dyh = world.hero.position.y - larva.position.y;
      if (larva.bossTimer <= 0 && dxh * dxh + dyh * dyh <= QUEEN_GUARDIAN_CHARGE_RANGE * QUEEN_GUARDIAN_CHARGE_RANGE) {
        larva.bossStage = 1;
        larva.bossTimer = QUEEN_GUARDIAN_TELEGRAPH;
        pushEvent(events, 'boss-guardian-charge', larva.position.x, larva.position.y, 1);
      }
    }

    larva.facing.x = dirX;
    larva.facing.y = dirY;
    larva.position.x += dirX * speed * dt;
    larva.position.y += dirY * speed * dt;
    larva.velocity.x = dirX * speed;
    larva.velocity.y = dirY * speed;
  }
}
