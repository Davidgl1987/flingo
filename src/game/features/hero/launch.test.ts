/**
 * Tests del lanzamiento corporal (GDD §4-5).
 */

import { describe, expect, it } from 'vitest';
import { BODY_LAUNCH_COOLDOWN, LAUNCH_SPEED_MAX, LAUNCH_SPEED_MIN } from './constants';
import { createEventQueue, drainEvents, type GameEvent } from '@/engine/events';
import { launchHero, launchSpeed } from './launch';
import { stepWorld } from '@/game/world/step';
import { createWorld } from '@/game/world/create';
import type { RoomData } from '@/game/world/types';

function makeRoom(): RoomData {
  return {
    version: 1,
    id: 'launch-room',
    name: 'Launch',
    width: 30,
    height: 30,
    playerStart: { x: 0, y: 0 },
    tags: ['combate'],
    doorSlots: [],
    enemies: [],
    hazards: [],
    items: [],
  };
}

describe('launchSpeed', () => {
  it('produce velocidades en el rango [3.6, 7.5]', () => {
    expect(launchSpeed(0)).toBeCloseTo(LAUNCH_SPEED_MIN, 9);
    expect(launchSpeed(1)).toBeCloseTo(LAUNCH_SPEED_MAX, 9);
    for (const force of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const speed = launchSpeed(force);
      expect(speed).toBeGreaterThanOrEqual(LAUNCH_SPEED_MIN);
      expect(speed).toBeLessThanOrEqual(LAUNCH_SPEED_MAX);
    }
  });

  it('es monótona creciente con la fuerza y clampa fuera de [0,1]', () => {
    expect(launchSpeed(0.8)).toBeGreaterThan(launchSpeed(0.3));
    expect(launchSpeed(-2)).toBeCloseTo(LAUNCH_SPEED_MIN, 9);
    expect(launchSpeed(5)).toBeCloseTo(LAUNCH_SPEED_MAX, 9);
  });
});

describe('launchHero', () => {
  it('aplica la velocidad en la dirección pedida y emite el evento launch', () => {
    const world = createWorld(makeRoom());
    const events = createEventQueue(8);
    const ok = launchHero(world, 1, 0, 1, events);

    expect(ok).toBe(true);
    expect(world.hero.velocity.x).toBeCloseTo(LAUNCH_SPEED_MAX, 9);
    expect(world.hero.velocity.y).toBeCloseTo(0, 9);

    const collected: GameEvent[] = [];
    drainEvents(events, (e) => collected.push({ ...e }));
    expect(collected).toHaveLength(1);
    expect(collected[0].type).toBe('launch');
    expect(collected[0].intensity).toBeCloseTo(1, 9);
  });

  it('rechaza fuerzas por debajo del 8%', () => {
    const world = createWorld(makeRoom());
    const events = createEventQueue(8);
    expect(launchHero(world, 1, 0, 0.05, events)).toBe(false);
    expect(world.hero.velocity.x).toBe(0);
  });

  it('respeta el cooldown de 0.2 s', () => {
    const world = createWorld(makeRoom());
    const events = createEventQueue(64);
    expect(launchHero(world, 1, 0, 0.5, events)).toBe(true);
    // Inmediatamente después: bloqueado.
    expect(launchHero(world, 0, 1, 0.5, events)).toBe(false);

    // Avanzamos la sim justo por encima del cooldown.
    const ticks = Math.ceil(BODY_LAUNCH_COOLDOWN * 60) + 1;
    for (let i = 0; i < ticks; i++) {
      stepWorld(world, events);
    }
    expect(launchHero(world, 0, 1, 0.5, events)).toBe(true);
  });
});
