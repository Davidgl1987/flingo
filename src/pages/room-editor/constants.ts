import {
  EDITOR_ENEMY_TYPES,
  EDITOR_HAZARD_TYPES,
  EDITOR_ITEM_TYPES,
  type EditorTool,
} from '../../game/core/roomEditor';
import type { DoorSide, EnemyType, HazardType, ItemType, RoomTag } from '../../game/core/types';

export type PaletteEntry = {
  tool: EditorTool;
  label: string;
  color: string;
};

export const enemyColors: Record<EnemyType, string> = {
  dummy: '#ef4444',
  chaser: '#f97316',
  spike: '#94a3b8',
  trail: '#22c55e',
  shooter: '#020617',
};

export const hazardColors: Record<HazardType, string> = {
  pit: '#020617',
  spikes: '#7f1d1d',
  barrel: '#b45309',
  slow: '#2563eb',
  boost: '#14b8a6',
  rock: '#64748b',
};

export const itemColors: Record<ItemType, string> = {
  coin: '#facc15',
  potion: '#f472b6',
  key: '#e5e7eb',
};

const enemyLabels: Record<EnemyType, string> = {
  dummy: 'Dummy',
  chaser: 'Chaser',
  spike: 'Spike',
  trail: 'Trail',
  shooter: 'Shooter',
};

const hazardLabels: Record<HazardType, string> = {
  rock: 'Roca',
  pit: 'Foso',
  spikes: 'Pinchos',
  barrel: 'Barril',
  slow: 'Lenta',
  boost: 'Impulso',
};

const itemLabels: Record<ItemType, string> = {
  coin: 'Moneda',
  potion: 'Pocion',
  key: 'Llave',
};

export const roomTags: RoomTag[] = ['combat', 'start', 'key', 'boss', 'reward'];
export const doorSides: DoorSide[] = ['north', 'south', 'east', 'west'];

export const baseTools: PaletteEntry[] = [
  { tool: 'select', label: 'Seleccionar', color: '#e2e8f0' },
  { tool: 'playerStart', label: 'Inicio', color: '#38bdf8' },
  { tool: 'erase', label: 'Borrar', color: '#fb7185' },
];

export const enemyTools: PaletteEntry[] = EDITOR_ENEMY_TYPES.map((type) => ({
  tool: `enemy:${type}`,
  label: enemyLabels[type],
  color: enemyColors[type],
}));

export const hazardTools: PaletteEntry[] = EDITOR_HAZARD_TYPES.map((type) => ({
  tool: `hazard:${type}`,
  label: hazardLabels[type],
  color: hazardColors[type],
}));

export const itemTools: PaletteEntry[] = EDITOR_ITEM_TYPES.map((type) => ({
  tool: `item:${type}`,
  label: itemLabels[type],
  color: itemColors[type],
}));

export const panelClass = 'rounded-lg border border-white/10 bg-slate-950/80 p-3 shadow-xl shadow-black/30';
export const buttonBase = 'rounded-md border px-3 py-2 text-sm font-semibold transition disabled:opacity-40';
export const editorCellSize = 40;
export const editorCellGap = 1;
export const editorDraftStorageKey = 'flingo-editor-draft';
export const editorPlaytestStorageKey = 'flingo-editor-room';
