// ── Shooter (GDD §7.5) ─────────────────────────────────────────────────────

import { canAggro, moveToward, stepPatrol } from '../steering';
import {
  SHOOTER_CHARGE_DURATION,
  SHOOTER_CHASE_DURATION,
  SHOOTER_CHASE_SPEED,
  SHOOTER_PROJECTILE_DAMAGE,
  SHOOTER_PROJECTILE_RADIUS,
  SHOOTER_PROJECTILE_SPEED,
} from './constants';
import { fireEnemyProjectile } from '@/game/sim/combat';
import type { Enemy, World } from '@/game/sim/world';

export function stepShooter(world: World, enemy: Enemy, dt: number): void {
  // Sin aggro (punto 7): patrulla como cualquier otro arquetipo, con el
  // ciclo persigue/carga/dispara congelado (nunca telegrafía ni dispara a
  // través de su propio muro) hasta que el héroe vuelva a su sala.
  if (!canAggro(world, enemy)) {
    stepPatrol(world, enemy, SHOOTER_CHASE_SPEED, dt);
    return;
  }

  enemy.shooterPhaseTimer -= dt;

  if (enemy.shooterPhase === 'chase') {
    moveToward(world, enemy, world.hero.position.x, world.hero.position.y, SHOOTER_CHASE_SPEED, dt);
  } else {
    // Fase de carga: se detiene y telegrafía el disparo (render dibuja el aviso).
    enemy.velocity.x = 0;
    enemy.velocity.y = 0;
  }

  if (enemy.shooterPhaseTimer <= 0) {
    if (enemy.shooterPhase === 'chase') {
      enemy.shooterPhase = 'charge';
      enemy.shooterPhaseTimer = SHOOTER_CHARGE_DURATION;
    } else {
      // Fin de la carga: dispara hacia el héroe y vuelve a perseguir.
      const dx = world.hero.position.x - enemy.position.x;
      const dy = world.hero.position.y - enemy.position.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      fireEnemyProjectile(
        world,
        enemy.position.x,
        enemy.position.y,
        dx / len,
        dy / len,
        SHOOTER_PROJECTILE_SPEED,
        SHOOTER_PROJECTILE_DAMAGE,
        SHOOTER_PROJECTILE_RADIUS,
      );
      enemy.shooterPhase = 'chase';
      enemy.shooterPhaseTimer = SHOOTER_CHASE_DURATION;
    }
  }
}
