/**
 * Store zustand SOLO para estado de UI de baja frecuencia (HP, monedero,
 * avisos, fase de juego, llave). Prohibido usarlo para nada que cambie cada
 * frame (cooldowns/barras de recarga se leen directamente de la sim vía rAF,
 * nunca vía este store). Las mejoras acumuladas (nivel por `UpgradeId`) no
 * viven aquí: se leen directamente de `session.world.hero.upgradeLevels`
 * donde hacen falta (ej. PauseModal), sin duplicar estado.
 *
 * Se sincroniza desde fuera (GameRoot/HUD) al drenar la cola de eventos y al
 * observar cambios de `world.phase`; nunca desde dentro del hot loop de sim.
 */

import { create } from 'zustand';
import { HERO_START_HP } from '@/game/features/hero/constants';
import type { GamePhase } from '@/game/world/types';

interface UiState {
  hp: number;
  maxHp: number;
  /** Monedero gastable (docs/plans/ECONOMY_PLAN.md), no el total histórico recogido. */
  coins: number;
  hasKey: boolean;
  phase: GamePhase;
  roomsCleared: number;
  score: number;
  /** Sala actual (1-indexada) / total de la run (GDD §12), null en modo sala única. */
  roomIndex: number | null;
  totalRooms: number | null;
  currentRoomName: string;
  /** Aviso transitorio (ej. "tiro demasiado flojo"). */
  notice: string | null;
  /** Cambia con cada aviso para retrigger aunque el texto se repita. */
  noticeSeq: number;
  showNotice: (text: string) => void;
  clearNotice: () => void;
  syncFromWorld: (snapshot: {
    hp: number;
    maxHp: number;
    coins: number;
    hasKey: boolean;
    phase: GamePhase;
    roomsCleared: number;
    score: number;
    roomIndex: number | null;
    totalRooms: number | null;
    currentRoomName: string;
  }) => void;
  resetRun: () => void;
}

const initialState = {
  hp: HERO_START_HP,
  maxHp: HERO_START_HP,
  coins: 0,
  hasKey: false,
  phase: 'playing' as GamePhase,
  roomsCleared: 0,
  score: 0,
  roomIndex: null as number | null,
  totalRooms: null as number | null,
  currentRoomName: '',
  notice: null as string | null,
  noticeSeq: 0,
};

export const useUiStore = create<UiState>((set) => ({
  ...initialState,
  showNotice: (text) => set((s) => ({ notice: text, noticeSeq: s.noticeSeq + 1 })),
  clearNotice: () => set({ notice: null }),
  syncFromWorld: (snapshot) => set(snapshot),
  resetRun: () => set({ ...initialState }),
}));
