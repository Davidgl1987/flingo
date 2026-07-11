/**
 * Lanzamiento corporal (GDD §4-5): el gesto de tirachinas convertido en velocidad.
 */

import {
  BODY_LAUNCH_COOLDOWN,
  LAUNCH_SPEED_MAX,
  LAUNCH_SPEED_MIN,
  MIN_LAUNCH_FORCE,
} from '@/game/content/constants';
import { pushEvent, type EventQueue } from './events';
import type { World } from './world';

/**
 * Velocidad de salida según la fuerza normalizada [0,1].
 * Interpolación lineal 3.6 → 7.5 u/s (tabla maestra del GDD: un tiro a tope
 * sale a ~2× el flojo, con mínimo apreciable).
 */
export function launchSpeed(force: number): number {
  const f = force < 0 ? 0 : force > 1 ? 1 : force;
  return LAUNCH_SPEED_MIN + (LAUNCH_SPEED_MAX - LAUNCH_SPEED_MIN) * f;
}

/**
 * Lanza el cuerpo del héroe en la dirección (unitaria) dada con la fuerza [0,1].
 * Respeta el cooldown de 0.2 s y rechaza fuerzas por debajo del mínimo.
 * Devuelve true si el lanzamiento se produjo.
 */
export function launchHero(
  world: World,
  dirX: number,
  dirY: number,
  force: number,
  events: EventQueue,
): boolean {
  if (force < MIN_LAUNCH_FORCE) {
    return false;
  }
  const hero = world.hero;
  if (world.time - hero.lastLaunchTime < BODY_LAUNCH_COOLDOWN) {
    return false;
  }
  const speed = launchSpeed(force);
  hero.velocity.x = dirX * speed;
  hero.velocity.y = dirY * speed;
  hero.lastLaunchTime = world.time;
  pushEvent(events, 'launch', hero.position.x, hero.position.y, force);
  return true;
}
