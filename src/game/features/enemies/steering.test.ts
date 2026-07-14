/**
 * Tests de navegación compartida (GDD §7): evitación de hazards/barriles en
 * el steering local, y contención de aggro por sala.
 */

import { describe, expect, it } from 'vitest';
import { stepEnemyAi } from './ai';
import { generateDungeon } from '@/game/features/dungeon/dungeon';
import { createDungeonWorld } from '@/game/features/dungeon/dungeon-world';
import { createEventQueue, drainEvents } from '@/engine/events';
import { stepWorld } from '@/game/world/step';
import { createWorld } from '@/game/world/create';
import type { EnemySpawn, HazardSpawn, RoomData, World } from '@/game/world/types';

const FIXED_DT = 1 / 60;

function makeRoom(partial: Partial<RoomData> = {}): RoomData {
  return {
    version: 1,
    id: 'ai-room',
    name: 'AI',
    width: 30,
    height: 30,
    playerStart: { x: 0, y: 0 },
    tags: ['combate'],
    doorSlots: [],
    enemies: [],
    hazards: [],
    items: [],
    ...partial,
  };
}

function makeWorld(enemies: EnemySpawn[], hazards: HazardSpawn[] = []): World {
  return createWorld(makeRoom({ enemies, hazards }));
}

describe('navegación: evitación de hazards', () => {
  it('un Chaser rodea un foso interpuesto sin caer en él', () => {
    // Foso entre el chaser y el héroe.
    const pit: HazardSpawn = {
      id: 'pit-1',
      kind: 'pit',
      position: { x: 0, y: 4 },
      width: 2.5,
      height: 2.5,
    };
    const world = makeWorld([{ id: 'c1', kind: 'chaser', position: { x: 0, y: 8 } }], [pit]);
    world.hero.position.x = 0;
    world.hero.position.y = 0;

    const box = {
      minX: pit.position.x - pit.width / 2,
      maxX: pit.position.x + pit.width / 2,
      minY: pit.position.y - pit.height / 2,
      maxY: pit.position.y + pit.height / 2,
    };
    // 6 s de persecución: en ningún tick el centro del chaser entra en el foso.
    for (let i = 0; i < 360; i++) {
      stepEnemyAi(world, FIXED_DT);
      world.time += FIXED_DT;
      const c = world.enemies[0];
      const inside =
        c.position.x >= box.minX &&
        c.position.x <= box.maxX &&
        c.position.y >= box.minY &&
        c.position.y <= box.maxY;
      expect(inside).toBe(false);
    }
    // Y aún así progresa hacia el héroe (rodeó el foso).
    const c = world.enemies[0];
    expect(Math.hypot(c.position.x - 0, c.position.y - 0)).toBeLessThan(4);
  });
});

describe('evitación de barriles (regresión: chaser inmolándose)', () => {
  it('un chaser con barriles entre él y el héroe los rodea sin detonarlos', () => {
    // Reproduce la sala de pruebas: héroe arriba, chaser abajo, dos barriles
    // en la ruta directa. Sin este guard, el chaser detonaba un barril al
    // pasar y moría solo en <2 s (visto en preview, 2026-07-03).
    const world = makeWorld([
      { id: 'c1', kind: 'chaser', position: { x: 2.5, y: -4.5 } },
    ], [
      { id: 'b1', kind: 'barrel', position: { x: 2, y: -2 }, width: 0.8, height: 0.8 },
      { id: 'b2', kind: 'barrel', position: { x: 3.2, y: -2.4 }, width: 0.8, height: 0.8 },
    ]);
    world.hero.position.x = 0;
    world.hero.position.y = 6;
    const events = createEventQueue(64);
    for (let i = 0; i < 300; i++) {
      stepWorld(world, events);
      drainEvents(events, () => undefined);
    }
    const chaser = world.enemies[0];
    expect(chaser.hp).toBe(chaser.maxHp);
    expect(world.barrels.every((b) => !b.exploded)).toBe(true);
    // Y progresó hacia el héroe (no se quedó atascado tras los barriles).
    expect(Math.hypot(chaser.position.x - 0, chaser.position.y - 6)).toBeLessThan(3);
  });
});

describe('contención de aggro por sala (punto 7 de playtest ronda 3)', () => {
  it('un enemigo de sala NO visitada patrulla con normalidad pero no persigue aunque el héroe esté cerca al otro lado del muro', () => {
    // Mismo patrón de pool que dungeon-world.test.ts (6 salas: el generador
    // exige ROOMS_PER_RUN para materializar la topología). El chaser vive en
    // 'combat-1' con un tramo de patrulla conocido.
    const pool: RoomData[] = [
      {
        version: 1,
        id: 'start-1',
        name: 'Sala start-1',
        width: 9,
        height: 9,
        playerStart: { x: 0, y: 0 },
        tags: ['inicio'],
        doorSlots: [
          { side: 'north', offset: 0 },
          { side: 'south', offset: 0 },
          { side: 'east', offset: 0 },
          { side: 'west', offset: 0 },
        ],
        enemies: [],
        hazards: [],
        items: [],
      },
      {
        version: 1,
        id: 'combat-1',
        name: 'Sala combat-1',
        width: 9,
        height: 9,
        playerStart: { x: 0, y: 0 },
        tags: ['combate'],
        doorSlots: [
          { side: 'north', offset: 0 },
          { side: 'south', offset: 0 },
          { side: 'east', offset: 0 },
          { side: 'west', offset: 0 },
        ],
        enemies: [
          { id: 'chaser-1', kind: 'chaser', position: { x: -3.5, y: 0 }, patrolTarget: { x: -1.5, y: 0 } },
        ],
        hazards: [],
        items: [],
      },
      {
        version: 1,
        id: 'combat-2',
        name: 'Sala combat-2',
        width: 9,
        height: 9,
        playerStart: { x: 0, y: 0 },
        tags: ['combate'],
        doorSlots: [
          { side: 'north', offset: 0 },
          { side: 'south', offset: 0 },
          { side: 'east', offset: 0 },
          { side: 'west', offset: 0 },
        ],
        enemies: [{ id: 'd2', kind: 'dummy', position: { x: 2, y: 2 } }],
        hazards: [],
        items: [],
      },
      {
        version: 1,
        id: 'combat-3',
        name: 'Sala combat-3',
        width: 9,
        height: 9,
        playerStart: { x: 0, y: 0 },
        tags: ['combate'],
        doorSlots: [
          { side: 'north', offset: 0 },
          { side: 'south', offset: 0 },
          { side: 'east', offset: 0 },
          { side: 'west', offset: 0 },
        ],
        enemies: [{ id: 'd3', kind: 'dummy', position: { x: 2, y: 2 } }],
        hazards: [],
        items: [],
      },
      {
        version: 1,
        id: 'key-1',
        name: 'Sala key-1',
        width: 9,
        height: 9,
        playerStart: { x: 0, y: 0 },
        tags: ['llave'],
        doorSlots: [
          { side: 'north', offset: 0 },
          { side: 'south', offset: 0 },
          { side: 'east', offset: 0 },
          { side: 'west', offset: 0 },
        ],
        enemies: [{ id: 'd4', kind: 'dummy', position: { x: 2, y: 2 } }],
        hazards: [],
        items: [{ id: 'key-item', kind: 'key', position: { x: 0, y: 0 } }],
      },
      {
        version: 1,
        id: 'boss-1',
        name: 'Sala boss-1',
        width: 9,
        height: 9,
        playerStart: { x: 0, y: 0 },
        tags: ['jefe'],
        doorSlots: [
          { side: 'north', offset: 0 },
          { side: 'south', offset: 0 },
          { side: 'east', offset: 0 },
          { side: 'west', offset: 0 },
        ],
        enemies: [{ id: 'boss-enemy', kind: 'dummy', position: { x: 0, y: 0 } }],
        hazards: [],
        items: [],
      },
      {
        version: 1,
        id: 'shop-1',
        name: 'Sala shop-1',
        width: 9,
        height: 9,
        playerStart: { x: 0, y: 0 },
        tags: ['tienda'],
        doorSlots: [
          { side: 'north', offset: 0 },
          { side: 'south', offset: 0 },
          { side: 'east', offset: 0 },
          { side: 'west', offset: 0 },
        ],
        enemies: [],
        hazards: [],
        items: [{ id: 'shopkeeper', kind: 'shopkeeper', position: { x: 0, y: 0 } }],
      },
    ];

    const dungeon = generateDungeon(10, pool);
    const world = createDungeonWorld(dungeon, 10);
    const events = createEventQueue(64);

    const combatRuntime = world.roomRuntimes.get('combat-1')!;
    const chaser = world.enemies.find((e) => e.roomId === 'combat-1' && e.kind === 'chaser')!;
    expect(chaser).toBeDefined();

    // Con esta semilla, 'combat-1' no es la sala de inicio: sigue sin
    // visitar mientras el héroe no entre en ella.
    expect(combatRuntime.visited).toBe(false);
    expect(world.currentRoomId).not.toBe('combat-1');

    // Sitúa al héroe pegado al borde de SU sala actual más cercano al centro
    // de la sala del chaser (en línea recta hacia él, "al otro lado del
    // muro" en el sentido del punto 7: cerca en distancia absoluta, pero sin
    // cruzar nunca a su sala), y lo deja quieto ahí.
    const heroRuntime = world.roomRuntimes.get(world.currentRoomId)!;
    const towardX = combatRuntime.bounds.minX + (combatRuntime.bounds.maxX - combatRuntime.bounds.minX) / 2;
    const towardY = combatRuntime.bounds.minY + (combatRuntime.bounds.maxY - combatRuntime.bounds.minY) / 2;
    world.hero.position.x = Math.min(Math.max(towardX, heroRuntime.bounds.minX + 0.3), heroRuntime.bounds.maxX - 0.3);
    world.hero.position.y = Math.min(Math.max(towardY, heroRuntime.bounds.minY + 0.3), heroRuntime.bounds.maxY - 0.3);
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;

    // 3 s de simulación: suficiente para varias idas/vueltas de patrulla.
    for (let i = 0; i < 180; i++) {
      stepWorld(world, events);
      drainEvents(events, () => undefined);
      // El héroe nunca debe haber cruzado a la sala del chaser en este test.
      expect(world.currentRoomId).not.toBe('combat-1');
    }

    // La sala del chaser sigue sin visitar (el héroe no ha entrado).
    expect(combatRuntime.visited).toBe(false);
    // Nunca activa persecución...
    expect(chaser.chasing).toBe(false);
    // ...y se ha movido dentro de su tramo de patrulla, en coordenadas de
    // MUNDO (patrolFrom/patrolTo ya incluyen el origin de la sala): sigue
    // vivo, no está congelado, pero tampoco se ha acercado a la posición
    // absoluta del héroe más allá de su tramo asignado.
    const patrolMinX = Math.min(chaser.patrolFrom.x, chaser.patrolTo.x) - 0.1;
    const patrolMaxX = Math.max(chaser.patrolFrom.x, chaser.patrolTo.x) + 0.1;
    expect(chaser.position.x).toBeGreaterThanOrEqual(patrolMinX);
    expect(chaser.position.x).toBeLessThanOrEqual(patrolMaxX);
  });
});
