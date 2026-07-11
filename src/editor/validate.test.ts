/**
 * Tests de validateLive (GDD §13): además de las reglas del parser común
 * (room-format.ts), el editor añade comprobaciones de "dentro de la sala"
 * para el inicio del jugador, enemigos (y su patrulla), hazards e items, y
 * de huecos de puerta que no se salgan del muro.
 */

import { describe, expect, it } from 'vitest';
import type { EnemySpawn, HazardSpawn, ItemSpawn } from '@/game/sim/world';
import { defaultRoom } from './utils';
import { validateLive } from './validate';

describe('validateLive', () => {
  it('no reporta errores para la sala por defecto', () => {
    expect(validateLive(defaultRoom())).toEqual([]);
  });

  it('reporta el inicio del jugador fuera de la sala', () => {
    const room = { ...defaultRoom(), playerStart: { x: 100, y: 0 } };
    const errors = validateLive(room);
    expect(errors).toContain('El inicio del jugador está fuera de la sala.');
  });

  it('reporta un enemigo fuera de la sala', () => {
    const enemy: EnemySpawn = { id: 'dummy-1', kind: 'dummy', position: { x: 100, y: 0 } };
    const room = { ...defaultRoom(), enemies: [enemy] };
    const errors = validateLive(room);
    expect(errors).toContain('El enemigo "dummy-1" está fuera de la sala.');
  });

  it('reporta un destino de patrulla fuera de la sala', () => {
    const enemy: EnemySpawn = {
      id: 'chaser-1',
      kind: 'chaser',
      position: { x: 0, y: 0 },
      patrolTarget: { x: 100, y: 0 },
    };
    const room = { ...defaultRoom(), enemies: [enemy] };
    const errors = validateLive(room);
    expect(errors).toContain('El destino de patrulla de "chaser-1" está fuera de la sala.');
  });

  it('reporta un hazard fuera de la sala', () => {
    const hazard: HazardSpawn = { id: 'pit-1', kind: 'pit', position: { x: 100, y: 0 }, width: 1, height: 1 };
    const room = { ...defaultRoom(), hazards: [hazard] };
    const errors = validateLive(room);
    expect(errors).toContain('El hazard "pit-1" está fuera de la sala.');
  });

  it('reporta un item fuera de la sala', () => {
    const item: ItemSpawn = { id: 'coin-1', kind: 'coin', position: { x: 100, y: 0 } };
    const room = { ...defaultRoom(), items: [item] };
    const errors = validateLive(room);
    expect(errors).toContain('El objeto "coin-1" está fuera de la sala.');
  });

  it('reporta un hueco de puerta que se sale del muro', () => {
    const room = { ...defaultRoom(), doorSlots: [{ side: 'north' as const, offset: 10 }] };
    const errors = validateLive(room);
    expect(errors).toContain('El hueco de puerta Norte (10) se sale del muro.');
  });
});
