/**
 * Tests del perfil de calidad adaptativo (bug de pantalla negra en móvil,
 * David 2026-07-21, ver cabecera de quality.ts): cubren la lógica PURA de
 * umbrales de `detectQualityProfile` — un objeto `gl` de mentira basta (no
 * hace falta un contexto WebGL real). `window` se stubea vía
 * `vi.stubGlobal` (entorno de test = node, sin DOM, ver `test.environment`
 * en vite.config.ts) porque `detectQualityProfile` sí lo toca (matchMedia +
 * `readQualityOverride`, debug-params.ts) — a diferencia de
 * `debug-params.test.ts`, que evita testear directamente los lectores que
 * tocan `window` y solo prueba las funciones puras que no lo hacen.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectQualityProfile } from './quality';

// Mismos códigos GLenum que lib.dom.d.ts (MAX_FRAGMENT_UNIFORM_VECTORS =
// 0x8DFD, MAX_TEXTURE_IMAGE_UNITS = 0x8872): el objeto `gl` de mentira solo
// necesita exponer esas dos constantes + `getParameter`.
const MAX_FRAGMENT_UNIFORM_VECTORS = 0x8dfd;
const MAX_TEXTURE_IMAGE_UNITS = 0x8872;

function fakeGl(uniforms: number, texUnits: number): WebGLRenderingContext {
  const params: Record<number, number> = {
    [MAX_FRAGMENT_UNIFORM_VECTORS]: uniforms,
    [MAX_TEXTURE_IMAGE_UNITS]: texUnits,
  };
  return {
    MAX_FRAGMENT_UNIFORM_VECTORS,
    MAX_TEXTURE_IMAGE_UNITS,
    getParameter: (pname: number) => params[pname],
  } as unknown as WebGLRenderingContext;
}

/** Stub mínimo de `window` (location.search para `readQualityOverride` + matchMedia para la señal de puntero). */
function stubWindow(coarsePointer: boolean, search = ''): void {
  vi.stubGlobal('window', {
    location: { search },
    matchMedia: (query: string) => ({
      matches: query === '(pointer: coarse)' ? coarsePointer : false,
    }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('detectQualityProfile', () => {
  it("'alto' con capacidades generosas y puntero fino (caso escritorio de hoy)", () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    stubWindow(false);
    expect(detectQualityProfile(fakeGl(1024, 32))).toBe('alto');
  });

  it("'bajo' si MAX_FRAGMENT_UNIFORM_VECTORS < 512, aunque el resto sea generoso", () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    stubWindow(false);
    expect(detectQualityProfile(fakeGl(511, 32))).toBe('bajo');
  });

  it("'alto' justo en el límite (512 NO es < 512)", () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    stubWindow(false);
    expect(detectQualityProfile(fakeGl(512, 32))).toBe('alto');
  });

  it("'bajo' si MAX_TEXTURE_IMAGE_UNITS < 16, aunque el resto sea generoso", () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    stubWindow(false);
    expect(detectQualityProfile(fakeGl(1024, 15))).toBe('bajo');
  });

  it("'alto' justo en el límite (16 NO es < 16)", () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    stubWindow(false);
    expect(detectQualityProfile(fakeGl(1024, 16))).toBe('alto');
  });

  it("'bajo' con pointer:coarse aunque las capacidades sean generosas (repro Chrome Android de David)", () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    stubWindow(true);
    expect(detectQualityProfile(fakeGl(1024, 32))).toBe('bajo');
  });

  it('?quality=bajo fuerza bajo aunque las capacidades sean generosas', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    stubWindow(false, '?quality=bajo');
    expect(detectQualityProfile(fakeGl(1024, 32))).toBe('bajo');
  });

  it('?quality=alto fuerza alto aunque las capacidades sean pobres (verificación del perfil bajo desde escritorio)', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    stubWindow(false, '?quality=alto');
    expect(detectQualityProfile(fakeGl(256, 8))).toBe('alto');
  });

  it('valor de ?quality= desconocido no fuerza nada (cae a la detección real)', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    stubWindow(false, '?quality=turbo');
    expect(detectQualityProfile(fakeGl(1024, 32))).toBe('alto');
    expect(detectQualityProfile(fakeGl(256, 32))).toBe('bajo');
  });
});
