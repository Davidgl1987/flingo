import { setSelectionPosition, type EditorSelection } from '../../../game/core/roomEditor';
import type { RoomDefinition } from '../../../game/core/types';
import type { SelectedEntity } from '../utils';
import { NumberField } from './NumberField';

export function SelectionProperties({
  room,
  selected,
  selectedEntity,
  onChange,
}: {
  room: RoomDefinition;
  selected: EditorSelection | null;
  selectedEntity: SelectedEntity | null;
  onChange: (room: RoomDefinition) => void;
}) {
  if (!selected) {
    return <p className="mt-3 rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-300">Nada seleccionado.</p>;
  }

  if (selected.kind === 'playerStart') {
    return (
      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberField label="X" value={room.playerStart.x} onChange={(value) => onChange(setSelectionPosition(room, selected, { ...room.playerStart, x: value }))} />
        <NumberField label="Y" value={room.playerStart.y} onChange={(value) => onChange(setSelectionPosition(room, selected, { ...room.playerStart, y: value }))} />
      </div>
    );
  }

  if (selected.kind === 'patrolTarget') {
    const enemy = room.enemies.find((candidate) => candidate.id === selected.id);
    const target = enemy?.patrolTarget;
    if (!enemy || !target) {
      return <p className="mt-3 rounded-md border border-rose-400/20 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">Punto de patrulla no encontrado.</p>;
    }

    return (
      <div className="mt-3 grid gap-3">
        <div className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm">
          <b className="block">punto de patrulla</b>
          <span className="text-slate-300">{enemy.id}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={target.x} onChange={(value) => onChange(setSelectionPosition(room, selected, { ...target, x: value }))} />
          <NumberField label="Y" value={target.y} onChange={(value) => onChange(setSelectionPosition(room, selected, { ...target, y: value }))} />
        </div>
      </div>
    );
  }

  if (!selectedEntity) {
    return <p className="mt-3 rounded-md border border-rose-400/20 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">Seleccion no encontrada.</p>;
  }

  const pos = selectedEntity.entity.pos;
  return (
    <div className="mt-3 grid gap-3">
      <div className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm">
        <b className="block">{selected.kind}</b>
        <span className="text-slate-300">{selectedEntity.entity.id}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={pos.x} onChange={(value) => onChange(setSelectionPosition(room, selected, { ...pos, x: value }))} />
        <NumberField label="Y" value={pos.y} onChange={(value) => onChange(setSelectionPosition(room, selected, { ...pos, y: value }))} />
      </div>
      {selected.kind === 'enemy' && <EnemyProperties room={room} selected={selected} onChange={onChange} />}
      {selected.kind === 'hazard' && <HazardProperties room={room} selected={selected} onChange={onChange} />}
      {selected.kind === 'item' && <ItemProperties room={room} selected={selected} onChange={onChange} />}
    </div>
  );
}

function EnemyProperties({
  room,
  selected,
  onChange,
}: {
  room: RoomDefinition;
  selected: Extract<EditorSelection, { kind: 'enemy' }>;
  onChange: (room: RoomDefinition) => void;
}) {
  const enemy = room.enemies.find((candidate) => candidate.id === selected.id);
  if (!enemy) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      <NumberField label="Radio" step={0.01} value={enemy.radius} onChange={(value) => onChange({ ...room, enemies: room.enemies.map((candidate) => (candidate.id === enemy.id ? { ...candidate, radius: value } : candidate)) })} />
      <NumberField label="HP" value={enemy.hp} onChange={(value) => onChange({ ...room, enemies: room.enemies.map((candidate) => (candidate.id === enemy.id ? { ...candidate, hp: value } : candidate)) })} />
      <NumberField label="Max" value={enemy.maxHp} onChange={(value) => onChange({ ...room, enemies: room.enemies.map((candidate) => (candidate.id === enemy.id ? { ...candidate, maxHp: value } : candidate)) })} />
    </div>
  );
}

function HazardProperties({
  room,
  selected,
  onChange,
}: {
  room: RoomDefinition;
  selected: Extract<EditorSelection, { kind: 'hazard' }>;
  onChange: (room: RoomDefinition) => void;
}) {
  const hazard = room.hazards.find((candidate) => candidate.id === selected.id);
  if (!hazard) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {'width' in hazard && hazard.width !== undefined && (
        <NumberField label="Ancho" value={hazard.width} onChange={(value) => onChange({ ...room, hazards: room.hazards.map((candidate) => (candidate.id === hazard.id ? { ...candidate, width: value } : candidate)) })} />
      )}
      {'height' in hazard && hazard.height !== undefined && (
        <NumberField label="Alto" value={hazard.height} onChange={(value) => onChange({ ...room, hazards: room.hazards.map((candidate) => (candidate.id === hazard.id ? { ...candidate, height: value } : candidate)) })} />
      )}
      {'radius' in hazard && hazard.radius !== undefined && (
        <NumberField label="Radio" step={0.01} value={hazard.radius} onChange={(value) => onChange({ ...room, hazards: room.hazards.map((candidate) => (candidate.id === hazard.id ? { ...candidate, radius: value } : candidate)) })} />
      )}
    </div>
  );
}

function ItemProperties({
  room,
  selected,
  onChange,
}: {
  room: RoomDefinition;
  selected: Extract<EditorSelection, { kind: 'item' }>;
  onChange: (room: RoomDefinition) => void;
}) {
  const item = room.items.find((candidate) => candidate.id === selected.id);
  if (!item) return null;
  return (
    <NumberField label="Radio" step={0.01} value={item.radius} onChange={(value) => onChange({ ...room, items: room.items.map((candidate) => (candidate.id === item.id ? { ...candidate, radius: value } : candidate)) })} />
  );
}
