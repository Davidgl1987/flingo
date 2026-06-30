import { PIT_FALL_TRIGGER_INSET, ROOM_RESTITUTION } from './constants';
import type { GameState, HazardState, Vec2 } from './types';
import { add, clamp, dist, dot, isInsideCircle, len, mul, normalize, overlapCircleRect, reflect, sub, v } from './vector';
import { buildWorldWallObstacles, getRoomAtPosition, getWorldBounds } from './worldMap';
import { enemyRoomBounds } from './enemyAi';

// Collision + geometry helpers extracted from simulation.ts: projectile sweeps
// against walls/rocks, circle-vs-wall/obstacle resolution, and hazard overlap
// tests. Note: world-mode entities clamp to world walls (collideCircleWithWorld
// Walls); the origin-centred clampEntityToRoom is only the non-world fallback.

const PROJECTILE_SURFACE_EPSILON = 0.025;
const PROJECTILE_HIT_EPSILON = 0.0001;
const SPIKE_HAZARD_PUSH_SPEED = 5.2;
const SPIKE_HAZARD_CLEARANCE = 0.08;

export type ProjectileHit = {
  type: 'wall' | 'rock';
  t: number;
  pos: Vec2;
  normal: Vec2;
};

export function placeProjectileAfterSurfaceHit(hit: ProjectileHit, radius: number): Vec2 {
  return add(hit.pos, mul(hit.normal, radius + PROJECTILE_SURFACE_EPSILON));
}

export function findProjectileRoomHit(start: Vec2, end: Vec2, halfW: number, halfH: number): ProjectileHit | null {
  if (end.x >= -halfW && end.x <= halfW && end.y >= -halfH && end.y <= halfH) return null;

  const delta = sub(end, start);
  const candidates: ProjectileHit[] = [];
  const pushCandidate = (t: number, normal: Vec2) => {
    if (t < 0 || t > 1) return;
    const pos = add(start, mul(delta, t));
    if (pos.x < -halfW - 0.001 || pos.x > halfW + 0.001 || pos.y < -halfH - 0.001 || pos.y > halfH + 0.001) return;
    candidates.push({
      type: 'wall',
      t,
      pos: {
        x: clamp(pos.x, -halfW, halfW),
        y: clamp(pos.y, -halfH, halfH),
      },
      normal,
    });
  };

  if (Math.abs(delta.x) > 0.0001) {
    pushCandidate((halfW - start.x) / delta.x, v(-1, 0));
    pushCandidate((-halfW - start.x) / delta.x, v(1, 0));
  }
  if (Math.abs(delta.y) > 0.0001) {
    pushCandidate((halfH - start.y) / delta.y, v(0, -1));
    pushCandidate((-halfH - start.y) / delta.y, v(0, 1));
  }

  if (candidates.length > 0) return candidates.sort((a, b) => a.t - b.t)[0];

  const overflowX = Math.max(0, Math.abs(end.x) - halfW);
  const overflowY = Math.max(0, Math.abs(end.y) - halfH);
  const normal = overflowX >= overflowY ? v(-Math.sign(end.x || delta.x), 0) : v(0, -Math.sign(end.y || delta.y));
  return {
    type: 'wall',
    t: 1,
    pos: {
      x: clamp(end.x, -halfW, halfW),
      y: clamp(end.y, -halfH, halfH),
    },
    normal,
  };
}

export function findProjectileWorldWallHit(state: GameState, start: Vec2, end: Vec2, radius: number): ProjectileHit | null {
  let closest: ProjectileHit | null = null;
  for (const wall of buildWorldWallObstacles(state.worldMap, state.hasKey)) {
    const hit = raycastExpandedRect(start, end, radius, {
      id: wall.id,
      type: 'rock',
      pos: wall.pos,
      width: wall.width,
      height: wall.height,
    });
    if (hit && (!closest || hit.t < closest.t)) {
      closest = { ...hit, type: 'wall' };
    }
  }
  return closest;
}

export function findProjectileRockHit(start: Vec2, end: Vec2, radius: number, hazards: HazardState[]): ProjectileHit | null {
  let closest: ProjectileHit | null = null;
  for (const hazard of hazards) {
    if (hazard.type !== 'rock') continue;
    const hit = raycastExpandedRect(start, end, radius, hazard);
    if (hit && (!closest || hit.t < closest.t)) closest = hit;
  }
  return closest;
}

function raycastExpandedRect(start: Vec2, end: Vec2, radius: number, hazard: HazardState): ProjectileHit | null {
  const delta = sub(end, start);
  const halfWidth = (hazard.width ?? 1) / 2;
  const halfHeight = (hazard.height ?? 1) / 2;
  const minX = hazard.pos.x - halfWidth - radius;
  const maxX = hazard.pos.x + halfWidth + radius;
  const minY = hazard.pos.y - halfHeight - radius;
  const maxY = hazard.pos.y + halfHeight + radius;
  let tNear = -Infinity;
  let tFar = Infinity;
  let normal = v(0, 0);

  if (Math.abs(delta.x) < 0.0001) {
    if (start.x < minX || start.x > maxX) return null;
  } else {
    const nearX = delta.x > 0 ? (minX - start.x) / delta.x : (maxX - start.x) / delta.x;
    const farX = delta.x > 0 ? (maxX - start.x) / delta.x : (minX - start.x) / delta.x;
    if (nearX > tNear) normal = delta.x > 0 ? v(-1, 0) : v(1, 0);
    tNear = Math.max(tNear, nearX);
    tFar = Math.min(tFar, farX);
  }

  if (Math.abs(delta.y) < 0.0001) {
    if (start.y < minY || start.y > maxY) return null;
  } else {
    const nearY = delta.y > 0 ? (minY - start.y) / delta.y : (maxY - start.y) / delta.y;
    const farY = delta.y > 0 ? (maxY - start.y) / delta.y : (minY - start.y) / delta.y;
    if (nearY > tNear) normal = delta.y > 0 ? v(0, -1) : v(0, 1);
    tNear = Math.max(tNear, nearY);
    tFar = Math.min(tFar, farY);
  }

  if (tNear > tFar || tFar < 0 || tNear > 1) return null;
  const t = Math.max(0, tNear);
  const hitNormal = tNear < 0 ? normalize(mul(delta, -1)) : normal;
  if (t <= PROJECTILE_HIT_EPSILON && dot(delta, hitNormal) >= 0) return null;

  const centerPos = add(start, mul(delta, t));
  let surfacePos = { ...centerPos };
  if (Math.abs(hitNormal.x) > 0) {
    surfacePos = {
      x: hazard.pos.x + halfWidth * hitNormal.x,
      y: clamp(centerPos.y, hazard.pos.y - halfHeight, hazard.pos.y + halfHeight),
    };
  } else if (Math.abs(hitNormal.y) > 0) {
    surfacePos = {
      x: clamp(centerPos.x, hazard.pos.x - halfWidth, hazard.pos.x + halfWidth),
      y: hazard.pos.y + halfHeight * hitNormal.y,
    };
  }
  return {
    type: 'rock',
    t,
    pos: surfacePos,
    normal: hitNormal,
  };
}

function bounceCircleAgainstRoom(state: GameState, entity: 'player'): GameState {
  const next = state;
  const body = next[entity];
  const halfW = next.room.width / 2;
  const halfH = next.room.height / 2;

  if (body.pos.x - body.radius < -halfW) {
    body.pos.x = -halfW + body.radius;
    if (dot(body.vel, v(1, 0)) < 0) body.vel = reflect(body.vel, v(1, 0), ROOM_RESTITUTION);
  }
  if (body.pos.x + body.radius > halfW) {
    body.pos.x = halfW - body.radius;
    if (dot(body.vel, v(-1, 0)) < 0) body.vel = reflect(body.vel, v(-1, 0), ROOM_RESTITUTION);
  }
  if (body.pos.y - body.radius < -halfH) {
    body.pos.y = -halfH + body.radius;
    if (dot(body.vel, v(0, 1)) < 0) body.vel = reflect(body.vel, v(0, 1), ROOM_RESTITUTION);
  }
  if (body.pos.y + body.radius > halfH) {
    body.pos.y = halfH - body.radius;
    if (dot(body.vel, v(0, -1)) < 0) body.vel = reflect(body.vel, v(0, -1), ROOM_RESTITUTION);
  }

  return next;
}

export function collideBodyWithWorldWalls(state: GameState, entity: 'player'): GameState {
  if (!state.worldMap) return bounceCircleAgainstRoom(state, entity);
  const next = state;
  const body = next[entity];
  collideCircleWithWorldWalls(next, body, true);
  // Hard backstop against tunnelling at launch speed: the player can move freely
  // between rooms but can never leave the whole scenario's bounding box.
  const bounds = getWorldBounds(next.worldMap);
  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;
  body.pos.x = clamp(body.pos.x, bounds.center.x - halfW + body.radius, bounds.center.x + halfW - body.radius);
  body.pos.y = clamp(body.pos.y, bounds.center.y - halfH + body.radius, bounds.center.y + halfH - body.radius);
  return next;
}

export function collideCircleWithWorldWalls(state: GameState, body: { pos: Vec2; vel: Vec2; radius: number }, canUnlock = false): void {
  if (!state.worldMap) {
    clampEntityToRoom(body.pos, body.radius, state.room.width, state.room.height);
    return;
  }

  for (const wall of buildWorldWallObstacles(state.worldMap, state.hasKey)) {
    if (!overlapCircleRect(body.pos, body.radius, wall.pos, wall.width, wall.height)) continue;
    const dx = body.pos.x - wall.pos.x;
    const dy = body.pos.y - wall.pos.y;
    const overlapX = wall.width / 2 + body.radius - Math.abs(dx);
    const overlapY = wall.height / 2 + body.radius - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) continue;
    if (canUnlock && wall.requiresKey && wall.connectionId && state.hasKey && state.worldMap) {
      const conn = state.worldMap.connections.find((c) => c.id === wall.connectionId);
      if (conn && !conn.unlocked) {
        conn.unlocked = true;
        state.message = 'Has abierto la puerta del jefe.';
        continue; // let the player through; next frame the cache rebuilds without this barrier
      }
    }
    if (overlapX < overlapY) {
      const normal = v(Math.sign(dx || body.vel.x || 1), 0);
      body.pos.x += normal.x * overlapX;
      if (dot(body.vel, normal) < 0) body.vel = reflect(body.vel, normal, ROOM_RESTITUTION);
    } else {
      const normal = v(0, Math.sign(dy || body.vel.y || 1));
      body.pos.y += normal.y * overlapY;
      if (dot(body.vel, normal) < 0) body.vel = reflect(body.vel, normal, ROOM_RESTITUTION);
    }
  }
}

function clampEntityToRoom(pos: Vec2, radius: number, width: number, height: number): void {
  pos.x = clamp(pos.x, -width / 2 + radius, width / 2 - radius);
  pos.y = clamp(pos.y, -height / 2 + radius, height / 2 - radius);
}

export function hazardContainsCircle(hazard: HazardState, pos: Vec2, radius: number): boolean {
  if (hazard.radius !== undefined) return isInsideCircle(pos, hazard.pos, hazard.radius + radius);
  return overlapCircleRect(pos, radius, hazard.pos, hazard.width ?? 1, hazard.height ?? 1);
}

export function hazardContainsPitTrigger(hazard: HazardState, pos: Vec2): boolean {
  if (hazard.type !== 'pit') return false;
  if (hazard.radius !== undefined) return isInsideCircle(pos, hazard.pos, Math.max(0, hazard.radius - PIT_FALL_TRIGGER_INSET));
  const halfWidth = (hazard.width ?? 1) / 2;
  const halfHeight = (hazard.height ?? 1) / 2;
  const inset = Math.min(PIT_FALL_TRIGGER_INSET, halfWidth - 0.05, halfHeight - 0.05);
  return (
    pos.x > hazard.pos.x - halfWidth + inset &&
    pos.x < hazard.pos.x + halfWidth - inset &&
    pos.y > hazard.pos.y - halfHeight + inset &&
    pos.y < hazard.pos.y + halfHeight - inset
  );
}

export function pushPlayerOutOfSpikeHazard(state: GameState, hazard: HazardState): GameState {
  const next = state;
  let pushDir = v(0, 0);
  let pushDistance = 0;

  if (hazard.radius !== undefined) {
    pushDir = normalize(sub(next.player.pos, hazard.pos));
    if (len(pushDir) <= 0) pushDir = len(next.player.vel) > 0 ? normalize(next.player.vel) : v(1, 0);
    pushDistance = hazard.radius + next.player.radius + SPIKE_HAZARD_CLEARANCE - dist(next.player.pos, hazard.pos);
  } else {
    const width = hazard.width ?? 1;
    const height = hazard.height ?? 1;
    const dx = next.player.pos.x - hazard.pos.x;
    const dy = next.player.pos.y - hazard.pos.y;
    const overlapX = width / 2 + next.player.radius + SPIKE_HAZARD_CLEARANCE - Math.abs(dx);
    const overlapY = height / 2 + next.player.radius + SPIKE_HAZARD_CLEARANCE - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) return next;

    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001 && len(next.player.vel) > 0) {
      pushDir = Math.abs(next.player.vel.x) >= Math.abs(next.player.vel.y)
        ? v(Math.sign(next.player.vel.x), 0)
        : v(0, Math.sign(next.player.vel.y));
      pushDistance = Math.abs(pushDir.x) > 0 ? overlapX : overlapY;
    } else if (overlapX < overlapY) {
      pushDir = v(Math.sign(dx || next.player.vel.x || 1), 0);
      pushDistance = overlapX;
    } else {
      pushDir = v(0, Math.sign(dy || next.player.vel.y || 1));
      pushDistance = overlapY;
    }
  }

  if (pushDistance <= 0 || len(pushDir) <= 0) return next;
  next.player.pos = add(next.player.pos, mul(pushDir, pushDistance));
  next.player.vel = add(mul(next.player.vel, 0.15), mul(pushDir, SPIKE_HAZARD_PUSH_SPEED));
  if (next.worldMap) collideCircleWithWorldWalls(next, next.player);
  else clampEntityToRoom(next.player.pos, next.player.radius, next.room.width, next.room.height);
  return next;
}

export function isPlayerOverSolidGround(state: GameState): boolean {
  if (state.worldMap) {
    const room = getRoomAtPosition(state.worldMap, state.player.pos);
    if (!room) return false;
    return !state.hazards.some((hazard) => hazard.type === 'pit' && hazard.roomInstanceId === room.id && hazardContainsCircle(hazard, state.player.pos, 0));
  }
  const halfW = state.room.width / 2;
  const halfH = state.room.height / 2;
  if (
    state.player.pos.x < -halfW + state.player.radius ||
    state.player.pos.x > halfW - state.player.radius ||
    state.player.pos.y < -halfH + state.player.radius ||
    state.player.pos.y > halfH - state.player.radius
  ) {
    return false;
  }
  return !state.hazards.some((hazard) => hazard.type === 'pit' && hazardContainsCircle(hazard, state.player.pos, 0));
}

export function collidePlayerWithRectObstacle(state: GameState, obstacle: HazardState): GameState {
  const width = obstacle.width ?? 1;
  const height = obstacle.height ?? 1;
  if (!overlapCircleRect(state.player.pos, state.player.radius, obstacle.pos, width, height)) return state;
  const next = state;
  const dx = next.player.pos.x - obstacle.pos.x;
  const dy = next.player.pos.y - obstacle.pos.y;
  const overlapX = width / 2 + next.player.radius - Math.abs(dx);
  const overlapY = height / 2 + next.player.radius - Math.abs(dy);
  if (overlapX < overlapY) {
    const normal = v(Math.sign(dx || 1), 0);
    next.player.pos.x += normal.x * overlapX;
    if (dot(next.player.vel, normal) < 0) next.player.vel = reflect(next.player.vel, normal, ROOM_RESTITUTION);
  } else {
    const normal = v(0, Math.sign(dy || 1));
    next.player.pos.y += normal.y * overlapY;
    if (dot(next.player.vel, normal) < 0) next.player.vel = reflect(next.player.vel, normal, ROOM_RESTITUTION);
  }
  return next;
}

export function collideEnemiesWithRectObstacle(state: GameState, obstacle: HazardState): GameState {
  const next = state;
  const width = obstacle.width ?? 1;
  const height = obstacle.height ?? 1;
  for (const enemy of next.enemies) {
    if (!enemy.alive) continue;
    if (!overlapCircleRect(enemy.pos, enemy.radius, obstacle.pos, width, height)) continue;
    const dx = enemy.pos.x - obstacle.pos.x;
    const dy = enemy.pos.y - obstacle.pos.y;
    const overlapX = width / 2 + enemy.radius - Math.abs(dx);
    const overlapY = height / 2 + enemy.radius - Math.abs(dy);
    if (overlapX < overlapY) {
      enemy.pos.x += Math.sign(dx || 1) * overlapX;
      enemy.vel.x *= -0.3;
    } else {
      enemy.pos.y += Math.sign(dy || 1) * overlapY;
      enemy.vel.y *= -0.3;
    }
  }
  return next;
}

export function collideEnemiesWithCircleObstacle(state: GameState, obstacle: HazardState): GameState {
  const next = state;
  const obstacleRadius = obstacle.radius ?? 0.42;
  for (const enemy of next.enemies) {
    if (!enemy.alive) continue;
    const minDist = enemy.radius + obstacleRadius + 0.04;
    const distance = dist(enemy.pos, obstacle.pos);
    if (distance >= minDist) continue;
    const normal = normalize(sub(enemy.pos, obstacle.pos));
    const push = len(normal) > 0 ? normal : v(1, 0);
    enemy.pos = add(obstacle.pos, mul(push, minDist));
    enemy.vel = reflect(enemy.vel, push, 0.2);
    if (next.worldMap) collideCircleWithWorldWalls(next, enemy);
    else clampEntityToRoom(enemy.pos, enemy.radius, next.room.width, next.room.height);
  }
  return next;
}

export function findSafePosition(state: GameState): Vec2 {
  for (const hazard of state.hazards) {
    if ((hazard.type === 'pit' || hazard.type === 'spikes') && hazardContainsCircle(hazard, state.player.pos, state.player.radius)) {
      return state.player.lastSafePos;
    }
  }
  return { ...state.player.pos };
}

export function separateEnemies(state: GameState): GameState {
  const next = state;
  const alive = next.enemies.filter((e) => e.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      const minDist = a.radius + b.radius;
      const d = dist(a.pos, b.pos);
      if (d >= minDist || d <= 0.00001) {
        if (d <= 0.00001) { // exact overlap: nudge apart deterministically
          a.pos = add(a.pos, v(0.01, 0));
          b.pos = add(b.pos, v(-0.01, 0));
        }
        continue;
      }
      const normal = normalize(sub(b.pos, a.pos));
      const push = (minDist - d) / 2;
      a.pos = add(a.pos, mul(normal, -push));
      b.pos = add(b.pos, mul(normal, push));
    }
  }
  // keep each enemy inside its OWN room after separating (world coords)
  if (next.worldMap) {
    for (const enemy of alive) {
      if (!enemy.roomInstanceId) continue;
      const bounds = enemyRoomBounds(next, enemy);
      enemy.pos.x = clamp(enemy.pos.x, bounds.minX + enemy.radius, bounds.maxX - enemy.radius);
      enemy.pos.y = clamp(enemy.pos.y, bounds.minY + enemy.radius, bounds.maxY - enemy.radius);
    }
  }
  return next;
}
