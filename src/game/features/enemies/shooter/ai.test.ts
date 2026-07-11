/**
 * Tests del Shooter (GDD §7.5): ciclo persigue → carga → dispara.
 */

import { describe, expect, it } from 'vitest';
import { stepEnemyAi } from '../ai';
import { createWorld, type EnemySpawn, type HazardSpawn, type RoomData, type World } from '@/game/sim/world';
import { SHOOTER_PROJECTILE_SPEED } from './constants';

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

describe('Shooter (GDD §7.5)', () => {
  it('cicla persigue 1 s → carga 1 s → dispara un proyectil hostil de 6.6 u/s', () => {
    const world = makeWorld([{ id: 'sh1', kind: 'shooter', position: { x: 0, y: -8 } }]);
    world.hero.position.y = 8;

    // Fase inicial: persigue con velocidad > 0.
    runAi(world, 30); // 0.5 s
    const shooter = world.enemies[0];
    expect(shooter.shooterPhase).toBe('chase');
    expect(Math.hypot(shooter.velocity.x, shooter.velocity.y)).toBeGreaterThan(0.5);

    // Tras ~1 s total: cargando, quieto.
    runAi(world, 35); // hasta ~1.08 s
    expect(shooter.shooterPhase).toBe('charge');
    expect(shooter.velocity.x).toBe(0);
    expect(shooter.velocity.y).toBe(0);

    // Tras ~2 s: ha disparado y vuelve a perseguir.
    runAi(world, 62);
    expect(shooter.shooterPhase).toBe('chase');
    const projectile = world.projectiles.find((p) => p.active && p.kind === 'enemy');
    expect(projectile).toBeDefined();
    expect(projectile!.owner).toBe('enemy');
    expect(Math.hypot(projectile!.velocity.x, projectile!.velocity.y)).toBeCloseTo(
      SHOOTER_PROJECTILE_SPEED,
      5,
    );
    // Disparado hacia el héroe (al sur → +y).
    expect(projectile!.velocity.y).toBeGreaterThan(0);
  });
});
