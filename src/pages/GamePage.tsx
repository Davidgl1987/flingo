import { useEffect } from 'react';
import { Game } from '../game/Game';
import { useGameStore } from '../game/stores/useGameStore';
import type { RoomDefinition, Vec2 } from '../game/core/types';

const DEBUG_AIM_DIRECTIONS: Record<string, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  upRight: { x: 0.72, y: -0.72 },
  downLeft: { x: -0.72, y: 0.72 },
};

export function GamePage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('editorRoom') === '1') {
      const serializedRoom = window.localStorage.getItem('slingshot-editor-room') ?? window.sessionStorage.getItem('slingshot-editor-room');
      if (serializedRoom) {
        try {
          useGameStore.getState().loadEditorRoomScenario(JSON.parse(serializedRoom) as RoomDefinition);
        } catch {
          window.localStorage.removeItem('slingshot-editor-room');
          window.sessionStorage.removeItem('slingshot-editor-room');
        }
      }
    }
    const debugAim = params.get('debugAim');
    const direction = debugAim ? DEBUG_AIM_DIRECTIONS[debugAim] : null;
    if (direction) {
      const start = { x: 0, y: 3.2 };
      const pullDistance = 2.1;
      useGameStore.getState().startAimAt(start);
      useGameStore.getState().updateAimAt({
        x: start.x - direction.x * pullDistance,
        y: start.y - direction.y * pullDistance,
      });
    }
  }, []);

  return <Game />;
}
