import type { DoorSide, RoomDefinition, Vec2 } from '../../game/core/types';
import type { EditorSelection } from '../../game/core/roomEditor';
import { editorCellGap, editorCellSize, enemyColors, hazardColors, itemColors } from './constants';

export type SelectedEntity =
  | { kind: 'enemy'; entity: RoomDefinition['enemies'][number] }
  | { kind: 'hazard'; entity: RoomDefinition['hazards'][number] }
  | { kind: 'item'; entity: RoomDefinition['items'][number] };

export type CellContent = {
  selectionKey: string;
  color: string;
  shape: 'circle' | 'square' | 'diamond';
  size: number;
  label?: string;
};

export function getSelectedEntity(room: RoomDefinition, selected: EditorSelection | null): SelectedEntity | null {
  if (!selected || selected.kind === 'playerStart' || selected.kind === 'patrolTarget') return null;
  if (selected.kind === 'enemy') {
    const entity = room.enemies.find((candidate) => candidate.id === selected.id);
    return entity ? { kind: 'enemy', entity } : null;
  }
  if (selected.kind === 'hazard') {
    const entity = room.hazards.find((candidate) => candidate.id === selected.id);
    return entity ? { kind: 'hazard', entity } : null;
  }
  const entity = room.items.find((candidate) => candidate.id === selected.id);
  return entity ? { kind: 'item', entity } : null;
}

export function getCellContents(room: RoomDefinition, pos: Vec2): CellContent[] {
  return [
    ...room.enemies
      .filter((enemy) => enemy.patrolTarget?.x === pos.x && enemy.patrolTarget.y === pos.y)
      .map((enemy) => ({ selectionKey: `patrolTarget:${enemy.id}`, color: '#a78bfa', shape: 'diamond' as const, size: 15, label: 'P' })),
    ...room.hazards
      .filter((hazard) => hazard.pos.x === pos.x && hazard.pos.y === pos.y)
      .map((hazard) => ({ selectionKey: `hazard:${hazard.id}`, color: hazardColors[hazard.type], shape: 'square' as const, size: hazard.type === 'barrel' ? 18 : 22 })),
    ...room.enemies
      .filter((enemy) => enemy.pos.x === pos.x && enemy.pos.y === pos.y)
      .map((enemy) => ({ selectionKey: `enemy:${enemy.id}`, color: enemyColors[enemy.type], shape: 'circle' as const, size: 18 })),
    ...room.items
      .filter((item) => item.pos.x === pos.x && item.pos.y === pos.y)
      .map((item) => ({ selectionKey: `item:${item.id}`, color: itemColors[item.type], shape: 'diamond' as const, size: 14 })),
  ];
}

export function selectionKey(selected: EditorSelection): string {
  return selected.kind === 'playerStart' ? 'playerStart' : `${selected.kind}:${selected.id}`;
}

export function makeRange(size: number): number[] {
  const half = Math.floor(size / 2);
  return Array.from({ length: size }, (_, index) => index - half);
}

export function doorOffsetsForSide(room: RoomDefinition, side: DoorSide): number[] {
  const span = side === 'north' || side === 'south' ? room.width : room.height;
  const half = Math.floor(span / 2);
  const offsets: number[] = [];
  for (let offset = -half + 1; offset <= half - 1; offset += 1) offsets.push(offset);
  return offsets;
}

export function gridPixelSize(tileCount: number): number {
  return tileCount * editorCellSize + (tileCount - 1) * editorCellGap;
}

export function tileToGridPoint(pos: Vec2, room: RoomDefinition): Vec2 {
  const halfWidth = Math.floor(room.width / 2);
  const halfHeight = Math.floor(room.height / 2);
  return {
    x: (pos.x + halfWidth) * (editorCellSize + editorCellGap) + editorCellSize / 2,
    y: (pos.y + halfHeight) * (editorCellSize + editorCellGap) + editorCellSize / 2,
  };
}

export function slugifyRoomId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}
