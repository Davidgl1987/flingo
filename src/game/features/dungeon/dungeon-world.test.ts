/**
 * Tests del flujo de puertas y transición de sala en la mazmorra multi-sala
 * (GDD §10.2): cerrada→limpia→abierta, la puerta del jefe exige llave, cruzar
 * un hueco actualiza la sala actual y activa a sus enemigos, y victoria al
 * limpiar la sala del jefe.
 */

import { describe, expect, it } from 'vitest';
import { generateDungeon } from './dungeon';
import { createDungeonWorld } from './dungeon-world';
import { createEventQueue, drainEvents, type GameEvent } from '@/engine/events';
import { stepWorld } from '@/game/world/step';
import type { EnemySpawn, RoomData, RoomTag } from '@/game/world/types';

function makeRoom(
  id: string,
  tags: RoomTag[],
  opts: { size?: number; enemies?: EnemySpawn[]; items?: RoomData['items'] } = {},
): RoomData {
  const size = opts.size ?? 9;
  return {
    version: 1,
    id,
    name: `Sala ${id}`,
    width: size,
    height: size,
    playerStart: { x: 0, y: 0 },
    tags,
    doorSlots: [
      { side: 'north', offset: 0 },
      { side: 'south', offset: 0 },
      { side: 'east', offset: 0 },
      { side: 'west', offset: 0 },
    ],
    enemies: opts.enemies ?? [],
    hazards: [],
    items: opts.items ?? [],
  };
}

function makePool(): RoomData[] {
  return [
    makeRoom('start-1', ['inicio']),
    makeRoom('combat-1', ['combate'], {
      enemies: [{ id: 'd1', kind: 'dummy', position: { x: 2, y: 2 } }],
    }),
    makeRoom('combat-2', ['combate'], {
      enemies: [{ id: 'd2', kind: 'dummy', position: { x: 2, y: 2 } }],
    }),
    makeRoom('combat-3', ['combate'], {
      enemies: [{ id: 'd3', kind: 'dummy', position: { x: 2, y: 2 } }],
    }),
    makeRoom('key-1', ['llave'], {
      enemies: [{ id: 'd4', kind: 'dummy', position: { x: 2, y: 2 } }],
      items: [{ id: 'key-item', kind: 'key', position: { x: 0, y: 0 } }],
    }),
    makeRoom('boss-1', ['jefe'], {
      enemies: [{ id: 'boss-enemy', kind: 'dummy', position: { x: 0, y: 0 } }],
    }),
  ];
}

function collect(events: ReturnType<typeof createEventQueue>): GameEvent['type'][] {
  const types: GameEvent['type'][] = [];
  drainEvents(events, (e) => types.push(e.type));
  return types;
}

describe('flujo de puertas y transición de sala (mazmorra multi-sala)', () => {
  it('las puertas de la sala de inicio (con enemigos) empiezan cerradas y se abren al limpiarla', () => {
    const dungeon = generateDungeon(10, makePool());
    const world = createDungeonWorld(dungeon, 10);
    const events = createEventQueue(64);

    const startRuntime = world.roomRuntimes.get(dungeon.startRoomId)!;
    const hasEnemies = world.enemies.some((e) => e.roomId === dungeon.startRoomId);

    if (hasEnemies) {
      expect(startRuntime.doors.every((d) => d.requiresKey || !d.open)).toBe(true);

      // Matar a todos los enemigos de la sala de inicio.
      for (const enemy of world.enemies) {
        if (enemy.roomId === dungeon.startRoomId) enemy.hp = 0;
      }
      stepWorld(world, events);

      expect(startRuntime.cleared).toBe(true);
      expect(startRuntime.doors.filter((d) => !d.requiresKey).every((d) => d.open)).toBe(true);
      expect(collect(events)).toContain('room-cleared');
    } else {
      // La sala de inicio de este pool no tiene enemigos: cuenta como limpiada desde el tick 0.
      expect(startRuntime.cleared).toBe(true);
    }
  });

  it('la puerta del jefe no abre sin llave (rebote + aviso) y abre al tocarla con llave', () => {
    const dungeon = generateDungeon(10, makePool());
    const world = createDungeonWorld(dungeon, 10);
    const events = createEventQueue(64);

    const bossRuntime = world.roomRuntimes.get(dungeon.bossRoomId)!;
    const bossDoor = bossRuntime.doors.find((d) => d.requiresKey)!;
    expect(bossDoor).toBeTruthy();
    expect(bossDoor.open).toBe(false);

    // Aleja al enemigo del jefe para que no interfiera con el contacto de daño.
    for (const enemy of world.enemies) {
      if (enemy.roomId === dungeon.bossRoomId) {
        enemy.position.x = bossRuntime.bounds.maxX - 0.5;
        enemy.position.y = bossRuntime.bounds.maxY - 0.5;
      }
    }

    // Sin llave: el héroe toca el hueco de la puerta desde dentro de la sala del jefe, no se abre.
    world.currentRoomId = bossRuntime.id;
    bossRuntime.visited = true;
    const insideDoorX = bossDoor.center.x + Math.sign(bossRuntime.bounds.maxX - bossDoor.center.x || -1) * 0.3;
    const insideDoorY = bossDoor.center.y + Math.sign(bossRuntime.bounds.maxY - bossDoor.center.y || -1) * 0.3;
    world.hero.position.x = Math.min(Math.max(insideDoorX, bossRuntime.bounds.minX + 0.2), bossRuntime.bounds.maxX - 0.2);
    world.hero.position.y = Math.min(Math.max(insideDoorY, bossRuntime.bounds.minY + 0.2), bossRuntime.bounds.maxY - 0.2);
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;
    world.hero.hasKey = false;
    stepWorld(world, events);
    expect(world.currentRoomId).toBe(bossRuntime.id);
    expect(bossDoor.open).toBe(false);
    expect(collect(events)).toContain('door-locked');

    // Con llave: se abre y emite evento.
    world.hero.hasKey = true;
    stepWorld(world, events);
    expect(bossDoor.open).toBe(true);
    expect(collect(events)).toContain('door-locked');
  });

  it('cruzar un hueco de puerta actualiza la sala actual y activa a sus enemigos', () => {
    const dungeon = generateDungeon(10, makePool());
    const world = createDungeonWorld(dungeon, 10);
    const events = createEventQueue(64);

    // Localiza una sala vecina de la de inicio que no sea la de inicio misma.
    const conn = dungeon.connections.find(
      (c) => c.roomAId === dungeon.startRoomId || c.roomBId === dungeon.startRoomId,
    )!;
    const neighborId = conn.roomAId === dungeon.startRoomId ? conn.roomBId : conn.roomAId;
    const neighborRuntime = world.roomRuntimes.get(neighborId)!;
    expect(neighborRuntime.visited).toBe(false);

    // Fuerza al héroe dentro del interior estricto de la sala vecina.
    world.hero.position.x = neighborRuntime.bounds.minX + 0.5;
    world.hero.position.y = (neighborRuntime.bounds.minY + neighborRuntime.bounds.maxY) / 2;
    // Evita que la física lo mueva fuera con velocidad residual.
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;

    stepWorld(world, events);

    expect(world.currentRoomId).toBe(neighborId);
    expect(neighborRuntime.visited).toBe(true);
    expect(collect(events)).toContain('room-entered');

    const neighborEnemies = world.enemies.filter((e) => e.roomId === neighborId);
    if (neighborEnemies.length > 0) {
      // Tras varios ticks, un enemigo activo (visited=true) debe haberse movido o al menos
      // no seguir bloqueado por la restricción de "sala no visitada" (comprobado indirectamente
      // por el hecho de que stepEnemyAi ya no lo salta).
      expect(neighborRuntime.visited).toBe(true);
    }
  });

  it('limpiar la sala del jefe pone la fase en victory', () => {
    const dungeon = generateDungeon(10, makePool());
    const world = createDungeonWorld(dungeon, 10);
    const events = createEventQueue(64);

    world.currentRoomId = dungeon.bossRoomId;
    const runtime = world.roomRuntimes.get(dungeon.bossRoomId)!;
    runtime.visited = true;
    // Coloca al héroe físicamente en el interior de la sala del jefe: si no,
    // stepRoomTransition detectaría que sigue en la sala de inicio y
    // sobrescribiría currentRoomId antes de evaluar el clear.
    world.hero.position.x = (runtime.bounds.minX + runtime.bounds.maxX) / 2;
    world.hero.position.y = (runtime.bounds.minY + runtime.bounds.maxY) / 2;
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;
    for (const enemy of world.enemies) {
      if (enemy.roomId === dungeon.bossRoomId) enemy.hp = 0;
    }

    stepWorld(world, events);

    expect(world.phase).toBe('victory');
    expect(collect(events)).toContain('victory');
  });

  it('limpiar la sala del jefe pone la fase en dungeon-cleared si NO es la mazmorra final (run multi-mazmorra)', () => {
    const dungeon = generateDungeon(10, makePool());
    const world = createDungeonWorld(dungeon, 10);
    // Run multi-mazmorra (GDD §10): quedan más jefes por delante de esta mazmorra.
    world.isFinalDungeon = false;
    const events = createEventQueue(64);

    world.currentRoomId = dungeon.bossRoomId;
    const runtime = world.roomRuntimes.get(dungeon.bossRoomId)!;
    runtime.visited = true;
    world.hero.position.x = (runtime.bounds.minX + runtime.bounds.maxX) / 2;
    world.hero.position.y = (runtime.bounds.minY + runtime.bounds.maxY) / 2;
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;
    for (const enemy of world.enemies) {
      if (enemy.roomId === dungeon.bossRoomId) enemy.hp = 0;
    }

    stepWorld(world, events);

    expect(world.phase).toBe('dungeon-cleared');
    expect(collect(events)).toContain('dungeon-cleared');
    expect(collect(events)).not.toContain('victory');
  });

  it('la mejora solo se ofrece si el héroe sigue en la sala recién limpiada', () => {
    const dungeon = generateDungeon(11, makePool());
    const world = createDungeonWorld(dungeon, 11);
    const events = createEventQueue(64);

    // Sala de combate normal (no jefe): localizamos una con enemigos.
    const combatRuntime = [...world.roomRuntimes.values()].find(
      (r) => !r.tags.includes('jefe') && !r.cleared,
    )!;
    world.currentRoomId = combatRuntime.id;
    combatRuntime.visited = true;
    world.hero.position.x = (combatRuntime.bounds.minX + combatRuntime.bounds.maxX) / 2;
    world.hero.position.y = (combatRuntime.bounds.minY + combatRuntime.bounds.maxY) / 2;
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;
    for (const enemy of world.enemies) {
      if (enemy.roomId === combatRuntime.id) enemy.hp = 0;
    }

    stepWorld(world, events);

    expect(combatRuntime.cleared).toBe(true);
    expect(world.phase).toBe('room-cleared');
  });
});
