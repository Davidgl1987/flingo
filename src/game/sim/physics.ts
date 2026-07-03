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
 * 4) fricción exponencial y umbral de parada total.
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

  collideInnerBounds(position, velocity, hero.radius, world.bounds, events);
  const obstacles = world.obstacles;
  for (let i = 0; i < obstacles.length; i++) {
    collideCircleAabb(position, velocity, hero.radius, obstacles[i].aabb, events);
  }

  velocity.x *= FRICTION_DECAY_PER_TICK;
  velocity.y *= FRICTION_DECAY_PER_TICK;
  if (velocity.x * velocity.x + velocity.y * velocity.y < STOP_THRESHOLD * STOP_THRESHOLD) {
    velocity.x = 0;
    velocity.y = 0;
  }
}
