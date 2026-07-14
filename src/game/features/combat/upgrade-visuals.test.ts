import { describe, expect, it } from 'vitest';
import { arrowWidthScaleForLevel } from './upgrade-visuals';

describe('arrowWidthScaleForLevel', () => {
  it('es neutro (1) a nivel 0', () => {
    expect(arrowWidthScaleForLevel(0)).toBe(1);
  });

  it('sube +25% por nivel', () => {
    expect(arrowWidthScaleForLevel(1)).toBeCloseTo(1.25);
    expect(arrowWidthScaleForLevel(2)).toBeCloseTo(1.5);
    expect(arrowWidthScaleForLevel(3)).toBeCloseTo(1.75);
  });

  it('no baja de 1 con niveles negativos', () => {
    expect(arrowWidthScaleForLevel(-3)).toBe(1);
  });
});
