import type { EnemyState, EnemyType, HazardState, HazardType, ItemState, ItemType, RoomDefinition, Vec2 } from './types';

export type EditorEntityKind = 'enemy' | 'hazard' | 'item';
export type EditorTool =
  | 'select'
  | 'erase'
  | 'playerStart'
  | `enemy:${EnemyType}`
  | `hazard:${HazardType}`
  | `item:${ItemType}`;

export type EditorSelection =
  | { kind: 'playerStart' }
  | { kind: 'enemy'; id: string }
  | { kind: 'patrolTarget'; id: string }
  | { kind: 'hazard'; id: string }
  | { kind: 'item'; id: string };

export const EDITOR_ENEMY_TYPES: EnemyType[] = ['dummy', 'chaser', 'spike', 'trail', 'shooter'];
export const EDITOR_HAZARD_TYPES: HazardType[] = ['rock', 'pit', 'spikes', 'barrel', 'slow', 'boost'];
export const EDITOR_ITEM_TYPES: ItemType[] = ['coin', 'potion', 'key'];
export const PATROL_ENEMY_TYPES: EnemyType[] = ['dummy', 'spike', 'trail'];

export const DEFAULT_EDITOR_ROOM: RoomDefinition = {
  id: 'room-draft',
  name: 'Sala borrador',
  width: 9,
  height: 13,
  playerStart: { x: 0, y: 5 },
  enemies: [
    { id: 'room-draft-dummy-1', type: 'dummy', pos: { x: 0, y: -3 }, radius: 0.42, hp: 2, maxHp: 2, patrolTarget: { x: 1, y: -3 } },
  ],
  hazards: [
    { id: 'room-draft-rock-1', type: 'rock', pos: { x: 0, y: 0 }, width: 1, height: 1 },
  ],
  items: [
    { id: 'room-draft-coin-1', type: 'coin', pos: { x: -2, y: -1 }, radius: 0.32, collected: false },
  ],
};

const enemyDefaults: Record<EnemyType, Pick<EnemyState, 'radius' | 'hp' | 'maxHp'> & Partial<Pick<EnemyState, 'spikeDir'>>> = {
  dummy: { radius: 0.42, hp: 2, maxHp: 2 },
  chaser: { radius: 0.45, hp: 3, maxHp: 3 },
  spike: { radius: 0.52, hp: 3, maxHp: 3, spikeDir: { x: -1, y: 0 } },
  trail: { radius: 0.46, hp: 3, maxHp: 3 },
  shooter: { radius: 0.46, hp: 3, maxHp: 3 },
};

const hazardDefaults: Record<HazardType, Omit<HazardState, 'id' | 'type' | 'pos'>> = {
  rock: { width: 1, height: 1 },
  pit: { width: 1, height: 1 },
  spikes: { width: 1, height: 1 },
  barrel: { radius: 0.42 },
  slow: { width: 1, height: 1 },
  boost: { width: 1, height: 1, dir: { x: 1, y: 0 } },
};

const itemDefaults: Record<ItemType, Pick<ItemState, 'radius' | 'collected'>> = {
  coin: { radius: 0.32, collected: false },
  potion: { radius: 0.34, collected: false },
  key: { radius: 0.34, collected: false },
};

export function cloneRoom(room: RoomDefinition): RoomDefinition {
  return JSON.parse(JSON.stringify(room)) as RoomDefinition;
}

export function normalizeTilePos(pos: Vec2): Vec2 {
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}

export function updateRoomBounds(room: RoomDefinition, width: number, height: number): RoomDefinition {
  return {
    ...room,
    width: toOddDimension(width),
    height: toOddDimension(height),
  };
}

export function toOddDimension(value: number): number {
  const integer = Math.max(5, Math.round(value));
  return integer % 2 === 0 ? integer + 1 : integer;
}

export function makeEditorEnemy(type: EnemyType, pos: Vec2, id: string): RoomDefinition['enemies'][number] {
  const tile = normalizeTilePos(pos);
  const patrolTarget = PATROL_ENEMY_TYPES.includes(type) ? { x: tile.x + 1, y: tile.y } : undefined;
  return {
    id,
    type,
    pos: tile,
    ...enemyDefaults[type],
    patrolTarget,
  };
}

export function makeEditorHazard(type: HazardType, pos: Vec2, id: string): HazardState {
  return {
    id,
    type,
    pos: normalizeTilePos(pos),
    ...hazardDefaults[type],
  };
}

export function makeEditorItem(type: ItemType, pos: Vec2, id: string): ItemState {
  return {
    id,
    type,
    pos: normalizeTilePos(pos),
    ...itemDefaults[type],
  };
}

export function nextEntityId(room: RoomDefinition, prefix: string): string {
  const ids = new Set([
    ...room.enemies.map((enemy) => enemy.id),
    ...room.hazards.map((hazard) => hazard.id),
    ...room.items.map((item) => item.id),
  ]);
  let index = 1;
  let id = `${room.id}-${prefix}-${index}`;
  while (ids.has(id)) {
    index += 1;
    id = `${room.id}-${prefix}-${index}`;
  }
  return id;
}

export function entityAt(room: RoomDefinition, pos: Vec2): EditorSelection | null {
  const tile = normalizeTilePos(pos);
  const patrolEnemy = room.enemies.find((candidate) => candidate.patrolTarget && sameTile(candidate.patrolTarget, tile));
  if (patrolEnemy) return { kind: 'patrolTarget', id: patrolEnemy.id };

  const item = room.items.find((candidate) => sameTile(candidate.pos, tile));
  if (item) return { kind: 'item', id: item.id };

  const hazard = room.hazards.find((candidate) => sameTile(candidate.pos, tile));
  if (hazard) return { kind: 'hazard', id: hazard.id };

  const enemy = room.enemies.find((candidate) => sameTile(candidate.pos, tile));
  if (enemy) return { kind: 'enemy', id: enemy.id };

  if (sameTile(room.playerStart, tile)) return { kind: 'playerStart' };
  return null;
}

export function applyEditorTool(room: RoomDefinition, tool: EditorTool, pos: Vec2, selected: EditorSelection | null): { room: RoomDefinition; selected: EditorSelection | null } {
  const tile = normalizeTilePos(pos);

  if (tool === 'select') {
    const entity = entityAt(room, tile);
    if (entity) return { room, selected: entity };
    if (selected) return { room: moveSelection(room, selected, tile), selected };
    return { room, selected: null };
  }

  if (tool === 'erase') {
    return { room: removeAt(room, tile), selected: null };
  }

  if (tool === 'playerStart') {
    return { room: { ...room, playerStart: tile }, selected: { kind: 'playerStart' } };
  }

  const [kind, type] = tool.split(':') as [EditorEntityKind, EnemyType | HazardType | ItemType];
  if (kind === 'enemy') {
    const enemy = makeEditorEnemy(type as EnemyType, tile, nextEntityId(room, type));
    return { room: { ...room, enemies: [...room.enemies, enemy] }, selected: { kind: 'enemy', id: enemy.id } };
  }
  if (kind === 'hazard') {
    const hazard = makeEditorHazard(type as HazardType, tile, nextEntityId(room, type));
    return { room: { ...room, hazards: [...room.hazards, hazard] }, selected: { kind: 'hazard', id: hazard.id } };
  }

  const item = makeEditorItem(type as ItemType, tile, nextEntityId(room, type));
  return { room: { ...room, items: [...room.items, item] }, selected: { kind: 'item', id: item.id } };
}

export function deleteSelection(room: RoomDefinition, selected: EditorSelection | null): { room: RoomDefinition; selected: null } {
  if (!selected || selected.kind === 'playerStart' || selected.kind === 'patrolTarget') return { room, selected: null };
  return { room: removeBySelection(room, selected), selected: null };
}

export function duplicateSelection(room: RoomDefinition, selected: EditorSelection | null): { room: RoomDefinition; selected: EditorSelection | null } {
  if (!selected || selected.kind === 'playerStart' || selected.kind === 'patrolTarget') return { room, selected };
  if (selected.kind === 'enemy') {
    const source = room.enemies.find((enemy) => enemy.id === selected.id);
    if (!source) return { room, selected: null };
    const clonedSource = cloneRoom({ ...room, enemies: [source], hazards: [], items: [] }).enemies[0];
    const duplicate = {
      ...clonedSource,
      id: nextEntityId(room, source.type),
      pos: offsetDuplicate(source.pos),
      patrolTarget: source.patrolTarget ? offsetDuplicate(source.patrolTarget) : undefined,
    };
    return { room: { ...room, enemies: [...room.enemies, duplicate] }, selected: { kind: 'enemy', id: duplicate.id } };
  }
  if (selected.kind === 'hazard') {
    const source = room.hazards.find((hazard) => hazard.id === selected.id);
    if (!source) return { room, selected: null };
    const duplicate = { ...cloneRoom({ ...room, enemies: [], hazards: [source], items: [] }).hazards[0], id: nextEntityId(room, source.type), pos: offsetDuplicate(source.pos) };
    return { room: { ...room, hazards: [...room.hazards, duplicate] }, selected: { kind: 'hazard', id: duplicate.id } };
  }

  const source = room.items.find((item) => item.id === selected.id);
  if (!source) return { room, selected: null };
  const duplicate = { ...cloneRoom({ ...room, enemies: [], hazards: [], items: [source] }).items[0], id: nextEntityId(room, source.type), pos: offsetDuplicate(source.pos) };
  return { room: { ...room, items: [...room.items, duplicate] }, selected: { kind: 'item', id: duplicate.id } };
}

export function setSelectionPosition(room: RoomDefinition, selected: EditorSelection, pos: Vec2): RoomDefinition {
  return moveSelection(room, selected, normalizeTilePos(pos));
}

export function validateEditorRoom(room: RoomDefinition): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  if (!room.id.trim()) errors.push('La sala necesita id.');
  if (!room.name.trim()) errors.push('La sala necesita nombre.');
  if (room.width < 5 || room.height < 5) errors.push('La sala debe medir al menos 5x5.');
  if (!isInside(room, room.playerStart)) errors.push('El inicio del jugador queda fuera de la sala.');
  if (isBlockedByHazard(room, room.playerStart)) errors.push('El inicio del jugador no debe estar sobre peligro u obstáculo.');

  for (const entity of [...room.enemies, ...room.hazards, ...room.items]) {
    if (ids.has(entity.id)) errors.push(`Id duplicado: ${entity.id}.`);
    ids.add(entity.id);
    if (!isInside(room, entity.pos)) errors.push(`${entity.id} queda fuera de la sala.`);
    if (!sameTile(entity.pos, normalizeTilePos(entity.pos))) errors.push(`${entity.id} no está centrado en tile.`);
  }

  for (const enemy of room.enemies) {
    if (PATROL_ENEMY_TYPES.includes(enemy.type) && !enemy.patrolTarget) {
      errors.push(`${enemy.id} necesita punto de patrulla.`);
    }
    if (enemy.patrolTarget && !isInside(room, enemy.patrolTarget)) {
      errors.push(`El punto de patrulla de ${enemy.id} queda fuera de la sala.`);
    }
    if (enemy.patrolTarget && !sameTile(enemy.patrolTarget, normalizeTilePos(enemy.patrolTarget))) {
      errors.push(`El punto de patrulla de ${enemy.id} no está centrado en tile.`);
    }
  }

  for (const side of ['north', 'south', 'east', 'west'] as const) {
    const slots = room.doorSlots?.filter((slot) => slot.side === side) ?? [];
    if (slots.length > 2) errors.push(`${side} no puede tener más de 2 puertas.`);
    for (let index = 0; index < slots.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < slots.length; otherIndex += 1) {
        if (Math.abs(slots[index].offset - slots[otherIndex].offset) < 2) {
          errors.push(`${side} tiene puertas demasiado juntas.`);
        }
      }
    }
  }

  return errors;
}

export function exportRoomDefinition(room: RoomDefinition): string {
  return `{
  id: ${quote(room.id)},
  name: ${quote(room.name)},
  width: ${room.width},
  height: ${room.height},
  tags: ${formatStringArray(room.tags ?? ['combat'])},
  doorSlots: ${formatDoorSlots(room.doorSlots ?? [])},
  playerStart: ${formatVec(room.playerStart)},
  enemies: [
${room.enemies.map(formatEnemy).join(',\n')}
  ],
  hazards: [
${room.hazards.map(formatHazard).join(',\n')}
  ],
  items: [
${room.items.map(formatItem).join(',\n')}
  ],
}`;
}

export function exportRoomJson(room: RoomDefinition): string {
  return JSON.stringify(room, null, 2);
}

function moveSelection(room: RoomDefinition, selected: EditorSelection, pos: Vec2): RoomDefinition {
  if (selected.kind === 'playerStart') return { ...room, playerStart: pos };
  if (selected.kind === 'enemy') {
    return { ...room, enemies: room.enemies.map((enemy) => (enemy.id === selected.id ? { ...enemy, pos } : enemy)) };
  }
  if (selected.kind === 'patrolTarget') {
    return { ...room, enemies: room.enemies.map((enemy) => (enemy.id === selected.id ? { ...enemy, patrolTarget: pos } : enemy)) };
  }
  if (selected.kind === 'hazard') {
    return { ...room, hazards: room.hazards.map((hazard) => (hazard.id === selected.id ? { ...hazard, pos } : hazard)) };
  }
  return { ...room, items: room.items.map((item) => (item.id === selected.id ? { ...item, pos } : item)) };
}

function removeAt(room: RoomDefinition, pos: Vec2): RoomDefinition {
  const tile = normalizeTilePos(pos);
  return {
    ...room,
    enemies: room.enemies.filter((enemy) => !sameTile(enemy.pos, tile)),
    hazards: room.hazards.filter((hazard) => !sameTile(hazard.pos, tile)),
    items: room.items.filter((item) => !sameTile(item.pos, tile)),
  };
}

function removeBySelection(room: RoomDefinition, selected: Exclude<EditorSelection, { kind: 'playerStart' } | { kind: 'patrolTarget' }>): RoomDefinition {
  if (selected.kind === 'enemy') return { ...room, enemies: room.enemies.filter((enemy) => enemy.id !== selected.id) };
  if (selected.kind === 'hazard') return { ...room, hazards: room.hazards.filter((hazard) => hazard.id !== selected.id) };
  return { ...room, items: room.items.filter((item) => item.id !== selected.id) };
}

function offsetDuplicate(pos: Vec2): Vec2 {
  return { x: pos.x + 1, y: pos.y };
}

function isInside(room: RoomDefinition, pos: Vec2): boolean {
  return Math.abs(pos.x) <= Math.floor(room.width / 2) && Math.abs(pos.y) <= Math.floor(room.height / 2);
}

function isBlockedByHazard(room: RoomDefinition, pos: Vec2): boolean {
  return room.hazards.some((hazard) => sameTile(hazard.pos, pos) && ['pit', 'spikes', 'barrel', 'rock'].includes(hazard.type));
}

function sameTile(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

function formatEnemy(enemy: RoomDefinition['enemies'][number]): string {
  const optionalSpikeDir = enemy.spikeDir ? `, spikeDir: ${formatVec(enemy.spikeDir)}` : '';
  const optionalPatrolTarget = enemy.patrolTarget ? `, patrolTarget: ${formatVec(enemy.patrolTarget)}` : '';
  return `    { id: ${quote(enemy.id)}, type: ${quote(enemy.type)}, pos: ${formatVec(enemy.pos)}, radius: ${formatNumber(enemy.radius)}, hp: ${enemy.hp}, maxHp: ${enemy.maxHp}${optionalSpikeDir}${optionalPatrolTarget} }`;
}

function formatHazard(hazard: HazardState): string {
  const fields = [
    `id: ${quote(hazard.id)}`,
    `type: ${quote(hazard.type)}`,
    `pos: ${formatVec(hazard.pos)}`,
  ];
  if (hazard.radius !== undefined) fields.push(`radius: ${formatNumber(hazard.radius)}`);
  if (hazard.width !== undefined) fields.push(`width: ${formatNumber(hazard.width)}`);
  if (hazard.height !== undefined) fields.push(`height: ${formatNumber(hazard.height)}`);
  if (hazard.dir) fields.push(`dir: ${formatVec(hazard.dir)}`);
  return `    { ${fields.join(', ')} }`;
}

function formatItem(item: ItemState): string {
  return `    { id: ${quote(item.id)}, type: ${quote(item.type)}, pos: ${formatVec(item.pos)}, radius: ${formatNumber(item.radius)}, collected: false }`;
}

function formatDoorSlots(slots: NonNullable<RoomDefinition['doorSlots']>): string {
  if (slots.length === 0) return '[]';
  return `[\n${slots.map((slot) => `    { side: ${quote(slot.side)}, offset: ${formatNumber(slot.offset)} }`).join(',\n')}\n  ]`;
}

function formatStringArray(values: string[]): string {
  return `[${values.map(quote).join(', ')}]`;
}

function formatVec(vec: Vec2): string {
  return `{ x: ${formatNumber(vec.x)}, y: ${formatNumber(vec.y)} }`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
