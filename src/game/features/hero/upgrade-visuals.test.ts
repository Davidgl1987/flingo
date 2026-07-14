import { describe, expect, it } from 'vitest';
import {
  boulderScaleFactor,
  cometStretchFactor,
  shieldBubbleOpacity,
  spikeCountForLevel,
} from './upgrade-visuals';

describe('spikeCountForLevel', () => {
  it('no muestra pinchos sin nivel', () => {
    expect(spikeCountForLevel(0)).toBe(0);
    expect(spikeCountForLevel(-1)).toBe(0);
  });

  it('sube en anillos de 4 por nivel hasta el máximo (3)', () => {
    expect(spikeCountForLevel(1)).toBe(4);
    expect(spikeCountForLevel(2)).toBe(8);
    expect(spikeCountForLevel(3)).toBe(12);
  });

  it('clampa por encima del nivel máximo', () => {
    expect(spikeCountForLevel(4)).toBe(12);
    expect(spikeCountForLevel(100)).toBe(12);
  });
});

describe('cometStretchFactor', () => {
  it('es neutro (1) a nivel 0', () => {
    expect(cometStretchFactor(0)).toBe(1);
  });

  it('sube +15% por nivel', () => {
    expect(cometStretchFactor(1)).toBeCloseTo(1.15);
    expect(cometStretchFactor(2)).toBeCloseTo(1.3);
    expect(cometStretchFactor(3)).toBeCloseTo(1.45);
  });

  it('no baja de 1 con niveles negativos', () => {
    expect(cometStretchFactor(-5)).toBe(1);
  });
});

describe('boulderScaleFactor', () => {
  it('es neutro (1) a nivel 0', () => {
    expect(boulderScaleFactor(0)).toBe(1);
  });

  it('sube +6% por nivel', () => {
    expect(boulderScaleFactor(1)).toBeCloseTo(1.06);
    expect(boulderScaleFactor(2)).toBeCloseTo(1.12);
    expect(boulderScaleFactor(3)).toBeCloseTo(1.18);
  });
});

describe('shieldBubbleOpacity', () => {
  it('es invisible sin cargas', () => {
    expect(shieldBubbleOpacity(0)).toBe(0);
    expect(shieldBubbleOpacity(-1)).toBe(0);
  });

  it('sube con más cargas, con tope en 0.35', () => {
    const one = shieldBubbleOpacity(1);
    const two = shieldBubbleOpacity(2);
    expect(one).toBeGreaterThan(0);
    expect(two).toBeGreaterThan(one);
    expect(shieldBubbleOpacity(50)).toBe(0.35);
  });
});
