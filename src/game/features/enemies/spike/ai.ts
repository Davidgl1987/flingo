// ── Spike (GDD §7.3) ───────────────────────────────────────────────────────

import { stepPatrol } from '@/game/features/enemies/steering';
import { SPIKE_PATROL_SPEED } from './constants';
import type { Enemy, World } from '@/game/world/types';

export function stepSpike(world: World, enemy: Enemy, dt: number): void {
  stepPatrol(world, enemy, SPIKE_PATROL_SPEED, dt);
  // La cara peligrosa mira hacia donde se mueve (playtest 2026-07-05):
  // embiste con las púas por delante. Parado conserva la última dirección
  // (o el spikeDir inicial de la sala), así que sigue siendo legible.
  const speed = Math.hypot(enemy.velocity.x, enemy.velocity.y);
  if (speed > 0.05) {
    enemy.facing.x = enemy.velocity.x / speed;
    enemy.facing.y = enemy.velocity.y / speed;
  }
}
