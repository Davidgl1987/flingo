/**
 * Tabla de definición de jefes (GDD §15): un jefe = una entrada aquí, en el
 * mismo espíritu que `sim/upgrades.ts::UPGRADE_POOL` — B1-B4 solo añaden una
 * entrada a `BOSS_DEFS` + sus funciones `stepPattern`/`onPhaseChanged`, sin
 * tocar el framework de `sim/boss.ts`.
 *
 * SIN imports de React ni three.js: es contenido puro, consumido por la sim
 * (sim/boss.ts) y por el render (composición específica por jefe en
 * render/EnemyView.tsx via `bossId`).
 */

import { fireEnemyProjectile } from '../sim/combat';
import { pushEvent, type EventQueue } from '../sim/events';
import type { BossId, Enemy, World } from '../sim/world';

/**
 * Contrato de patrón de un jefe: se llama una vez por tick (mismo dt fijo que
 * el resto de la sim) mientras el jefe está vivo y la sala está en juego.
 * Debe mutar `boss` (posición/velocity/bossTimer/bossStage/bossCounter/
 * bossTelegraphUntil/bossTelegraphKind/bossVulnerable) y puede emitir
 * eventos propios (p.ej. disparos) via `events`. Cero asignaciones: solo
 * escalares y los campos ya existentes del Enemy.
 */
export type BossPatternStep = (world: World, boss: Enemy, dt: number, events: EventQueue) => void;

export interface BossDef {
  id: BossId;
  /** Nombre mostrado en la barra de vida (HUD). */
  name: string;
  /** Vida máxima (GDD §15.6). */
  maxHp: number;
  /**
   * Techo de daño de un único golpe del jefe al héroe, como fracción de su
   * vida MÁXIMA (GDD §15.1 punto 6: 60% en fase 1, puede escalar un poco en
   * fases posteriores, nunca hasta 100%). Índice 0/1/2 = fase 1/2/3.
   */
  hitDamageCapFraction: [number, number, number];
  /**
   * Multiplicador de daño recibido mientras NO está en ventana de
   * vulnerabilidad (GDD §15.1 punto 4). 0 = inmune fuera de ventana; un
   * valor >0 dejaría pasar daño reducido si algún jefe futuro lo necesitara.
   */
  damageOutsideWindow: number;
  /** Avance de un tick del patrón de ataque de este jefe. */
  stepPattern: BossPatternStep;
  /** Se llama una vez al cruzar a fase 2 o 3 (para resetear bossStage/timers propios del patrón). */
  onPhaseChanged?: (world: World, boss: Enemy, phase: 2 | 3) => void;
}

// ── Jefe de pruebas (Fase B0): quieto, un ataque telegrafiado simple en ────
// bucle, ventana tras el ataque. Solo para verificar el framework; NO es un
// jefe de diseño (B1-B4 lo son). Se añade al pool de salas SOLO en dev/tests
// (ver content/rooms.ts::getRoomPool), nunca en una run normal si hay otro
// jefe disponible.

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

function testBossStepPattern(world: World, boss: Enemy, dt: number, events: EventQueue): void {
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

export const BOSS_DEFS: Record<BossId, BossDef> = {
  'test-boss': {
    id: 'test-boss',
    name: 'Jefe de Pruebas',
    maxHp: 12,
    hitDamageCapFraction: [0.6, 0.65, 0.7],
    damageOutsideWindow: 0,
    stepPattern: testBossStepPattern,
  },
};

export function getBossDef(id: BossId): BossDef {
  return BOSS_DEFS[id];
}
