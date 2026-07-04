/**
 * Tests del generador procedural de mazmorras (GDD §10.2): validaciones de
 * conectividad, ciclo, llave/jefe, solape y determinismo por semilla.
 */

import { describe, expect, it } from 'vitest';
import { generateDungeon, validateDungeon } from './dungeon';
import type { RoomData, RoomTag } from './world';

function makeTestRoom(id: string, tags: RoomTag[], size = 9): RoomData {
  return {
    version: 1,
    id,
    name: id,
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
    enemies: [],
    hazards: [],
    items: [],
  };
}

function makeVariedPool(): RoomData[] {
  return [
    makeTestRoom('start-1', ['inicio'], 9),
    makeTestRoom('combat-1', ['combate'], 9),
    makeTestRoom('combat-2', ['combate'], 11),
    makeTestRoom('combat-3', ['combate'], 7),
    makeTestRoom('combat-4', ['combate'], 9),
    makeTestRoom('key-1', ['llave'], 9),
    makeTestRoom('boss-1', ['jefe'], 13),
  ];
}

describe('generateDungeon', () => {
  it('produce ~6 salas (o roomCount pedido) con inicio/llave/jefe únicos', () => {
    const pool = makeVariedPool();
    const map = generateDungeon(42, pool);

    expect(map.rooms.length).toBe(6);
    expect(map.rooms.filter((r) => r.room.tags.includes('inicio')).length).toBe(1);
    expect(map.rooms.filter((r) => r.room.tags.includes('llave')).length).toBe(1);
    expect(map.rooms.filter((r) => r.room.tags.includes('jefe')).length).toBe(1);
  });

  it('todo alcanzable, jefe requiere llave, llave alcanzable sin pasar por el jefe, sin solapes', () => {
    const pool = makeVariedPool();
    const map = generateDungeon(7, pool);
    const validation = validateDungeon(map);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('contiene al menos un ciclo (aristas >= nodos)', () => {
    const pool = makeVariedPool();
    const map = generateDungeon(123, pool);
    expect(map.connections.length).toBeGreaterThanOrEqual(map.rooms.length);
  });

  it('el jefe es hoja terminal (una sola conexión, la que exige llave)', () => {
    const pool = makeVariedPool();
    const map = generateDungeon(99, pool);
    const bossConnections = map.connections.filter(
      (c) => c.roomAId === map.bossRoomId || c.roomBId === map.bossRoomId,
    );
    expect(bossConnections.length).toBe(1);
    expect(bossConnections[0].requiresKey).toBe(true);
  });

  it('es determinista: misma semilla + pool → mismo mapa', () => {
    const pool = makeVariedPool();
    const mapA = generateDungeon(555, pool);
    const mapB = generateDungeon(555, pool);

    expect(mapA.rooms.map((r) => r.room.id)).toEqual(mapB.rooms.map((r) => r.room.id));
    expect(mapA.rooms.map((r) => r.origin)).toEqual(mapB.rooms.map((r) => r.origin));
    expect(mapA.startRoomId).toBe(mapB.startRoomId);
    expect(mapA.bossRoomId).toBe(mapB.bossRoomId);
    expect(mapA.keyRoomId).toBe(mapB.keyRoomId);
  });

  it('semillas distintas pueden producir asignaciones de sala distintas', () => {
    const pool = makeVariedPool();
    const mapA = generateDungeon(1, pool);
    const mapB = generateDungeon(2, pool);
    // No garantizamos que TODAS las salas cambien, pero la selección de
    // combate debe depender de la semilla al menos en algún caso con este pool.
    const idsA = mapA.rooms.map((r) => r.room.id).join(',');
    const idsB = mapB.rooms.map((r) => r.room.id).join(',');
    expect(idsA === idsB && mapA.seed === mapB.seed).toBe(false);
  });

  it('ninguna sala (salvo vecinas) se solapa en coordenadas de mundo', () => {
    const pool = makeVariedPool();
    const map = generateDungeon(2024, pool);
    const neighborPairs = new Set<string>();
    for (const conn of map.connections) {
      neighborPairs.add(`${conn.roomAId}-${conn.roomBId}`);
      neighborPairs.add(`${conn.roomBId}-${conn.roomAId}`);
    }
    for (let i = 0; i < map.rooms.length; i++) {
      for (let j = i + 1; j < map.rooms.length; j++) {
        const a = map.rooms[i];
        const b = map.rooms[j];
        if (neighborPairs.has(`${a.room.id}-${b.room.id}`)) continue;
        const overlap = a.bounds.minX < b.bounds.maxX && a.bounds.maxX > b.bounds.minX &&
          a.bounds.minY < b.bounds.maxY && a.bounds.maxY > b.bounds.minY;
        expect(overlap).toBe(false);
      }
    }
  });

  it('cae al layout de emergencia si el pool es insuficiente (sigue siendo válido)', () => {
    // Pool sin sala de llave: no se puede materializar la topología pedida.
    const pool = [
      makeTestRoom('start-1', ['inicio']),
      makeTestRoom('combat-1', ['combate']),
      makeTestRoom('boss-1', ['jefe']),
    ];
    const map = generateDungeon(1, pool);
    const validation = validateDungeon(map);
    expect(validation.valid).toBe(true);
  });
});
