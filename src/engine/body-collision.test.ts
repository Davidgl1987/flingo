/**
 * Tests de colisión cuerpo-a-cuerpo (fase 4, feedback de playtest: "los
 * enemigos te traspasan"): círculo-círculo con separación posicional +
 * impulso, integrada en stepWorld tras el gameplay de contacto. La embestida
 * (daño/knockback por velocidad) debe seguir funcionando exactamente igual.
 */

import { describe, expect, it } from 'vitest';
import { createEventQueue } from './events';
import { collideCircleCircle, stepBodySeparation } from './physics';
import { stepWorld } from '@/game/world/step';
import { createWorld } from '@/game/world/create';
import type { EnemySpawn, RoomData, World } from '@/game/world/types';

function makeRoom(partial: Partial<RoomData> = {}): RoomData {
  return {
    version: 1,
    id: 'body-room',
    name: 'Body',
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

function makeWorld(enemies: EnemySpawn[] = []): World {
  return createWorld(makeRoom({ enemies }));
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('collideCircleCircle (primitiva)', () => {
  it('sin solape: no toca nada y devuelve false', () => {
    const posA = { x: 0, y: 0 };
    const velA = { x: 1, y: 0 };
    const posB = { x: 2, y: 0 };
    const velB = { x: 0, y: 0 };
    expect(collideCircleCircle(posA, velA, 0.4, 1, posB, velB, 0.4, 1)).toBe(false);
    expect(posA).toEqual({ x: 0, y: 0 });
    expect(velA).toEqual({ x: 1, y: 0 });
  });

  it('con solape: separa hasta la suma de radios y devuelve true', () => {
    const posA = { x: 0, y: 0 };
    const velA = { x: 0, y: 0 };
    const posB = { x: 0.5, y: 0 };
    const velB = { x: 0, y: 0 };
    expect(collideCircleCircle(posA, velA, 0.4, 1, posB, velB, 0.4, 1)).toBe(true);
    expect(dist(posA, posB)).toBeCloseTo(0.8, 5);
  });

  it('la separación se reparte según masa inversa (el pesado se mueve menos)', () => {
    const posA = { x: 0, y: 0 }; // héroe pesado: invMass 0.5
    const velA = { x: 0, y: 0 };
    const posB = { x: 0.4, y: 0 }; // enemigo: invMass 1
    const velB = { x: 0, y: 0 };
    collideCircleCircle(posA, velA, 0.4, 0.5, posB, velB, 0.4, 1);
    // Solape 0.4: A retrocede 0.4·(0.5/1.5)≈0.133, B avanza 0.4·(1/1.5)≈0.267.
    expect(posA.x).toBeCloseTo(-0.1333, 3);
    expect(posB.x).toBeCloseTo(0.6667, 3);
  });

  it('aplica impulso solo si se acercan (los que se alejan no rebotan de más)', () => {
    // Acercándose: velocidades cambian.
    const posA = { x: 0, y: 0 };
    const velA = { x: 2, y: 0 };
    const posB = { x: 0.5, y: 0 };
    const velB = { x: 0, y: 0 };
    collideCircleCircle(posA, velA, 0.4, 1, posB, velB, 0.4, 1);
    expect(velA.x).toBeLessThan(2);
    expect(velB.x).toBeGreaterThan(0);

    // Alejándose (mismo solape): velocidades intactas.
    const posC = { x: 0, y: 0 };
    const velC = { x: -3, y: 0 };
    const posD = { x: 0.5, y: 0 };
    const velD = { x: 3, y: 0 };
    collideCircleCircle(posC, velC, 0.4, 1, posD, velD, 0.4, 1);
    expect(velC.x).toBe(-3);
    expect(velD.x).toBe(3);
  });
});

describe('stepBodySeparation (mundo)', () => {
  it('héroe y enemigo solapados quedan separados (no se atraviesan)', () => {
    const world = makeWorld([{ id: 'd1', kind: 'dummy', position: { x: 0.3, y: 0 } }]);
    // Héroe parado encima del enemigo (solape claro).
    world.hero.position.x = 0;
    world.hero.position.y = 0;
    stepBodySeparation(world);
    const enemy = world.enemies[0];
    expect(dist(world.hero.position, enemy.position)).toBeGreaterThanOrEqual(
      world.hero.radius + enemy.radius - 1e-6,
    );
  });

  it('ignora enemigos muertos', () => {
    const world = makeWorld([{ id: 'd1', kind: 'dummy', position: { x: 0.1, y: 0 } }]);
    world.enemies[0].hp = 0;
    world.hero.position.x = 0;
    stepBodySeparation(world);
    expect(world.hero.position.x).toBe(0); // el cadáver no empuja
  });

  it('dos enemigos apilados se separan entre sí', () => {
    const world = makeWorld([
      { id: 'a', kind: 'dummy', position: { x: 5, y: 5 } },
      { id: 'b', kind: 'dummy', position: { x: 5.2, y: 5 } },
    ]);
    // Aleja al héroe para aislar el caso enemigo↔enemigo.
    world.hero.position.x = -10;
    world.hero.position.y = -10;
    stepBodySeparation(world);
    const [a, b] = world.enemies;
    expect(dist(a.position, b.position)).toBeGreaterThanOrEqual(a.radius + b.radius - 1e-6);
  });

  it('a baja velocidad el héroe NO atraviesa a un enemigo (tras varios ticks de stepWorld)', () => {
    const world = makeWorld([{ id: 'd1', kind: 'dummy', position: { x: 1, y: 0 } }]);
    const events = createEventQueue();
    // Empuje suave hacia el enemigo, por debajo del umbral de embestida (2.5).
    world.hero.velocity.x = 2.0;
    for (let i = 0; i < 90; i++) {
      stepWorld(world, events);
    }
    const enemy = world.enemies[0];
    // El enemigo sigue vivo (sin embestida) y no hay solape.
    expect(enemy.hp).toBeGreaterThan(0);
    expect(dist(world.hero.position, enemy.position)).toBeGreaterThanOrEqual(
      world.hero.radius + enemy.radius - 1e-6,
    );
  });

  it('la embestida sigue funcionando: a alta velocidad el enemigo recibe daño y knockback', () => {
    const world = makeWorld([{ id: 'd1', kind: 'dummy', position: { x: 1, y: 0 } }]);
    const events = createEventQueue();
    const hpBefore = world.enemies[0].hp;
    world.hero.velocity.x = 7;
    for (let i = 0; i < 30; i++) {
      stepWorld(world, events);
    }
    const enemy = world.enemies[0];
    expect(enemy.hp).toBeLessThan(hpBefore);
    // Y tras el impacto tampoco hay solape (la separación se aplicó).
    if (enemy.hp > 0) {
      expect(dist(world.hero.position, enemy.position)).toBeGreaterThanOrEqual(
        world.hero.radius + enemy.radius - 1e-6,
      );
    }
  });
});
