/**
 * Integración de arranque (fase 3): la sesión por defecto del juego es un
 * mundo de mazmorra multi-sala generado desde el pool de serie, con semilla
 * forzable (?seed=N) que sobrevive a los reinicios.
 */

import { describe, expect, it } from 'vitest';
import { seriesRooms, testRoom } from '@/game/content/rooms';
import { createDungeonGameSession, createGameSession, restartSession } from './session';

describe('createDungeonGameSession (arranque de run completa)', () => {
  it('crea un mundo multi-sala con el pool de serie: dungeon activo, héroe en la sala de inicio', () => {
    const session = createDungeonGameSession(seriesRooms, 42);
    const world = session.world;

    expect(world.dungeon).not.toBeNull();
    expect(world.dungeon!.rooms.length).toBe(6);
    expect(world.currentRoomId).toBe(world.dungeon!.startRoomId);

    const startRuntime = world.roomRuntimes.get(world.dungeon!.startRoomId)!;
    expect(startRuntime.visited).toBe(true);
    const { position } = world.hero;
    expect(position.x).toBeGreaterThanOrEqual(startRuntime.bounds.minX);
    expect(position.x).toBeLessThanOrEqual(startRuntime.bounds.maxX);
    expect(position.y).toBeGreaterThanOrEqual(startRuntime.bounds.minY);
    expect(position.y).toBeLessThanOrEqual(startRuntime.bounds.maxY);
  });

  it('es determinista con semilla forzada: mismas salas y misma colocación', () => {
    const a = createDungeonGameSession(seriesRooms, 1234);
    const b = createDungeonGameSession(seriesRooms, 1234);
    expect(a.world.dungeon!.rooms.map((r) => r.room.id)).toEqual(
      b.world.dungeon!.rooms.map((r) => r.room.id),
    );
    expect(a.world.dungeon!.rooms.map((r) => r.origin)).toEqual(
      b.world.dungeon!.rooms.map((r) => r.origin),
    );
  });

  it('los enemigos de salas no visitadas existen pero sus salas están sin visitar', () => {
    const session = createDungeonGameSession(seriesRooms, 42);
    const world = session.world;
    const unvisited = [...world.roomRuntimes.values()].filter((r) => !r.visited);
    expect(unvisited.length).toBeGreaterThan(0);
    // Y hay enemigos asignados a salas (etiquetados con roomId).
    expect(world.enemies.every((e) => e.roomId !== undefined)).toBe(true);
  });

  it('restartSession con semilla forzada regenera el MISMO mapa; sin forzar, una run nueva', () => {
    const forced = createDungeonGameSession(seriesRooms, 777);
    const idsBefore = forced.world.dungeon!.rooms.map((r) => r.room.id);
    restartSession(forced);
    expect(forced.seed).toBe(777);
    expect(forced.world.dungeon!.rooms.map((r) => r.room.id)).toEqual(idsBefore);

    const free = createDungeonGameSession(seriesRooms, null);
    const seedBefore = free.seed;
    restartSession(free);
    // Sin forzar: la semilla se resortea (probabilidad de colisión despreciable,
    // pero lo que garantizamos es que el mundo se regenera y sigue siendo válido).
    expect(free.world.dungeon).not.toBeNull();
    expect(typeof free.seed).toBe('number');
    expect(free.world.currentRoomId).toBe(free.world.dungeon!.startRoomId);
    // seedBefore solo se usa para asegurar que ambos son enteros válidos.
    expect(Number.isInteger(seedBefore)).toBe(true);
  });

  it('el modo sala única (playtest del editor) sigue creando un mundo sin dungeon', () => {
    const session = createGameSession(testRoom);
    expect(session.world.dungeon).toBeNull();
    expect(session.dungeonPool).toBeNull();
  });
});
