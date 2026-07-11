/**
 * Tests del Dummy (GDD §7.1): correa y detección de persecución.
 */

import { describe, expect, it } from 'vitest';
import { stepEnemyAi } from '@/game/features/enemies/ai';
import { createWorld } from '@/game/world/create';
import type { EnemySpawn, HazardSpawn, RoomData, World } from '@/game/world/types';
import { DUMMY_CHASE_SPEED, DUMMY_LEASH_RANGE } from './constants';

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

describe('Dummy (GDD §7.1)', () => {
  it('patrulla y no persigue si el héroe está lejos', () => {
    const world = makeWorld([
      { id: 'd1', kind: 'dummy', position: { x: 0, y: 0 }, patrolTarget: { x: 1.6, y: 0 } },
    ]);
    world.hero.position.x = 10;
    world.hero.position.y = 10;
    runAi(world, 60);
    const dummy = world.enemies[0];
    expect(dummy.chasing).toBe(false);
    // Se mueve dentro de su tramo de patrulla (eje x).
    expect(dummy.position.x).toBeGreaterThan(0);
    expect(dummy.position.x).toBeLessThanOrEqual(1.7);
  });

  it('persigue al héroe cercano a 1.7 u/s', () => {
    const world = makeWorld([{ id: 'd1', kind: 'dummy', position: { x: 0, y: 0 } }]);
    world.hero.position.x = 2;
    world.hero.position.y = 0;
    runAi(world, 1);
    const dummy = world.enemies[0];
    expect(dummy.chasing).toBe(true);
    expect(Math.hypot(dummy.velocity.x, dummy.velocity.y)).toBeCloseTo(DUMMY_CHASE_SPEED, 5);
  });

  it('respeta la correa: nunca se aleja mucho más de 2.2 u de su zona y vuelve a patrullar', () => {
    const world = makeWorld([
      { id: 'd1', kind: 'dummy', position: { x: 0, y: 0 }, patrolTarget: { x: 1.6, y: 0 } },
    ]);
    // Héroe al alcance de detección para engancharlo…
    world.hero.position.x = 2;
    world.hero.position.y = 0;
    runAi(world, 10);
    expect(world.enemies[0].chasing).toBe(true);
    // …y después el héroe se aleja mucho: el dummy le sigue solo hasta la correa.
    world.hero.position.x = 12;
    let maxDistFromHome = 0;
    for (let i = 0; i < 600; i++) {
      stepEnemyAi(world, FIXED_DT);
      world.time += FIXED_DT;
      const dummy = world.enemies[0];
      const dist = Math.hypot(dummy.position.x - dummy.patrolFrom.x, dummy.position.y - dummy.patrolFrom.y);
      if (dist > maxDistFromHome) maxDistFromHome = dist;
    }
    // Margen de 1 tick de movimiento sobre la correa (comprobación al tick siguiente).
    expect(maxDistFromHome).toBeLessThan(DUMMY_LEASH_RANGE + DUMMY_CHASE_SPEED * FIXED_DT * 2);
    expect(world.enemies[0].chasing).toBe(false);
  });
});
