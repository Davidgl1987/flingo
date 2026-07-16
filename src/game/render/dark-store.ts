/**
 * Store zustand del experimento de penumbra (rama `estilo-oscuro`): estado
 * RUNTIME de `dark` (0/1/2) y de los 4 grupos de `?glow=` (fosos/hazards/
 * items/puertas), editable en caliente desde el menú de pausa (PauseModal)
 * sin recargar la página.
 *
 * Los parámetros de URL (`?dark=`, `?glow=`, ver debug-params.ts) siguen
 * siendo el valor INICIAL — mismo default de siempre (dark=1, todos los
 * grupos activos) — pero a partir de ahí este store manda: `assets.ts` se
 * suscribe fuera de React para reaplicar `applyDarkMaterials` en cada cambio,
 * y los componentes de render leen selectores de aquí en vez de constantes
 * fijas de carga de módulo.
 */

import { create } from 'zustand';
import { readDarkMode, readGlowGroups, type GlowGroup } from './debug-params';

export interface DarkGlowState {
  fosos: boolean;
  hazards: boolean;
  items: boolean;
  puertas: boolean;
}

interface DarkStoreState {
  dark: 0 | 1 | 2;
  glow: DarkGlowState;
  setDark: (n: 0 | 1 | 2) => void;
  setGlow: (grupo: GlowGroup, on: boolean) => void;
}

function initialGlow(): DarkGlowState {
  const groups = readGlowGroups();
  return {
    fosos: groups.has('fosos'),
    hazards: groups.has('hazards'),
    items: groups.has('items'),
    puertas: groups.has('puertas'),
  };
}

export const useDarkStore = create<DarkStoreState>((set) => ({
  dark: readDarkMode(),
  glow: initialGlow(),
  setDark: (n) => set({ dark: n }),
  setGlow: (grupo, on) => set((s) => ({ glow: { ...s.glow, [grupo]: on } })),
}));
