/**
 * Tick del mundo: orquesta los sistemas de la simulación a timestep fijo.
 *
 * Cada llamada avanza exactamente FIXED_DT. El acumulador (frame de render →
 * N ticks) vive en el driver de render, no aquí, para que la sim sea
 * determinista y testeable sin reloj.
 *
 * Orden de sistemas por tick (importa para la consistencia de colisiones):
 * 1) física del héroe (movimiento, rebotes)
 * 2) IA de enemigos (steering + movimiento deseado)
 * 3) física de enemigos (colisión contra sólidos, fricción de knockback)
 * 4) proyectiles (movimiento + colisiones + daño)
 * 5) hazards (héroe, enemigos, charcos del Trail, barriles)
 * 6) contactos cuerpo-a-cuerpo héroe↔enemigo (embestida / daño recibido)
 * 7) recogida de items
 * 8) housekeeping: enemigos muertos sueltan moneda; ¿sala limpiada?
 *
 * Muta `world` y `events` in-place: nada de crear un mundo nuevo por tick.
 */

import { FIXED_DT, ROOM_CLEAR_SCORE } from '../content/constants';
import { stepEnemyAi } from './ai';
import { stepHeroEnemyContacts, stepProjectiles } from './combat';
import { pushEvent, type EventQueue } from './events';
import { stepBarrels, stepEnemyHazards, stepHeroHazards, stepPuddles } from './hazards';
import { dropCoinAt, stepItems } from './items';
import { stepEnemyCollisions, stepHeroPhysics } from './physics';
import type { GamePhase, World } from './world';

/**
 * Lectura de fase opaca al narrowing de TypeScript: los sistemas intermedios
 * (hazards, barriles, contactos) pueden mutar `world.phase` a 'game-over'
 * dentro del mismo tick, cosa que el control-flow analysis no modela.
 */
function currentPhase(world: World): GamePhase {
  return world.phase;
}

/** Enemigos con hp<=0 en el tick anterior, para no soltar moneda dos veces por el mismo cadáver. */
function collectDeadDrops(world: World, alreadyDropped: Set<string>): void {
  const enemies = world.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.hp <= 0 && !alreadyDropped.has(enemy.id)) {
      alreadyDropped.add(enemy.id);
      dropCoinAt(world, enemy.position.x, enemy.position.y);
    }
  }
}

/** true si todos los enemigos de la sala están muertos (sala vacía cuenta como limpiada). */
function isRoomCleared(world: World): boolean {
  const enemies = world.enemies;
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].hp > 0) return false;
  }
  return true;
}

export function stepWorld(world: World, events: EventQueue): void {
  // La sim se pausa con un modal abierto (mejoras) o tras la muerte: solo
  // avanza el reloj para que los timers de UI no se congelen raro al volver.
  if (world.phase !== 'playing') {
    world.time += FIXED_DT;
    return;
  }

  stepHeroPhysics(world, events);

  stepEnemyAi(world, FIXED_DT);
  stepEnemyCollisions(world);

  stepProjectiles(world, FIXED_DT, events);

  stepHeroHazards(world, FIXED_DT, events);
  stepEnemyHazards(world, world.spikeDamageCooldowns, events);
  stepPuddles(world, FIXED_DT, events);
  stepBarrels(world, events);

  if (currentPhase(world) !== 'game-over') {
    stepHeroEnemyContacts(world, world.contactDamageCooldowns, events);
  }

  stepItems(world, events);

  collectDeadDrops(world, world.deadEnemiesDropped);

  if (currentPhase(world) === 'playing' && world.enemies.length > 0 && isRoomCleared(world)) {
    world.phase = 'room-cleared';
    world.stats.roomsCleared += 1;
    world.stats.score += ROOM_CLEAR_SCORE;
    pushEvent(events, 'room-cleared', world.hero.position.x, world.hero.position.y, 1);
  }

  world.time += FIXED_DT;
}
