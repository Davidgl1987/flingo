import {
  deleteSelection,
  duplicateSelection,
  type EditorSelection,
} from '../../../game/core/roomEditor';
import type { RoomDefinition, RoomTag } from '../../../game/core/types';
import { buttonBase, panelClass, roomTags } from '../constants';
import { slugifyRoomId, type SelectedEntity } from '../utils';
import { RoomDoorControls } from './RoomDoorControls';
import { SelectionProperties } from './SelectionProperties';

export function PropertiesPanel({
  room,
  selected,
  selectedEntity,
  validationErrors,
  exportedRoom,
  copyState,
  saveState,
  saveMessage,
  onChangeRoom,
  onCopyExport,
  onTestLevel,
  onSaveLevel,
}: {
  room: RoomDefinition;
  selected: EditorSelection | null;
  selectedEntity: SelectedEntity | null;
  validationErrors: string[];
  exportedRoom: string;
  copyState: 'idle' | 'copied' | 'failed';
  saveState: 'idle' | 'saving' | 'saved' | 'failed';
  saveMessage: string;
  onChangeRoom: (room: RoomDefinition, selected?: EditorSelection | null) => void;
  onCopyExport: () => void;
  onTestLevel: () => void;
  onSaveLevel: () => void;
}) {
  return (
    <aside className={`${panelClass} flex min-h-[520px] flex-col gap-4`}>
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase text-slate-300">Propiedades</h2>
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-400">Id</span>
          <input
            className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm"
            value={room.id}
            onChange={(event) => onChangeRoom({ ...room, id: slugifyRoomId(event.target.value) })}
          />
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-semibold uppercase text-slate-400">RoomTag</span>
          <select
            className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm"
            value={room.tags?.[0] ?? 'combat'}
            onChange={(event) => onChangeRoom({ ...room, tags: [event.target.value as RoomTag] })}
          >
            {roomTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </label>
        <RoomDoorControls room={room} onChange={onChangeRoom} />
        <SelectionProperties room={room} selected={selected} selectedEntity={selectedEntity} onChange={(next) => onChangeRoom(next)} />
        <SelectionActions room={room} selected={selected} onChangeRoom={onChangeRoom} />
      </section>

      <ValidationPanel validationErrors={validationErrors} />
      <ActionPanel
        saveMessage={saveMessage}
        saveState={saveState}
        validationErrors={validationErrors}
        onSaveLevel={onSaveLevel}
        onTestLevel={onTestLevel}
      />
      <ExportPanel copyState={copyState} exportedRoom={exportedRoom} onCopyExport={onCopyExport} />
    </aside>
  );
}

function SelectionActions({
  room,
  selected,
  onChangeRoom,
}: {
  room: RoomDefinition;
  selected: EditorSelection | null;
  onChangeRoom: (room: RoomDefinition, selected?: EditorSelection | null) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        className={`${buttonBase} border-white/15 bg-slate-900 hover:bg-slate-800`}
        disabled={!selected || selected.kind === 'playerStart' || selected.kind === 'patrolTarget'}
        onClick={() => {
          const result = duplicateSelection(room, selected);
          onChangeRoom(result.room, result.selected);
        }}
      >
        Duplicar
      </button>
      <button
        className={`${buttonBase} border-rose-400/40 bg-rose-950/50 text-rose-100 hover:bg-rose-900/70`}
        disabled={!selected || selected.kind === 'playerStart' || selected.kind === 'patrolTarget'}
        onClick={() => {
          const result = deleteSelection(room, selected);
          onChangeRoom(result.room, result.selected);
        }}
      >
        Eliminar
      </button>
    </div>
  );
}

function ValidationPanel({ validationErrors }: { validationErrors: string[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase text-slate-300">Validacion</h2>
      {validationErrors.length === 0 ? (
        <p className="m-0 rounded-md border border-emerald-400/25 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">Lista para probar.</p>
      ) : (
        <ul className="m-0 grid gap-2 p-0 text-sm text-rose-100">
          {validationErrors.map((error) => (
            <li className="list-none rounded-md border border-rose-400/25 bg-rose-950/40 px-3 py-2" key={error}>
              {error}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionPanel({
  validationErrors,
  saveState,
  saveMessage,
  onTestLevel,
  onSaveLevel,
}: {
  validationErrors: string[];
  saveState: 'idle' | 'saving' | 'saved' | 'failed';
  saveMessage: string;
  onTestLevel: () => void;
  onSaveLevel: () => void;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase text-slate-300">Acciones</h2>
      <div className="grid grid-cols-2 gap-2">
        <button
          className={`${buttonBase} border-emerald-400/35 bg-emerald-950/50 text-emerald-100 hover:bg-emerald-900/60`}
          disabled={validationErrors.length > 0}
          onClick={onTestLevel}
        >
          Probar nivel
        </button>
        <button
          className={`${buttonBase} border-sky-400/35 bg-sky-950/50 text-sky-100 hover:bg-sky-900/60`}
          disabled={validationErrors.length > 0 || saveState === 'saving'}
          onClick={onSaveLevel}
        >
          {saveState === 'saving' ? 'Guardando' : 'Guardar nivel'}
        </button>
      </div>
      {saveMessage && (
        <p className={`mt-2 rounded-md border px-3 py-2 text-xs ${saveState === 'failed' ? 'border-rose-400/25 bg-rose-950/40 text-rose-100' : 'border-emerald-400/25 bg-emerald-950/30 text-emerald-100'}`}>
          {saveMessage}
        </p>
      )}
    </section>
  );
}

function ExportPanel({
  copyState,
  exportedRoom,
  onCopyExport,
}: {
  copyState: 'idle' | 'copied' | 'failed';
  exportedRoom: string;
  onCopyExport: () => void;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-bold uppercase text-slate-300">Export</h2>
        <button className={`${buttonBase} border-sky-400/35 bg-sky-950/50 text-sky-100 hover:bg-sky-900/60`} onClick={onCopyExport}>
          {copyState === 'copied' ? 'Copiado' : copyState === 'failed' ? 'Falló' : 'Copiar'}
        </button>
      </div>
      <textarea
        className="min-h-[260px] flex-1 resize-none rounded-md border border-white/10 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100"
        readOnly
        value={exportedRoom}
      />
    </section>
  );
}
