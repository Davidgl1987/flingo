/**
 * Tests de caracterización de `movement.ts` (hoy sin cobertura directa: los
 * tests existentes de Guardián/Reina solo ejercitan estas funciones
 * indirectamente vía sus patrones). Usa un enemigo 'dummy' con radio grande
 * (imitando el tamaño de un jefe) en vez de pasar por el registro de jefes:
 * `moveBossTowardWithAvoidance`/`bossHitsSolid`/`bossRoomBounds` son genéricas
 * sobre cualquier `Enemy`, no leen `bossId`.
 */

import { describe, expect, it } from 'vitest';
import type { EnemySpawn, HazardSpawn, RoomData, RoomTag } from '@/game/world/types';
import { createWorld } from '@/game/world/create';
import { bossHitsSolid, bossRoomBounds, moveBossTowardWithAvoidance } from './movement';

const FIXED_DT = 1 / 60;
/** Radio del enemigo de test: grande, a escala de jefe (vs ENEMY_RADIUS=0.4 normal). */
const BIG_RADIUS = 0.6;

function makeRoom(partial: Partial<RoomData> = {}): RoomData {
  return {
    version: 1,
    id: 'movement-room',
    name: 'Sala de movimiento',
    width: 15,
    height: 15,
    playerStart: { x: 0, y: 6 },
    tags: ['jefe'] as RoomTag[],
    doorSlots: [],
    enemies: [],
    hazards: [],
    items: [],
    ...partial,
  };
}

/** Roca 1.8x1.8 centrada en (cx,cy), mismo tamaño que las interiores de boss-guardian.json. */
function rockAt(id: string, cx: number, cy: number): HazardSpawn {
  return { id, kind: 'rock', position: { x: cx, y: cy }, width: 1.8, height: 1.8 };
}

function makeMovementWorld(opts: { position?: { x: number; y: number }; hazards?: HazardSpawn[] } = {}) {
  const spawn: EnemySpawn = {
    id: 'big-1',
    kind: 'dummy',
    position: opts.position ?? { x: 0, y: 0 },
    radius: BIG_RADIUS,
  };
  return createWorld(makeRoom({ enemies: [spawn], hazards: opts.hazards ?? [] }));
}

function bigEnemy(world: ReturnType<typeof createWorld>) {
  return world.enemies.find((e) => e.id === 'big-1')!;
}

describe('bossRoomBounds', () => {
  it('sin roomId (modo sala única) devuelve world.bounds', () => {
    const world = makeMovementWorld();
    const enemy = bigEnemy(world);
    expect(enemy.roomId).toBeUndefined();
    expect(bossRoomBounds(world, enemy)).toBe(world.bounds);
  });
});

describe('bossHitsSolid', () => {
  it('true fuera de los límites de la sala, false dentro', () => {
    const world = makeMovementWorld();
    const enemy = bigEnemy(world);
    expect(bossHitsSolid(world, enemy, world.bounds.maxX + 1, 0)).toBe(true);
    expect(bossHitsSolid(world, enemy, 0, 0)).toBe(false);
  });

  it('detecta el AABB de una roca: true encima/cerca, false lejos', () => {
    const world = makeMovementWorld({ hazards: [rockAt('rock-a', 3, 0)] });
    const enemy = bigEnemy(world);
    // Encima del centro de la roca: solapa seguro.
    expect(bossHitsSolid(world, enemy, 3, 0)).toBe(true);
    // Justo pegado al borde (roca 1.8x1.8 → medio lado 0.9; radio BIG_RADIUS=0.6):
    // a menos de 0.9+0.6=1.5 del centro en línea recta, solapa.
    expect(bossHitsSolid(world, enemy, 3 - 1.4, 0)).toBe(true);
    // Bien lejos de la roca: no solapa.
    expect(bossHitsSolid(world, enemy, -6, -6)).toBe(false);
  });
});

describe('moveBossTowardWithAvoidance: avanza hacia el objetivo', () => {
  it('en campo abierto (sin obstáculos), reduce la distancia al objetivo cada tick hasta casi tocarlo', () => {
    const world = makeMovementWorld({ position: { x: -5, y: -5 } });
    const enemy = bigEnemy(world);
    const targetX = 5;
    const targetY = 5;
    const distStart = Math.hypot(targetX - enemy.position.x, targetY - enemy.position.y);

    for (let i = 0; i < 600; i++) {
      moveBossTowardWithAvoidance(world, enemy, targetX, targetY, FIXED_DT, 2);
      world.time += FIXED_DT;
    }

    const distEnd = Math.hypot(targetX - enemy.position.x, targetY - enemy.position.y);
    expect(distEnd).toBeLessThan(distStart);
    expect(distEnd).toBeLessThan(0.2); // llega a tocar el objetivo (umbral de parada 0.15)
  });

  it('se detiene (velocity 0) al llegar al objetivo, sin overshoot', () => {
    const world = makeMovementWorld({ position: { x: 0, y: 0 } });
    const enemy = bigEnemy(world);
    // Objetivo ya dentro del umbral de parada (0.15): no debe moverse.
    moveBossTowardWithAvoidance(world, enemy, 0.05, 0, FIXED_DT, 2);
    expect(enemy.velocity.x).toBe(0);
    expect(enemy.velocity.y).toBe(0);
    expect(enemy.position.x).toBe(0);
    expect(enemy.position.y).toBe(0);
  });
});

// Geometría diagonal (no puramente horizontal/vertical): un obstáculo cuya
// cara golpeada de frente y en perfecta simetría con el eje de avance hace
// degenerar la tangente a un único eje (caso límite conocido, no es lo que
// se quiere caracterizar aquí). En diagonal, igual que en el fix real de
// B1.6.1 (Guardián rodeando `rock-sw`), la normal y la tangente resultante
// SIEMPRE tienen componente en ambos ejes.
const DIAGONAL_ROCK = rockAt('rock-diagonal', -3, -3);

describe('moveBossTowardWithAvoidance: no atraviesa obstáculos/columnas', () => {
  it('con una roca en la diagonal hacia el objetivo, su círculo nunca solapa el AABB de la roca y aun así progresa', () => {
    const world = makeMovementWorld({ position: { x: 0, y: 0 }, hazards: [DIAGONAL_ROCK] });
    const enemy = bigEnemy(world);
    const halfW = DIAGONAL_ROCK.width! / 2;
    const halfH = DIAGONAL_ROCK.height! / 2;
    const distStart = Math.hypot(enemy.position.x - -6, enemy.position.y - -6);

    let everOverlapping = false;
    for (let i = 0; i < 600; i++) {
      moveBossTowardWithAvoidance(world, enemy, -6, -6, FIXED_DT, 1.5);
      world.time += FIXED_DT;
      const nearestX = Math.max(DIAGONAL_ROCK.position.x - halfW, Math.min(enemy.position.x, DIAGONAL_ROCK.position.x + halfW));
      const nearestY = Math.max(DIAGONAL_ROCK.position.y - halfH, Math.min(enemy.position.y, DIAGONAL_ROCK.position.y + halfH));
      const dx = enemy.position.x - nearestX;
      const dy = enemy.position.y - nearestY;
      if (dx * dx + dy * dy < BIG_RADIUS * BIG_RADIUS - 1e-6) everOverlapping = true;
    }

    expect(everOverlapping).toBe(false);
    // Rodea la roca y sigue progresando hacia el objetivo (no se queda atascado).
    const distEnd = Math.hypot(enemy.position.x - -6, enemy.position.y - -6);
    expect(distEnd).toBeLessThan(distStart);
    expect(distEnd).toBeLessThan(5);
  });
});

describe('moveBossTowardWithAvoidance: desliza en diagonal ante bloqueo', () => {
  it('bloqueado en línea recta hacia el objetivo, se desvía por la tangente (avance con componente en AMBOS ejes) en vez de quedarse quieto', () => {
    // Enemigo cerca de la esquina de la roca, con el objetivo justo detrás de
    // ella en diagonal: un único paso grande (dt=1) hace que el tramo recto
    // aterrice dentro de la roca, disparando la circunnavegación tangencial
    // en esta misma llamada.
    const world = makeMovementWorld({ position: { x: -1.5, y: -1.5 }, hazards: [DIAGONAL_ROCK] });
    const enemy = bigEnemy(world);
    const startX = enemy.position.x;
    const startY = enemy.position.y;
    // Confirma la premisa: el tramo recto directo SÍ está bloqueado.
    expect(bossHitsSolid(world, enemy, -2.5, -2.5)).toBe(true);

    moveBossTowardWithAvoidance(world, enemy, -6, -6, 1, 1);

    // No se ha quedado inmóvil, y el desvío tiene componente en AMBOS ejes
    // (deslizamiento tangencial diagonal, no un axis-slide de un solo eje).
    expect(Math.abs(enemy.position.x - startX)).toBeGreaterThan(0.01);
    expect(Math.abs(enemy.position.y - startY)).toBeGreaterThan(0.01);
    // Y el destino elegido no penetra la roca.
    expect(bossHitsSolid(world, enemy, enemy.position.x, enemy.position.y)).toBe(false);
  });
});
