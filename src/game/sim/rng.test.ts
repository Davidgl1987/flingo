/**
 * Tests del RNG con semilla.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng (mulberry32)', () => {
  it('es determinista: misma semilla, misma secuencia', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('semillas distintas producen secuencias distintas', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('devuelve valores uniformes en [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
