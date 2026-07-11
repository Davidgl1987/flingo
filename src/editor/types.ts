import type { EnemyKind, HazardKind, ItemKind } from '@/game/world/types';

export type Selection =
  | { type: 'enemy'; id: string }
  | { type: 'hazard'; id: string }
  | { type: 'item'; id: string }
  /** Handle del destino de patrulla de un enemigo (segundo punto arrastrable en el lienzo). */
  | { type: 'patrol'; id: string }
  | { type: 'start' }
  | null;

export type PlaceKind =
  | { type: 'enemy'; kind: EnemyKind }
  | { type: 'hazard'; kind: HazardKind }
  | { type: 'item'; kind: ItemKind }
  | { type: 'start' }
  | null;
