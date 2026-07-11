/**
 * El pool de salas de serie (src/game/features/dungeon/levels/*.json) debe producir una mazmorra
 * válida sin caer al layout de emergencia (GDD §10.2), y cada sala debe
 * pasar el parser del formato (GDD §13).
 */

import { describe, expect, it } from 'vitest';
import { generateDungeon, validateDungeon } from './dungeon';
import { seriesRooms } from './rooms';

describe('pool de salas de serie', () => {
  it('contiene salas con las 3 etiquetas obligatorias (inicio/llave/jefe) y al menos 2 de combate', () => {
    expect(seriesRooms.some((r) => r.tags.includes('inicio'))).toBe(true);
    expect(seriesRooms.some((r) => r.tags.includes('llave'))).toBe(true);
    expect(seriesRooms.some((r) => r.tags.includes('jefe'))).toBe(true);
    expect(seriesRooms.filter((r) => r.tags.includes('combate')).length).toBeGreaterThanOrEqual(2);
  });

  it('genera una mazmorra válida de 6 salas sin caer al fallback', () => {
    const dungeon = generateDungeon(2026, seriesRooms);
    expect(dungeon.rooms.length).toBe(6);
    expect(dungeon.rooms.some((r) => r.room.id.startsWith('fallback-'))).toBe(false);

    const validation = validateDungeon(dungeon);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('es determinista con distintas semillas (todas producen mazmorras válidas)', () => {
    for (const seed of [1, 42, 999, 123456]) {
      const dungeon = generateDungeon(seed, seriesRooms);
      const validation = validateDungeon(dungeon);
      expect(validation.valid, `semilla ${seed}: ${validation.errors.join('; ')}`).toBe(true);
    }
  });
});
