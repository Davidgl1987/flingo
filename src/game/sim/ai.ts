/**
 * IA de enemigos (GDD §7): 5 arquetipos con comportamiento legible y
 * consistente, determinista (usa world.rng cuando hace falta aleatoriedad).
 *
 * Navegación: steering local con evitación de obstáculos/hazards (raycast
 * corto contra AABBs + desvío angular). No hay pathfinding global (A*): con
 * las salas de referencia (obstáculos dispersos, no laberínticas) el
 * steering local resuelve rodear rocas/fosos/pinchos sin atascarse en
 * esquinas; si el contenido futuro lo exige, este módulo es el punto de
 * extensión natural para añadir un fallback A* sobre una rejilla de sala.
 *
 * Contrato de rendimiento: cero asignaciones por tick. Todo opera sobre
 * escalares; los AABBs recorridos son los arrays ya existentes del mundo.
 */

import {
  AI_AVOID_LOOKAHEAD,
  AI_AVOID_SKIN,
  AI_AVOID_STEER_ANGLE,
  CHASER_SPEED,
  CHASER_SPEED_WHILE_AIMING,
  DUMMY_CHASE_SPEED,
  DUMMY_DETECT_RANGE,
  DUMMY_LEASH_RANGE,
  DUMMY_PATROL_SPEED,
  SHOOTER_CHARGE_DURATION,
  SHOOTER_CHASE_DURATION,
  SHOOTER_CHASE_SPEED,
  SHOOTER_PROJECTILE_DAMAGE,
  SHOOTER_PROJECTILE_RADIUS,
  SHOOTER_PROJECTILE_SPEED,
  SPIKE_PATROL_SPEED,
  TRAIL_DROP_INTERVAL,
  TRAIL_PUDDLE_LIFETIME,
  TRAIL_PUDDLE_RADIUS,
  TRAIL_SPEED,
} from '../content/constants';
import { fireEnemyProjectile } from './combat';
import type { AABB, Enemy, World } from './world';

const PATROL_ARRIVE_EPS = 0.12;

/** Comprueba si un punto cae dentro de un AABB con margen de piel. */
function pointInAabb(x: number, y: number, box: AABB, skin: number): boolean {
  return x >= box.minX - skin && x <= box.maxX + skin && y >= box.minY - skin && y <= box.maxY + skin;
}

/**
 * Steering local: comprueba un punto de sondeo por delante del enemigo en la
 * dirección deseada; si cae dentro de un obstáculo sólido o de un hazard que
 * el enemigo debe esquivar (pit/spikes), rota la dirección deseada un ángulo
 * fijo (alterna izquierda/derecha según el signo de una función determinista
 * de la posición, para que el desvío sea consistente, no errático).
 */
function steerAwayFromHazards(world: World, enemy: Enemy, desiredX: number, desiredY: number): Vec2Out {
  const len = Math.sqrt(desiredX * desiredX + desiredY * desiredY);
  if (len < 1e-6) {
    steerScratch.x = 0;
    steerScratch.y = 0;
    return steerScratch;
  }
  let dx = desiredX / len;
  let dy = desiredY / len;

  const probeDist = AI_AVOID_LOOKAHEAD;

  if (isBlocked(world, enemy, dx, dy, probeDist)) {
    // Lado de giro: si ya venía esquivando, mantiene el mismo lado (evita
    // oscilar entre izquierda/derecha y quedarse vibrando en el sitio); si
    // no, lo decide una función determinista de su posición (sin RNG:
    // consistente y legible).
    const turnSign =
      enemy.steerBias !== 0
        ? enemy.steerBias
        : (enemy.position.x * 7.13 + enemy.position.y * 3.71) % 2 < 1
          ? 1
          : -1;
    // Escalera de ángulos crecientes, primero el lado preferido: encuentra
    // una dirección despejada aunque el objetivo esté justo detrás del hazard.
    for (let step = 1; step <= 5; step++) {
      const magnitude = AI_AVOID_STEER_ANGLE * (0.5 + step * 0.5); // 60°, 90°, …, 180°
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? turnSign : -turnSign;
        const angle = magnitude * sign;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;
        if (!isBlocked(world, enemy, rx, ry, probeDist)) {
          enemy.steerBias = sign;
          steerScratch.x = rx;
          steerScratch.y = ry;
          return steerScratch;
        }
      }
    }
    // Sin salida despejada: mantiene el bias para reintentar el mismo lado.
  } else {
    enemy.steerBias = 0;
  }

  steerScratch.x = dx;
  steerScratch.y = dy;
  return steerScratch;
}

interface Vec2Out {
  x: number;
  y: number;
}

/** Scratch reutilizado por steerAwayFromHazards (cero asignaciones por tick). */
const steerScratch: Vec2Out = { x: 0, y: 0 };

/**
 * true si el punto (px,py) cae en un hazard que los enemigos deben esquivar
 * (foso, pinchos o barril sin explotar), con margen de piel. Los barriles
 * cuentan: la IA nunca debe inmolarse sola (GDD §7); que un enemigo detone un
 * barril solo puede provocarlo el jugador (knockback/cadena), y ese empuje es
 * físico, no un movimiento de IA, así que no pasa por aquí.
 * Solo escalares: cero asignaciones.
 */
function pointInAvoidHazard(
  world: World,
  px: number,
  py: number,
  skin: number,
  bodyRadius: number,
): boolean {
  const barrels = world.barrels;
  for (let i = 0; i < barrels.length; i++) {
    const barrel = barrels[i];
    if (barrel.exploded) continue;
    // El barril detona por solape de radios (barril + cuerpo), no por centro:
    // la zona vetada debe incluir el radio del cuerpo que navega.
    const reach = barrel.radius + bodyRadius + skin;
    const dx = px - barrel.position.x;
    const dy = py - barrel.position.y;
    if (dx * dx + dy * dy <= reach * reach) return true;
  }
  const hazards = world.hazards;
  for (let i = 0; i < hazards.length; i++) {
    const hazard = hazards[i];
    if (hazard.kind !== 'pit' && hazard.kind !== 'spikes') continue;
    const hw = hazard.width / 2 + skin;
    const hh = hazard.height / 2 + skin;
    if (
      px >= hazard.position.x - hw &&
      px <= hazard.position.x + hw &&
      py >= hazard.position.y - hh &&
      py <= hazard.position.y + hh
    ) {
      return true;
    }
  }
  return false;
}

/** true si el punto de sondeo (posición + dir·dist) cae en un obstáculo sólido o hazard a esquivar. */
function isBlocked(world: World, enemy: Enemy, dx: number, dy: number, dist: number): boolean {
  const skin = AI_AVOID_SKIN;
  // Sondea varios puntos a lo largo del rayo (no solo la punta): evita que
  // el probe "salte" el borde de un hazard en trayectorias tangenciales.
  for (let step = 1; step <= 3; step++) {
    const d = (dist * step) / 3;
    const px = enemy.position.x + dx * d;
    const py = enemy.position.y + dy * d;

    const obstacles = world.obstacles;
    for (let i = 0; i < obstacles.length; i++) {
      if (pointInAabb(px, py, obstacles[i].aabb, skin)) return true;
    }
    if (pointInAvoidHazard(world, px, py, skin, enemy.radius)) return true;

    // No salirse de SU sala (mazmorra multi-sala: cada enemigo se limita a la
    // sala en la que vive, no a la sala actual del héroe).
    const b = enemy.roomId !== undefined ? (world.roomRuntimes.get(enemy.roomId)?.bounds ?? world.bounds) : world.bounds;
    if (px < b.minX + skin || px > b.maxX - skin || py < b.minY + skin || py > b.maxY - skin) {
      return true;
    }
  }
  return false;
}

/**
 * Mueve un enemigo hacia (targetX,targetY) a `speed`, con evitación de
 * hazards en dos capas: steering (desvío suave anticipado) + invariante duro
 * (el centro de un enemigo NUNCA acaba un tick dentro de un foso/pinchos:
 * si el movimiento le metería, desliza por el eje libre o se detiene).
 * Muta velocity/position.
 */
function moveToward(
  world: World,
  enemy: Enemy,
  targetX: number,
  targetY: number,
  speed: number,
  dt: number,
): void {
  const dx = targetX - enemy.position.x;
  const dy = targetY - enemy.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-6) {
    enemy.velocity.x = 0;
    enemy.velocity.y = 0;
    return;
  }
  const steered = steerAwayFromHazards(world, enemy, dx, dy);
  let vx = steered.x * speed;
  let vy = steered.y * speed;

  const guard = AI_AVOID_SKIN;
  const nextX = enemy.position.x + vx * dt;
  const nextY = enemy.position.y + vy * dt;
  if (pointInAvoidHazard(world, nextX, nextY, guard, enemy.radius)) {
    // Invariante duro: intenta deslizar por un solo eje; si ambos bloquean, se para.
    if (!pointInAvoidHazard(world, nextX, enemy.position.y, guard, enemy.radius)) {
      vy = 0;
    } else if (!pointInAvoidHazard(world, enemy.position.x, nextY, guard, enemy.radius)) {
      vx = 0;
    } else {
      vx = 0;
      vy = 0;
    }
  }

  enemy.velocity.x = vx;
  enemy.velocity.y = vy;
  enemy.position.x += vx * dt;
  enemy.position.y += vy * dt;
}

function heroDistance(world: World, enemy: Enemy): number {
  const dx = world.hero.position.x - enemy.position.x;
  const dy = world.hero.position.y - enemy.position.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Dummy (GDD §7.1) ───────────────────────────────────────────────────────

function stepDummy(world: World, enemy: Enemy, dt: number): void {
  const distToHero = heroDistance(world, enemy);

  if (!enemy.chasing && distToHero <= DUMMY_DETECT_RANGE) {
    enemy.chasing = true;
  }
  if (enemy.chasing) {
    const distFromHome = Math.hypot(
      enemy.position.x - enemy.patrolFrom.x,
      enemy.position.y - enemy.patrolFrom.y,
    );
    if (distFromHome > DUMMY_LEASH_RANGE) {
      enemy.chasing = false;
    }
  }

  if (enemy.chasing) {
    moveToward(world, enemy, world.hero.position.x, world.hero.position.y, DUMMY_CHASE_SPEED, dt);
    return;
  }

  stepPatrol(world, enemy, DUMMY_PATROL_SPEED, dt);
}

/** Patrulla ida/vuelta entre patrolFrom y patrolTo, compartida por Dummy/Spike/Trail. */
function stepPatrol(world: World, enemy: Enemy, speed: number, dt: number): void {
  const target = enemy.patrolForward ? enemy.patrolTo : enemy.patrolFrom;
  const dist = Math.hypot(target.x - enemy.position.x, target.y - enemy.position.y);
  if (dist < PATROL_ARRIVE_EPS) {
    enemy.patrolForward = !enemy.patrolForward;
    enemy.velocity.x = 0;
    enemy.velocity.y = 0;
    return;
  }
  moveToward(world, enemy, target.x, target.y, speed, dt);
}

// ── Chaser (GDD §7.2) ──────────────────────────────────────────────────────

function stepChaser(world: World, enemy: Enemy, dt: number): void {
  const speed = world.heroAiming ? CHASER_SPEED_WHILE_AIMING : CHASER_SPEED;
  moveToward(world, enemy, world.hero.position.x, world.hero.position.y, speed, dt);
}

// ── Spike (GDD §7.3) ───────────────────────────────────────────────────────

function stepSpike(world: World, enemy: Enemy, dt: number): void {
  stepPatrol(world, enemy, SPIKE_PATROL_SPEED, dt);
}

// ── Trail (GDD §7.4) ───────────────────────────────────────────────────────

function acquirePuddle(world: World) {
  const pool = world.puddles;
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) return pool[i];
  }
  return null;
}

function stepTrail(world: World, enemy: Enemy, dt: number): void {
  stepPatrol(world, enemy, TRAIL_SPEED, dt);

  enemy.trailDropTimer -= dt;
  if (enemy.trailDropTimer <= 0) {
    enemy.trailDropTimer = TRAIL_DROP_INTERVAL;
    const puddle = acquirePuddle(world);
    if (puddle) {
      puddle.active = true;
      puddle.position.x = enemy.position.x;
      puddle.position.y = enemy.position.y;
      puddle.radius = TRAIL_PUDDLE_RADIUS;
      puddle.ttl = TRAIL_PUDDLE_LIFETIME;
    }
  }
}

// ── Shooter (GDD §7.5) ─────────────────────────────────────────────────────

function stepShooter(world: World, enemy: Enemy, dt: number): void {
  enemy.shooterPhaseTimer -= dt;

  if (enemy.shooterPhase === 'chase') {
    moveToward(world, enemy, world.hero.position.x, world.hero.position.y, SHOOTER_CHASE_SPEED, dt);
  } else {
    // Fase de carga: se detiene y telegrafía el disparo (render dibuja el aviso).
    enemy.velocity.x = 0;
    enemy.velocity.y = 0;
  }

  if (enemy.shooterPhaseTimer <= 0) {
    if (enemy.shooterPhase === 'chase') {
      enemy.shooterPhase = 'charge';
      enemy.shooterPhaseTimer = SHOOTER_CHARGE_DURATION;
    } else {
      // Fin de la carga: dispara hacia el héroe y vuelve a perseguir.
      const dx = world.hero.position.x - enemy.position.x;
      const dy = world.hero.position.y - enemy.position.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      fireEnemyProjectile(
        world,
        enemy.position.x,
        enemy.position.y,
        dx / len,
        dy / len,
        SHOOTER_PROJECTILE_SPEED,
        SHOOTER_PROJECTILE_DAMAGE,
        SHOOTER_PROJECTILE_RADIUS,
      );
      enemy.shooterPhase = 'chase';
      enemy.shooterPhaseTimer = SHOOTER_CHASE_DURATION;
    }
  }
}

// ── Orquestador ────────────────────────────────────────────────────────────

export function stepEnemyAi(world: World, dt: number): void {
  const enemies = world.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.hp <= 0) continue;
    // Mazmorra multi-sala: los enemigos de salas que el héroe no ha visitado
    // todavía no patrullan ni persiguen (GDD §10.2). En modo sala única
    // (roomId undefined, tests de fase 1-2) no hay restricción.
    if (enemy.roomId !== undefined) {
      const runtime = world.roomRuntimes.get(enemy.roomId);
      if (runtime !== undefined && !runtime.visited) continue;
    }
    // Mientras dura el knockback, la física (stepEnemyCollisions) gobierna la
    // velocidad; la IA no la sobreescribe para que el empuje se note.
    if (world.time < enemy.knockbackUntil) continue;
    switch (enemy.kind) {
      case 'dummy':
        stepDummy(world, enemy, dt);
        break;
      case 'chaser':
        stepChaser(world, enemy, dt);
        break;
      case 'spike':
        stepSpike(world, enemy, dt);
        break;
      case 'trail':
        stepTrail(world, enemy, dt);
        break;
      case 'shooter':
        stepShooter(world, enemy, dt);
        break;
    }
  }
}
