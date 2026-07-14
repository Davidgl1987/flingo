/**
 * Tests headless de las primitivas geométricas (sin React ni three.js).
 */

import { describe, expect, it } from 'vitest';
import { dampAngleTowards } from './geometry';

describe('dampAngleTowards', () => {
  it('gira por el arco más corto al cruzar ±PI (no da la vuelta larga)', () => {
    // De 3.0 a -3.0: la diferencia "directa" es -6.0, pero el arco más corto
    // cruzando el wrap-around es solo ≈0.28 rad (2π - 6.0).
    const current = 3.0;
    const target = -3.0;
    const lambda = 12;
    const dt = 1 / 60;
    const next = dampAngleTowards(current, target, lambda, dt);
    const shortArcDelta = Math.PI * 2 - 6.0; // ≈0.283
    const factor = 1 - Math.exp(-lambda * dt);
    const expectedNext = current + shortArcDelta * factor;
    expect(next).toBeCloseTo(expectedNext, 10);
    // El paso dado en un solo frame debe ser pequeño (arco corto), nunca
    // cercano a 2π ni a la magnitud del delta "directo" (6.0).
    expect(Math.abs(next - current)).toBeLessThan(0.5);
  });

  it('converge monótonamente hacia el objetivo sin oscilar', () => {
    let current = 0;
    const target = 1.2;
    const lambda = 12;
    const dt = 1 / 60;
    let prevDistance = Math.abs(target - current);
    for (let i = 0; i < 30; i++) {
      current = dampAngleTowards(current, target, lambda, dt);
      const distance = Math.abs(target - current);
      expect(distance).toBeLessThanOrEqual(prevDistance);
      prevDistance = distance;
    }
    expect(current).toBeCloseTo(target, 2);
  });

  it('un dt grande no sobrepasa el objetivo (factor clampado a 1)', () => {
    const current = 0;
    const target = 0.5;
    const lambda = 12;
    const dt = 10; // frame gigante (tab en segundo plano, etc.)
    const next = dampAngleTowards(current, target, lambda, dt);
    expect(next).toBeCloseTo(target, 10);
  });

  it('si ya está en el objetivo, se mantiene estable', () => {
    const next = dampAngleTowards(1.5, 1.5, 12, 1 / 60);
    expect(next).toBeCloseTo(1.5, 10);
  });
});
