/**
 * Test del Spike (GDD §7.3, playtest 2026-07-05): la cara peligrosa sigue a
 * la marcha.
 */

import { describe, expect, it } from 'vitest';
import { stepEnemyAi } from '@/game/features/enemies/ai';
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

function runAi(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    stepEnemyAi(world, FIXED_DT);
    world.time += FIXED_DT;
  }
}

describe('Spike: la cara peligrosa sigue a la marcha (playtest 2026-07-05)', () => {
  it('al patrullar, facing apunta hacia donde se mueve; parado conserva la última', () => {
    const world = makeWorld([
      {
        id: 's1',
        kind: 'spike',
        position: { x: 0, y: 0 },
        facing: { x: 0, y: 1 },
        patrolTarget: { x: 3, y: 0 },
      },
    ]);
    world.hero.position.x = 12;
    world.hero.position.y = 12;
    runAi(world, 30);
    const spike = world.enemies[0];
    const speed = Math.hypot(spike.velocity.x, spike.velocity.y);
    expect(speed).toBeGreaterThan(0.1);
    // Se mueve hacia +x → facing debe ser ~(±1, 0) según el sentido del tramo.
    expect(Math.abs(spike.facing.x)).toBeGreaterThan(0.9);
    expect(Math.abs(spike.facing.y)).toBeLessThan(0.3);
  });
});
