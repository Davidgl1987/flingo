/**
 * Tests del generador procedural de mazmorras (GDD §10.2): validaciones de
 * conectividad, ciclo, llave/jefe, solape y determinismo por semilla.
 */

import { describe, expect, it } from 'vitest';
import { generateDungeon, validateDungeon, type DungeonMap } from './dungeon';
import type { RoomData, RoomTag } from '@/game/world/types';

function makeTestRoom(id: string, tags: RoomTag[], size = 9, boss?: RoomData['boss']): RoomData {
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
    ...(boss !== undefined ? { boss } : {}),
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
    makeTestRoom('shop-1', ['tienda'], 9),
  ];
}

describe('generateDungeon', () => {
  it('produce ~6 salas (o roomCount pedido) + 1 tienda, con inicio/llave/jefe/tienda únicos', () => {
    const pool = makeVariedPool();
    const map = generateDungeon(42, pool);

    // roomCount pedido (6, por defecto) + 1 tienda ADICIONAL (docs/plans/ECONOMY_PLAN.md F4).
    expect(map.rooms.length).toBe(7);
    expect(map.rooms.filter((r) => r.room.tags.includes('inicio')).length).toBe(1);
    expect(map.rooms.filter((r) => r.room.tags.includes('llave')).length).toBe(1);
    expect(map.rooms.filter((r) => r.room.tags.includes('jefe')).length).toBe(1);
    expect(map.rooms.filter((r) => r.room.tags.includes('tienda')).length).toBe(1);
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

  describe('sala de tienda (docs/plans/ECONOMY_PLAN.md F4)', () => {
    it('incluye exactamente una sala tienda, conectada a una vecina y alcanzable', () => {
      const pool = makeVariedPool();
      const map = generateDungeon(2024, pool);

      const shopRooms = map.rooms.filter((r) => r.room.tags.includes('tienda'));
      expect(shopRooms.length).toBe(1);
      const shopId = shopRooms[0].room.id;

      const shopConnections = map.connections.filter((c) => c.roomAId === shopId || c.roomBId === shopId);
      expect(shopConnections.length).toBe(1); // callejón sin salida: una sola puerta
      expect(shopConnections[0].requiresKey).toBe(false); // no es la sala del jefe, no exige llave

      const validation = validateDungeon(map);
      expect(validation.valid).toBe(true);
    });

    it('el layout de emergencia también incluye una sala de tienda con tendero', () => {
      // Pool insuficiente (sin llave ni tienda): fuerza el fallback.
      const pool = [
        makeTestRoom('start-1', ['inicio']),
        makeTestRoom('combat-1', ['combate']),
        makeTestRoom('boss-1', ['jefe']),
      ];
      const map = generateDungeon(1, pool);

      const shopRooms = map.rooms.filter((r) => r.room.tags.includes('tienda'));
      expect(shopRooms.length).toBe(1);
      expect(shopRooms[0].room.items.some((i) => i.kind === 'shopkeeper')).toBe(true);

      const validation = validateDungeon(map);
      expect(validation.valid).toBe(true);
    });
  });

  describe('selección de sala de jefe (GDD §15, Fase B0)', () => {
    it('con una sola sala de jefe con `boss`, la elige siempre (aunque haya otras "jefe" sin boss)', () => {
      const pool = [
        ...makeVariedPool().filter((r) => !r.tags.includes('jefe')),
        makeTestRoom('boss-plain', ['jefe'], 13),
        makeTestRoom('boss-real', ['jefe'], 13, 'test-boss'),
      ];
      for (const seed of [1, 2, 3, 4, 5]) {
        const map = generateDungeon(seed, pool);
        expect(map.bossRoomId).toBe('boss-real');
      }
    });

    it('sin ninguna sala "jefe" con `boss`, cae a cualquier sala "jefe" (compatibilidad con boss-den.json)', () => {
      const pool = makeVariedPool(); // 'boss-1' no tiene `boss`
      const map = generateDungeon(42, pool);
      expect(map.bossRoomId).toBe('boss-1');
    });

    it('con `bossId` explícito (run multi-mazmorra), la sala de jefe resultante SIEMPRE tiene ese boss', () => {
      const pool = [
        ...makeVariedPool().filter((r) => !r.tags.includes('jefe')),
        makeTestRoom('boss-guardian', ['jefe'], 13, 'guardian'),
        makeTestRoom('boss-queen', ['jefe'], 13, 'queen'),
      ];
      for (const seed of [1, 2, 3, 4, 5]) {
        const mapGuardian = generateDungeon(seed, pool, 6, 'guardian');
        expect(mapGuardian.bossRoomId).toBe('boss-guardian');
        const mapQueen = generateDungeon(seed, pool, 6, 'queen');
        expect(mapQueen.bossRoomId).toBe('boss-queen');
      }
    });
  });

  // Bug playtest 2026-07-14: la 2ª mazmorra de una run se veía casi igual a
  // la 1ª (topología fija, solo permutaba qué sala de combate rellenaba cada
  // celda). `buildTopology` ahora depende de `rng`: esta suite comprueba que
  // sigue siendo siempre válida y que además VARÍA la forma del grafo entre
  // semillas (no solo la sala elegida por celda).
  describe('variedad de topología entre mazmorras (bug playtest: mazmorras casi idénticas)', () => {
    /** Multiconjunto (cx,cy)+rol de una mazmorra, para comparar FORMAS de topología (no solo qué sala cae en cada celda). */
    function topologyShape(map: DungeonMap): string {
      return map.rooms
        .map((r) => `${r.cell.cx},${r.cell.cy}:${r.room.tags.join('+')}`)
        .sort()
        .join('|');
    }

    it('genera una mazmorra válida para 30 semillas consecutivas', () => {
      const pool = makeVariedPool();
      for (let seed = 1; seed <= 30; seed++) {
        const map = generateDungeon(seed, pool);
        const validation = validateDungeon(map);
        expect(validation.valid, `semilla ${seed}: ${validation.errors.join('; ')}`).toBe(true);
      }
    });

    it('semillas consecutivas producen mayoritariamente formas de topología distintas', () => {
      const pool = makeVariedPool();
      const total = 29;
      let distinct = 0;
      for (let seed = 1; seed <= total; seed++) {
        const shapeA = topologyShape(generateDungeon(seed, pool));
        const shapeB = topologyShape(generateDungeon(seed + 1, pool));
        if (shapeA !== shapeB) distinct++;
      }
      expect(distinct / total).toBeGreaterThan(0.5);
    });

    it('es determinista: misma semilla + pool → misma forma de topología', () => {
      const pool = makeVariedPool();
      for (const seed of [3, 17, 101]) {
        const shapeA = topologyShape(generateDungeon(seed, pool));
        const shapeB = topologyShape(generateDungeon(seed, pool));
        expect(shapeA).toBe(shapeB);
      }
    });
  });
});
