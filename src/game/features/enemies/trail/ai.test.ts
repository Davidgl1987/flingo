/**
 * Tests del Trail (GDD §7.4): cadencia de charcos.
 */

import { describe, expect, it } from 'vitest';
import { stepEnemyAi } from '@/game/features/enemies/ai';
import { createWorld } from '@/game/world/create';
import type { EnemySpawn, HazardSpawn, RoomData, World } from '@/game/world/types';
import { TRAIL_DROP_INTERVAL, TRAIL_PUDDLE_LIFETIME, TRAIL_PUDDLE_RADIUS } from './constants';

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

function runAi(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    stepEnemyAi(world, FIXED_DT);
    world.time += FIXED_DT;
  }
}

describe('Trail (GDD §7.4)', () => {
  it('suelta charcos con cadencia de 0.55 s, radio 0.45 y vida 3.2 s', () => {
    const world = makeWorld([
      { id: 't1', kind: 'trail', position: { x: 0, y: 0 }, patrolTarget: { x: 5, y: 0 } },
    ]);
    world.hero.position.x = 12; // lejos: solo patrulla

    // 1.2 s de sim: suelta en t≈0, t≈0.55 y t≈1.1 → 3 charcos.
    runAi(world, 72);

    const active = world.puddles.filter((p) => p.active);
    expect(active.length).toBe(Math.floor(1.2 / TRAIL_DROP_INTERVAL) + 1);
    for (const puddle of active) {
      expect(puddle.radius).toBeCloseTo(TRAIL_PUDDLE_RADIUS, 9);
      expect(puddle.ttl).toBeLessThanOrEqual(TRAIL_PUDDLE_LIFETIME);
      expect(puddle.ttl).toBeGreaterThan(0);
    }
  });
});
