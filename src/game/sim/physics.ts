/**
 * Física de la simulación: integración a timestep fijo, fricción exponencial,
 * colisión círculo-vs-AABB con reflexión.
 *
 * Contrato de rendimiento: CERO asignaciones por tick. Todo trabaja sobre
 * escalares y muta los vectores del mundo in-place.
 *
 * El acumulador de timestep vive en el driver de render (useGameLoop):
 * aquí cada llamada avanza exactamente FIXED_DT, lo que mantiene la sim
 * determinista e independiente del framerate.
 */

import {
  FIXED_DT,
  FRICTION_FACTOR,
  LOW_SPEED_EXTRA_FRICTION,
  LOW_SPEED_FRICTION_THRESHOLD,
  MAX_SPEED,
  RESTITUTION,
  STOP_THRESHOLD,
} from '../content/constants';
import { pushEvent, type EventQueue } from './events';
import type { AABB, Vec2, World } from './world';

/**
 * Factor de decaimiento por tick, precomputado (sin Math.exp en el hot path).
 * Fricción exponencial del GDD: v(t) = v0 · e^(−1.42·t)  ⇒  v *= e^(−1.42·dt).
 */
const FRICTION_DECAY_PER_TICK = Math.exp(-FRICTION_FACTOR * FIXED_DT);

/**
 * Decaimiento extra del héroe a baja velocidad (feedback de playtest, punto
 * 8): un único `Math.exp` escalar por tick (no una asignación), que crece
 * linealmente de 0 (en el umbral) a `LOW_SPEED_EXTRA_FRICTION` (a v=0). Los
 * tiros fuertes casi nunca lo notan (pasan la mayoría de su recorrido por
 * encima del umbral); los flojos frenan bastante antes de lo que haría la
 * fricción exponencial pura, que en términos relativos no distingue tiros
 * flojos de fuertes.
 */
function lowSpeedExtraDecay(speed: number): number {
  if (speed >= LOW_SPEED_FRICTION_THRESHOLD) return 1;
  const t = 1 - speed / LOW_SPEED_FRICTION_THRESHOLD;
  return Math.exp(-LOW_SPEED_EXTRA_FRICTION * t * FIXED_DT);
}

/**
 * Colisión círculo-vs-AABB con resolución por reflexión.
 *
 * Método del punto más cercano: clamp del centro del círculo al rectángulo.
 * La normal sale del punto más cercano hacia el centro, lo que trata las
 * esquinas correctamente (normal diagonal) y evita atravesarlas. Se corrige
 * la posición (push-out) y se refleja solo la componente normal de la
 * velocidad multiplicada por la restitución; la tangencial se conserva.
 *
 * Emite 'wall-bounce' con intensidad = velocidad normal de impacto.
 * Devuelve true si hubo contacto. Muta position/velocity in-place.
 */
export function collideCircleAabb(
  position: Vec2,
  velocity: Vec2,
  radius: number,
  box: AABB,
  events: EventQueue | null,
): boolean {
  const nearestX = position.x < box.minX ? box.minX : position.x > box.maxX ? box.maxX : position.x;
  const nearestY = position.y < box.minY ? box.minY : position.y > box.maxY ? box.maxY : position.y;
  const dx = position.x - nearestX;
  const dy = position.y - nearestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= radius * radius) {
    return false;
  }

  let normalX: number;
  let normalY: number;
  let pushOut: number;
  if (distSq > 1e-12) {
    // Centro fuera de la caja: normal desde el punto más cercano (incluye esquinas).
    const dist = Math.sqrt(distSq);
    normalX = dx / dist;
    normalY = dy / dist;
    pushOut = radius - dist;
  } else {
    // Centro dentro de la caja (caso degenerado): salir por la cara más próxima.
    const dLeft = position.x - box.minX;
    const dRight = box.maxX - position.x;
    const dBottom = position.y - box.minY;
    const dTop = box.maxY - position.y;
    let minDist = dLeft;
    normalX = -1;
    normalY = 0;
    if (dRight < minDist) {
      minDist = dRight;
      normalX = 1;
      normalY = 0;
    }
    if (dBottom < minDist) {
      minDist = dBottom;
      normalX = 0;
      normalY = -1;
    }
    if (dTop < minDist) {
      minDist = dTop;
      normalX = 0;
      normalY = 1;
    }
    pushOut = minDist + radius;
  }

  position.x += normalX * pushOut;
  position.y += normalY * pushOut;

  const velAlongNormal = velocity.x * normalX + velocity.y * normalY;
  if (velAlongNormal < 0) {
    if (events !== null) {
      pushEvent(events, 'wall-bounce', position.x, position.y, -velAlongNormal);
    }
    // v' = v − (1 + e)·(v·n)·n  ⇒  componente normal queda en −e·(v·n).
    const impulse = (1 + RESTITUTION) * velAlongNormal;
    velocity.x -= impulse * normalX;
    velocity.y -= impulse * normalY;
  }
  return true;
}

/**
 * Colisión contra las caras internas de las 4 paredes de la sala.
 * Reflexión por eje con la misma restitución que las rocas.
 */
export function collideInnerBounds(
  position: Vec2,
  velocity: Vec2,
  radius: number,
  bounds: AABB,
  events: EventQueue | null,
): boolean {
  const minX = bounds.minX + radius;
  const maxX = bounds.maxX - radius;
  const minY = bounds.minY + radius;
  const maxY = bounds.maxY - radius;
  let hit = false;

  if (position.x < minX) {
    position.x = minX;
    if (velocity.x < 0) {
      if (events !== null) pushEvent(events, 'wall-bounce', position.x, position.y, -velocity.x);
      velocity.x = -velocity.x * RESTITUTION;
    }
    hit = true;
  } else if (position.x > maxX) {
    position.x = maxX;
    if (velocity.x > 0) {
      if (events !== null) pushEvent(events, 'wall-bounce', position.x, position.y, velocity.x);
      velocity.x = -velocity.x * RESTITUTION;
    }
    hit = true;
  }

  if (position.y < minY) {
    position.y = minY;
    if (velocity.y < 0) {
      if (events !== null) pushEvent(events, 'wall-bounce', position.x, position.y, -velocity.y);
      velocity.y = -velocity.y * RESTITUTION;
    }
    hit = true;
  } else if (position.y > maxY) {
    position.y = maxY;
    if (velocity.y > 0) {
      if (events !== null) pushEvent(events, 'wall-bounce', position.x, position.y, velocity.y);
      velocity.y = -velocity.y * RESTITUTION;
    }
    hit = true;
  }

  return hit;
}

/**
 * Un tick de física del héroe (FIXED_DT):
 * 1) clamp de velocidad a MAX_SPEED (garantiza desplazamiento máx. 0.225 u/tick,
 *    menor que el muro de 0.42 u ⇒ sin tunneling con detección discreta),
 * 2) integración de posición,
 * 3) colisiones (paredes interiores + rocas) con push-out inmediato,
 * 4) fricción exponencial (modulada por mejoras de fricción) y umbral de parada.
 *
 * NOTA de rendimiento: el héroe es la única entidad con fricción variable por
 * mejoras, así que `Math.pow` aquí es una única operación escalar por tick
 * (no una asignación); el resto de entidades usan la constante precomputada.
 */
export function stepHeroPhysics(world: World, events: EventQueue): void {
  const hero = world.hero;
  const position = hero.position;
  const velocity = hero.velocity;

  const speedSq = velocity.x * velocity.x + velocity.y * velocity.y;
  if (speedSq > MAX_SPEED * MAX_SPEED) {
    const scale = MAX_SPEED / Math.sqrt(speedSq);
    velocity.x *= scale;
    velocity.y *= scale;
  }

  position.x += velocity.x * FIXED_DT;
  position.y += velocity.y * FIXED_DT;

  // Mazmorra multi-sala: no hay un único límite exterior (el héroe cruza de
  // sala en sala por los huecos de puerta); los muros de cada sala ya viven
  // como obstáculos AABB en `world.obstacles` (con hueco donde la puerta está
  // abierta), así que `collideInnerBounds` contra `world.bounds` (la sala
  // ACTUAL) se omite para no empujar al héroe de vuelta al cruzar un hueco.
  // Modo sala única (world.dungeon === null): comportamiento histórico intacto.
  if (world.dungeon === null) {
    collideInnerBounds(position, velocity, hero.radius, world.bounds, events);
  }
  const obstacles = world.obstacles;
  for (let i = 0; i < obstacles.length; i++) {
    collideCircleAabb(position, velocity, hero.radius, obstacles[i].aabb, events);
  }

  const frictionMultiplier = hero.modifiers.frictionMultiplier;
  const baseDecay =
    frictionMultiplier === 1 ? FRICTION_DECAY_PER_TICK : Math.pow(FRICTION_DECAY_PER_TICK, frictionMultiplier);
  // Fricción extra a baja velocidad (punto 8 de playtest): calculada sobre la
  // velocidad ANTES de aplicar el decaimiento de este tick, un único
  // Math.hypot + Math.exp escalares, sin asignaciones.
  const speedBefore = Math.hypot(velocity.x, velocity.y);
  const decay = baseDecay * lowSpeedExtraDecay(speedBefore);
  velocity.x *= decay;
  velocity.y *= decay;
  if (velocity.x * velocity.x + velocity.y * velocity.y < STOP_THRESHOLD * STOP_THRESHOLD) {
    velocity.x = 0;
    velocity.y = 0;
  }
}

// ── Colisión círculo-círculo (cuerpos: héroe↔enemigo, enemigo↔enemigo) ─────

/** Restitución de los choques cuerpo-a-cuerpo (moderada: empujón, no pinball). */
const BODY_RESTITUTION = 0.4;
/**
 * Masa inversa relativa del héroe frente a un enemigo en la separación de
 * cuerpos: el héroe "pesa" el doble (arrolla más de lo que es arrollado).
 */
const HERO_INV_MASS = 0.5;
const ENEMY_INV_MASS = 1;

/**
 * Colisión círculo-vs-círculo con separación posicional proporcional a la
 * masa inversa + impulso a lo largo de la normal (solo si se acercan), con
 * restitución moderada. Cero asignaciones: todo escalar, muta in-place.
 *
 * Devuelve true si había solape. No emite eventos: el daño/knockback de
 * gameplay lo decide combat.ts ANTES (mismo tick), esto solo garantiza que
 * los cuerpos no se atraviesen ni se queden pegados.
 */
export function collideCircleCircle(
  posA: Vec2,
  velA: Vec2,
  radiusA: number,
  invMassA: number,
  posB: Vec2,
  velB: Vec2,
  radiusB: number,
  invMassB: number,
): boolean {
  const dx = posB.x - posA.x;
  const dy = posB.y - posA.y;
  const rr = radiusA + radiusB;
  const distSq = dx * dx + dy * dy;
  if (distSq >= rr * rr) return false;

  const dist = Math.sqrt(distSq);
  // Centros coincidentes (degenerado): separa por un eje fijo determinista.
  const nx = dist > 1e-6 ? dx / dist : 1;
  const ny = dist > 1e-6 ? dy / dist : 0;

  const totalInvMass = invMassA + invMassB;
  if (totalInvMass <= 0) return true;

  // Separación posicional: reparte el solape según masa inversa.
  const overlap = rr - dist;
  posA.x -= nx * overlap * (invMassA / totalInvMass);
  posA.y -= ny * overlap * (invMassA / totalInvMass);
  posB.x += nx * overlap * (invMassB / totalInvMass);
  posB.y += ny * overlap * (invMassB / totalInvMass);

  // Impulso normal solo si se acercan (velocidad relativa contra la normal).
  const relVelNormal = (velB.x - velA.x) * nx + (velB.y - velA.y) * ny;
  if (relVelNormal < 0) {
    const impulse = (-(1 + BODY_RESTITUTION) * relVelNormal) / totalInvMass;
    velA.x -= impulse * invMassA * nx;
    velA.y -= impulse * invMassA * ny;
    velB.x += impulse * invMassB * nx;
    velB.y += impulse * invMassB * ny;
  }
  return true;
}

/**
 * Separación de cuerpos tras resolver el gameplay del tick (embestida/daño en
 * combat.ts): héroe↔enemigos y enemigo↔enemigo de la misma sala. Se ejecuta
 * DESPUÉS de stepHeroEnemyContacts para que el solape del tick de impacto
 * siga registrando daño de embestida/contacto; esto solo evita atravesar y
 * apilarse. O(n²) sobre los enemigos vivos: presupuesto trivial (≤ ~30).
 */
export function stepBodySeparation(world: World): void {
  const hero = world.hero;
  const enemies = world.enemies;
  // Durante la animación de caída al foso el héroe no es un cuerpo sólido
  // (está "hundiéndose"): los enemigos no deben empujarlo ni ser empujados.
  const heroSolid = world.fallingUntil <= 0;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.hp <= 0) continue;
    if (heroSolid) {
      collideCircleCircle(
        hero.position,
        hero.velocity,
        hero.radius,
        HERO_INV_MASS,
        enemy.position,
        enemy.velocity,
        enemy.radius,
        ENEMY_INV_MASS,
      );
    }
    for (let j = i + 1; j < enemies.length; j++) {
      const other = enemies[j];
      if (other.hp <= 0 || other.roomId !== enemy.roomId) continue;
      collideCircleCircle(
        enemy.position,
        enemy.velocity,
        enemy.radius,
        ENEMY_INV_MASS,
        other.position,
        other.velocity,
        other.radius,
        ENEMY_INV_MASS,
      );
    }
  }
}

/**
 * Resuelve la posición de los enemigos contra las paredes interiores y las
 * rocas: el steering de la IA ya evita la mayoría de acercamientos, esto es
 * un cinturón de seguridad de push-out (sin rebote elástico: los enemigos no
 * "rebotan", simplemente no atraviesan sólidos). Knockback (velocidad tras un
 * golpe) sí se ve amortiguado por el push-out, que es el comportamiento
 * deseado (un enemigo empujado contra una roca se frena ahí, no la atraviesa).
 */
export function stepEnemyCollisions(world: World): void {
  const bounds = world.bounds;
  const obstacles = world.obstacles;
  const enemies = world.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.hp <= 0) continue;
    // Mazmorra multi-sala: cada enemigo se contiene contra los límites de SU
    // PROPIA sala (nunca sale de ella, GDD §10.2), no los de la sala actual
    // del héroe. Modo sala única (roomId undefined): usa `world.bounds` como
    // antes.
    const enemyBounds =
      enemy.roomId !== undefined ? (world.roomRuntimes.get(enemy.roomId)?.bounds ?? bounds) : bounds;
    collideInnerBounds(enemy.position, enemy.velocity, enemy.radius, enemyBounds, null);
    for (let j = 0; j < obstacles.length; j++) {
      collideCircleAabb(enemy.position, enemy.velocity, enemy.radius, obstacles[j].aabb, null);
    }
    // Fricción suave del knockback (los enemigos no deslizan indefinidamente).
    enemy.velocity.x *= FRICTION_DECAY_PER_TICK;
    enemy.velocity.y *= FRICTION_DECAY_PER_TICK;
  }
}
