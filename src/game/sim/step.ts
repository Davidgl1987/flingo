/**
 * Tick del mundo: orquesta los sistemas de la simulación a timestep fijo.
 *
 * Cada llamada avanza exactamente FIXED_DT. El acumulador (frame de render →
 * N ticks) vive en el driver de render, no aquí, para que la sim sea
 * determinista y testeable sin reloj.
 *
 * Muta `world` y `events` in-place: nada de crear un mundo nuevo por tick.
 */

import { FIXED_DT } from '../content/constants';
import type { EventQueue } from './events';
import { stepHeroPhysics } from './physics';
import type { World } from './world';

export function stepWorld(world: World, events: EventQueue): void {
  stepHeroPhysics(world, events);
  // Fase 2: IA de enemigos, proyectiles, combate, hazards, flujo de puertas.
  world.time += FIXED_DT;
}
