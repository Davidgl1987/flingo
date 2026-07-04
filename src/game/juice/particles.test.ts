/**
 * Tests headless del pool de partículas (fase 4): preasignado, nunca crece,
 * recicla slots al saturarse y expira partículas por vida. Sin three.js.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../sim/rng';
import { ParticlePool, PARTICLE_POOL_SIZE } from './particles';
import { reactToEvent } from './reactToEvent';
import { createJuiceState } from './juiceState';
import { ShockwavePool } from './shockwave';
import type { GameEvent } from '../sim/events';

describe('ParticlePool', () => {
  it('el pool no crece: los arrays mantienen su capacidad aunque se sature', () => {
    const pool = new ParticlePool(16);
    const rng = createRng(7);
    for (let i = 0; i < 10; i++) {
      pool.burst(0, 0, 8, 3, 0.1, 0.5, 1, 1, 1, rng); // 80 spawns sobre 16 slots
    }
    expect(pool.capacity).toBe(16);
    expect(pool.x.length).toBe(16);
    expect(pool.active.length).toBe(16);
    expect(pool.aliveCount).toBeLessThanOrEqual(16);
  });

  it('update expira partículas al agotar su vida y libera slots', () => {
    const pool = new ParticlePool(8);
    const rng = createRng(7);
    pool.burst(0, 0, 8, 2, 0.1, 0.3, 1, 0, 0, rng); // vida 0.3 s
    expect(pool.aliveCount).toBe(8);
    pool.update(0.1);
    expect(pool.aliveCount).toBe(8); // aún vivas
    pool.update(0.25); // total 0.35 > 0.3
    expect(pool.aliveCount).toBe(0);
  });

  it('las partículas se mueven y caen (integración simple)', () => {
    const pool = new ParticlePool(4);
    pool.spawn(1, 2, 0, 3, 1, 0.1, 1, 1, 1, 1);
    const x0 = pool.x[0];
    pool.update(0.1);
    expect(pool.x[0]).toBeGreaterThan(x0); // avanza en su dirección
    expect(pool.y[0]).toBeGreaterThanOrEqual(0); // nunca bajo el suelo
  });

  it('el tamaño por defecto es el del presupuesto (~256)', () => {
    const pool = new ParticlePool();
    expect(pool.capacity).toBe(PARTICLE_POOL_SIZE);
    expect(PARTICLE_POOL_SIZE).toBe(256);
  });
});

describe('reactToEvent → pools', () => {
  function makeEvent(type: GameEvent['type'], intensity = 1, label = ''): GameEvent {
    return { type, x: 3, y: 4, intensity, label };
  }

  it('un evento con burst activa partículas; uno silencioso no', () => {
    const pool = new ParticlePool(64);
    const juice = createJuiceState();
    const rng = createRng(1);
    reactToEvent(makeEvent('enemy-died'), pool, juice, null, rng);
    expect(pool.aliveCount).toBeGreaterThan(0);

    const silent = new ParticlePool(64);
    reactToEvent(makeEvent('room-entered'), silent, juice, null, rng);
    expect(silent.aliveCount).toBe(0);
  });

  it('la explosión de barril dispara hit-stop, trauma máximo y onda expansiva', () => {
    const pool = new ParticlePool(64);
    const juice = createJuiceState();
    const shockwaves = new ShockwavePool();
    reactToEvent(makeEvent('barrel-explosion', 2.0), pool, juice, shockwaves, createRng(1));
    expect(juice.trauma).toBe(1);
    expect(juice.hitStopRemaining).toBeGreaterThan(0);
    expect(shockwaves.active[0]).toBe(1);
    expect(shockwaves.maxRadius[0]).toBeCloseTo(2.0);
  });

  it('embestida floja (daño 1) NO dispara hit-stop; fuerte (daño ≥2) sí', () => {
    const pool = new ParticlePool(64);
    const weak = createJuiceState();
    reactToEvent(makeEvent('enemy-hit', 1), pool, weak, null, createRng(1));
    expect(weak.hitStopRemaining).toBe(0);

    const strong = createJuiceState();
    reactToEvent(makeEvent('enemy-hit', 2), pool, strong, null, createRng(1));
    expect(strong.hitStopRemaining).toBeGreaterThan(0);
  });
});
