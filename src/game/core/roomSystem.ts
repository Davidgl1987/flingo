import { cloneState } from './clone';
import { PLAYER_RADIUS, PLAYER_START_HP } from './constants';
import { RUN_ROOM_POOL } from './levelRooms';
import { ROOMS } from './rooms';
import type { GameState, RoomDefinition, WorldMapState, WorldRoomInstance } from './types';
import { len, normalize, sub, v } from './vector';
import { ensureKeyItem, generateProceduralWorldMap, getCurrentRoom, getWorldBounds, offsetRoomDefinition, rotateRoomDefinition } from './worldMap';

export function createInitialGameState(roomIndex = 0): GameState {
  const base = createBaseGameState(roomIndex);
  return loadWorldMap(base, generateProceduralWorldMap(RUN_ROOM_POOL), true);
}

function createBaseGameState(roomIndex = 0): GameState {
  return {
    phase: 'playing',
    isPaused: false,
    currentRoomIndex: roomIndex,
    roomsCleared: 0,
    roomClearRewardTimer: 0,
    coins: 0,
    score: 0,
    message: 'Toca en cualquier zona, tira hacia atrás y suelta.',
    room: { id: '', name: '', width: 1, height: 1, cleared: false },
    worldMap: null,
    currentRoomInstanceId: null,
    hasKey: false,
    player: {
      pos: v(0, 0),
      vel: v(0, 0),
      radius: PLAYER_RADIUS,
      hp: PLAYER_START_HP,
      maxHp: PLAYER_START_HP,
      bodyDamage: 1,
      arrowDamage: 1,
      spellDamage: 2,
      weaponMode: 'body',
      canAct: true,
      isAiming: false,
      aimStart: null,
      aimCurrent: null,
      lastSafePos: v(0, 0),
      invulnerableTimer: 0,
      actionCooldown: 0,
      actionCooldowns: {
        body: 0,
        arrow: 0,
        spell: 0,
      },
      pitFallTimer: 0,
      pitFallPos: null,
      pitFallActive: false,
      pitFallHeight: 0,
      pitFallVerticalVelocity: 0,
      upgrades: [],
      shieldCharges: 0,
    },
    enemies: [],
    hazards: [],
    items: [],
    projectiles: [],
    trails: [],
    effects: [],
    upgradeChoices: [],
    nextId: 1,
  };
}

export function loadRoom(previousState: GameState, roomIndex: number, resetPlayerPosition = true): GameState {
  const room: RoomDefinition = ROOMS[roomIndex];
  return loadRoomDefinition(previousState, room, roomIndex, resetPlayerPosition);
}

export function loadWorldMap(previousState: GameState, worldMap: WorldMapState, resetPlayerPosition = true): GameState {
  const startRoom = getCurrentRoom(worldMap, worldMap.startRoomId) ?? worldMap.rooms[0];
  const next: GameState = cloneState(previousState);
  const worldBounds = getWorldBounds(worldMap);
  const roomDefinitions = worldMap.rooms.map((instance) => {
    const source = RUN_ROOM_POOL.find((room) => room.id === instance.roomId) ?? ROOMS[0];
    const rotatedSource = rotateRoomDefinition(source, instance.rotation ?? 0);
    const offsetRoom = offsetRoomDefinition(rotatedSource, instance);
    return {
      room: offsetRoom,
      instance,
      keyItems: ensureKeyItem(offsetRoom, instance),
    };
  });

  next.phase = 'playing';
  next.isPaused = false;
  next.worldMap = cloneState(worldMap);
  next.currentRoomInstanceId = startRoom.id;
  next.hasKey = false;
  next.currentRoomIndex = 0;
  next.room = roomStateFromInstance(startRoom);
  next.room.width = worldBounds.width;
  next.room.height = worldBounds.height;
  next.enemies = roomDefinitions.flatMap(({ room }) => room.enemies.map((enemy) => ({
    ...cloneState(enemy),
    vel: v(0, 0),
    hp: enemy.hp,
    alive: true,
    contactCooldown: 0,
    trailTimer: 0,
    aiTimer: 0,
    homePos: cloneState(enemy.pos),
    patrolAnchor: cloneState(enemy.pos),
    patrolTarget: cloneState(enemy.patrolTarget ?? enemy.pos),
    patrolAxis: enemy.patrolTarget && len(sub(enemy.patrolTarget, enemy.pos)) > 0.01 ? normalize(sub(enemy.patrolTarget, enemy.pos)) : undefined,
    patrolRange: enemy.patrolTarget && len(sub(enemy.patrolTarget, enemy.pos)) > 0.01 ? len(sub(enemy.patrolTarget, enemy.pos)) : undefined,
  })));
  next.hazards = roomDefinitions.flatMap(({ room }) => room.hazards.map((hazard) => cloneState(hazard)));
  next.items = roomDefinitions.flatMap(({ room, keyItems }) => [
    ...room.items.map((item) => ({ ...cloneState(item), collected: false })),
    ...keyItems,
  ]);
  next.projectiles = [];
  next.trails = [];
  next.effects = [];
  next.upgradeChoices = [];
  next.roomClearRewardTimer = 0;
  next.message = startRoom.name;
  resetTransientPlayerState(next);

  if (resetPlayerPosition) {
    const source = RUN_ROOM_POOL.find((room) => room.id === startRoom.roomId) ?? ROOMS[0];
    const rotatedSource = rotateRoomDefinition(source, startRoom.rotation ?? 0);
    const start = {
      x: rotatedSource.playerStart.x + startRoom.offset.x,
      y: rotatedSource.playerStart.y + startRoom.offset.y,
    };
    next.player.pos = start;
    next.player.lastSafePos = start;
  }

  return next;
}

export function loadRoomDefinition(previousState: GameState, room: RoomDefinition, roomIndex: number, resetPlayerPosition = true): GameState {
  const playerStart = room.playerStart;
  const next: GameState = cloneState(previousState);

  next.phase = 'playing';
  next.isPaused = false;
  next.currentRoomIndex = roomIndex;
  next.worldMap = null;
  next.currentRoomInstanceId = null;
  next.hasKey = false;
  next.room = {
    id: room.id,
    name: room.name,
    width: room.width,
    height: room.height,
    cleared: false,
  };
  next.enemies = room.enemies.map((enemy) => {
    const patrolAnchor = cloneState(enemy.pos);
    const patrolTarget = cloneState(enemy.patrolTarget ?? enemy.pos);
    const patrolDelta = sub(patrolTarget, patrolAnchor);
    const patrolRange = len(patrolDelta);
    return {
      ...cloneState(enemy),
      vel: v(0, 0),
      hp: enemy.hp,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
      aiTimer: 0,
      homePos: cloneState(enemy.pos),
      patrolAnchor,
      patrolTarget,
      patrolAxis: patrolRange > 0.01 ? normalize(patrolDelta) : undefined,
      patrolRange: patrolRange > 0.01 ? patrolRange : undefined,
    };
  });
  next.hazards = room.hazards.map((hazard) => cloneState(hazard));
  next.items = room.items.map((item) => ({ ...cloneState(item), collected: false }));
  next.projectiles = [];
  next.trails = [];
  next.effects = [];
  next.upgradeChoices = [];
  next.roomClearRewardTimer = 0;
  next.message = room.name;
  resetTransientPlayerState(next);

  if (resetPlayerPosition) {
    next.player.pos = cloneState(playerStart);
    next.player.lastSafePos = cloneState(playerStart);
  }

  return next;
}

export function isFinalRoom(index: number): boolean {
  return index >= ROOMS.length - 1;
}

export function roomStateFromInstance(room: WorldRoomInstance) {
  return {
    id: room.id,
    name: room.name,
    width: room.width,
    height: room.height,
    cleared: room.cleared,
  };
}

function resetTransientPlayerState(next: GameState): void {
  next.player.vel = v(0, 0);
  next.player.pitFallActive = false;
  next.player.pitFallHeight = 0;
  next.player.pitFallVerticalVelocity = 0;
  next.player.isAiming = false;
  next.player.aimStart = null;
  next.player.aimCurrent = null;
  next.player.canAct = true;
  next.player.actionCooldown = 0;
  next.player.actionCooldowns = {
    body: 0,
    arrow: 0,
    spell: 0,
  };
  next.player.pitFallTimer = 0;
  next.player.pitFallPos = null;
}
