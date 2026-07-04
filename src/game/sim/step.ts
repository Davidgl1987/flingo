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

import { DOOR_TOUCH_MARGIN, FIXED_DT, ROOM_CLEAR_SCORE } from '../content/constants';
import { stepEnemyAi } from './ai';
import { stepHeroEnemyContacts, stepProjectiles } from './combat';
import { openConnection } from './dungeon-world';
import { pushEvent, type EventQueue } from './events';
import { stepBarrels, stepEnemyHazards, stepHeroHazards, stepPuddles } from './hazards';
import { dropCoinAt, stepItems } from './items';
import { stepBodySeparation, stepEnemyCollisions, stepHeroPhysics } from './physics';
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

/** true si todos los enemigos dados están muertos (lista vacía cuenta como limpiada). */
function allDead(enemies: World['enemies']): boolean {
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].hp > 0) return false;
  }
  return true;
}

/** Modo sala única (world.dungeon === null, tests de fase 1-2): comportamiento histórico sin cambios. */
function stepSingleRoomClear(world: World, events: EventQueue): void {
  if (world.enemies.length > 0 && allDead(world.enemies)) {
    world.phase = 'room-cleared';
    world.stats.roomsCleared += 1;
    world.stats.score += ROOM_CLEAR_SCORE;
    pushEvent(events, 'room-cleared', world.hero.position.x, world.hero.position.y, 1);
  }
}

/** GDD §10.2: limpiar una sala = todos sus enemigos muertos → recompensa/mejora + puertas (salvo llave). */
function stepDungeonRoomClear(world: World, events: EventQueue): void {
  const dungeon = world.dungeon;
  if (!dungeon) return;
  const runtime = world.roomRuntimes.get(world.currentRoomId);
  if (!runtime || runtime.cleared) return;

  const roomEnemies = world.enemies.filter((e) => e.roomId === runtime.id);
  if (roomEnemies.length === 0 || !allDead(roomEnemies)) return;

  runtime.cleared = true;
  world.stats.roomsCleared += 1;
  world.stats.score += ROOM_CLEAR_SCORE;
  pushEvent(events, 'room-cleared', world.hero.position.x, world.hero.position.y, 1, runtime.name);
  pushEvent(events, 'doors-open', world.hero.position.x, world.hero.position.y, 1, runtime.name);

  // Abre las conexiones de la sala (ambos lados), salvo las que requieren
  // llave (esas se abren al tocarlas con la llave, ver stepBossDoorKeyCheck).
  for (const door of runtime.doors) {
    if (door.requiresKey) continue;
    openConnection(world, door.connectionIndex);
  }

  if (runtime.id === dungeon.bossRoomId) {
    world.phase = 'victory';
    pushEvent(events, 'victory', world.hero.position.x, world.hero.position.y, 1);
    return;
  }

  // Solo se ofrece mejora si el héroe sigue físicamente en la sala recién limpiada.
  if (world.currentRoomId === runtime.id) {
    world.phase = 'room-cleared';
  }
}

/** Cadencia mínima entre avisos de "necesitas la llave" mientras el héroe sigue pegado a la puerta (s). */
const LOCKED_NOTICE_INTERVAL = 1.5;

/** GDD §10.2: la puerta del jefe se abre al tocarla con llave; sin llave, rebota (la física ya lo hace) + aviso. */
function stepBossDoorKeyCheck(world: World, events: EventQueue): void {
  const dungeon = world.dungeon;
  if (!dungeon) return;
  const runtime = world.roomRuntimes.get(world.currentRoomId);
  if (!runtime) return;

  for (const door of runtime.doors) {
    if (!door.requiresKey || door.open) continue;
    const dx = world.hero.position.x - door.center.x;
    const dy = world.hero.position.y - door.center.y;
    if (Math.hypot(dx, dy) > DOOR_TOUCH_MARGIN) continue;

    if (world.hero.hasKey) {
      openConnection(world, door.connectionIndex);
      pushEvent(events, 'door-locked', door.center.x, door.center.y, 1, 'unlocked');
    } else if (world.time >= world.lockedNoticeCooldownUntil) {
      world.lockedNoticeCooldownUntil = world.time + LOCKED_NOTICE_INTERVAL;
      pushEvent(events, 'door-locked', door.center.x, door.center.y, 0, 'locked');
    }
  }
}

/**
 * Detecta que el héroe ha cruzado a otra sala (mundo continuo, sin pantallas
 * de carga): busca la sala cuyo AABB (con margen para cubrir el hueco de
 * puerta) contiene la posición actual del héroe. Si cambia respecto a
 * `currentRoomId`, actualiza el estado y emite 'room-entered'.
 */
function stepRoomTransition(world: World, events: EventQueue): void {
  const dungeon = world.dungeon;
  if (!dungeon) return;

  const hero = world.hero;
  const margin = 1; // cubre el tramo del hueco de puerta entre salas contiguas
  for (const placed of dungeon.rooms) {
    const b = placed.bounds;
    if (
      hero.position.x < b.minX - margin ||
      hero.position.x > b.maxX + margin ||
      hero.position.y < b.minY - margin ||
      hero.position.y > b.maxY + margin
    ) {
      continue;
    }
    // Preferimos la sala cuyo interior estricto contiene al héroe; si está en
    // el hueco de puerta (fuera de todos los interiores estrictos), se queda
    // con la sala actual hasta que entre claramente en otra.
    const strictlyInside =
      hero.position.x >= b.minX && hero.position.x <= b.maxX && hero.position.y >= b.minY && hero.position.y <= b.maxY;
    if (!strictlyInside) continue;
    if (placed.room.id === world.currentRoomId) return;

    world.currentRoomId = placed.room.id;
    world.room = placed.room;
    world.bounds = placed.bounds;
    const runtime = world.roomRuntimes.get(placed.room.id);
    if (runtime) {
      const firstVisit = !runtime.visited;
      runtime.visited = true;
      pushEvent(events, 'room-entered', hero.position.x, hero.position.y, firstVisit ? 1 : 0, runtime.name);
    }
    return;
  }
}

export function stepWorld(world: World, events: EventQueue): void {
  // La sim se pausa con un modal abierto (mejoras) o tras la muerte/victoria:
  // solo avanza el reloj para que los timers de UI no se congelen raro al volver.
  if (world.phase !== 'playing') {
    world.time += FIXED_DT;
    return;
  }

  stepHeroPhysics(world, events);
  stepRoomTransition(world, events);
  if (world.dungeon) stepBossDoorKeyCheck(world, events);

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

  // Separación de cuerpos DESPUÉS del gameplay de contacto: la embestida y el
  // daño de contacto ya se han resuelto sobre el solape de este tick; aquí
  // solo se garantiza que héroe/enemigos no se atraviesen ni se apilen.
  stepBodySeparation(world);

  stepItems(world, events);

  collectDeadDrops(world, world.deadEnemiesDropped);

  if (currentPhase(world) === 'playing') {
    if (world.dungeon) {
      stepDungeonRoomClear(world, events);
    } else {
      stepSingleRoomClear(world, events);
    }
  }

  world.time += FIXED_DT;
}
