/**
 * Store zustand SOLO para estado de UI de baja frecuencia (HP, monedas,
 * avisos, fase de juego). Prohibido usarlo para nada que cambie cada frame.
 */

import { create } from 'zustand';
import { HERO_START_HP } from './content/constants';

interface UiState {
  hp: number;
  maxHp: number;
  coins: number;
  /** Aviso transitorio (ej. "tiro demasiado flojo"). */
  notice: string | null;
  /** Cambia con cada aviso para retrigger aunque el texto se repita. */
  noticeSeq: number;
  showNotice: (text: string) => void;
  clearNotice: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  hp: HERO_START_HP,
  maxHp: HERO_START_HP,
  coins: 0,
  notice: null,
  noticeSeq: 0,
  showNotice: (text) => set((s) => ({ notice: text, noticeSeq: s.noticeSeq + 1 })),
  clearNotice: () => set({ notice: null }),
}));
