/**
 * Store zustand SOLO para estado de UI de baja frecuencia (HP, monedas,
 * avisos, fase de juego, llave, mejoras). Prohibido usarlo para nada que
 * cambie cada frame (cooldowns/barras de recarga se leen directamente de la
 * sim vía rAF, nunca vía este store).
 *
 * Se sincroniza desde fuera (GameRoot/HUD) al drenar la cola de eventos y al
 * observar cambios de `world.phase`; nunca desde dentro del hot loop de sim.
 */

import { create } from 'zustand';
import { HERO_START_HP } from '@/game/content/constants';
import type { GamePhase } from '@/game/sim/world';
import type { UpgradeId } from '@/game/sim/upgrades';

interface UiState {
  hp: number;
  maxHp: number;
  coins: number;
  hasKey: boolean;
  phase: GamePhase;
  roomsCleared: number;
  score: number;
  /** Sala actual (1-indexada) / total de la run (GDD §12), null en modo sala única. */
  roomIndex: number | null;
  totalRooms: number | null;
  currentRoomName: string;
  /** Mejoras aplicadas hasta ahora en la run (para el resumen de pausa/fin). */
  acquiredUpgrades: UpgradeId[];
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
  addUpgrade: (id: UpgradeId) => void;
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
  acquiredUpgrades: [] as UpgradeId[],
  notice: null as string | null,
  noticeSeq: 0,
};

export const useUiStore = create<UiState>((set) => ({
  ...initialState,
  showNotice: (text) => set((s) => ({ notice: text, noticeSeq: s.noticeSeq + 1 })),
  clearNotice: () => set({ notice: null }),
  syncFromWorld: (snapshot) => set(snapshot),
  addUpgrade: (id) => set((s) => ({ acquiredUpgrades: [...s.acquiredUpgrades, id] })),
  resetRun: () => set({ ...initialState }),
}));
