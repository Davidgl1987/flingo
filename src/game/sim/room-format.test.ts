/**
 * Tests del parse/validación del formato de sala (GDD §13).
 */

import { describe, expect, it } from 'vitest';
import { parseRoomData, parseRoomDataFromJson } from './room-format';

function validRoomJson(): Record<string, unknown> {
  return {
    version: 1,
    id: 'room-1',
    name: 'Sala de prueba',
    width: 9,
    height: 9,
    playerStart: { x: 0, y: 0 },
    tags: ['combate'],
    doorSlots: [{ side: 'north', offset: 0 }],
    enemies: [{ id: 'e1', kind: 'dummy', position: { x: 1, y: 1 } }],
    hazards: [{ id: 'h1', kind: 'rock', position: { x: -2, y: -2 }, width: 1, height: 1 }],
    items: [{ id: 'i1', kind: 'coin', position: { x: 2, y: 2 } }],
  };
}

describe('parseRoomData', () => {
  it('acepta una sala bien formada', () => {
    const result = parseRoomData(validRoomJson());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.room?.id).toBe('room-1');
  });

  it('rechaza dimensiones pares o menores que el mínimo', () => {
    const bad = { ...validRoomJson(), width: 4 };
    const result = parseRoomData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('width'))).toBe(true);
  });

  it('rechaza id/nombre vacíos', () => {
    const bad = { ...validRoomJson(), id: '', name: '' };
    const result = parseRoomData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('rechaza más de 2 huecos de puerta por lado', () => {
    const bad = {
      ...validRoomJson(),
      doorSlots: [
        { side: 'north', offset: -2 },
        { side: 'north', offset: 0 },
        { side: 'north', offset: 2 },
      ],
    };
    const result = parseRoomData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('más de 2'))).toBe(true);
  });

  it('rechaza huecos de puerta demasiado próximos en el mismo lado', () => {
    const bad = {
      ...validRoomJson(),
      doorSlots: [
        { side: 'north', offset: 0 },
        { side: 'north', offset: 0.5 },
      ],
    };
    const result = parseRoomData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('próxim'))).toBe(true);
  });

  it('rechaza ids de enemigo duplicados', () => {
    const bad = {
      ...validRoomJson(),
      enemies: [
        { id: 'dup', kind: 'dummy', position: { x: 0, y: 0 } },
        { id: 'dup', kind: 'chaser', position: { x: 1, y: 1 } },
      ],
    };
    const result = parseRoomData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicado'))).toBe(true);
  });

  it('rechaza el inicio del jugador encima de un hazard', () => {
    const bad = {
      ...validRoomJson(),
      playerStart: { x: -2, y: -2 },
      hazards: [{ id: 'h1', kind: 'spikes', position: { x: -2, y: -2 }, width: 1, height: 1 }],
    };
    const result = parseRoomData(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('encima del hazard'))).toBe(true);
  });

  it('rechaza tags desconocidas', () => {
    const bad = { ...validRoomJson(), tags: ['no-existe'] };
    const result = parseRoomData(bad);
    expect(result.valid).toBe(false);
  });

  it('rechaza JSON que no es un objeto', () => {
    const result = parseRoomData([1, 2, 3]);
    expect(result.valid).toBe(false);
  });

  it('parseRoomDataFromJson acepta una cadena JSON válida y rechaza JSON malformado', () => {
    const okJson = JSON.stringify(validRoomJson());
    const ok = parseRoomDataFromJson(okJson);
    expect(ok.valid).toBe(true);

    const bad = parseRoomDataFromJson('{ esto no es json');
    expect(bad.valid).toBe(false);
    expect(bad.errors[0]).toContain('JSON válido');
  });
});
