/**
 * Tests headless del estado de effects (fase 4): el trauma decae, el hit-stop
 * escala el dt de la sim y se recupera solo. Sin three.js ni React.
 */

import { describe, expect, it } from 'vitest';
import {
  addTrauma,
  consumeHitStop,
  createEffectsState,
  decayTrauma,
  HIT_STOP_TIME_SCALE,
  triggerHitStop,
} from './effectsState';

describe('trauma', () => {
  it('addTrauma acumula y clampa a [0,1]', () => {
    const state = createEffectsState();
    addTrauma(state, 0.3);
    expect(state.trauma).toBeCloseTo(0.3);
    addTrauma(state, 0.9);
    expect(state.trauma).toBe(1);
    addTrauma(state, -5);
    expect(state.trauma).toBe(0);
  });

  it('decae exponencialmente con el tiempo y llega exactamente a 0', () => {
    const state = createEffectsState();
    addTrauma(state, 1);
    decayTrauma(state, 0.25);
    const after250ms = state.trauma;
    expect(after250ms).toBeLessThan(1);
    expect(after250ms).toBeGreaterThan(0);
    // Sigue decayendo de forma monótona.
    decayTrauma(state, 0.25);
    expect(state.trauma).toBeLessThan(after250ms);
    // Tras suficiente tiempo se apaga del todo (clamp a 0, no cola infinita).
    decayTrauma(state, 10);
    expect(state.trauma).toBe(0);
  });
});

describe('hit-stop', () => {
  it('sin hit-stop activo el factor es 1 (la sim corre a tiempo real)', () => {
    const state = createEffectsState();
    expect(consumeHitStop(state, 1 / 60)).toBe(1);
  });

  it('mientras dura devuelve la escala reducida y luego se recupera', () => {
    const state = createEffectsState();
    triggerHitStop(state, 0.08); // 80 ms
    // ~5 frames a 60 fps dentro de la ventana: escala reducida.
    let scaled = 0;
    for (let i = 0; i < 5; i++) {
      if (consumeHitStop(state, 1 / 60) === HIT_STOP_TIME_SCALE) scaled++;
    }
    expect(scaled).toBe(5);
    // Pasada la ventana: recuperado, factor 1 y contador a 0 exacto.
    expect(consumeHitStop(state, 1 / 60)).toBe(1);
    expect(state.hitStopRemaining).toBe(0);
  });

  it('no se acorta si ya hay un hit-stop más largo en curso', () => {
    const state = createEffectsState();
    triggerHitStop(state, 0.1);
    triggerHitStop(state, 0.02);
    expect(state.hitStopRemaining).toBeCloseTo(0.1);
  });

  it('la escala reduce de verdad el avance de la sim (dt escalado)', () => {
    const state = createEffectsState();
    triggerHitStop(state, 0.06);
    const dt = 1 / 60;
    let simTime = 0;
    // 12 frames reales = 200 ms de reloj; los ~4 primeros van escalados.
    for (let i = 0; i < 12; i++) {
      simTime += dt * consumeHitStop(state, dt);
    }
    expect(simTime).toBeLessThan(12 * dt);
    expect(simTime).toBeGreaterThan(6 * dt); // no congela: solo ralentiza ~60-100 ms
  });
});
