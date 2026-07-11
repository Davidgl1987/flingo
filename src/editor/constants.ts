import type { DoorSide, EnemyKind, HazardKind, ItemKind, RoomTag } from '@/game/sim/world';

export const ENEMY_KINDS: EnemyKind[] = ['dummy', 'chaser', 'spike', 'trail', 'shooter'];
export const HAZARD_KINDS: HazardKind[] = ['pit', 'spikes', 'barrel', 'rock', 'slow', 'boost'];
export const ITEM_KINDS: ItemKind[] = ['coin', 'potion', 'key'];
export const ALL_TAGS: RoomTag[] = ['inicio', 'combate', 'llave', 'recompensa', 'jefe'];
export const SIDES: DoorSide[] = ['north', 'south', 'east', 'west'];

export const ENEMY_COLOR: Record<EnemyKind, string> = {
  dummy: '#ff5964',
  chaser: '#ff9f45',
  spike: '#9aa1bd',
  trail: '#4dd68a',
  shooter: '#2b2f42',
  // 'boss' no es colocable desde el editor por ahora (GDD §15: los jefes se
  // definen por sala en content/bosses.ts + src/levels/boss-*.json, no
  // pieza a pieza); el color solo satisface la exhaustividad del Record.
  boss: '#7a3fd6',
};
export const HAZARD_COLOR: Record<HazardKind, string> = {
  pit: '#05060a',
  spikes: '#8d94ad',
  barrel: '#c0442b',
  rock: '#767d99',
  slow: '#6b4a2f',
  boost: '#3fd0ff',
};
export const ITEM_COLOR: Record<ItemKind, string> = { coin: '#ffd166', potion: '#ff6bcb', key: '#ffe082' };
export const SIDE_LABEL: Record<DoorSide, string> = { north: 'Norte', south: 'Sur', east: 'Este', west: 'Oeste' };

export const HAZARD_DEFAULT_SIZE: Record<HazardKind, { width: number; height: number }> = {
  pit: { width: 1.6, height: 1.6 },
  spikes: { width: 1.4, height: 1.4 },
  barrel: { width: 0.8, height: 0.8 },
  rock: { width: 1.2, height: 1.2 },
  slow: { width: 2, height: 1.6 },
  boost: { width: 1.2, height: 2 },
};
