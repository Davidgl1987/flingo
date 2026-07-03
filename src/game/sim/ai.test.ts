/**
 * Tests de IA por arquetipo (GDD §7): Dummy con correa, Chaser que acelera
 * al apuntar, Trail con cadencia de charcos, ciclo del Shooter, y evitación
 * de hazards en la navegación.
 */

import { describe, expect, it } from 'vitest';
import {
  CHASER_SPEED,
  CHASER_SPEED_WHILE_AIMING,
  DUMMY_CHASE_SPEED,
  DUMMY_LEASH_RANGE,
  SHOOTER_PROJECTILE_SPEED,
  TRAIL_DROP_INTERVAL,
  TRAIL_PUDDLE_LIFETIME,
  TRAIL_PUDDLE_RADIUS,
} from '../content/constants';
import { stepEnemyAi } from './ai';
import { createEventQueue, drainEvents } from './events';
import { stepWorld } from './step';
import { createWorld, type EnemySpawn, type HazardSpawn, type RoomData, type World } from './world';

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

describe('Trail (GDD §7.4)', () => {
  it('suelta charcos con cadencia de 0.55 s, radio 0.45 y vida 3.2 s', () => {
    const world = makeWorld([
      { id: 't1', kind: 'trail', position: { x: 0, y: 0 }, patrolTarget: { x: 5, y: 0 } },
    ]);
    world.hero.position.x = 12; // lejos: solo patrulla

    // 1.2 s de sim: suelta en t≈0, t≈0.55 y t≈1.1 → 3 charcos.
    runAi(world, 72);

    const active = world.puddles.filter((p) => p.active);
    expect(active.length).toBe(Math.floor(1.2 / TRAIL_DROP_INTERVAL) + 1);
    for (const puddle of active) {
      expect(puddle.radius).toBeCloseTo(TRAIL_PUDDLE_RADIUS, 9);
      expect(puddle.ttl).toBeLessThanOrEqual(TRAIL_PUDDLE_LIFETIME);
      expect(puddle.ttl).toBeGreaterThan(0);
    }
  });
});

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

describe('navegación: evitación de hazards', () => {
  it('un Chaser rodea un foso interpuesto sin caer en él', () => {
    // Foso entre el chaser y el héroe.
    const pit: HazardSpawn = {
      id: 'pit-1',
      kind: 'pit',
      position: { x: 0, y: 4 },
      width: 2.5,
      height: 2.5,
    };
    const world = makeWorld([{ id: 'c1', kind: 'chaser', position: { x: 0, y: 8 } }], [pit]);
    world.hero.position.x = 0;
    world.hero.position.y = 0;

    const box = {
      minX: pit.position.x - pit.width / 2,
      maxX: pit.position.x + pit.width / 2,
      minY: pit.position.y - pit.height / 2,
      maxY: pit.position.y + pit.height / 2,
    };
    // 6 s de persecución: en ningún tick el centro del chaser entra en el foso.
    for (let i = 0; i < 360; i++) {
      stepEnemyAi(world, FIXED_DT);
      world.time += FIXED_DT;
      const c = world.enemies[0];
      const inside =
        c.position.x >= box.minX &&
        c.position.x <= box.maxX &&
        c.position.y >= box.minY &&
        c.position.y <= box.maxY;
      expect(inside).toBe(false);
    }
    // Y aún así progresa hacia el héroe (rodeó el foso).
    const c = world.enemies[0];
    expect(Math.hypot(c.position.x - 0, c.position.y - 0)).toBeLessThan(4);
  });
});

describe('evitación de barriles (regresión: chaser inmolándose)', () => {
  it('un chaser con barriles entre él y el héroe los rodea sin detonarlos', () => {
    // Reproduce la sala de pruebas: héroe arriba, chaser abajo, dos barriles
    // en la ruta directa. Sin este guard, el chaser detonaba un barril al
    // pasar y moría solo en <2 s (visto en preview, 2026-07-03).
    const world = makeWorld([
      { id: 'c1', kind: 'chaser', position: { x: 2.5, y: -4.5 } },
    ], [
      { id: 'b1', kind: 'barrel', position: { x: 2, y: -2 }, width: 0.8, height: 0.8 },
      { id: 'b2', kind: 'barrel', position: { x: 3.2, y: -2.4 }, width: 0.8, height: 0.8 },
    ]);
    world.hero.position.x = 0;
    world.hero.position.y = 6;
    const events = createEventQueue(64);
    for (let i = 0; i < 300; i++) {
      stepWorld(world, events);
      drainEvents(events, () => undefined);
    }
    const chaser = world.enemies[0];
    expect(chaser.hp).toBe(chaser.maxHp);
    expect(world.barrels.every((b) => !b.exploded)).toBe(true);
    // Y progresó hacia el héroe (no se quedó atascado tras los barriles).
    expect(Math.hypot(chaser.position.x - 0, chaser.position.y - 6)).toBeLessThan(3);
  });
});
