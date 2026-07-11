/**
 * Tests del Chaser (GDD §7.2): persecución constante y aceleración al apuntar.
 */

import { describe, expect, it } from 'vitest';
import { stepEnemyAi } from '@/game/features/enemies/ai';
import { createWorld } from '@/game/world/create';
import type { EnemySpawn, HazardSpawn, RoomData, World } from '@/game/world/types';
import { CHASER_SPEED, CHASER_SPEED_WHILE_AIMING } from './constants';

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

describe('Chaser (GDD §7.2)', () => {
  it('persigue siempre a 2.35 u/s', () => {
    const world = makeWorld([{ id: 'c1', kind: 'chaser', position: { x: 8, y: 8 } }]);
    runAi(world, 1);
    const chaser = world.enemies[0];
    expect(Math.hypot(chaser.velocity.x, chaser.velocity.y)).toBeCloseTo(CHASER_SPEED, 5);
    // Se acerca al héroe (0,0).
    expect(chaser.velocity.x).toBeLessThan(0);
    expect(chaser.velocity.y).toBeLessThan(0);
  });

  it('acelera a 3.0 u/s cuando el héroe está apuntando', () => {
    const world = makeWorld([{ id: 'c1', kind: 'chaser', position: { x: 8, y: 8 } }]);
    world.heroAiming = true;
    runAi(world, 1);
    const chaser = world.enemies[0];
    expect(Math.hypot(chaser.velocity.x, chaser.velocity.y)).toBeCloseTo(
      CHASER_SPEED_WHILE_AIMING,
      5,
    );
  });
});
