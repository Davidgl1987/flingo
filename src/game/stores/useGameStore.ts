import { create } from 'zustand';
import { createInitialGameState, loadRoomDefinition } from '../core/roomSystem';
import { applyUpgrade } from '../core/upgrades';
import type { GameState, RoomDefinition, UpgradeId, Vec2, WeaponMode } from '../core/types';
import { cancelAim, releaseAim, setWeaponMode, startAim, tickGame, updateAim } from '../core/simulation';

export type GameActions = {
  resetRun: () => void;
  tick: (dt: number) => void;
  startAimAt: (point: Vec2) => void;
  updateAimAt: (point: Vec2) => void;
  releaseAim: () => void;
  cancelAim: () => void;
  setWeapon: (mode: WeaponMode) => void;
  setPaused: (paused: boolean) => void;
  loadEditorRoomScenario: (room: RoomDefinition) => void;
  chooseUpgrade: (id: UpgradeId) => void;
};

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...createInitialGameState(),

  resetRun: () => set(createInitialGameState()),
  tick: (dt) => set((state) => tickGame(state, dt)),
  startAimAt: (point) => set((state) => startAim(state, point)),
  updateAimAt: (point) => set((state) => updateAim(state, point)),
  releaseAim: () => set((state) => releaseAim(state)),
  cancelAim: () => set((state) => cancelAim(state)),
  setWeapon: (mode) => set((state) => setWeaponMode(state, mode)),
  setPaused: (paused) => set((state) => ({ ...state, isPaused: paused })),
  loadEditorRoomScenario: (room) => set((state) => loadRoomDefinition(state, room, 0, true)),
  chooseUpgrade: (id) => {
    const current = get();
    const upgraded = applyUpgrade(current, id);
    upgraded.phase = 'playing';
    upgraded.roomClearRewardTimer = 0;
    upgraded.player.canAct = true;
    upgraded.message = 'Puertas abiertas. Elige tu camino.';
    set(upgraded);
  },
}));
