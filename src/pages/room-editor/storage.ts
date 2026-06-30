import { cloneRoom, DEFAULT_EDITOR_ROOM, exportRoomJson } from '../../game/core/roomEditor';
import type { RoomDefinition } from '../../game/core/types';
import { editorDraftStorageKey, editorPlaytestStorageKey } from './constants';

export function loadPersistedEditorDraft(): RoomDefinition {
  const serializedDraft = window.localStorage.getItem(editorDraftStorageKey);
  if (!serializedDraft) return cloneRoom(DEFAULT_EDITOR_ROOM);

  try {
    return JSON.parse(serializedDraft) as RoomDefinition;
  } catch {
    window.localStorage.removeItem(editorDraftStorageKey);
    return cloneRoom(DEFAULT_EDITOR_ROOM);
  }
}

export function persistEditorDraft(room: RoomDefinition): void {
  window.localStorage.setItem(editorDraftStorageKey, exportRoomJson(room));
}

export function persistEditorPlaytestRoom(room: RoomDefinition): void {
  const roomJson = exportRoomJson(room);
  window.localStorage.setItem(editorDraftStorageKey, roomJson);
  window.localStorage.setItem(editorPlaytestStorageKey, roomJson);
}
