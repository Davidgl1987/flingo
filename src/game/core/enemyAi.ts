import {
  CHASER_AIMING_SPEED,
  CHASER_SPEED,
  DUMMY_CHASE_DISTANCE,
  DUMMY_CHASE_SPEED,
  DUMMY_PATROL_SPEED,
  DUMMY_ROUTE_LEASH,
  SHOOTER_CHARGE_TIME,
  SHOOTER_CHASE_SPEED,
  SHOOTER_CHASE_TIME,
  SHOOTER_PROJECTILE_SPEED,
  SPIKE_PATROL_SPEED,
  TRAIL_DAMAGE,
  TRAIL_PATROL_SPEED,
} from './constants';
import { addEffect } from './effects';
import { advancePathClock, buildPathGrid, getEnemyMoveDirection, steerAwayFromNearbyHazards, type PathGrid } from './pathfinding';
import type { EnemyState, GameState, Vec2 } from './types';
import { add, clamp, dist, isInsideCircle, len, mul, normalize, overlapCircleRect, sub, v } from './vector';
import { getCurrentRoom, roomBounds } from './worldMap';

export type RoomBounds = { minX: number; maxX: number; minY: number; maxY: number };

export function updateEnemyAi(state: GameState, dt: number): GameState {
  const next = state;
  advancePathClock(dt);
  const pathGrid = buildPathGrid(next);
  for (const enemy of next.enemies) {
    if (!enemy.alive) continue;
    // Enemies in rooms the player isn't in run their AI against THEIR OWN room's
    // A* grid (not the active room's): patrol types keep patrolling, chase types
    // return to homePos. They never path against the active room's coordinates.
    if (next.currentRoomInstanceId && enemy.roomInstanceId && enemy.roomInstanceId !== next.currentRoomInstanceId) {
      updateInactiveRoomEnemy(next, enemy, dt);
      continue;
    }
    enemy.aiTimer = (enemy.aiTimer ?? 0) + dt;

    if (enemy.type === 'dummy') {
      updatePatrolTarget(next, enemy.id);
      const nearPlayer = dist(enemy.pos, next.player.pos) < DUMMY_CHASE_DISTANCE;
      const withinLeash = dist(enemy.patrolAnchor ?? enemy.pos, enemy.pos) < DUMMY_ROUTE_LEASH;
      const target = nearPlayer && withinLeash ? next.player.pos : enemy.patrolTarget ?? enemy.pos;
      const speed = nearPlayer && withinLeash ? DUMMY_CHASE_SPEED : DUMMY_PATROL_SPEED;
      enemy.vel = mul(getEnemyMoveDirection(next, pathGrid, enemy.pos, target, enemy.radius, enemy.id), speed);
    }

    if (enemy.type === 'chaser') {
      const direction = getEnemyMoveDirection(next, pathGrid, enemy.pos, next.player.pos, enemy.radius, enemy.id);
      enemy.vel = mul(direction, next.player.isAiming ? CHASER_AIMING_SPEED : CHASER_SPEED);
    }

    if (enemy.type === 'spike') {
      updatePatrolTarget(next, enemy.id, enemy.spikeDir);
      const target = enemy.patrolTarget ?? enemy.pos;
      const direction = getEnemyMoveDirection(next, pathGrid, enemy.pos, target, enemy.radius, enemy.id);
      enemy.vel = mul(direction, SPIKE_PATROL_SPEED);
      if (len(direction) > 0.01) enemy.spikeDir = direction;
    }

    if (enemy.type === 'trail') {
      updatePatrolTarget(next, enemy.id);
      const target = enemy.patrolTarget ?? enemy.pos;
      enemy.vel = mul(getEnemyMoveDirection(next, pathGrid, enemy.pos, target, enemy.radius, enemy.id), TRAIL_PATROL_SPEED);
      enemy.trailTimer -= dt;
      if (enemy.trailTimer <= 0) {
        next.trails.push({
          id: `trail-${next.nextId++}`,
          pos: { ...enemy.pos },
          radius: 0.45,
          life: 3.2,
          damage: TRAIL_DAMAGE,
        });
        enemy.trailTimer = 0.55;
      }
    }

    if (enemy.type === 'shooter') {
      updateShooterAi(next, pathGrid, enemy.id, dt);
    }
  }
  return next;
}

function updateInactiveRoomEnemy(state: GameState, enemy: EnemyState, dt: number): void {
  enemy.aiTimer = (enemy.aiTimer ?? 0) + dt;
  const room = getCurrentRoom(state.worldMap, enemy.roomInstanceId ?? '');
  if (!room) { enemy.vel = v(0, 0); return; }
  const grid = buildPathGrid(state, room);

  // Every enemy keeps a minimal patrol around its spawn anchor so none stand
  // frozen while the player is elsewhere. Chase types (chaser/shooter) have no
  // patrol of their own, so they patrol gently around their spawn — which also
  // brings them home after a chase.
  updatePatrolTarget(state, enemy.id, enemy.type === 'spike' ? enemy.spikeDir : undefined);
  const target = enemy.patrolTarget ?? enemy.homePos ?? enemy.pos;
  const speed =
    enemy.type === 'spike' ? SPIKE_PATROL_SPEED :
    enemy.type === 'trail' ? TRAIL_PATROL_SPEED :
    DUMMY_PATROL_SPEED; // dummy, chaser, shooter

  const direction = getEnemyMoveDirection(state, grid, enemy.pos, target, enemy.radius, enemy.id);
  enemy.vel = mul(direction, speed);
  if (enemy.type === 'spike' && len(direction) > 0.01) enemy.spikeDir = direction;

  if (enemy.type === 'trail') {
    enemy.trailTimer -= dt;
    if (enemy.trailTimer <= 0) {
      state.trails.push({ id: `trail-${state.nextId++}`, pos: { ...enemy.pos }, radius: 0.45, life: 3.2, damage: TRAIL_DAMAGE });
      enemy.trailTimer = 0.55;
    }
  }
}

// Patrol anchors/targets live in world coordinates, so they must be clamped to
// the enemy's own room bounds (with its world offset), NOT the origin-centered
// state.room. Using state.room here made enemies in offset rooms patrol toward
// the map origin and abandon their room. See docs/instructions/ARCHITECTURE_INVARIANTS.md.
export function enemyRoomBounds(state: GameState, enemy: EnemyState): RoomBounds {
  if (state.worldMap && enemy.roomInstanceId) {
    const instance = getCurrentRoom(state.worldMap, enemy.roomInstanceId);
    if (instance) return roomBounds(instance);
  }
  return {
    minX: -state.room.width / 2,
    maxX: state.room.width / 2,
    minY: -state.room.height / 2,
    maxY: state.room.height / 2,
  };
}

function updatePatrolTarget(state: GameState, enemyId: string, preferredAxis?: Vec2): void {
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
  if (!enemy) return;
  const bounds = enemyRoomBounds(state, enemy);
  enemy.patrolAnchor ??= { ...enemy.pos };
  enemy.patrolTarget ??= { ...enemy.pos };
  enemy.patrolAnchor = clampPatrolPoint(bounds, enemy.patrolAnchor, enemy.radius);
  enemy.patrolTarget = clampPatrolPoint(bounds, enemy.patrolTarget, enemy.radius);

  if (!enemy.patrolAxis) {
    const seed = idSeed(enemy.id);
    const range = 1.2 + Math.abs(Math.sin(seed * 2.1)) * 1.35;
    let axis: Vec2;
    if (preferredAxis) {
      axis = normalize(preferredAxis);
    } else {
      // Pick the axis with the most clearance from hazards/walls so the enemy
      // can actually complete a patrol instead of immediately hitting an
      // obstacle (e.g. the barrel sitting on the dummy's horizontal line).
      const horizontalClear = axisClearance(state, enemy, bounds, enemy.patrolAnchor, v(1, 0), range);
      const verticalClear = axisClearance(state, enemy, bounds, enemy.patrolAnchor, v(0, 1), range);
      const preferHorizontal = Math.abs(horizontalClear - verticalClear) < 0.3 ? Math.sin(seed) >= 0 : horizontalClear > verticalClear;
      axis = preferHorizontal ? v(1, 0) : v(0, 1);
    }
    enemy.patrolAxis = axis;
    enemy.patrolRange = range;
    enemy.patrolTarget = clampPatrolPoint(bounds, add(enemy.patrolAnchor, mul(axis, range)), enemy.radius);
  }

  const anchor = enemy.patrolAnchor;
  const target = enemy.patrolTarget;
  const axis = enemy.patrolAxis ?? v(1, 0);
  const blocked = isPatrolPressingWall(bounds, enemy.pos, target, enemy.radius) || isPatrolPressingHazard(state, enemy, target);
  if (dist(enemy.pos, target) > 0.28 && !blocked) return;
  const endpoint = clampPatrolPoint(bounds, add(anchor, mul(axis, enemy.patrolRange ?? 1.6)), enemy.radius);
  const targetIsEndpoint = dist(target, endpoint) <= dist(target, anchor);
  enemy.patrolTarget = targetIsEndpoint ? anchor : endpoint;
}

// A patrol enemy heading into a rock/barrel/pit/spikes can't reach a target past
// it (hazard avoidance keeps deflecting it), so it would get stuck. Detect a
// blocking hazard just ahead and treat it like reaching the endpoint: turn back.
function isPatrolPressingHazard(state: GameState, enemy: EnemyState, target: Vec2): boolean {
  const toTarget = sub(target, enemy.pos);
  if (len(toTarget) < 0.001) return false;
  const probe = add(enemy.pos, mul(normalize(toTarget), enemy.radius + 0.55));
  return pointBlockedByHazard(state, enemy, probe, enemy.radius * 0.7);
}

function pointBlockedByHazard(state: GameState, enemy: EnemyState, point: Vec2, radius: number): boolean {
  for (const hazard of state.hazards) {
    if (enemy.roomInstanceId && hazard.roomInstanceId && hazard.roomInstanceId !== enemy.roomInstanceId) continue;
    const blocks = hazard.type === 'rock' || hazard.type === 'pit' || hazard.type === 'spikes' || (hazard.type === 'barrel' && !hazard.exploded);
    if (!blocks) continue;
    const overlaps = hazard.radius !== undefined
      ? isInsideCircle(point, hazard.pos, hazard.radius + radius)
      : overlapCircleRect(point, radius, hazard.pos, hazard.width ?? 1, hazard.height ?? 1);
    if (overlaps) return true;
  }
  return false;
}

// How far a patrol can extend along ±axis from the anchor before hitting a
// hazard or the room edge. Used to choose the clearer patrol axis.
function axisClearance(state: GameState, enemy: EnemyState, bounds: RoomBounds, anchor: Vec2, axis: Vec2, range: number): number {
  let total = 0;
  const steps = 8;
  const margin = enemy.radius + 0.1;
  for (const sign of [1, -1]) {
    let reach = 0;
    for (let step = 1; step <= steps; step += 1) {
      const distance = (range * step) / steps;
      const point = add(anchor, mul(axis, distance * sign));
      if (point.x < bounds.minX + margin || point.x > bounds.maxX - margin || point.y < bounds.minY + margin || point.y > bounds.maxY - margin) break;
      if (pointBlockedByHazard(state, enemy, point, enemy.radius)) break;
      reach = distance;
    }
    total += reach;
  }
  return total;
}

function clampPatrolPoint(bounds: RoomBounds, point: Vec2, radius: number): Vec2 {
  const margin = radius + 0.28;
  return {
    x: clamp(point.x, bounds.minX + margin, bounds.maxX - margin),
    y: clamp(point.y, bounds.minY + margin, bounds.maxY - margin),
  };
}

function isPatrolPressingWall(bounds: RoomBounds, pos: Vec2, target: Vec2, radius: number): boolean {
  const toTarget = sub(target, pos);
  const minX = bounds.minX + radius + 0.08;
  const maxX = bounds.maxX - radius - 0.08;
  const minY = bounds.minY + radius + 0.08;
  const maxY = bounds.maxY - radius - 0.08;
  return (
    (pos.x <= minX && toTarget.x < 0) ||
    (pos.x >= maxX && toTarget.x > 0) ||
    (pos.y <= minY && toTarget.y < 0) ||
    (pos.y >= maxY && toTarget.y > 0)
  );
}

function updateShooterAi(state: GameState, pathGrid: PathGrid, enemyId: string, dt: number): void {
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId);
  if (!enemy) return;

  enemy.shooterState ??= 'chasing';
  enemy.shooterTimer = (enemy.shooterTimer ?? 0) + dt;

  if (enemy.shooterState === 'chasing') {
    enemy.vel = mul(getEnemyMoveDirection(state, pathGrid, enemy.pos, state.player.pos, enemy.radius, enemy.id), SHOOTER_CHASE_SPEED);
    if (enemy.shooterTimer >= SHOOTER_CHASE_TIME) {
      enemy.shooterState = 'charging';
      enemy.shooterTimer = 0;
      enemy.vel = v(0, 0);
      fireShooterProjectile(state, enemy);
    }
    return;
  }

  enemy.vel = v(0, 0);
  if (enemy.shooterTimer >= SHOOTER_CHARGE_TIME) {
    enemy.shooterState = 'chasing';
    enemy.shooterTimer = 0;
  }
}

function fireShooterProjectile(state: GameState, enemy: { id: string; pos: Vec2; radius: number }): void {
  const direction = normalize(sub(state.player.pos, enemy.pos));
  state.projectiles.push({
    id: `projectile-${state.nextId++}`,
    type: 'arrow',
    pos: add(enemy.pos, mul(direction, enemy.radius + 0.22)),
    vel: mul(direction, SHOOTER_PROJECTILE_SPEED),
    radius: 0.2,
    damage: 1,
    life: 2.2,
    alive: true,
    hostile: true,
    pierceRemaining: 0,
    bouncesRemaining: 0,
    hitEnemyIds: [],
  });
  addEffect(state, 'projectile', enemy.pos, { color: '#f8fafc', dir: direction });
}

function idSeed(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 10000;
  }
  return hash / 10000 * Math.PI * 2;
}
