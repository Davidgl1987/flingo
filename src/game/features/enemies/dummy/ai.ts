// ── Dummy (GDD §7.1) ───────────────────────────────────────────────────────

import { canAggro, heroDistance, moveToward, stepPatrol } from '@/game/features/enemies/steering';
import { DUMMY_CHASE_SPEED, DUMMY_DETECT_RANGE, DUMMY_LEASH_RANGE, DUMMY_PATROL_SPEED } from './constants';
import type { Enemy, World } from '@/game/world/types';

export function stepDummy(world: World, enemy: Enemy, dt: number): void {
  const aggro = canAggro(world, enemy);
  const distToHero = heroDistance(world, enemy);

  if (!enemy.chasing && aggro && distToHero <= DUMMY_DETECT_RANGE) {
    enemy.chasing = true;
  }
  if (enemy.chasing) {
    const distFromHome = Math.hypot(
      enemy.position.x - enemy.patrolFrom.x,
      enemy.position.y - enemy.patrolFrom.y,
    );
    // Deja de perseguir si se aleja demasiado de su zona de patrulla O si el
    // héroe ha salido de su sala (aggro revocado): vuelve a patrullar.
    if (distFromHome > DUMMY_LEASH_RANGE || !aggro) {
      enemy.chasing = false;
    }
  }

  if (enemy.chasing) {
    moveToward(world, enemy, world.hero.position.x, world.hero.position.y, DUMMY_CHASE_SPEED, dt);
    return;
  }

  stepPatrol(world, enemy, DUMMY_PATROL_SPEED, dt);
}
