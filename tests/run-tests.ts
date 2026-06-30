function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

assert.equal = function equal<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
  }
};

assert.deepEqual = function deepEqual<T>(actual: T, expected: T) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(actual)} to deepEqual ${JSON.stringify(expected)}`);
  }
};

import { createInitialGameState, loadRoom, loadRoomDefinition, loadWorldMap, roomStateFromInstance } from '../src/game/core/roomSystem';
import { applyUpgrade, chooseUpgradeOptions } from '../src/game/core/upgrades';
import { releaseAim, setWeaponMode, startAim, tickGame } from '../src/game/core/simulation';
import { explodeBarrel, resolvePlayerEnemyHit, respawnAfterPit } from '../src/game/core/damageSystem';
import { RUN_ROOM_POOL, SAVED_LEVEL_ROOMS } from '../src/game/core/levelRooms';
import { ROOMS } from '../src/game/core/rooms';
import { BARREL_RADIUS, PIT_FALL_DURATION, PIT_FALL_LAND_HEIGHT, SPIKE_DAMAGE } from '../src/game/core/constants';
import { buildFloorTiles, isPointInsideAnyPit } from '../src/game/physics/tilePhysics';
import { DEFAULT_EDITOR_ROOM, applyEditorTool, entityAt, exportRoomDefinition, exportRoomJson, updateRoomBounds, validateEditorRoom } from '../src/game/core/roomEditor';
import { buildWorldWallObstacles, doorWorldPosition, generateProceduralWorldMap, generateVariableWorldMap, validateWorldMap, getCurrentRoom, getWorldBounds, getDoorBridges, isConnectionPassable, openConnectionBetween, oppositeSide, DOOR_WIDTH, ROOM_GAP, roomBounds, rotateRoomDefinition } from '../src/game/core/worldMap';
import { separateEnemies } from '../src/game/core/collisions';
import { buildPathGrid } from '../src/game/core/pathfinding';
import { updateEnemyAi } from '../src/game/core/enemyAi';
import type { DoorSlot, EnemyState, RoomDefinition, Vec2, WorldDoorConnection, WorldMapState, WorldRoomInstance } from '../src/game/core/types';
import type { WallObstacle } from '../src/game/core/worldMap';

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

test('body launch applies velocity and disables immediate action', () => {
  let state = createInitialGameState(0);
  state = startAim(state, { x: 0, y: 0 });
  state = { ...state, player: { ...state.player, aimCurrent: { x: -2, y: 0 } } };
  state = releaseAim(state);
  assert.equal(state.player.isAiming, false);
  assert(state.player.vel.x > 0);
  assert.equal(state.player.canAct, false);
  assert.equal(state.effects.some((effect) => effect.type === 'launch'), false);
});

test('arrow mode creates projectile instead of launching body', () => {
  let state = createInitialGameState(0);
  state = setWeaponMode(state, 'arrow');
  state = startAim(state, { x: 0, y: 0 });
  state = { ...state, player: { ...state.player, aimCurrent: { x: -2, y: 0 } } };
  state = releaseAim(state);
  assert.equal(state.projectiles.length, 1);
  assert(state.projectiles[0].vel.x > 0);
  assert.equal(state.projectiles[0].pierceRemaining, 1);
  assert(state.player.vel.x < 0);
});

test('aim can start away from the hero like a slingshot anchor', () => {
  let state = createInitialGameState(0);
  state = startAim(state, { x: 3, y: 2 });
  assert.equal(state.player.isAiming, true);
  assert.deepEqual(state.player.aimStart, { x: 3, y: 2 });
});

test('body can be relaunched while moving once cooldown ends', () => {
  let state = createInitialGameState(0);
  state.player.vel = { x: 5, y: 0 };
  state.player.canAct = false;
  state.player.actionCooldown = 0;

  state = tickGame(state, 1 / 60);
  assert(state.player.vel.x > 1);
  assert.equal(state.player.canAct, true);

  state = startAim(state, { x: 0, y: 0 });
  state = { ...state, player: { ...state.player, aimCurrent: { x: -2, y: 0 } } };
  state = releaseAim(state);
  assert(state.player.vel.x > 0);
  assert.equal(state.player.canAct, false);
});

test('weapon cooldowns are tracked per action mode', () => {
  let state = createInitialGameState(0);
  state = startAim(state, { x: 0, y: 0 });
  state = { ...state, player: { ...state.player, aimCurrent: { x: -2, y: 0 } } };
  state = releaseAim(state);
  assert.equal(state.player.canAct, false);
  assert(state.player.actionCooldowns.body > 0);

  state = setWeaponMode(state, 'arrow');
  assert.equal(state.player.canAct, true);
  assert.equal(state.player.actionCooldowns.arrow, 0);
});

test('paused state freezes simulation and input', () => {
  let state = createInitialGameState(0);
  state.player.vel = { x: 5, y: 0 };
  state.player.actionCooldowns.body = 0.2;
  state.player.actionCooldown = 0.2;
  state.isPaused = true;

  const next = tickGame(state, 1 / 30);
  assert.deepEqual(next.player.pos, state.player.pos);
  assert.equal(next.player.actionCooldown, 0.2);
  assert.equal(startAim(next, { x: 0, y: 0 }).player.isAiming, false);
});

test('projectiles can be fired while moving once cooldown ends', () => {
  let state = createInitialGameState(0);
  state = setWeaponMode(state, 'spell');
  state.player.vel = { x: 5, y: 0 };
  state.player.canAct = false;
  state.player.actionCooldown = 0;

  state = tickGame(state, 1 / 60);
  assert(state.player.vel.x > 1);
  assert.equal(state.player.canAct, true);

  state = startAim(state, { x: 0, y: 0 });
  state = { ...state, player: { ...state.player, aimCurrent: { x: -2, y: 0 } } };
  state = releaseAim(state);
  assert.equal(state.projectiles.length, 1);
  assert.equal(state.player.canAct, false);
});

test('arrows expire on room walls', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  const halfW = state.room.width / 2;
  state.projectiles = [
    {
      id: 'wall-arrow',
      type: 'arrow',
      pos: { x: halfW - 0.08, y: 0 },
      vel: { x: 8, y: 0 },
      radius: 0.18,
      damage: 1,
      life: 2,
      alive: true,
    },
  ];

  const next = tickGame(state, 1 / 30);
  assert.equal(next.projectiles.length, 0);
  assert(next.effects.some((effect) => effect.type === 'impact'), 'wall impact should create a projectile hit effect');
  const impact = next.effects.find((effect) => effect.type === 'impact')!;
  assert.equal(impact.pos.x, halfW);
});

test('arrows impact rocks instead of passing through them', () => {
  let state = createInitialGameState(0);
  state.projectiles = [
    {
      id: 'rock-arrow',
      type: 'arrow',
      pos: { x: -0.9, y: 0 },
      vel: { x: 8, y: 0 },
      radius: 0.18,
      damage: 1,
      life: 2,
      alive: true,
    },
  ];
  state.hazards = [{ id: 'test-rock', type: 'rock', pos: { x: 0, y: 0 }, width: 1, height: 1 }];

  const next = tickGame(state, 1 / 30);
  assert.equal(next.projectiles.length, 0);
  assert(next.effects.some((effect) => effect.type === 'impact'), 'rock impact should create a projectile hit effect');
  const impact = next.effects.find((effect) => effect.type === 'impact')!;
  assert.equal(impact.pos.x, -0.5);
});

test('spells still bounce off room walls', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  const halfW = state.room.width / 2;
  state.projectiles = [
    {
      id: 'wall-spell',
      type: 'spell',
      pos: { x: halfW - 0.08, y: 0 },
      vel: { x: 8, y: 0 },
      radius: 0.18,
      damage: 1,
      life: 2,
      alive: true,
    },
  ];

  const next = tickGame(state, 1 / 30);
  assert.equal(next.projectiles.length, 1);
  assert(next.projectiles[0].vel.x < 0);
  assert(next.projectiles[0].pos.x <= halfW - next.projectiles[0].radius);
  assert.equal(next.projectiles[0].bouncesRemaining, 0);
  assert(next.effects.some((effect) => effect.type === 'impact'), 'spell wall bounce should create a projectile hit effect');
  const impact = next.effects.find((effect) => effect.type === 'impact')!;
  assert.equal(impact.pos.x, halfW);
});

test('spells bounce off rocks and create a visible rock impact', () => {
  let state = createInitialGameState(0);
  state.projectiles = [
    {
      id: 'rock-spell',
      type: 'spell',
      pos: { x: -0.9, y: 0 },
      vel: { x: 8, y: 0 },
      radius: 0.18,
      damage: 1,
      life: 2,
      alive: true,
    },
  ];
  state.hazards = [{ id: 'test-spell-rock', type: 'rock', pos: { x: 0, y: 0 }, width: 1, height: 1 }];

  let next = tickGame(state, 1 / 30);
  assert.equal(next.projectiles.length, 1);
  assert(next.projectiles[0].vel.x < 0);
  assert.equal(next.projectiles[0].bouncesRemaining, 0);
  const impact = next.effects.find((effect) => effect.type === 'impact')!;
  assert.equal(impact.pos.x, -0.5);
  assert.equal(impact.height, 0.48);

  const impactCountAfterBounce = next.effects.filter((effect) => effect.type === 'impact').length;
  assert.equal(impactCountAfterBounce, 1);
  for (let frame = 0; frame < 3; frame += 1) {
    next = tickGame(next, 1 / 30);
  }
  assert.equal(next.projectiles.length, 1);
  assert(next.projectiles[0].pos.x < -0.72, 'spell should keep moving away from the rock after bouncing');
  assert.equal(next.effects.filter((effect) => effect.type === 'impact').length, impactCountAfterBounce);
});

test('spells expire after their single wall bounce is spent', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  const halfW = state.room.width / 2;
  state.projectiles = [
    {
      id: 'spent-spell',
      type: 'spell',
      pos: { x: halfW - 0.08, y: 0 },
      vel: { x: 8, y: 0 },
      radius: 0.18,
      damage: 1,
      life: 2,
      alive: true,
      bouncesRemaining: 0,
    },
  ];

  const next = tickGame(state, 1 / 30);
  assert.equal(next.projectiles.length, 0);
});

test('spells expire when they hit an enemy', () => {
  let state = createInitialGameState(0);
  const enemy = state.enemies[0];
  state.projectiles = [
    {
      id: 'enemy-spell',
      type: 'spell',
      pos: { ...enemy.pos },
      vel: { x: 8, y: 0 },
      radius: 0.18,
      damage: 1,
      life: 2,
      alive: true,
      bouncesRemaining: 1,
    },
  ];

  const next = tickGame(state, 1 / 30);
  assert.equal(next.projectiles.length, 0);
  assert(next.enemies[0].hp < enemy.hp);
});

test('arrows pierce one enemy before expiring on the next', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.hazards = [];
  state.items = [];
  state.enemies = [
    {
      id: 'pierce-a',
      type: 'dummy',
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 4,
      maxHp: 4,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
    {
      id: 'pierce-b',
      type: 'dummy',
      pos: { x: 0.9, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 4,
      maxHp: 4,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
  ];
  state.projectiles = [
    {
      id: 'piercing-arrow',
      type: 'arrow',
      pos: { x: 0, y: 0 },
      vel: { x: 8, y: 0 },
      radius: 0.18,
      damage: 1,
      life: 2,
      alive: true,
      pierceRemaining: 1,
    },
  ];

  let next = tickGame(state, 1 / 30);
  assert.equal(next.projectiles.length, 1);
  next = tickGame(next, 1 / 30);
  assert.equal(next.projectiles.length, 0);
  assert(next.enemies[0].hp < state.enemies[0].hp);
  assert(next.enemies[1].hp < state.enemies[1].hp);
});

test('fast impact damages enemy', () => {
  let state = createInitialGameState(0);
  const enemy = state.enemies[0];
  state.player.pos = { x: enemy.pos.x - 0.3, y: enemy.pos.y };
  state.player.vel = { x: 7, y: 0 };
  const next = resolvePlayerEnemyHit(state, enemy.id);
  const damaged = next.enemies.find((e) => e.id === enemy.id)!;
  assert(damaged.hp < enemy.hp);
  assert(damaged.pos.x > enemy.pos.x);
  assert((damaged.hitFlashTimer ?? 0) > 0);
  assert(next.effects.some((effect) => effect.type === 'impact'));
});

test('fast impact damages chaser even during contact cooldown', () => {
  let state = createInitialGameState(0);
  state.player.pos = { x: -0.3, y: 0 };
  state.player.vel = { x: 8, y: 0 };
  state.enemies = [
    {
      id: 'cooldown-chaser',
      type: 'chaser',
      pos: { x: 0, y: 0 },
      vel: { x: -1, y: 0 },
      radius: 0.45,
      hp: 3,
      maxHp: 3,
      alive: true,
      contactCooldown: 0.35,
      trailTimer: 0,
    },
  ];

  const next = resolvePlayerEnemyHit(state, 'cooldown-chaser');
  const damaged = next.enemies.find((enemy) => enemy.id === 'cooldown-chaser')!;
  assert(damaged.hp < 3);
  assert((damaged.hitFlashTimer ?? 0) > 0);
});

test('enemy death creates death juice and effects expire', () => {
  let state = createInitialGameState(0);
  const enemy = state.enemies[0];
  state = resolvePlayerEnemyHit({
    ...state,
    player: { ...state.player, pos: { x: enemy.pos.x - 0.3, y: enemy.pos.y }, vel: { x: 12, y: 0 } },
  }, enemy.id);
  assert(state.effects.some((effect) => effect.type === 'death'));
  state.enemies = [];

  for (let index = 0; index < 40; index += 1) {
    state = tickGame(state, 1 / 30);
  }
  assert.equal(state.effects.length, 0);
});

test('spike enemy damages player when hit from dangerous side', () => {
  let state = loadRoom(createInitialGameState(0), 2, true);
  const enemy = state.enemies.find((e) => e.type === 'spike' && e.spikeDir)!;
  state.player.pos = {
    x: enemy.pos.x + enemy.spikeDir!.x * 0.2,
    y: enemy.pos.y + enemy.spikeDir!.y * 0.2,
  };
  state.player.vel = { x: -enemy.spikeDir!.x * 7, y: -enemy.spikeDir!.y * 7 };
  const next = resolvePlayerEnemyHit(state, enemy.id);
  assert.equal(next.player.hp, state.player.hp - 1);
});

test('ground spikes shove player out when they damage', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.hp = 5;
  state.player.pos = { x: 0.1, y: 0 };
  state.player.vel = { x: 0, y: 0 };
  state.enemies = [
    {
      id: 'distant-dummy',
      type: 'dummy',
      pos: { x: 3, y: 3 },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 2,
      maxHp: 2,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
  ];
  state.items = [];
  state.hazards = [{ id: 'trap-spikes', type: 'spikes', pos: { x: 0, y: 0 }, width: 1, height: 1 }];

  const next = tickGame(state, 1 / 30);
  assert.equal(next.player.hp, 4);
  assert(next.player.pos.x > 0.5 + next.player.radius, 'player should be pushed beyond the spike edge');
  assert(next.player.vel.x > 0, 'player should receive outward velocity from ground spikes');
});

test('pit respawns player at last safe position and removes hp', () => {
  let state = createInitialGameState(0);
  state.player.hp = 4;
  state.player.pitFallActive = true;
  state.player.pitFallHeight = -2;
  state.player.pitFallVerticalVelocity = -5;
  state.player.lastSafePos = { x: -2, y: 1 };
  state.player.pos = { x: 99, y: 99 };
  const next = respawnAfterPit(state);
  assert.deepEqual(next.player.pos, { x: -2, y: 1 });
  assert.deepEqual(next.player.pitFallPos, { x: 99, y: 99 });
  assert.equal(next.player.hp, 3);
  assert.equal(next.player.pitFallActive, false);
  assert.equal(next.player.pitFallHeight, 0);
  assert.equal(next.player.pitFallVerticalVelocity, 0);
  assert.equal(next.effects.length, 0);
  assert.equal(next.player.pitFallTimer, PIT_FALL_DURATION);
  assert.equal(next.player.actionCooldown, PIT_FALL_DURATION);
});

test('pit fall visual can happen inside the pit instead of at the safe respawn point', () => {
  let state = createInitialGameState(0);
  state.player.lastSafePos = { x: -2, y: 1 };
  state.player.pos = { x: 3, y: 3 };
  const next = respawnAfterPit(state, { x: 0.5, y: -0.5 });
  assert.deepEqual(next.player.pos, { x: -2, y: 1 });
  assert.deepEqual(next.player.pitFallPos, { x: 0.5, y: -0.5 });
});

test('floor tiles leave real holes where pits exist', () => {
  const tiles = buildFloorTiles(5, 5, [{ id: 'pit-hole-test', type: 'pit', pos: { x: 0, y: 0 }, width: 1.8, height: 1.8 }]);
  assert(!tiles.some((tile) => tile.x === 0 && tile.z === 0), 'pit center should not have a solid floor tile');
  assert(tiles.some((tile) => tile.x === -2 && tile.z === -2), 'room corner should still have a floor tile');
  assert.equal(tiles.length, 24);
});

test('pit centers are not considered safe respawn ground', () => {
  const hazards = [{ id: 'pit-safe-test', type: 'pit' as const, pos: { x: 0, y: 0 }, width: 1.8, height: 1.8 }];
  assert.equal(isPointInsideAnyPit(0, 0, hazards, 5, 5, 0.2), true);
  assert.equal(isPointInsideAnyPit(-2, -2, hazards, 5, 5, 0.2), false);
});

test('entering a pit starts a downward pit fall before damage is applied', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.hp = 4;
  state.player.pos = { x: 0, y: 0 };
  state.player.vel = { x: 2, y: -1 };
  state.player.lastSafePos = { x: -2, y: 1 };
  state.hazards = [{ id: 'fall-mode-pit', type: 'pit', pos: { x: 0, y: 0 }, width: 1.8, height: 1.8 }];

  const next = tickGame(state, 1 / 60);
  assert.equal(next.player.pitFallActive, true);
  assert.equal(next.player.pitFallVerticalVelocity, 0);
  assert.equal(next.player.pitFallHeight, 0);
  assert(next.player.vel.x > 1.8);
  assert(next.player.vel.y < -0.9);
  assert.deepEqual(next.player.lastSafePos, { x: -2, y: 1 });
  assert.equal(next.player.hp, 4);
  assert.equal(next.player.canAct, false);
});

test('grazing a pit corner does not start a fall', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.pos = { x: 0.62, y: 0.62 };
  state.player.vel = { x: 0.2, y: 0.2 };
  state.player.lastSafePos = { x: -2, y: 1 };
  state.hazards = [{ id: 'corner-graze-pit', type: 'pit', pos: { x: 0, y: 0 }, width: 1, height: 1 }];

  const next = tickGame(state, 1 / 60);
  assert.equal(next.player.pitFallActive, false);
  assert.equal(next.player.hp, state.player.hp);
});

test('pit fall uses entry velocity for horizontal arc while normal core stays disabled', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.pitFallActive = true;
  state.player.pos = { x: 0.25, y: -0.25 };
  state.player.vel = { x: 4, y: 2 };
  state.player.actionCooldown = 0.7;
  state.player.actionCooldowns.body = 0.7;
  state.player.pitFallHeight = 0;
  state.player.pitFallVerticalVelocity = 0;
  state.hazards = [{ id: 'active-fall-pit', type: 'pit', pos: { x: 0.25, y: -0.25 }, width: 3, height: 3 }];

  const next = tickGame(state, 1 / 30);
  assert(next.player.pos.x > state.player.pos.x);
  assert(next.player.pos.y > state.player.pos.y);
  assert(next.player.pitFallHeight < state.player.pitFallHeight);
  assert.equal(next.player.actionCooldown, 0.7);
  assert.equal(next.player.pitFallActive, true);
});

test('fast movement can clear a one-tile pit and land on solid ground', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.hp = 4;
  state.player.pos = { x: 0, y: 0 };
  state.player.vel = { x: 4.2, y: 0 };
  state.player.lastSafePos = { x: -2, y: 1 };
  state.hazards = [{ id: 'clearable-one-tile-pit', type: 'pit', pos: { x: 0, y: 0 }, width: 1, height: 1 }];

  state = tickGame(state, 1 / 60);
  assert.equal(state.player.pitFallActive, true);
  for (let index = 0; index < 50 && state.player.pitFallActive; index += 1) {
    state = tickGame(state, 1 / 30);
  }
  assert.equal(state.player.pitFallActive, false);
  assert(state.player.pos.x > 0.5, 'player should land past the pit');
  assert.equal(state.player.hp, 4);
  assert(JSON.stringify(state.player.pos) !== JSON.stringify({ x: -2, y: 1 }), 'player should not respawn after clearing the pit');
});

test('pit fall cannot snap back to the floor after dropping past the landing height', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.hp = 4;
  state.player.pitFallActive = true;
  state.player.pos = { x: 0.48, y: 0 };
  state.player.vel = { x: 3, y: 0 };
  state.player.lastSafePos = { x: -2, y: 1 };
  state.player.pitFallHeight = PIT_FALL_LAND_HEIGHT - 0.05;
  state.player.pitFallVerticalVelocity = -1.2;
  state.hazards = [{ id: 'late-landing-pit', type: 'pit', pos: { x: 0, y: 0 }, width: 1, height: 1 }];

  state = tickGame(state, 1 / 30);
  assert.equal(state.player.pitFallActive, true);
  assert(state.player.pitFallHeight < PIT_FALL_LAND_HEIGHT);
  assert.deepEqual(state.player.pos, { x: 0.48, y: 0 });
  assert.equal(state.player.vel.x, 0);
  assert.equal(state.player.vel.y, 0);
  assert.equal(state.effects.some((effect) => effect.type === 'impact'), false);

  for (let index = 0; index < 40 && state.player.pitFallActive; index += 1) {
    state = tickGame(state, 1 / 30);
  }
  assert.equal(state.player.pitFallActive, false);
  assert.deepEqual(state.player.pos, { x: -2, y: 1 });
  assert.equal(state.player.hp, 3);
});

test('pit fall eventually respawns to last safe position', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.hp = 4;
  state.player.pos = { x: 0, y: 0 };
  state.player.vel = { x: 3, y: 0 };
  state.player.lastSafePos = { x: -2, y: 1 };
  state.hazards = [{ id: 'fall-respawn-pit', type: 'pit', pos: { x: 0, y: 0 }, width: 7, height: 2 }];

  state = tickGame(state, 1 / 60);
  assert.equal(state.player.pitFallActive, true);
  for (let index = 0; index < 40 && state.player.pitFallActive; index += 1) {
    state = tickGame(state, 1 / 30);
  }
  assert.equal(state.player.pitFallActive, false);
  assert.deepEqual(state.player.pos, { x: -2, y: 1 });
  assert.equal(state.player.hp, 3);
});

test('barrel explosion damages enemies in radius and marks barrel', () => {
  let state = createInitialGameState(0);
  const barrel = state.hazards.find((h) => h.type === 'barrel')!;
  const enemy = state.enemies[0];
  state.enemies[0] = { ...enemy, pos: { ...barrel.pos }, hp: 3, maxHp: 3 };
  const next = explodeBarrel(state, barrel.id);
  assert.equal(next.hazards.find((h) => h.id === barrel.id)!.exploded, true);
  assert(next.enemies[0].hp < 3 || !next.enemies[0].alive);
});

test('enemies trigger barrels when they actually touch them', () => {
  let state = createInitialGameState(0);
  state.player.pos = { x: -3, y: -3 };
  state.player.vel = { x: 0, y: 0 };
  state.enemies = [
    {
      id: 'barrel-touch-dummy',
      type: 'dummy',
      pos: { x: 0.3, y: 0 },
      vel: { x: -0.5, y: 0 },
      radius: 0.45,
      hp: 2,
      maxHp: 2,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
  ];
  state.hazards = [{ id: 'safe-barrel', type: 'barrel', pos: { x: 0, y: 0 }, radius: 0.42 }];

  const next = tickGame(state, 1 / 30);
  assert.equal(next.hazards[0].exploded, true);
});

test('boost zones increase speed without changing trajectory', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.pos = { x: 0, y: 0 };
  state.player.vel = { x: 3, y: 1 };
  state.hazards = [{ id: 'boost-test', type: 'boost', pos: { x: 0, y: 0 }, width: 2, height: 2, dir: { x: 0, y: 1 } }];
  state.enemies = [
    {
      id: 'boost-room-keeper',
      type: 'dummy',
      pos: { x: 2.5, y: 2.5 },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 2,
      maxHp: 2,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
  ];

  const beforeAngle = Math.atan2(state.player.vel.y, state.player.vel.x);
  const beforeSpeed = Math.hypot(state.player.vel.x, state.player.vel.y);
  const next = tickGame(state, 1 / 30);
  const afterAngle = Math.atan2(next.player.vel.y, next.player.vel.x);
  const afterSpeed = Math.hypot(next.player.vel.x, next.player.vel.y);
  assert(afterSpeed > beforeSpeed);
  assert(Math.abs(afterAngle - beforeAngle) < 0.0001);
});

test('chaser steers around pits instead of running straight through them', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.pos = { x: 2.4, y: 0 };
  state.player.isAiming = true;
  state.enemies = [
    {
      id: 'pit-avoid-chaser',
      type: 'chaser',
      pos: { x: -2.4, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 3,
      maxHp: 3,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
  ];
  state.hazards = [{ id: 'test-pit', type: 'pit', pos: { x: 0, y: 0 }, width: 2, height: 2 }];

  const next = tickGame(state, 1 / 60);
  assert(next.enemies[0].vel.x > 0);
  assert(Math.abs(next.enemies[0].vel.y) > 0.25);
});

test('chaser pressure damages player when it stays close', () => {
  let state = createInitialGameState(0);
  state.player.pos = { x: 0, y: 0 };
  state.player.vel = { x: 0, y: 0 };
  state.enemies = [
    {
      id: 'pressure-chaser',
      type: 'chaser',
      pos: { x: 0.95, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 3,
      maxHp: 3,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
  ];
  state.hazards = [];

  const next = tickGame(state, 1 / 30);
  assert.equal(next.player.hp, state.player.hp - 1);
  assert(next.effects.some((effect) => effect.type === 'damage'));
});

test('dummy contact damages player on weak collision', () => {
  let state = createInitialGameState(0);
  state.player.pos = { x: 0, y: 0 };
  state.player.vel = { x: 0, y: 0 };
  state.enemies = [
    {
      id: 'contact-dummy',
      type: 'dummy',
      pos: { x: 0.45, y: 0 },
      vel: { x: -0.4, y: 0 },
      radius: 0.45,
      hp: 2,
      maxHp: 2,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
  ];
  state.hazards = [];

  const next = tickGame(state, 1 / 30);
  assert.equal(next.player.hp, state.player.hp - 1);
  assert(next.effects.some((effect) => effect.type === 'damage'));
});

test('chaser keeps moving even when player is far away', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.pos = { x: 10, y: 10 };
  state.player.isAiming = false;
  state.enemies = [
    {
      id: 'route-chaser',
      type: 'chaser',
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 3,
      maxHp: 3,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
  ];
  state.hazards = [];

  const next = tickGame(state, 1 / 60);
  assert(Math.hypot(next.enemies[0].vel.x, next.enemies[0].vel.y) > 0.5);
});

test('chaser pathfinding steers around barrels and ground spikes', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.pos = { x: 2.6, y: 0 };
  state.enemies = [
    {
      id: 'obstacle-avoid-chaser',
      type: 'chaser',
      pos: { x: -2.6, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 3,
      maxHp: 3,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
  ];
  state.hazards = [
    { id: 'test-barrel', type: 'barrel', pos: { x: -0.45, y: 0 }, radius: 0.42 },
    { id: 'test-spikes', type: 'spikes', pos: { x: 0.55, y: 0 }, width: 1.0, height: 1.2 },
  ];

  const next = tickGame(state, 1 / 60);
  assert(next.enemies[0].vel.x > 0);
  assert(Math.abs(next.enemies[0].vel.y) > 0.2);
});

test('shooter alternates chase and hostile cone shot', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  state.player.pos = { x: 1.8, y: 0 };
  state.enemies = [
    {
      id: 'test-shooter',
      type: 'shooter',
      pos: { x: -1.8, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 0.46,
      hp: 3,
      maxHp: 3,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
  ];
  state.hazards = [];

  for (let index = 0; index < 31; index += 1) {
    state = tickGame(state, 1 / 30);
  }

  assert.equal(state.enemies[0].shooterState, 'charging');
  assert.equal(state.projectiles.length, 1);
  assert.equal(state.projectiles[0].hostile, true);
  assert(state.projectiles[0].vel.x > 0);
});

test('basic enemies have ambient movement', () => {
  let state = createInitialGameState(0);
  const dummy = state.enemies.find((enemy) => enemy.type === 'dummy')!;
  const before = { ...dummy.pos };

  state = tickGame(state, 1 / 30);
  const moved = state.enemies.find((enemy) => enemy.id === dummy.id)!;
  assert(distForTest(before, moved.pos) > 0.005);
});

test('coin pickup rises above player without camera shake', () => {
  let state = createInitialGameState(0);
  state.player.pos = { x: 0, y: 0 };
  state.player.vel = { x: 0, y: 0 };
  state.enemies = [];
  state.hazards = [];
  state.items = [{ id: 'coin-effect-test', type: 'coin', pos: { x: 0, y: 0 }, radius: 0.32, collected: false }];

  const next = tickGame(state, 1 / 30);
  const pickup = next.effects.find((effect) => effect.type === 'pickup');
  assert(pickup);
  assert.equal(pickup!.shake, 0);
  assert(pickup!.height > next.player.radius);
});

test('patrolling enemies turn back instead of pressing into room walls', () => {
  let state = loadRoom(createInitialGameState(0), 0);
  const rightEdge = state.room.width / 2 - 0.45;
  state.player.pos = { x: -20, y: -20 };
  state.enemies = [
    {
      id: 'wall-patrol-dummy',
      type: 'dummy',
      pos: { x: rightEdge, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 2,
      maxHp: 2,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
      patrolAnchor: { x: rightEdge, y: 0 },
      patrolTarget: { x: rightEdge + 2, y: 0 },
      patrolAxis: { x: 1, y: 0 },
      patrolRange: 2,
    },
  ];
  state.hazards = [];

  state = tickGame(state, 1 / 30);
  assert(state.enemies[0].vel.x < 0, 'patrol should turn inward at the wall');
});

test('chooses three distinct upgrade options', () => {
  const state = createInitialGameState(0);
  const choices = chooseUpgradeOptions(state);
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices).size, 3);
});

function distForTest(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function roomById(map: WorldMapState, roomId: string): WorldRoomInstance {
  const room = map.rooms.find((candidate) => candidate.id === roomId);
  if (!room) throw new Error(`Missing room ${roomId}`);
  return room;
}

function slotForRoom(connection: WorldDoorConnection, roomId: string): DoorSlot {
  if (connection.aRoomId === roomId) return connection.aSlot;
  if (connection.bRoomId === roomId) return connection.bSlot;
  throw new Error(`Connection ${connection.id} does not include ${roomId}`);
}

function otherRoomForConnection(connection: WorldDoorConnection, roomId: string): string {
  if (connection.aRoomId === roomId) return connection.bRoomId;
  if (connection.bRoomId === roomId) return connection.aRoomId;
  throw new Error(`Connection ${connection.id} does not include ${roomId}`);
}

function insideDoorPosition(room: WorldRoomInstance, slot: DoorSlot, distance: number): Vec2 {
  const door = doorWorldPosition(room, slot);
  if (slot.side === 'north') return { x: door.x, y: door.y + distance };
  if (slot.side === 'south') return { x: door.x, y: door.y - distance };
  if (slot.side === 'east') return { x: door.x - distance, y: door.y };
  return { x: door.x + distance, y: door.y };
}

function outwardVelocity(side: DoorSlot['side'], speed: number): Vec2 {
  if (side === 'north') return { x: 0, y: -speed };
  if (side === 'south') return { x: 0, y: speed };
  if (side === 'east') return { x: speed, y: 0 };
  return { x: -speed, y: 0 };
}

function playerStayedInsideDoor(pos: Vec2, room: WorldRoomInstance, slot: DoorSlot): boolean {
  const bounds = roomBounds(room);
  if (slot.side === 'north') return pos.y >= bounds.minY;
  if (slot.side === 'south') return pos.y <= bounds.maxY;
  if (slot.side === 'east') return pos.x <= bounds.maxX;
  return pos.x >= bounds.minX;
}

function reachableRoomIds(map: WorldMapState, startRoomId: string): Set<string> {
  const seen = new Set<string>([startRoomId]);
  const queue = [startRoomId];
  while (queue.length > 0) {
    const roomId = queue.shift()!;
    for (const connection of map.connections) {
      if (connection.aRoomId !== roomId && connection.bRoomId !== roomId) continue;
      const nextRoomId = otherRoomForConnection(connection, roomId);
      if (seen.has(nextRoomId)) continue;
      seen.add(nextRoomId);
      queue.push(nextRoomId);
    }
  }
  return seen;
}

test('max_hp upgrade increases max hp and heals', () => {
  let state = createInitialGameState(0);
  state.player.hp = 3;
  const next = applyUpgrade(state, 'max_hp');
  assert.equal(next.player.maxHp, 6);
  assert.equal(next.player.hp, 4);
});

test('room clears when all enemies are dead and opens upgrade phase before final room', () => {
  let state = createInitialGameState(0);
  state.enemies = state.enemies.map((enemy) => ({ ...enemy, alive: false, hp: 0 }));
  let next = tickGame(state, 1 / 60);
  assert.equal(next.phase, 'playing');
  assert.equal(next.room.cleared, true);
  assert(next.roomClearRewardTimer > 0);
  assert.equal(next.upgradeChoices.length, 3);

  for (let index = 0; index < 40; index += 1) {
    next = tickGame(next, 1 / 30);
  }
  assert.equal(next.phase, 'choosing-upgrade');
});

test('choosing an upgrade after clearing a room restores input in the cleared room', () => {
  let state = createInitialGameState(0);
  const activeRoomId = state.currentRoomInstanceId;
  state.enemies = state.enemies.map((enemy) => (
    enemy.roomInstanceId === activeRoomId ? { ...enemy, alive: false, hp: 0 } : enemy
  ));
  state = tickGame(state, 1 / 60);
  for (let index = 0; index < 40; index += 1) {
    state = tickGame(state, 1 / 30);
  }
  assert.equal(state.phase, 'choosing-upgrade');

  state = applyUpgrade(state, state.upgradeChoices[0]);
  state.phase = 'playing';
  state.roomClearRewardTimer = 0;
  state.player.canAct = true;
  state = tickGame(state, 1 / 30);

  assert.equal(state.player.canAct, true);
  const aiming = startAim(state, { ...state.player.pos });
  assert.equal(aiming.player.isAiming, true);
});

test('procedural map creates connected start, key and boss rooms without overlaps', () => {
  const map = generateProceduralWorldMap(ROOMS, 123);
  assert.equal(map.rooms.length, 6);
  assert(map.rooms.some((room) => room.id === map.startRoomId && room.tags.includes('start')));
  assert(map.rooms.some((room) => room.id === map.keyRoomId && room.tags.includes('key')));
  assert(map.rooms.some((room) => room.id === map.bossRoomId && room.tags.includes('boss')));
  assert.equal(reachableRoomIds(map, map.startRoomId).size, map.rooms.length);

  for (let aIndex = 0; aIndex < map.rooms.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < map.rooms.length; bIndex += 1) {
      const a = roomBounds(map.rooms[aIndex]);
      const b = roomBounds(map.rooms[bIndex]);
      const separated = a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY;
      assert(separated, `${map.rooms[aIndex].id} should not overlap ${map.rooms[bIndex].id}`);
    }
  }
});

test('procedural doors respect wall limits, spacing and opposite-side alignment', () => {
  const map = generateProceduralWorldMap(ROOMS, 456);
  for (const room of map.rooms) {
    for (const side of ['north', 'south', 'east', 'west'] as const) {
      const slots = room.doorSlots.filter((slot) => slot.side === side);
      assert(slots.length <= 2, `${room.id} ${side} should have at most two doors`);
      if (slots.length === 2) {
        assert(Math.abs(slots[0].offset - slots[1].offset) >= 2, `${room.id} ${side} doors should not be adjacent`);
      }
    }
  }

  for (const connection of map.connections) {
    assert.equal(connection.bSlot.side, oppositeSide(connection.aSlot.side));
    const aRoom = roomById(map, connection.aRoomId);
    const bRoom = roomById(map, connection.bRoomId);
    const aDoor = doorWorldPosition(aRoom, connection.aSlot);
    const bDoor = doorWorldPosition(bRoom, connection.bSlot);
    // Rooms are separated by ROOM_GAP, so the two door edges line up on the
    // shared axis and sit one wall-gap apart on the perpendicular axis.
    const horizontalConnection = connection.aSlot.side === 'east' || connection.aSlot.side === 'west';
    if (horizontalConnection) {
      assert(Math.abs(aDoor.y - bDoor.y) < 0.001, `${connection.id} door y should align`);
      assert(Math.abs(Math.abs(aDoor.x - bDoor.x) - ROOM_GAP) < 0.001, `${connection.id} doors should be one wall-gap apart`);
    } else {
      assert(Math.abs(aDoor.x - bDoor.x) < 0.001, `${connection.id} door x should align`);
      assert(Math.abs(Math.abs(aDoor.y - bDoor.y) - ROOM_GAP) < 0.001, `${connection.id} doors should be one wall-gap apart`);
    }
  }
});

test('closed procedural door blocks the player and open door lets the player enter the connected room', () => {
  let state = createInitialGameState(0);
  const worldMap = state.worldMap!;
  const startRoom = roomById(worldMap, worldMap.startRoomId);
  const connection = worldMap.connections.find((candidate) => candidate.aRoomId === startRoom.id || candidate.bRoomId === startRoom.id)!;
  const slot = slotForRoom(connection, startRoom.id);
  const otherRoomId = otherRoomForConnection(connection, startRoom.id);

  state.player.pos = insideDoorPosition(startRoom, slot, state.player.radius + 0.03);
  state.player.vel = outwardVelocity(slot.side, 9);
  let next = tickGame(state, 1 / 10);
  assert.equal(next.currentRoomInstanceId, startRoom.id);
  assert(playerStayedInsideDoor(next.player.pos, startRoom, slot), 'closed door should keep player inside the room');

  next.worldMap = openConnectionBetween(next.worldMap!, startRoom.id, otherRoomId);
  next.player.pos = insideDoorPosition(startRoom, slot, state.player.radius + 0.03);
  next.player.vel = outwardVelocity(slot.side, 10);
  for (let index = 0; index < 12 && next.currentRoomInstanceId !== otherRoomId; index += 1) {
    next = tickGame(next, 1 / 30);
  }
  assert.equal(next.currentRoomInstanceId, otherRoomId);
});

test('boss connection remains blocked until the player physically unlocks it', () => {
  // The boss door now requires player contact (collision) to open — not just
  // picking up the key. isConnectionPassable checks connection.unlocked, not hasKey.
  const state = createInitialGameState(0);
  const worldMap = state.worldMap!;
  const bossConnection = worldMap.connections.find((connection) => connection.requiresKey)!;

  // Open the room connection (enemies cleared) but not yet unlocked by player contact.
  const openMap: WorldMapState = {
    ...worldMap,
    connections: worldMap.connections.map((connection) => (
      connection.id === bossConnection.id ? { ...connection, open: true } : connection
    )),
  };
  const openBossConnection = openMap.connections.find((connection) => connection.id === bossConnection.id)!;

  // Without unlocked flag the barrier is still present regardless of hasKey.
  assert.equal(isConnectionPassable(openBossConnection), false);
  assert(buildWorldWallObstacles(openMap, false).some((obstacle) => obstacle.connectionId === bossConnection.id));
  assert(buildWorldWallObstacles(openMap, true).some((obstacle) => obstacle.connectionId === bossConnection.id));

  // Once the player collides with it (unlocked = true), the barrier disappears.
  const unlockedMap: WorldMapState = {
    ...openMap,
    connections: openMap.connections.map((connection) => (
      connection.id === bossConnection.id ? { ...connection, unlocked: true } : connection
    )),
  };
  const unlockedBossConnection = unlockedMap.connections.find((connection) => connection.id === bossConnection.id)!;
  assert.equal(isConnectionPassable(unlockedBossConnection), true);
  assert.equal(buildWorldWallObstacles(unlockedMap, true).some((obstacle) => obstacle.connectionId === bossConnection.id), false);
});

test('key item is placed in the key room and collecting it persists hasKey', () => {
  let state = createInitialGameState(0);
  const keyItem = state.items.find((item) => item.type === 'key')!;
  assert(keyItem);
  assert.equal(keyItem.roomInstanceId, state.worldMap!.keyRoomId);

  const keyRoom = roomById(state.worldMap!, state.worldMap!.keyRoomId);
  state.currentRoomInstanceId = keyRoom.id;
  state.room = roomStateFromInstance(keyRoom);
  state.player.pos = { ...keyItem.pos };
  state.player.vel = { x: 0, y: 0 };

  state = tickGame(state, 1 / 60);
  assert.equal(state.hasKey, true);
  assert.equal(state.items.find((item) => item.id === keyItem.id)!.collected, true);
});

test('procedural run starts in a stable room without falling or dying on idle', () => {
  let state = createInitialGameState(0);
  assert.equal(state.currentRoomInstanceId, state.worldMap!.startRoomId);
  assert.equal(state.player.pitFallActive, false);
  for (let index = 0; index < 90; index += 1) {
    state = tickGame(state, 1 / 30);
  }
  assert.equal(state.phase, 'playing');
  assert.equal(state.player.pitFallActive, false);
  assert(state.player.hp > 0);
});

test('there are five handcrafted rooms for the MVP loop', () => {
  assert.equal(ROOMS.length, 5);
});

test('saved editor JSON rooms are available to the procedural room pool', () => {
  assert(SAVED_LEVEL_ROOMS.length >= 1);
  for (const room of SAVED_LEVEL_ROOMS) {
    assert(RUN_ROOM_POOL.some((candidate) => candidate.id === room.id));
  }
});

test('handcrafted rooms start the player from the bottom side', () => {
  for (const room of ROOMS) {
    assert(room.playerStart.y > 0, `${room.id} player should start near the bottom side`);
    assert.equal(Number.isInteger(room.playerStart.x), true);
    assert.equal(Number.isInteger(room.playerStart.y), true);
  }
});

test('handcrafted rooms are portrait-oriented and keep contents in bounds', () => {
  for (const room of ROOMS) {
    assert(room.height > room.width, `${room.id} should be taller than wide`);
    assert.equal(Number.isInteger(room.width), true);
    assert.equal(Number.isInteger(room.height), true);
    assert.equal(room.width % 2, 1);
    assert.equal(room.height % 2, 1);
    for (const enemy of room.enemies) {
      assert.equal(Number.isInteger(enemy.pos.x), true);
      assert.equal(Number.isInteger(enemy.pos.y), true);
      assert(Math.abs(enemy.pos.x) + enemy.radius <= room.width / 2, `${enemy.id} outside room width`);
      assert(Math.abs(enemy.pos.y) + enemy.radius <= room.height / 2, `${enemy.id} outside room height`);
    }
    for (const hazard of room.hazards) {
      const halfWidth = hazard.radius ?? (hazard.width ?? 0) / 2;
      const halfHeight = hazard.radius ?? (hazard.height ?? 0) / 2;
      assert.equal(Number.isInteger(hazard.pos.x), true);
      assert.equal(Number.isInteger(hazard.pos.y), true);
      if (hazard.radius === undefined) {
        assert.equal(hazard.width, 1);
        assert.equal(hazard.height, 1);
      }
      assert(Math.abs(hazard.pos.x) + halfWidth <= room.width / 2, `${hazard.id} outside room width`);
      assert(Math.abs(hazard.pos.y) + halfHeight <= room.height / 2, `${hazard.id} outside room height`);
    }
    for (const item of room.items) {
      assert.equal(Number.isInteger(item.pos.x), true);
      assert.equal(Number.isInteger(item.pos.y), true);
      assert(Math.abs(item.pos.x) + item.radius <= room.width / 2, `${item.id} outside room width`);
      assert(Math.abs(item.pos.y) + item.radius <= room.height / 2, `${item.id} outside room height`);
    }
  }
});

test('room editor keeps dimensions odd and at least five tiles', () => {
  const room = updateRoomBounds(DEFAULT_EDITOR_ROOM, 8, 4);
  assert.equal(room.width, 9);
  assert.equal(room.height, 5);
});

test('room editor places, moves and erases tile entities', () => {
  let room: RoomDefinition = { ...DEFAULT_EDITOR_ROOM, enemies: [], hazards: [], items: [] };
  let result = applyEditorTool(room, 'enemy:chaser', { x: 1.2, y: -2.4 }, null);
  room = result.room;
  assert.equal(room.enemies.length, 1);
  assert.deepEqual(room.enemies[0].pos, { x: 1, y: -2 });
  assert.equal(result.selected?.kind, 'enemy');

  result = applyEditorTool(room, 'select', { x: 3, y: 3 }, result.selected);
  room = result.room;
  assert.deepEqual(room.enemies[0].pos, { x: 3, y: 3 });

  result = applyEditorTool(room, 'erase', { x: 3, y: 3 }, result.selected);
  assert.equal(result.room.enemies.length, 0);
});

test('room editor adds and moves patrol target for patrolling enemies', () => {
  let room: RoomDefinition = { ...DEFAULT_EDITOR_ROOM, enemies: [], hazards: [], items: [] };
  let result = applyEditorTool(room, 'enemy:dummy', { x: 1, y: -2 }, null);
  room = result.room;
  assert.deepEqual(room.enemies[0].patrolTarget, { x: 2, y: -2 });
  assert.deepEqual(entityAt(room, { x: 2, y: -2 }), { kind: 'patrolTarget', id: room.enemies[0].id });

  result = applyEditorTool(room, 'select', { x: 2, y: -2 }, null);
  result = applyEditorTool(result.room, 'select', { x: 1, y: 1 }, result.selected);
  assert.deepEqual(result.room.enemies[0].patrolTarget, { x: 1, y: 1 });
});

test('room loader respects handcrafted patrol target', () => {
  const base = createInitialGameState(0);
  const room: RoomDefinition = {
    id: 'patrol-test',
    name: 'Patrol test',
    width: 9,
    height: 13,
    playerStart: { x: 0, y: 5 },
    enemies: [
      { id: 'patrol-dummy', type: 'dummy', pos: { x: 0, y: -2 }, radius: 0.42, hp: 2, maxHp: 2, patrolTarget: { x: 3, y: -2 } },
    ],
    hazards: [],
    items: [],
  };
  const loaded = loadRoomDefinition(base, room, 0, true);
  assert.deepEqual(loaded.enemies[0].patrolAnchor, { x: 0, y: -2 });
  assert.deepEqual(loaded.enemies[0].patrolTarget, { x: 3, y: -2 });
  assert.deepEqual(loaded.enemies[0].patrolAxis, { x: 1, y: 0 });
  assert.equal(loaded.enemies[0].patrolRange, 3);
});

test('editor patrol moves between enemy start and patrol target', () => {
  let state = loadRoomDefinition(createInitialGameState(0), {
    id: 'patrol-endpoint-test',
    name: 'Patrol endpoint test',
    width: 9,
    height: 13,
    playerStart: { x: 0, y: 5 },
    enemies: [
      { id: 'endpoint-spike', type: 'spike', pos: { x: -2, y: -4 }, radius: 0.52, hp: 3, maxHp: 3, patrolTarget: { x: 2, y: -4 }, spikeDir: { x: 1, y: 0 } },
    ],
    hazards: [],
    items: [],
  }, 0, true);
  state.enemies[0].pos = { x: 2, y: -4 };
  state.player.pos = { x: 0, y: 5 };

  const next = tickGame(state, 1 / 30);

  assert.deepEqual(next.enemies[0].patrolTarget, { x: -2, y: -4 });
  assert(next.enemies[0].vel.x < 0, 'spike should return to its initial patrol point');
});

test('spike and trail patrol without chasing nearby player', () => {
  let state = loadRoomDefinition(createInitialGameState(0), {
    id: 'no-chase-patrol-test',
    name: 'No chase patrol test',
    width: 9,
    height: 13,
    playerStart: { x: 0, y: 5 },
    enemies: [
      { id: 'no-chase-spike', type: 'spike', pos: { x: -2, y: -4 }, radius: 0.52, hp: 3, maxHp: 3, patrolTarget: { x: 2, y: -4 }, spikeDir: { x: 1, y: 0 } },
      { id: 'no-chase-trail', type: 'trail', pos: { x: 2, y: 1 }, radius: 0.46, hp: 3, maxHp: 3, patrolTarget: { x: -2, y: 1 } },
    ],
    hazards: [],
    items: [],
  }, 0, true);
  state.player.pos = { x: -2, y: -2.8 };

  const next = tickGame(state, 1 / 30);
  const spike = next.enemies.find((enemy) => enemy.id === 'no-chase-spike')!;
  const trail = next.enemies.find((enemy) => enemy.id === 'no-chase-trail')!;

  assert(spike.vel.x > 0, 'spike should keep patrolling toward its patrol target');
  assert(Math.abs(spike.vel.y) < 0.01, 'spike should not turn toward the nearby player');
  assert(trail.vel.x < 0, 'trail should keep patrolling toward its patrol target');
  assert(Math.abs(trail.vel.y) < 0.01, 'trail should not turn toward the nearby player');
});

test('room editor validates blocked player start', () => {
  let room: RoomDefinition = { ...DEFAULT_EDITOR_ROOM, hazards: [], enemies: [], items: [] };
  room = applyEditorTool(room, 'hazard:pit', room.playerStart, null).room;
  const errors = validateEditorRoom(room);
  assert(errors.some((error) => error.includes('inicio del jugador')));
});

test('room editor exports a pasteable room definition', () => {
  const output = exportRoomDefinition(DEFAULT_EDITOR_ROOM);
  assert(output.includes("id: 'room-draft'"));
  assert(output.includes("playerStart: { x: 0, y: 5 }"));
  assert(output.includes("type: 'dummy'"));
  assert(output.includes('patrolTarget'));
  assert(JSON.parse(exportRoomJson(DEFAULT_EDITOR_ROOM)).id === 'room-draft');
});

test('barrel explosion damages enemy in a different room that is within radius (no room gate)', () => {
  // Build a minimal state with a barrel and an enemy in a different room, but within BARREL_RADIUS
  let state = createInitialGameState(0);
  const barrelRoomId = 'room-a';
  const enemyRoomId = 'room-b';
  state.hazards = [{
    id: 'cross-room-barrel',
    type: 'barrel',
    pos: { x: 0, y: 0 },
    radius: 0.42,
    roomInstanceId: barrelRoomId,
  }];
  state.enemies = [{
    id: 'cross-room-enemy',
    type: 'dummy',
    pos: { x: BARREL_RADIUS - 0.5, y: 0 }, // within BARREL_RADIUS + enemy.radius
    vel: { x: 0, y: 0 },
    radius: 0.45,
    hp: 3,
    maxHp: 3,
    alive: true,
    contactCooldown: 0,
    trailTimer: 0,
    roomInstanceId: enemyRoomId,
  }];
  state.player.pos = { x: 99, y: 99 }; // far away

  const next = explodeBarrel(state, 'cross-room-barrel');
  const enemy = next.enemies.find((e) => e.id === 'cross-room-enemy')!;
  assert(enemy.hp < 3 || !enemy.alive, 'enemy in a different room within radius should take barrel damage');
});

test('floor spikes damage an enemy overlapping them with cooldown (not every frame)', () => {
  let state = createInitialGameState(0);
  state.hazards = [{ id: 'test-spikes', type: 'spikes', pos: { x: 0, y: 0 }, width: 2, height: 2 }];
  state.enemies = [{
    id: 'spike-victim',
    type: 'dummy',
    pos: { x: 0, y: 0 }, // directly on spikes
    vel: { x: 0, y: 0 },
    radius: 0.45,
    hp: 5,
    maxHp: 5,
    alive: true,
    contactCooldown: 0,
    trailTimer: 0,
  }];
  state.player.pos = { x: 99, y: 99 };
  state.items = [];

  // First tick: enemy should take SPIKE_DAMAGE
  const next1 = tickGame(state, 1 / 30);
  const enemy1 = next1.enemies.find((e) => e.id === 'spike-victim')!;
  assert(enemy1.alive, 'enemy should survive one spike hit');
  assert(enemy1.hp === 5 - SPIKE_DAMAGE, `enemy hp should drop by SPIKE_DAMAGE (${SPIKE_DAMAGE}), got ${enemy1.hp}`);
  assert(enemy1.contactCooldown > 0, 'spike cooldown should be set after damage');

  // Second tick immediately: cooldown still active, no additional damage
  const next2 = tickGame(next1, 1 / 30);
  const enemy2 = next2.enemies.find((e) => e.id === 'spike-victim')!;
  assert(enemy2.hp === enemy1.hp, 'second tick should not deal more spike damage while cooldown active');
});

test('two overlapping enemies get separated to at least sum of radii', () => {
  let state = createInitialGameState(0);
  // Place two enemies at the exact same position (overlapping)
  state.enemies = [
    {
      id: 'sep-a',
      type: 'dummy',
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 2,
      maxHp: 2,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
    {
      id: 'sep-b',
      type: 'dummy',
      pos: { x: 0.1, y: 0 }, // overlapping: 0.1 < 0.45 + 0.45 = 0.90
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 2,
      maxHp: 2,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
    },
  ];
  state.hazards = [];
  state.items = [];

  const next = separateEnemies(state);
  const a = next.enemies.find((e) => e.id === 'sep-a')!;
  const b = next.enemies.find((e) => e.id === 'sep-b')!;
  const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
  assert(d >= a.radius + b.radius - 0.001, `enemies should be separated to at least sum of radii, got dist=${d}`);
  // Neither should be outside the room bounds (state.room is centered at origin, default size)
  const halfW = state.room.width / 2;
  const halfH = state.room.height / 2;
  assert(Math.abs(a.pos.x) <= halfW && Math.abs(a.pos.y) <= halfH, 'enemy A should stay in room');
  assert(Math.abs(b.pos.x) <= halfW && Math.abs(b.pos.y) <= halfH, 'enemy B should stay in room');
});

test('coin in a different room than currentRoomInstanceId is still collected (no room gate)', () => {
  let state = createInitialGameState(0);
  const differentRoomId = 'some-other-room-id';
  state.enemies = [];
  state.hazards = [];
  state.items = [{
    id: 'cross-room-coin',
    type: 'coin',
    pos: { x: 0, y: 0 },
    radius: 0.32,
    collected: false,
    roomInstanceId: differentRoomId,
  }];
  state.player.pos = { x: 0, y: 0 };
  state.player.vel = { x: 0, y: 0 };
  // currentRoomInstanceId differs from the coin's roomInstanceId
  assert(state.currentRoomInstanceId !== differentRoomId, 'sanity check: rooms differ');

  const next = tickGame(state, 1 / 30);
  const coin = next.items.find((item) => item.id === 'cross-room-coin')!;
  assert(coin.collected, 'coin in a different room should still be collected when player overlaps it');
  assert(next.coins === state.coins + 1, 'coin count should increase');
});

test('regression: enemy on far side of a closed wall cannot damage player through it', () => {
  // Use the world map: position player near a closed door, enemy just past it.
  // The closed wall geometry should prevent the enemy from reaching the player.
  let state = createInitialGameState(0);
  const worldMap = state.worldMap!;
  const startRoom = worldMap.rooms.find((r) => r.id === worldMap.startRoomId)!;
  const connection = worldMap.connections.find((c) => c.aRoomId === startRoom.id || c.bRoomId === startRoom.id)!;
  const slot = connection.aRoomId === startRoom.id ? connection.aSlot : connection.bSlot;
  const otherRoomId = connection.aRoomId === startRoom.id ? connection.bRoomId : connection.aRoomId;
  const otherRoom = worldMap.rooms.find((r) => r.id === otherRoomId)!;

  // Place player just inside the door on the start-room side
  const doorPos = (() => {
    const { minX, maxX, minY, maxY } = roomBounds(startRoom);
    if (slot.side === 'north') return { x: minX + (maxX - minX) / 2, y: minY + state.player.radius + 0.1 };
    if (slot.side === 'south') return { x: minX + (maxX - minX) / 2, y: maxY - state.player.radius - 0.1 };
    if (slot.side === 'east') return { x: maxX - state.player.radius - 0.1, y: minY + (maxY - minY) / 2 };
    return { x: minX + state.player.radius + 0.1, y: minY + (maxY - minY) / 2 };
  })();

  // Place chaser enemy just past the closed door (in adjacent room), right at the boundary
  const enemyPos = (() => {
    const { minX, maxX, minY, maxY } = roomBounds(otherRoom);
    if (slot.side === 'north') return { x: minX + (maxX - minX) / 2, y: maxY - 0.5 };
    if (slot.side === 'south') return { x: minX + (maxX - minX) / 2, y: minY + 0.5 };
    if (slot.side === 'east') return { x: minX + 0.5, y: minY + (maxY - minY) / 2 };
    return { x: maxX - 0.5, y: minY + (maxY - minY) / 2 };
  })();

  state.player.pos = doorPos;
  state.player.vel = { x: 0, y: 0 };
  state.player.invulnerableTimer = 0;
  const initialHp = state.player.hp;

  state.enemies = [{
    id: 'wall-chaser',
    type: 'chaser',
    pos: enemyPos,
    vel: { x: 0, y: 0 },
    radius: 0.45,
    hp: 3,
    maxHp: 3,
    alive: true,
    contactCooldown: 0,
    trailTimer: 0,
    roomInstanceId: otherRoomId,
  }];
  state.hazards = [];
  state.items = [];

  // Run a few frames; closed wall should block both the enemy and any cross-wall pressure
  for (let i = 0; i < 5; i++) {
    state = tickGame(state, 1 / 30);
  }
  assert(state.player.hp === initialHp, 'player should not take damage from enemy on far side of closed wall');
});

// ===== Fase D tests =====

test('buildPathGrid for a specific non-active room uses that room bounds and marks its rocks as blocked', () => {
  // Use a procedural world map. Pick any non-start room that is a combat room.
  const state = createInitialGameState(0);
  const worldMap = state.worldMap!;
  // Pick the first room that is NOT the active room
  const inactiveRoom = worldMap.rooms.find((r) => r.id !== state.currentRoomInstanceId)!;
  assert(inactiveRoom, 'need at least two rooms');

  // Build a grid for that specific room (no rock; just verify bounds)
  const grid = buildPathGrid(state, inactiveRoom);
  const bounds = roomBounds(inactiveRoom);
  const expectedCols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / 1));
  const expectedRows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / 1));
  assert.equal(grid.cols, expectedCols);
  assert.equal(grid.rows, expectedRows);
  assert.equal(grid.roomId, inactiveRoom.id);
  // bounds should match
  assert(Math.abs(grid.bounds.minX - bounds.minX) < 0.001, 'grid minX should match room minX');
  assert(Math.abs(grid.bounds.maxY - bounds.maxY) < 0.001, 'grid maxY should match room maxY');

  // Now place a rock at the room center; the grid for that room should block it
  const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  state.hazards = [{
    id: `${inactiveRoom.id}-rock`,
    type: 'rock',
    pos: center,
    width: 1,
    height: 1,
    roomInstanceId: inactiveRoom.id,
  }];
  const gridWithRock = buildPathGrid(state, inactiveRoom);
  // The cell containing the rock center should be blocked
  assert(gridWithRock.blocked.size > 0, 'grid should have at least one blocked cell from the rock');
});

test('inactive-room chaser always has non-zero velocity (minimal patrol, never frozen)', () => {
  const state = createInitialGameState(0);
  const worldMap = state.worldMap!;
  const inactiveRoom = worldMap.rooms.find((r) => r.id !== state.currentRoomInstanceId)!;
  assert(inactiveRoom, 'need at least two rooms');

  const bounds = roomBounds(inactiveRoom);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const homePos: Vec2 = { x: centerX, y: centerY };

  state.enemies = [{
    id: 'inactive-chaser',
    type: 'chaser',
    pos: { x: centerX, y: centerY },
    vel: { x: 0, y: 0 },
    radius: 0.45,
    hp: 3,
    maxHp: 3,
    alive: true,
    contactCooldown: 0,
    trailTimer: 0,
    homePos: { ...homePos },
    roomInstanceId: inactiveRoom.id,
  } as EnemyState];
  state.hazards = [];
  state.items = [];

  // With the new patrol behavior, inactive chasers always do a minimal patrol
  // around their spawn anchor — they must never be frozen (zero velocity).
  const next = updateEnemyAi(state, 1 / 30);
  const chaser = next.enemies.find((e) => e.id === 'inactive-chaser')!;
  const speed = Math.hypot(chaser.vel.x, chaser.vel.y);
  assert(speed > 0, `inactive chaser should be patrolling (speed=${speed})`);
});

test('inactive-room chaser routes around a rock between it and homePos', () => {
  const state = createInitialGameState(0);
  const worldMap = state.worldMap!;
  const inactiveRoom = worldMap.rooms.find((r) => r.id !== state.currentRoomInstanceId)!;
  assert(inactiveRoom, 'need at least two rooms');

  const bounds = roomBounds(inactiveRoom);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  // homePos at center; enemy 4 units to the left; rock exactly in between
  const homePos: Vec2 = { x: centerX, y: centerY };
  const enemyPos: Vec2 = { x: centerX - 4, y: centerY };
  const rockPos: Vec2 = { x: centerX - 2, y: centerY }; // on the straight line

  state.enemies = [{
    id: 'rock-avoid-chaser',
    type: 'chaser',
    pos: { ...enemyPos },
    vel: { x: 0, y: 0 },
    radius: 0.45,
    hp: 3,
    maxHp: 3,
    alive: true,
    contactCooldown: 0,
    trailTimer: 0,
    homePos: { ...homePos },
    roomInstanceId: inactiveRoom.id,
  } as EnemyState];
  state.hazards = [{
    id: 'blocking-rock',
    type: 'rock',
    pos: rockPos,
    width: 1,
    height: 1,
    roomInstanceId: inactiveRoom.id,
  }];
  state.items = [];

  // Run several ticks and assert the chaser never overlaps the rock
  let s = state;
  for (let i = 0; i < 30; i += 1) {
    s = updateEnemyAi(s, 1 / 30) as typeof s;
    // Integrate position manually since we only call updateEnemyAi
    s.enemies = s.enemies.map((e) => e.id === 'rock-avoid-chaser'
      ? { ...e, pos: { x: e.pos.x + e.vel.x / 30, y: e.pos.y + e.vel.y / 30 } }
      : e);
    const chaser = s.enemies.find((e) => e.id === 'rock-avoid-chaser')!;
    const d = distForTest(chaser.pos, rockPos);
    assert(d >= 0.45 - 0.05, `chaser should not enter the rock (dist=${d.toFixed(3)}) at tick ${i}`);
  }
});

test('inactive-room chaser and shooter both have non-zero velocity (never frozen)', () => {
  const state = createInitialGameState(0);
  const worldMap = state.worldMap!;
  const inactiveRoom = worldMap.rooms.find((r) => r.id !== state.currentRoomInstanceId)!;
  assert(inactiveRoom, 'need at least two rooms');

  const bounds = roomBounds(inactiveRoom);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  state.enemies = [
    {
      id: 'inactive-patrol-chaser',
      type: 'chaser',
      pos: { x: centerX, y: centerY },
      vel: { x: 0, y: 0 },
      radius: 0.45,
      hp: 3,
      maxHp: 3,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
      homePos: { x: centerX, y: centerY },
      roomInstanceId: inactiveRoom.id,
    } as EnemyState,
    {
      id: 'inactive-patrol-shooter',
      type: 'shooter',
      pos: { x: centerX + 1, y: centerY },
      vel: { x: 0, y: 0 },
      radius: 0.46,
      hp: 3,
      maxHp: 3,
      alive: true,
      contactCooldown: 0,
      trailTimer: 0,
      homePos: { x: centerX + 1, y: centerY },
      roomInstanceId: inactiveRoom.id,
    } as EnemyState,
  ];
  state.hazards = [];
  state.items = [];

  const next = updateEnemyAi(state, 1 / 30);
  const chaser = next.enemies.find((e) => e.id === 'inactive-patrol-chaser')!;
  const shooter = next.enemies.find((e) => e.id === 'inactive-patrol-shooter')!;
  const chaserSpeed = Math.hypot(chaser.vel.x, chaser.vel.y);
  const shooterSpeed = Math.hypot(shooter.vel.x, shooter.vel.y);
  assert(chaserSpeed > 0, `inactive chaser should be patrolling (speed=${chaserSpeed})`);
  assert(shooterSpeed > 0, `inactive shooter should be patrolling (speed=${shooterSpeed})`);
  // Inactive shooter must not have fired any projectiles at the player
  assert(next.projectiles.length === 0, 'inactive shooter must not fire while player is in another room');
});

test('inactive-room trail enemy keeps dropping trails while player is elsewhere', () => {
  const state = createInitialGameState(0);
  const worldMap = state.worldMap!;
  const inactiveRoom = worldMap.rooms.find((r) => r.id !== state.currentRoomInstanceId)!;
  assert(inactiveRoom, 'need at least two rooms');

  const bounds = roomBounds(inactiveRoom);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  state.enemies = [{
    id: 'inactive-trail',
    type: 'trail',
    pos: { x: centerX, y: centerY },
    vel: { x: 0, y: 0 },
    radius: 0.46,
    hp: 3,
    maxHp: 3,
    alive: true,
    contactCooldown: 0,
    trailTimer: 0.01, // nearly expired so it drops on first tick
    homePos: { x: centerX, y: centerY },
    roomInstanceId: inactiveRoom.id,
  } as EnemyState];
  state.trails = [];
  state.hazards = [];
  state.items = [];

  // First tick: trailTimer hits 0 → trail drops
  const next = updateEnemyAi(state, 1 / 30);
  assert(next.trails.length > 0, 'inactive trail enemy should drop a trail segment while inactive');
  assert(next.trails[0].life > 0, 'dropped trail should have positive life');
  assert(next.trails[0].damage > 0, 'dropped trail should have non-zero damage');
  // Also assert movement — the trail enemy must not be frozen
  const trail = next.enemies.find((e) => e.id === 'inactive-trail')!;
  const speed = Math.hypot(trail.vel.x, trail.vel.y);
  assert(speed > 0, `inactive trail enemy should be patrolling (speed=${speed})`);
});

test('active-room chaser still chases the player (Fase D regression)', () => {
  const state = createInitialGameState(0);
  const worldMap = state.worldMap!;
  const activeRoom = worldMap.rooms.find((r) => r.id === state.currentRoomInstanceId)!;
  const bounds = roomBounds(activeRoom);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  // Player at center, chaser to its left — in the same active room
  state.player.pos = { x: centerX, y: centerY };
  state.player.vel = { x: 0, y: 0 };
  state.enemies = [{
    id: 'active-chaser',
    type: 'chaser',
    pos: { x: centerX - 3, y: centerY },
    vel: { x: 0, y: 0 },
    radius: 0.45,
    hp: 3,
    maxHp: 3,
    alive: true,
    contactCooldown: 0,
    trailTimer: 0,
    homePos: { x: centerX - 3, y: centerY },
    roomInstanceId: activeRoom.id,
  } as EnemyState];
  state.hazards = [];
  state.items = [];

  const next = updateEnemyAi(state, 1 / 30);
  const chaser = next.enemies.find((e) => e.id === 'active-chaser')!;
  // Should move toward player (positive x direction)
  assert(chaser.vel.x > 0, `active-room chaser should chase player to the right, got vel.x=${chaser.vel.x}`);
});

// ===== rotateRoomDefinition tests (Fase 1 NON_SQUARE_SCENARIOS) =====

// Shared fixture: a rich room with off-centre entities, directions, a rect hazard
// (boost with dir), a spike enemy (spikeDir), an item, and a non-centred doorSlot.
const ROTATE_TEST_ROOM: RoomDefinition = {
  id: 'rotate-test',
  name: 'Rotate test',
  width: 9,
  height: 13,
  playerStart: { x: 2, y: 4 },
  doorSlots: [
    { side: 'north', offset: 2 },  // non-centred
    { side: 'east',  offset: -1 },
  ],
  enemies: [
    {
      id: 'spike-e',
      type: 'spike',
      pos: { x: 1, y: -3 },
      radius: 0.52,
      hp: 3,
      maxHp: 3,
      spikeDir: { x: 1, y: 0 },
      patrolTarget:  { x: -1, y: -3 },
      patrolAnchor:  { x:  1, y: -3 },
      patrolAxis:    { x: 1, y: 0 },
      patrolRange: 2,
    },
    {
      id: 'dummy-e',
      type: 'dummy',
      pos: { x: -2, y: 2 },
      radius: 0.45,
      hp: 2,
      maxHp: 2,
    },
  ],
  hazards: [
    { id: 'boost-h', type: 'boost', pos: { x: 0, y: -1 }, width: 2, height: 4, dir: { x: 0, y: -1 } },
    { id: 'barrel-h', type: 'barrel', pos: { x: -3, y: 1 }, radius: 0.42 },
  ],
  items: [
    { id: 'coin-i', type: 'coin', pos: { x: 3, y: 2 }, radius: 0.32, collected: false },
  ],
};

test('rotateRoomDefinition: round-trip 90+270 equals original', () => {
  const r90  = rotateRoomDefinition(ROTATE_TEST_ROOM, 90);
  const back = rotateRoomDefinition(r90, 270);
  assert.deepEqual(back, ROTATE_TEST_ROOM);
});

test('rotateRoomDefinition: round-trip 180+180 equals original', () => {
  const r180 = rotateRoomDefinition(ROTATE_TEST_ROOM, 180);
  const back  = rotateRoomDefinition(r180, 180);
  assert.deepEqual(back, ROTATE_TEST_ROOM);
});

test('rotateRoomDefinition: four 90-degree rotations equal identity', () => {
  let r: RoomDefinition = ROTATE_TEST_ROOM;
  for (let i = 0; i < 4; i += 1) r = rotateRoomDefinition(r, 90);
  assert.deepEqual(r, ROTATE_TEST_ROOM);
});

test('rotateRoomDefinition: dimension swap on 90 and 270, unchanged on 0 and 180', () => {
  const r90  = rotateRoomDefinition(ROTATE_TEST_ROOM, 90);
  const r180 = rotateRoomDefinition(ROTATE_TEST_ROOM, 180);
  const r270 = rotateRoomDefinition(ROTATE_TEST_ROOM, 270);
  const r0   = rotateRoomDefinition(ROTATE_TEST_ROOM, 0);
  assert.equal(r90.width,   ROTATE_TEST_ROOM.height);
  assert.equal(r90.height,  ROTATE_TEST_ROOM.width);
  assert.equal(r270.width,  ROTATE_TEST_ROOM.height);
  assert.equal(r270.height, ROTATE_TEST_ROOM.width);
  assert.equal(r180.width,  ROTATE_TEST_ROOM.width);
  assert.equal(r180.height, ROTATE_TEST_ROOM.height);
  assert.equal(r0.width,    ROTATE_TEST_ROOM.width);
  assert.equal(r0.height,   ROTATE_TEST_ROOM.height);
});

test('rotateRoomDefinition: all points contained within local bounds after 90 rotation', () => {
  const rotated = rotateRoomDefinition(ROTATE_TEST_ROOM, 90);
  const hw = rotated.width  / 2;
  const hh = rotated.height / 2;
  const TOL = 1e-6;

  function assertInBounds(p: Vec2, label: string) {
    assert(p.x >= -hw - TOL && p.x <= hw + TOL, `${label} x=${p.x} outside [-${hw}, ${hw}]`);
    assert(p.y >= -hh - TOL && p.y <= hh + TOL, `${label} y=${p.y} outside [-${hh}, ${hh}]`);
  }

  assertInBounds(rotated.playerStart, 'playerStart');
  for (const e of rotated.enemies)  assertInBounds(e.pos, `enemy ${e.id}`);
  for (const h of rotated.hazards)  assertInBounds(h.pos, `hazard ${h.id}`);
  for (const i of rotated.items)    assertInBounds(i.pos, `item ${i.id}`);

  // Verify rect hazard (boost) got its width/height swapped
  const boost = rotated.hazards.find((h) => h.id === 'boost-h')!;
  assert.equal(boost.width,  4); // was height=4
  assert.equal(boost.height, 2); // was width=2
});

test('rotateRoomDefinition: door slot north offset=2 maps to correct side after 90 and 270', () => {
  // Original: north slot at offset=2. Local point: (2, -hh_old) = (2, -6.5).
  //
  // CCW 90°:  (-y, x) → (6.5, 2).  New dims: w'=13, h'=9, hw'=6.5.
  //   x'=6.5 = +hw' → east side, offset = y' = 2.
  const r90 = rotateRoomDefinition(ROTATE_TEST_ROOM, 90);
  const northSlot90 = r90.doorSlots?.find((s) => Math.abs(s.offset - 2) < 1e-6 && (s.side === 'east' || s.side === 'west'));
  assert(northSlot90, 'north slot with offset 2 should appear on east or west after 90° rotation');
  assert.equal(northSlot90!.side, 'east');
  assert.equal(northSlot90!.offset, 2);

  // CCW 270°: (y, -x) → (-6.5, -2). New dims: w'=13, h'=9, hw'=6.5.
  //   x'=-6.5 = -hw' → west side, offset = y' = -2.
  const r270 = rotateRoomDefinition(ROTATE_TEST_ROOM, 270);
  const northSlot270 = r270.doorSlots?.find((s) => Math.abs(Math.abs(s.offset) - 2) < 1e-6 && (s.side === 'east' || s.side === 'west'));
  assert(northSlot270, 'north slot with offset 2 should appear on east or west after 270° rotation');
  assert.equal(northSlot270!.side, 'west');
  assert.equal(northSlot270!.offset, -2);

  // Geometric consistency for 90°: east slot with offset=2 → local point = (hw'=6.5, 2).
  const hw90 = r90.width / 2;
  const hh90 = r90.height / 2;
  const geomPt: Vec2 = { x: hw90, y: northSlot90!.offset }; // east side formula
  assert(Math.abs(geomPt.x - hw90) < 1e-6);
  assert(Math.abs(geomPt.y - 2) < 1e-6);
  // Point is inside the new room bounds
  assert(Math.abs(geomPt.x) <= hw90 + 1e-6 && Math.abs(geomPt.y) <= hh90 + 1e-6);
});

test('rotateRoomDefinition: does not mutate the input room', () => {
  const frozen = JSON.parse(JSON.stringify(ROTATE_TEST_ROOM)) as RoomDefinition;
  rotateRoomDefinition(ROTATE_TEST_ROOM, 90);
  rotateRoomDefinition(ROTATE_TEST_ROOM, 180);
  rotateRoomDefinition(ROTATE_TEST_ROOM, 270);
  assert.deepEqual(ROTATE_TEST_ROOM, frozen);
});

// ===== end rotateRoomDefinition tests =====

// ===== wall geometry safety-net (Fase 4 NON_SQUARE_SCENARIOS) =====

/**
 * Returns the overlap area of two AABBs. Contacts that are merely tangent (both
 * axes overlap by ≤ GEOM_TOL) are treated as non-overlapping (area === 0).
 */
const GEOM_TOL = 1e-3;

function aabbOverlapArea(a: WallObstacle, b: WallObstacle): number {
  const ax0 = a.pos.x - a.width  / 2;
  const ax1 = a.pos.x + a.width  / 2;
  const ay0 = a.pos.y - a.height / 2;
  const ay1 = a.pos.y + a.height / 2;
  const bx0 = b.pos.x - b.width  / 2;
  const bx1 = b.pos.x + b.width  / 2;
  const by0 = b.pos.y - b.height / 2;
  const by1 = b.pos.y + b.height / 2;
  const overlapX = Math.min(ax1, bx1) - Math.max(ax0, bx0);
  const overlapY = Math.min(ay1, by1) - Math.max(ay0, by0);
  if (overlapX <= GEOM_TOL || overlapY <= GEOM_TOL) return 0;
  return overlapX * overlapY;
}

/**
 * Iterates a callback over seeds 1..40, each with a freshly-generated map.
 */
function forEachSeed(fn: (map: WorldMapState, seed: number) => void): void {
  for (let seed = 1; seed <= 40; seed += 1) {
    fn(generateProceduralWorldMap(ROOMS, seed), seed);
  }
}

test('wall geometry: no two PARALLEL line walls overlap (no doubled walls)', () => {
  // Forbids same-orientation overlap (a real doubled / irregular-thickness wall).
  // Cross-orientation overlap is a legitimate T/L corner crossing and is allowed —
  // the uniform grid never produces either, but variable layouts (flag on) produce
  // corner crossings by construction. Parallel doubled walls must stay at zero.
  forEachSeed((map, seed) => {
    const lineWalls = buildWorldWallObstacles(map, false).filter((o) => o.connectionId === undefined);
    const isH = (w: WallObstacle) => w.width > w.height;
    for (let i = 0; i < lineWalls.length; i += 1) {
      for (let j = i + 1; j < lineWalls.length; j += 1) {
        if (isH(lineWalls[i]) !== isH(lineWalls[j])) continue; // perpendicular corner: allowed
        const area = aabbOverlapArea(lineWalls[i], lineWalls[j]);
        assert(
          area <= 0,
          `seed=${seed}: parallel line walls "${lineWalls[i].id}" and "${lineWalls[j].id}" overlap with area=${area.toFixed(6)}`,
        );
      }
    }
  });
});

test('wall geometry: every passable connection has a bridge and a gap in the line walls', () => {
  forEachSeed((map, seed) => {
    // Open every connection so we always have passable connections to check.
    let openMap = map;
    for (const conn of map.connections) {
      if (!conn.open) {
        openMap = openConnectionBetween(openMap, conn.aRoomId, conn.bRoomId);
      }
    }
    // Also mark them unlocked so isConnectionPassable returns true.
    openMap = {
      ...openMap,
      connections: openMap.connections.map((c) => ({ ...c, unlocked: true })),
    };

    const lineWalls = buildWorldWallObstacles(openMap, true).filter((o) => o.connectionId === undefined);
    const bridges = getDoorBridges(openMap);

    for (const conn of openMap.connections) {
      assert(isConnectionPassable(conn), `seed=${seed}: connection ${conn.id} should be passable after forced open+unlock`);

      // 1. There must be exactly one bridge for this connection.
      const matchingBridges = bridges.filter((b) => b.id === `bridge-${conn.id}`);
      assert(
        matchingBridges.length === 1,
        `seed=${seed}: connection "${conn.id}" should have exactly one bridge, got ${matchingBridges.length}`,
      );

      // 2. Bridge centre must coincide (within tolerance) with the door world position.
      const aRoom = map.rooms.find((r) => r.id === conn.aRoomId)!;
      const doorPos = doorWorldPosition(aRoom, conn.aSlot);
      const bridge = matchingBridges[0];
      const horizontal = conn.aSlot.side === 'east' || conn.aSlot.side === 'west';
      if (horizontal) {
        assert(
          Math.abs(bridge.pos.y - doorPos.y) < GEOM_TOL,
          `seed=${seed}: bridge "${bridge.id}" y=${bridge.pos.y} should equal door y=${doorPos.y}`,
        );
      } else {
        assert(
          Math.abs(bridge.pos.x - doorPos.x) < GEOM_TOL,
          `seed=${seed}: bridge "${bridge.id}" x=${bridge.pos.x} should equal door x=${doorPos.x}`,
        );
      }

      // 3. No line wall should cover the door centre point.
      const px = doorPos.x;
      const py = doorPos.y;
      for (const wall of lineWalls) {
        const wx0 = wall.pos.x - wall.width  / 2;
        const wx1 = wall.pos.x + wall.width  / 2;
        const wy0 = wall.pos.y - wall.height / 2;
        const wy1 = wall.pos.y + wall.height / 2;
        // Point strictly inside (using GEOM_TOL shrink so touching edges are ok).
        const insideX = px > wx0 + GEOM_TOL && px < wx1 - GEOM_TOL;
        const insideY = py > wy0 + GEOM_TOL && py < wy1 - GEOM_TOL;
        assert(
          !(insideX && insideY),
          `seed=${seed}: door midpoint (${px.toFixed(3)}, ${py.toFixed(3)}) of connection "${conn.id}" is covered by line wall "${wall.id}"`,
        );
      }
    }
  });
});

test('wall geometry: every non-passable connection has exactly one door barrier covering its door midpoint', () => {
  forEachSeed((map, seed) => {
    const allObstacles = buildWorldWallObstacles(map, false);
    const barriers = allObstacles.filter((o) => o.connectionId !== undefined);

    for (const conn of map.connections) {
      if (isConnectionPassable(conn)) continue;

      // Must have exactly one barrier for this connection.
      const forConn = barriers.filter((b) => b.connectionId === conn.id);
      assert(
        forConn.length === 1,
        `seed=${seed}: connection "${conn.id}" should have exactly one door barrier, got ${forConn.length}`,
      );

      const barrier = forConn[0];

      // Barrier must cover the door midpoint.
      const aRoom = map.rooms.find((r) => r.id === conn.aRoomId)!;
      const doorPos = doorWorldPosition(aRoom, conn.aSlot);
      const bx0 = barrier.pos.x - barrier.width  / 2 - GEOM_TOL;
      const bx1 = barrier.pos.x + barrier.width  / 2 + GEOM_TOL;
      const by0 = barrier.pos.y - barrier.height / 2 - GEOM_TOL;
      const by1 = barrier.pos.y + barrier.height / 2 + GEOM_TOL;
      assert(
        doorPos.x >= bx0 && doorPos.x <= bx1 && doorPos.y >= by0 && doorPos.y <= by1,
        `seed=${seed}: barrier for "${conn.id}" at (${barrier.pos.x.toFixed(3)}, ${barrier.pos.y.toFixed(3)}) does not cover door midpoint (${doorPos.x.toFixed(3)}, ${doorPos.y.toFixed(3)})`,
      );
    }

    // Boss connection barrier must carry requiresKey === true.
    const bossConn = map.connections.find((c) => c.requiresKey);
    if (bossConn && !isConnectionPassable(bossConn)) {
      const bossBarrier = barriers.find((b) => b.connectionId === bossConn.id);
      assert(
        bossBarrier !== undefined,
        `seed=${seed}: boss connection "${bossConn.id}" should have a barrier`,
      );
      assert(
        bossBarrier!.requiresKey === true,
        `seed=${seed}: boss door barrier for "${bossConn.id}" must carry requiresKey=true`,
      );
    }
  });
});

// ===== end wall geometry safety-net (Fase 4 NON_SQUARE_SCENARIOS) =====

// ===== Fase 2a: rotation plumbing in loadWorldMap =====

test('loadWorldMap rotation=90 shifts hazard positions compared to rotation=0', () => {
  // Use room-01 which has a barrel at local { x: 0.2, y: -1.6 }.
  // With rotation=90 CCW: rotatePoint({x:0.2, y:-1.6}, 90) = {x: 1.6, y: 0.2}.
  const sourceDef = ROOMS.find((r) => r.id === 'room-01')!;
  assert(sourceDef, 'room-01 must exist in ROOMS');
  const barrel0 = sourceDef.hazards.find((h) => h.id === 'r1-barrel-a')!;
  assert(barrel0, 'r1-barrel-a must exist in room-01');

  // Build a minimal WorldMapState with a single instance using room-01 at origin.
  const baseMap = generateProceduralWorldMap(ROOMS, 42);
  // Find the instance whose roomId matches room-01 (or just patch the first room).
  const baseInstance = baseMap.rooms[0];

  // Map without rotation (or rotation=0): baseline.
  const mapRot0: import('../src/game/core/types').WorldMapState = {
    ...baseMap,
    rooms: baseMap.rooms.map((inst, i) => i === 0 ? { ...inst, rotation: 0 as const } : inst),
    startRoomId: baseInstance.id,
  };
  const stateRot0 = loadWorldMap(createInitialGameState(0), mapRot0, false);

  // Map with rotation=90 on the first instance (width/height swapped to stay coherent).
  const mapRot90: import('../src/game/core/types').WorldMapState = {
    ...baseMap,
    rooms: baseMap.rooms.map((inst, i) => i === 0
      ? { ...inst, rotation: 90 as const, width: baseInstance.height, height: baseInstance.width }
      : inst),
    startRoomId: baseInstance.id,
  };
  const stateRot90 = loadWorldMap(createInitialGameState(0), mapRot90, false);

  // Pick a barrel from the first instance in both states (the one with prefix `${baseInstance.id}-r1-barrel-a`).
  // Since we are patching the first room's instance but its roomId might not be room-01, we look
  // for any hazard that ends with '-r1-barrel-a' (the offsetRoomDefinition prefixes with `${instance.id}-`).
  const barrelId = `${baseInstance.id}-r1-barrel-a`;

  const barrel_rot0  = stateRot0.hazards.find((h) => h.id === barrelId);
  const barrel_rot90 = stateRot90.hazards.find((h) => h.id === barrelId);

  // The barrel must exist in both (it comes from the source room, which has r1-barrel-a only if
  // the first instance's roomId is room-01; otherwise we just verify the positions differ).
  // Verify that some hazard positions differ between the two rotations.
  const allPos0   = stateRot0.hazards.filter((h) => h.id.startsWith(baseInstance.id)).map((h) => h.pos);
  const allPos90  = stateRot90.hazards.filter((h) => h.id.startsWith(baseInstance.id)).map((h) => h.pos);

  // There must be at least one hazard from that instance that changed position.
  const anyChanged = allPos0.some((pos0, idx) => {
    const pos90 = allPos90[idx];
    return pos90 && (Math.abs(pos0.x - pos90.x) > 0.001 || Math.abs(pos0.y - pos90.y) > 0.001);
  });
  assert(anyChanged, 'hazard positions in the rotated instance should differ from the unrotated version');

  // If the first instance happens to use room-01, verify the barrel position specifically.
  if (barrel_rot0 && barrel_rot90) {
    // rotation=90 CCW: rotatePoint(local, 90) = {x: -local.y, y: local.x}
    // local barrel = { x: 0.2, y: -1.6 } → rotated = { x: 1.6, y: 0.2 }
    const expectedLocal90 = { x: -barrel0.pos.y, y: barrel0.pos.x };
    const expectedWorld90 = { x: expectedLocal90.x + baseInstance.offset.x, y: expectedLocal90.y + baseInstance.offset.y };
    assert(
      Math.abs(barrel_rot90.pos.x - expectedWorld90.x) < 0.001 &&
      Math.abs(barrel_rot90.pos.y - expectedWorld90.y) < 0.001,
      `barrel_rot90 pos should be (${expectedWorld90.x}, ${expectedWorld90.y}) but got (${barrel_rot90.pos.x}, ${barrel_rot90.pos.y})`,
    );
  }
});

test('loadWorldMap rotation=0 produces identical positions to no-rotation field (non-regression)', () => {
  // With rotation=0, result must be identical to not having the field at all.
  // Start from a rotation-stripped baseline so the property (0 ≡ absent) holds
  // (a variable map already carries rotations; strip them to test rotation=0 ≡ absent).
  const generated = generateProceduralWorldMap(ROOMS, 77);
  const baseMap: import('../src/game/core/types').WorldMapState = {
    ...generated,
    rooms: generated.rooms.map(({ rotation: _drop, ...inst }) => inst),
  };

  const mapNoRotation: import('../src/game/core/types').WorldMapState = { ...baseMap };
  const mapRot0: import('../src/game/core/types').WorldMapState = {
    ...baseMap,
    rooms: baseMap.rooms.map((inst) => ({ ...inst, rotation: 0 as const })),
  };

  const stateNoRot = loadWorldMap(createInitialGameState(0), mapNoRotation, true);
  const stateRot0  = loadWorldMap(createInitialGameState(0), mapRot0, true);

  // Hazard positions, enemy positions and player start must all be equal.
  assert.deepEqual(
    stateNoRot.hazards.map((h) => ({ id: h.id, pos: h.pos })),
    stateRot0.hazards.map((h) => ({ id: h.id, pos: h.pos })),
  );
  assert.deepEqual(
    stateNoRot.enemies.map((e) => ({ id: e.id, pos: e.pos })),
    stateRot0.enemies.map((e) => ({ id: e.id, pos: e.pos })),
  );
  assert.deepEqual(stateNoRot.player.pos, stateRot0.player.pos);
});

// ===== end Fase 2a rotation plumbing =====

// ===== variable layout (Fase 2) =====

test('generateProceduralWorldMap always returns a valid dispatched map', () => {
  // The dispatcher always attempts the variable layout (with rotations) and
  // falls back to the uniform grid if none of the derived seeds validate.
  // Either path must produce a map that passes validateWorldMap.
  for (let seed = 1; seed <= 20; seed += 1) {
    const map = generateProceduralWorldMap(ROOMS, seed);
    assert(validateWorldMap(map), `seed=${seed}: dispatched map must pass validateWorldMap`);
  }
});

test('generateVariableWorldMap produces valid maps across 40 seeds', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const map = generateVariableWorldMap(ROOMS, seed);
    if (!map) continue; // null → fallback path in dispatcher, OK
    assert(
      validateWorldMap(map),
      `seed=${seed}: generateVariableWorldMap produced a map that fails validateWorldMap`,
    );
    // Additional geometry invariants (reuse existing helpers).
    // No-overlap check.
    for (let ai = 0; ai < map.rooms.length; ai += 1) {
      for (let bi = ai + 1; bi < map.rooms.length; bi += 1) {
        const a = roomBounds(map.rooms[ai]);
        const b = roomBounds(map.rooms[bi]);
        const separated = a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY;
        // Allow touching (gap = 0) but not actual overlap.
        const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        assert(
          !(overlapX > 1e-6 && overlapY > 1e-6),
          `seed=${seed}: ${map.rooms[ai].id} overlaps ${map.rooms[bi].id}`,
        );
      }
    }
    // No doubled walls: same-orientation line walls must not overlap in area.
    // Cross-orientation overlaps (corner/T-junctions) are allowed.
    const openMap = {
      ...map,
      connections: map.connections.map((c) => ({ ...c, open: true, unlocked: true })),
    };
    const lineWalls = buildWorldWallObstacles(openMap, true).filter((w) => w.connectionId === undefined);
    for (let wi = 0; wi < lineWalls.length; wi += 1) {
      const wa = lineWalls[wi];
      const waHorizontal = wa.width > wa.height;
      for (let wj = wi + 1; wj < lineWalls.length; wj += 1) {
        const wb = lineWalls[wj];
        const wbHorizontal = wb.width > wb.height;
        if (waHorizontal !== wbHorizontal) continue; // cross-orientation corner, allowed
        const ox = Math.min(wa.pos.x + wa.width / 2, wb.pos.x + wb.width / 2)
                 - Math.max(wa.pos.x - wa.width / 2, wb.pos.x - wb.width / 2);
        const oy = Math.min(wa.pos.y + wa.height / 2, wb.pos.y + wb.height / 2)
                 - Math.max(wa.pos.y - wa.height / 2, wb.pos.y - wb.height / 2);
        assert(
          !(ox > 1e-3 && oy > 1e-3),
          `seed=${seed}: doubled parallel walls: "${wa.id}" & "${wb.id}"`,
        );
      }
    }
    // BFS connectivity.
    const seen = new Set<string>([map.startRoomId]);
    const q = [map.startRoomId];
    while (q.length > 0) {
      const id = q.shift()!;
      for (const conn of map.connections) {
        const next = conn.aRoomId === id ? conn.bRoomId : conn.bRoomId === id ? conn.aRoomId : null;
        if (next && !seen.has(next)) { seen.add(next); q.push(next); }
      }
    }
    assert(seen.size === map.rooms.length, `seed=${seed}: BFS did not reach all rooms`);
    // Boss is accessible only via key-locked connections (all boss connections requiresKey).
    const bossConns = map.connections.filter((c) => c.aRoomId === map.bossRoomId || c.bRoomId === map.bossRoomId);
    assert(bossConns.length >= 1, `seed=${seed}: boss should have at least 1 connection`);
    assert(bossConns.every((c) => c.requiresKey), `seed=${seed}: all boss connections must requiresKey`);
    // Key reachable without boss door.
    const keyReachable = new Set<string>([map.startRoomId]);
    const kq = [map.startRoomId];
    while (kq.length > 0) {
      const id = kq.shift()!;
      for (const conn of map.connections) {
        if (conn.requiresKey) continue;
        const next = conn.aRoomId === id ? conn.bRoomId : conn.bRoomId === id ? conn.aRoomId : null;
        if (next && !keyReachable.has(next)) { keyReachable.add(next); kq.push(next); }
      }
    }
    assert(keyReachable.has(map.keyRoomId), `seed=${seed}: key room not reachable without boss door`);
  }
});

test('generateVariableWorldMap produces variable-size layouts for at least 12 of 40 seeds', () => {
  let variableCount = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const map = generateVariableWorldMap(ROOMS, seed);
    if (!map) continue;
    if (!validateWorldMap(map)) continue;
    const widths = map.rooms.map((r) => r.width);
    const heights = map.rooms.map((r) => r.height);
    const uniform = widths.every((w) => w === widths[0]) && heights.every((h) => h === heights[0]);
    if (!uniform) variableCount += 1;
  }
  assert(
    variableCount >= 12,
    `Expected ≥ 12 seeds with non-uniform room sizes, got ${variableCount}`,
  );
});

test('generateProceduralWorldMap fallback always produces a valid map', () => {
  // The uniform-grid fallback is the safe path when no variable seed validates.
  // Both paths (variable and uniform fallback) must pass validateWorldMap.
  for (let seed = 1; seed <= 20; seed += 1) {
    const map = generateProceduralWorldMap(ROOMS, seed);
    assert(
      validateWorldMap(map),
      `seed=${seed}: generateProceduralWorldMap returned an invalid map (uniform fallback must always validate)`,
    );
  }
});

test('runtime smoke: full simulation runs on variable/rotated maps without escaping or throwing', () => {
  // Drives the whole tick (AI, per-room pathfinding on rotated dims, collisions,
  // hazards, all weapon modes) across several variable maps. The player is teleported
  // into every room (so active AI/pathfinding runs even in 90°/270° rooms) and fires
  // periodic launches. Asserts: no exception, no NaN, player stays inside world bounds,
  // and live enemies stay contained in their own room. Guards future AI/collision changes.
  const base = createInitialGameState(0);
  const modes = ['body', 'arrow', 'spell'] as const;
  for (let seed = 1; seed <= 8; seed += 1) {
    const map = generateProceduralWorldMap(RUN_ROOM_POOL, seed);
    let st = loadWorldMap(base, map, true);
    const wb = getWorldBounds(map);
    const minX = wb.center.x - wb.width / 2 - 1, maxX = wb.center.x + wb.width / 2 + 1;
    const minY = wb.center.y - wb.height / 2 - 1, maxY = wb.center.y + wb.height / 2 + 1;
    let modeIdx = 0;
    for (let ri = 0; ri < map.rooms.length; ri += 1) {
      const rb = roomBounds(map.rooms[ri]);
      st.player.pos = { x: (rb.minX + rb.maxX) / 2, y: (rb.minY + rb.maxY) / 2 };
      st.player.vel = { x: 0, y: 0 };
      st.player.canAct = true;
      st.player.actionCooldown = 0;
      st.player.actionCooldowns = { body: 0, arrow: 0, spell: 0 };
      for (let f = 0; f < 40; f += 1) {
        if (st.player.canAct && !st.player.isAiming && f % 10 === 0) {
          if (f % 20 === 0) st = setWeaponMode(st, modes[modeIdx++ % 3]);
          const ang = (f + ri * 13 + seed * 7) * 0.7;
          st = startAim(st, { x: st.player.pos.x, y: st.player.pos.y });
          st = { ...st, player: { ...st.player, aimCurrent: { x: st.player.pos.x + Math.cos(ang) * 2.2, y: st.player.pos.y + Math.sin(ang) * 2.2 } } };
          st = releaseAim(st);
        }
        st = tickGame(st, 1 / 60);
        const p = st.player.pos;
        assert(!Number.isNaN(p.x) && !Number.isNaN(p.y), `seed=${seed} room=${ri} frame=${f}: player pos is NaN`);
        assert(
          p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY,
          `seed=${seed} room=${ri} frame=${f}: player escaped world bounds at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`,
        );
        for (const en of st.enemies) {
          if (!en.alive) continue;
          const er = getCurrentRoom(map, en.roomInstanceId ?? null);
          if (!er) continue;
          const eb = roomBounds(er);
          assert(
            en.pos.x >= eb.minX - 1 && en.pos.x <= eb.maxX + 1 && en.pos.y >= eb.minY - 1 && en.pos.y <= eb.maxY + 1,
            `seed=${seed} room=${ri} frame=${f}: enemy ${en.id} left its room`,
          );
        }
      }
    }
  }
});

// ===== end variable layout (Fase 2) =====

void (async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      throw error;
    }
  }
})();
