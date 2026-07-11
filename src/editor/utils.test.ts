/**
 * Tests de las utilidades puras del editor (GDD §13): snap a la rejilla de
 * 0.5 u, generación de ids incrementales sin colisión y la sala por defecto.
 */

import { describe, expect, it } from 'vitest';
import { parseRoomData } from '@/game/features/dungeon/room-format';
import { defaultRoom, nextId, snap } from './utils';

describe('snap', () => {
  it('redondea al múltiplo de 0.5 más cercano', () => {
    expect(snap(1.24)).toBe(1);
    expect(snap(1.26)).toBe(1.5);
    expect(snap(1.75)).toBe(2);
    expect(snap(0)).toBe(0);
  });

  it('funciona con negativos', () => {
    expect(snap(-1.26)).toBe(-1.5);
    expect(snap(-1.24)).toBe(-1);
  });
});

describe('nextId', () => {
  it('devuelve "prefix-1" cuando no hay ids existentes', () => {
    expect(nextId('dummy', [])).toBe('dummy-1');
  });

  it('salta los ids ya usados de forma consecutiva', () => {
    const existing = [{ id: 'dummy-1' }, { id: 'dummy-2' }];
    expect(nextId('dummy', existing)).toBe('dummy-3');
  });

  it('rellena el primer hueco libre en vez de ir siempre al final', () => {
    const existing = [{ id: 'dummy-1' }, { id: 'dummy-3' }];
    expect(nextId('dummy', existing)).toBe('dummy-2');
  });

  it('no colisiona entre prefijos distintos', () => {
    const existing = [{ id: 'chaser-1' }];
    expect(nextId('dummy', existing)).toBe('dummy-1');
  });
});

describe('defaultRoom', () => {
  it('produce una sala válida según el parser común', () => {
    const room = defaultRoom();
    const result = parseRoomData(room);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('trae 4 huecos de puerta (uno por lado) y listas vacías de entidades', () => {
    const room = defaultRoom();
    expect(room.doorSlots).toHaveLength(4);
    expect(room.enemies).toEqual([]);
    expect(room.hazards).toEqual([]);
    expect(room.items).toEqual([]);
  });
});
