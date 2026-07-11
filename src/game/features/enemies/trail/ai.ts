// ── Trail (GDD §7.4) ───────────────────────────────────────────────────────

import { stepPatrol } from '../steering';
import { TRAIL_DROP_INTERVAL, TRAIL_PUDDLE_LIFETIME, TRAIL_PUDDLE_RADIUS, TRAIL_SPEED } from './constants';
import type { Enemy, World } from '@/game/sim/world';

function acquirePuddle(world: World) {
  const pool = world.puddles;
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) return pool[i];
  }
  return null;
}

export function stepTrail(world: World, enemy: Enemy, dt: number): void {
  stepPatrol(world, enemy, TRAIL_SPEED, dt);

  enemy.trailDropTimer -= dt;
  if (enemy.trailDropTimer <= 0) {
    enemy.trailDropTimer = TRAIL_DROP_INTERVAL;
    const puddle = acquirePuddle(world);
    if (puddle) {
      puddle.active = true;
      puddle.position.x = enemy.position.x;
      puddle.position.y = enemy.position.y;
      puddle.radius = TRAIL_PUDDLE_RADIUS;
      puddle.ttl = TRAIL_PUDDLE_LIFETIME;
      // Slot reciclado del pool compartido: puede venir de un charco de la
      // Reina (slows=true, rediseño 2026-07-10). El Trail normal solo hace
      // daño de contacto — resetea explícitamente.
      puddle.slows = false;
    }
  }
}
