/**
 * Jefe de pruebas (Fase B0): quieto, un ataque telegrafiado simple en bucle,
 * ventana tras el ataque. Solo para verificar el framework; NO es un jefe de
 * diseño (B1-B4 lo son). Se añade al pool de salas SOLO en dev/tests (ver
 * content/rooms.ts::getRoomPool), nunca en una run normal si hay otro jefe
 * disponible.
 */

import { fireEnemyProjectile } from '@/game/sim/combat';
import { pushEvent, type EventQueue } from '@/game/sim/events';
import type { Enemy, World } from '@/game/sim/world';

const TEST_BOSS_TELEGRAPH_DURATION = 0.8;
const TEST_BOSS_ATTACK_DURATION = 0.25;
const TEST_BOSS_VULNERABLE_DURATION = 1.4;
const TEST_BOSS_COOLDOWN_DURATION = 1.0;
const TEST_BOSS_PROJECTILE_SPEED = 4.5;
const TEST_BOSS_PROJECTILE_DAMAGE = 1;
const TEST_BOSS_PROJECTILE_RADIUS = 0.2;

/**
 * Sub-estado del ciclo del jefe de pruebas, codificado en `bossStage`
 * (escalar, sin objetos nuevos). `Enemy.bossStage` arranca en 0 (ver
 * `createEnemy` en world.ts) para TODO enemigo, jefe o no — por eso
 * `TEST_BOSS_STAGE_COOLDOWN` (que arranca un ciclo nuevo, telegrafiando el
 * primer ataque) es justamente el valor 0: el jefe de pruebas empieza su
 * vida "recién salido de un cooldown", no a mitad de telegraph.
 */
const TEST_BOSS_STAGE_COOLDOWN = 0;
const TEST_BOSS_STAGE_TELEGRAPH = 1;
const TEST_BOSS_STAGE_ATTACK = 2;
const TEST_BOSS_STAGE_VULNERABLE = 3;

export function testBossStepPattern(world: World, boss: Enemy, dt: number, events: EventQueue): void {
  boss.bossTimer -= dt;
  if (boss.bossTimer > 0) return;

  switch (boss.bossStage) {
    case TEST_BOSS_STAGE_TELEGRAPH: {
      // Fin del telegraph: dispara un proyectil lento hacia el héroe (ataque
      // "simple" del jefe de pruebas) y pasa a la ventana de resolución.
      const dx = world.hero.position.x - boss.position.x;
      const dy = world.hero.position.y - boss.position.y;
      const len = Math.hypot(dx, dy) || 1;
      fireEnemyProjectile(
        world,
        boss.position.x,
        boss.position.y,
        dx / len,
        dy / len,
        TEST_BOSS_PROJECTILE_SPEED,
        TEST_BOSS_PROJECTILE_DAMAGE,
        TEST_BOSS_PROJECTILE_RADIUS,
      );
      boss.bossTelegraphUntil = 0;
      boss.bossTelegraphKind = '';
      boss.bossStage = TEST_BOSS_STAGE_ATTACK;
      boss.bossTimer = TEST_BOSS_ATTACK_DURATION;
      break;
    }
    case TEST_BOSS_STAGE_ATTACK: {
      // Ventana de vulnerabilidad explícita (GDD §15.1 punto 4): se abre justo
      // tras resolver el ataque.
      boss.bossVulnerable = true;
      boss.bossStage = TEST_BOSS_STAGE_VULNERABLE;
      boss.bossTimer = TEST_BOSS_VULNERABLE_DURATION;
      break;
    }
    case TEST_BOSS_STAGE_VULNERABLE: {
      boss.bossVulnerable = false;
      boss.bossStage = TEST_BOSS_STAGE_COOLDOWN;
      boss.bossTimer = TEST_BOSS_COOLDOWN_DURATION;
      break;
    }
    case TEST_BOSS_STAGE_COOLDOWN:
    default: {
      // Nuevo ciclo: telegrafía el próximo ataque (mínimo 0.6s exigido por
      // GDD §15.1 punto 2; el jefe de pruebas usa 0.8s, igual que Guardián).
      boss.bossTelegraphUntil = world.time + TEST_BOSS_TELEGRAPH_DURATION;
      boss.bossTelegraphKind = 'test-attack';
      pushEvent(events, 'boss-telegraph', boss.position.x, boss.position.y, 1, boss.bossTelegraphKind);
      boss.bossStage = TEST_BOSS_STAGE_TELEGRAPH;
      boss.bossTimer = TEST_BOSS_TELEGRAPH_DURATION;
      break;
    }
  }
}
