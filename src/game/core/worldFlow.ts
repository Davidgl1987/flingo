import { chooseUpgradeOptions } from './upgrades';
import { isFinalRoom, roomStateFromInstance } from './roomSystem';
import type { GameState } from './types';
import { v } from './vector';
import { getCurrentRoom, getRoomAtPosition, openConnectionBetween, openRoomConnections } from './worldMap';

const ROOM_CLEAR_REWARD_DELAY = 0.85;

// Room/world traversal: which room the player is in, clearing a room and the
// post-clear reward (upgrade / victory) flow. Extracted from simulation.ts.

export function updateCurrentWorldRoom(state: GameState): GameState {
  const worldMap = state.worldMap;
  if (!worldMap) return state;
  const next = state;
  const roomAtPlayer = getRoomAtPosition(worldMap, next.player.pos);
  if (!roomAtPlayer || roomAtPlayer.id === next.currentRoomInstanceId) return next;

  const previousRoomId = next.currentRoomInstanceId;
  if (previousRoomId) {
    next.worldMap = openConnectionBetween(worldMap, previousRoomId, roomAtPlayer.id);
  }
  next.currentRoomInstanceId = roomAtPlayer.id;
  next.room = roomStateFromInstance(roomAtPlayer);
  next.player.lastSafePos = { ...next.player.pos };
  next.message = roomAtPlayer.name;
  return next;
}

export function checkRoomClear(state: GameState): GameState {
  if (state.phase !== 'playing') return state;

  if (!state.worldMap) {
    const alive = state.enemies.some((enemy) => enemy.alive);
    if (alive || state.room.cleared) return state;
    const next = state;
    next.room.cleared = true;
    next.roomsCleared += 1;
    next.player.vel = v(0, 0);
    next.player.canAct = false;
    next.upgradeChoices = chooseUpgradeOptions(next);
    next.roomClearRewardTimer = ROOM_CLEAR_REWARD_DELAY;
    next.message = 'Sala limpia.';
    return next;
  }

  // Clear EVERY room whose enemies are all dead (opening its doors), not only the
  // active one — you may have killed a neighbouring room's enemies with a ranged
  // attack through the doorway. The upgrade reward only fires when the room the
  // player is currently IN becomes cleared.
  const activeRoomId = state.currentRoomInstanceId;
  let worldMap = state.worldMap;
  let clearedCount = 0;
  let activeJustCleared = false;
  let activeIsBoss = false;
  for (const room of state.worldMap.rooms) {
    if (room.cleared) continue;
    const aliveInRoom = state.enemies.some((enemy) => enemy.alive && enemy.roomInstanceId === room.id);
    if (aliveInRoom) continue;
    worldMap = openRoomConnections(worldMap, room.id);
    clearedCount += 1;
    if (room.id === activeRoomId) {
      activeJustCleared = true;
      activeIsBoss = room.tags.includes('boss');
    }
  }
  if (clearedCount === 0) return state;

  const next = state;
  next.worldMap = worldMap;
  next.roomsCleared += clearedCount;
  const refreshed = getCurrentRoom(worldMap, activeRoomId);
  if (refreshed) next.room = roomStateFromInstance(refreshed);

  if (activeJustCleared) {
    next.player.vel = v(0, 0);
    next.player.canAct = false;
    next.upgradeChoices = activeIsBoss ? [] : chooseUpgradeOptions(next);
    next.roomClearRewardTimer = ROOM_CLEAR_REWARD_DELAY;
    next.message = activeIsBoss ? 'Boss derrotado.' : 'Sala limpia.';
  }
  return next;
}

export function advanceRoomClearReward(state: GameState, dt: number): GameState {
  const currentRoom = getCurrentRoom(state.worldMap, state.currentRoomInstanceId);
  const roomCleared = currentRoom?.cleared ?? state.room.cleared;
  if (!roomCleared || state.roomClearRewardTimer <= 0 || state.phase !== 'playing') return state;
  const next = state;
  next.roomClearRewardTimer = Math.max(0, next.roomClearRewardTimer - dt);

  if (next.roomClearRewardTimer > 0) return next;

  if (currentRoom?.tags.includes('boss') || (!next.worldMap && isFinalRoom(next.currentRoomIndex))) {
    next.phase = 'victory';
    next.message = 'MVP completado. El loop funciona si quieres volver a jugar.';
  } else {
    next.phase = 'choosing-upgrade';
    next.message = 'Sala limpia. Elige una mejora.';
  }

  return next;
}
