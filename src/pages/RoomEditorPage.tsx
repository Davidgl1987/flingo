import { useEffect, useMemo, useState } from 'react';
import { ROOMS } from '../game/core/rooms';
import type { RoomDefinition, Vec2 } from '../game/core/types';
import {
  DEFAULT_EDITOR_ROOM,
  applyEditorTool,
  cloneRoom,
  exportRoomDefinition,
  exportRoomJson,
  updateRoomBounds,
  validateEditorRoom,
  type EditorSelection,
  type EditorTool,
} from '../game/core/roomEditor';
import { EditorBoard } from './room-editor/components/EditorBoard';
import { EditorSidebar } from './room-editor/components/EditorSidebar';
import { PropertiesPanel } from './room-editor/components/PropertiesPanel';
import { getSelectedEntity } from './room-editor/utils';
import {
  loadPersistedEditorDraft,
  persistEditorDraft,
  persistEditorPlaytestRoom,
} from './room-editor/storage';

export function RoomEditorPage() {
  const [room, setRoom] = useState<RoomDefinition>(loadPersistedEditorDraft);
  const [tool, setTool] = useState<EditorTool>('select');
  const [selected, setSelected] = useState<EditorSelection | null>(null);
  const [sourceRoom, setSourceRoom] = useState('draft');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  const validationErrors = useMemo(() => validateEditorRoom(room), [room]);
  const exportedRoom = useMemo(() => exportRoomDefinition(room), [room]);
  const selectedEntity = getSelectedEntity(room, selected);

  useEffect(() => {
    persistEditorDraft(room);
  }, [room]);

  const updateRoom = (next: RoomDefinition, nextSelected = selected) => {
    setRoom(next);
    setSelected(nextSelected);
  };

  const handleCellClick = (pos: Vec2) => {
    const result = applyEditorTool(room, tool, pos, selected);
    updateRoom(result.room, result.selected);
  };

  const loadSourceRoom = (id: string) => {
    setSourceRoom(id);
    setSelected(null);
    if (id === 'draft') {
      setRoom(cloneRoom(DEFAULT_EDITOR_ROOM));
      return;
    }
    const index = Number(id);
    setRoom(cloneRoom(ROOMS[index] ?? DEFAULT_EDITOR_ROOM));
  };

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportedRoom);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const testLevel = () => {
    persistEditorPlaytestRoom(room);
    window.open('/?editorRoom=1', '_blank', 'noopener,noreferrer');
  };

  const saveLevel = async () => {
    setSaveState('saving');
    setSaveMessage('');
    try {
      const response = await fetch('/api/editor/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: exportRoomJson(room),
      });
      const payload = (await response.json()) as { ok?: boolean; path?: string; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'No se pudo guardar.');
      }
      setSaveState('saved');
      setSaveMessage(payload.path ?? `${room.id}.json`);
    } catch (error) {
      setSaveState('failed');
      setSaveMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
    }
  };

  return (
    <main className="h-full w-full overflow-auto bg-slate-950 text-slate-50" style={{ touchAction: 'auto' }}>
      <div className="grid min-h-full gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        <EditorSidebar
          sourceRoom={sourceRoom}
          tool={tool}
          onLoadSourceRoom={loadSourceRoom}
          onSelectTool={setTool}
        />
        <EditorBoard
          room={room}
          selected={selected}
          onCellClick={handleCellClick}
          onChangeHeight={(height) => updateRoom(updateRoomBounds(room, room.width, height))}
          onChangeName={(name) => updateRoom({ ...room, name })}
          onChangeWidth={(width) => updateRoom(updateRoomBounds(room, width, room.height))}
        />
        <PropertiesPanel
          copyState={copyState}
          exportedRoom={exportedRoom}
          room={room}
          saveMessage={saveMessage}
          saveState={saveState}
          selected={selected}
          selectedEntity={selectedEntity}
          validationErrors={validationErrors}
          onChangeRoom={updateRoom}
          onCopyExport={copyExport}
          onSaveLevel={saveLevel}
          onTestLevel={testLevel}
        />
      </div>
    </main>
  );
}
