import { cloneState } from './clone';
import {
  ACTION_COOLDOWNS,
  MAX_AIM_DISTANCE,
  PLAYER_DAMPING,
  PLAYER_LAUNCH_POWER,
  PLAYER_MAX_SPEED,
  PIT_FALL_DEATH_HEIGHT,
  PIT_FALL_DURATION,
  PIT_FALL_GRAVITY,
  PIT_FALL_LAND_HEIGHT,
  PROJECTILE_LIFETIME,
  PROJECTILE_RECOIL,
  PROJECTILE_SPEED,
  ROOM_RESTITUTION,
  SPIKE_DAMAGE,
  SPELL_SPEED,
  STOP_SPEED,
} from './constants';
import { addEffect } from './effects';
import { applyExplosiveBodySplash, damageEnemy, damagePlayer, explodeBarrelInPlace, resolvePlayerEnemyHitInPlace, respawnAfterPitInPlace } from './damageSystem';
import type { EnemyState, GameState, HazardState, Vec2, WeaponMode } from './types';
import { add, clamp, clampLen, dist, len, mul, normalize, reflect, sub, v } from './vector';
import { enemyRoomBounds, updateEnemyAi } from './enemyAi';
import { advanceRoomClearReward, checkRoomClear, updateCurrentWorldRoom } from './worldFlow';
import { getWorldBounds } from './worldMap';
import {
  collideBodyWithWorldWalls,
  collideCircleWithWorldWalls,
  collideEnemiesWithCircleObstacle,
  collideEnemiesWithRectObstacle,
  collidePlayerWithRectObstacle,
  findProjectileRockHit,
  findProjectileRoomHit,
  findProjectileWorldWallHit,
  findSafePosition,
  hazardContainsCircle,
  hazardContainsPitTrigger,
  isPlayerOverSolidGround,
  placeProjectileAfterSurfaceHit,
  pushPlayerOutOfSpikeHazard,
  separateEnemies,
} from './collisions';

const MIN_AIM_STRENGTH = 0.08;

export function startAim(state: GameState, point: Vec2): GameState {
  if (state.isPaused || state.phase !== 'playing' || !canUseCurrentWeapon(state)) return state;
  const next: GameState = cloneState(state);
  next.player.isAiming = true;
  next.player.aimStart = point;
  next.player.aimCurrent = point;
  next.message = next.player.weaponMode === 'body' ? 'Tira hacia atrás y suelta para lanzar.' : 'Tira hacia atrás y suelta para disparar.';
  return next;
}

export function updateAim(state: GameState, point: Vec2): GameState {
  if (!state.player.isAiming) return state;
  const next: GameState = cloneState(state);
  next.player.aimCurrent = point;
  return next;
}

export function cancelAim(state: GameState): GameState {
  if (!state.player.isAiming) return state;
  const next: GameState = cloneState(state);
  next.player.isAiming = false;
  next.player.aimStart = null;
  next.player.aimCurrent = null;
  return next;
}

export function releaseAim(state: GameState): GameState {
  if (!state.player.isAiming || !state.player.aimStart || !state.player.aimCurrent) return state;
  const pullVector = sub(state.player.aimStart, state.player.aimCurrent);
  const aimDistance = clamp(len(pullVector), 0, MAX_AIM_DISTANCE);
  const direction = normalize(pullVector);
  const strength = aimDistance / MAX_AIM_DISTANCE;
  const next: GameState = cloneState(state);

  next.player.isAiming = false;
  next.player.aimStart = null;
  next.player.aimCurrent = null;

  if (strength < MIN_AIM_STRENGTH) {
    next.message = 'Arrastre demasiado corto.';
    return next;
  }

  if (state.player.weaponMode === 'body') {
    next.player.vel = mul(direction, PLAYER_LAUNCH_POWER * (0.35 + strength) * 1.25);
    next.player.canAct = false;
    setActionCooldown(next, 'body');
    next.message = '¡Lanzamiento!';
    return next;
  }

  const projectileSpeed = state.player.weaponMode === 'spell' ? SPELL_SPEED : PROJECTILE_SPEED;
  const projectileDamage = state.player.weaponMode === 'spell' ? state.player.spellDamage : state.player.arrowDamage;
  const projectileRadius = state.player.weaponMode === 'spell' && state.player.upgrades.includes('arcane_spell') ? 0.25 : 0.18;
  next.projectiles.push({
    id: `projectile-${next.nextId++}`,
    type: state.player.weaponMode,
    pos: add(state.player.pos, mul(direction, state.player.radius + 0.2)),
    vel: mul(direction, projectileSpeed * (0.7 + strength * 0.5)),
    radius: projectileRadius,
    damage: projectileDamage,
    life: PROJECTILE_LIFETIME,
    alive: true,
    hostile: false,
    pierceRemaining: state.player.weaponMode === 'arrow' ? 1 : 0,
    bouncesRemaining: state.player.weaponMode === 'spell' ? 1 : 0,
    hitEnemyIds: [],
  });
  next.player.vel = clampLen(add(next.player.vel, mul(direction, -PROJECTILE_RECOIL * (0.75 + strength * 0.35))), PLAYER_MAX_SPEED);
  next.player.canAct = false;
  setActionCooldown(next, state.player.weaponMode);
  next.message = state.player.weaponMode === 'spell' ? 'Hechizo lanzado.' : 'Flecha disparada.';
  addEffect(next, 'projectile', state.player.pos, {
    color: state.player.weaponMode === 'spell' ? '#e9d5ff' : '#fef08a',
  });
  return next;
}

export function setWeaponMode(state: GameState, mode: WeaponMode): GameState {
  const next: GameState = cloneState(state);
  next.player.weaponMode = mode;
  syncActionState(next);
  next.message = mode === 'body' ? 'Modo cuerpo: más daño, más riesgo.' : mode === 'arrow' ? 'Modo flecha: seguro y preciso.' : 'Modo hechizo: más lento, más fuerte.';
  return next;
}

function canUseCurrentWeapon(state: GameState): boolean {
  return (
    state.phase === 'playing' &&
    !state.player.pitFallActive &&
    state.roomClearRewardTimer <= 0 &&
    state.player.canAct &&
    (state.player.actionCooldowns?.[state.player.weaponMode] ?? state.player.actionCooldown) <= 0
  );
}

function setActionCooldown(state: GameState, mode: WeaponMode): void {
  state.player.actionCooldowns ??= { body: 0, arrow: 0, spell: 0 };
  const multiplier = state.player.upgrades.includes('quick_aim') && mode !== 'body' ? 0.72 : 1;
  const cooldown = ACTION_COOLDOWNS[mode] * multiplier;
  state.player.actionCooldowns[mode] = cooldown;
  state.player.actionCooldown = cooldown;
}

function tickActionCooldowns(state: GameState, dt: number): void {
  state.player.actionCooldowns ??= {
    body: state.player.weaponMode === 'body' ? state.player.actionCooldown : 0,
    arrow: state.player.weaponMode === 'arrow' ? state.player.actionCooldown : 0,
    spell: state.player.weaponMode === 'spell' ? state.player.actionCooldown : 0,
  };
  for (const mode of ['body', 'arrow', 'spell'] as WeaponMode[]) {
    state.player.actionCooldowns[mode] = Math.max(0, state.player.actionCooldowns[mode] - dt);
  }
  state.player.actionCooldown = state.player.actionCooldowns[state.player.weaponMode];
}

function syncActionState(state: GameState): void {
  state.player.actionCooldowns ??= {
    body: state.player.weaponMode === 'body' ? state.player.actionCooldown : 0,
    arrow: state.player.weaponMode === 'arrow' ? state.player.actionCooldown : 0,
    spell: state.player.weaponMode === 'spell' ? state.player.actionCooldown : 0,
  };
  state.player.actionCooldown = state.player.actionCooldowns[state.player.weaponMode] ?? state.player.actionCooldown;
  state.player.canAct = state.phase === 'playing' && !state.player.pitFallActive && state.roomClearRewardTimer <= 0 && state.player.actionCooldown <= 0;
}

export function tickGame(state: GameState, dtRaw: number): GameState {
  const dt = clamp(dtRaw, 0, 1 / 30);
  if (state.isPaused || state.phase !== 'playing') return state;
  if (state.player.pitFallActive) return tickPitFall(state, dt);

  let next: GameState = cloneState(state);
  next.player.invulnerableTimer = Math.max(0, next.player.invulnerableTimer - dt);
  next.player.pitFallTimer = Math.max(0, next.player.pitFallTimer - dt);
  tickActionCooldowns(next, dt);

  next = updateEnemyAi(next, dt);
  next = integrateProjectiles(next, dt);
  next = integratePlayer(next, dt);
  next = updateCurrentWorldRoom(next);
  next = integrateEnemies(next, dt);
  next = separateEnemies(next);
  next = resolveHazards(next, dt);
  next = resolveEnemyPlayerCollisions(next);
  next = resolveHostileEnemyPressure(next);
  next = resolveProjectileEnemyCollisions(next);
  next = resolveHostileProjectilePlayerCollisions(next);
  // Enemy hits/pushes set the player position directly, which can shove it into
  // a wall or out of bounds; re-apply wall + world-AABB containment afterwards.
  if (!next.player.pitFallActive) next = collideBodyWithWorldWalls(next, 'player');
  next = collectItems(next);
  next = ageTrailsExplosionsAndEffects(next, dt);
  next = checkRoomClear(next);
  next = advanceRoomClearReward(next, dt);

  return reuseStableReferences(state, next);
}

function tickPitFall(state: GameState, dt: number): GameState {
  const next: GameState = cloneState(state);
  const previousPos = { ...next.player.pos };
  next.player.pos = add(next.player.pos, mul(next.player.vel, dt));
  // Same hard backstop as collideBodyWithWorldWalls: a body sliding while it
  // falls into a pit must never leave the whole scenario's bounding box (tickGame
  // returns early here, bypassing the normal per-frame world-AABB clamp).
  if (next.worldMap) {
    const bounds = getWorldBounds(next.worldMap);
    next.player.pos.x = clamp(next.player.pos.x, bounds.center.x - bounds.width / 2 + next.player.radius, bounds.center.x + bounds.width / 2 - next.player.radius);
    next.player.pos.y = clamp(next.player.pos.y, bounds.center.y - bounds.height / 2 + next.player.radius, bounds.center.y + bounds.height / 2 - next.player.radius);
  }
  next.player.vel = mul(next.player.vel, Math.exp(-0.5 * dt));
  next.player.pitFallVerticalVelocity -= PIT_FALL_GRAVITY * dt;
  next.player.pitFallHeight += next.player.pitFallVerticalVelocity * dt;

  if (next.player.pitFallVerticalVelocity < 0 && next.player.pitFallHeight <= 0 && isPlayerOverSolidGround(next)) {
    if (next.player.pitFallHeight >= PIT_FALL_LAND_HEIGHT) {
      next.player.pitFallActive = false;
      next.player.pitFallHeight = 0;
      next.player.pitFallVerticalVelocity = 0;
      next.message = 'Aterrizaje justo.';
      syncActionState(next);
      return next;
    }

    if (len(next.player.vel) > 0.1) {
      next.message = 'Golpeas el borde y caes.';
    }
    next.player.pos = previousPos;
    next.player.vel = v(0, 0);
  }

  if (next.player.pitFallHeight <= PIT_FALL_DEATH_HEIGHT) {
    respawnAfterPitInPlace(next, { ...next.player.pos });
    return next;
  }

  return next;
}

function reuseStableReferences(previous: GameState, next: GameState): GameState {
  if (roomsEqual(previous.room, next.room)) next.room = previous.room;
  if (hazardsEqual(previous.hazards, next.hazards)) next.hazards = previous.hazards;
  if (itemsEqual(previous.items, next.items)) next.items = previous.items;
  if (arrayEqual(previous.upgradeChoices, next.upgradeChoices)) next.upgradeChoices = previous.upgradeChoices;
  return next;
}

function roomsEqual(a: GameState['room'], b: GameState['room']): boolean {
  return a.id === b.id && a.name === b.name && a.width === b.width && a.height === b.height && a.cleared === b.cleared;
}

function hazardsEqual(a: HazardState[], b: HazardState[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((hazard, index) => {
    const other = b[index];
    return (
      hazard.id === other.id &&
      hazard.type === other.type &&
      hazard.pos.x === other.pos.x &&
      hazard.pos.y === other.pos.y &&
      hazard.radius === other.radius &&
      hazard.width === other.width &&
      hazard.height === other.height &&
      hazard.dir?.x === other.dir?.x &&
      hazard.dir?.y === other.dir?.y &&
      hazard.exploded === other.exploded &&
      hazard.timer === other.timer
    );
  });
}

function itemsEqual(a: GameState['items'], b: GameState['items']): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return (
      item.id === other.id &&
      item.type === other.type &&
      item.pos.x === other.pos.x &&
      item.pos.y === other.pos.y &&
      item.radius === other.radius &&
      item.collected === other.collected
    );
  });
}

function arrayEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function integratePlayer(state: GameState, dt: number): GameState {
  const next = state;

  let damping = PLAYER_DAMPING;
  if (next.player.upgrades.includes('slippery')) damping *= 0.72;
  if (next.player.upgrades.includes('sticky_boots')) damping *= 1.42;

  next.player.pos = add(next.player.pos, mul(next.player.vel, dt));
  next.player.vel = mul(next.player.vel, Math.exp(-damping * dt));
  next.player.vel = clampLen(next.player.vel, PLAYER_MAX_SPEED);

  const speed = len(next.player.vel);
  if (speed < STOP_SPEED) next.player.vel = v(0, 0);
  syncActionState(next);

  if (next.player.canAct) {
    next.player.lastSafePos = findSafePosition(next);
  }

  return collideBodyWithWorldWalls(next, 'player');
}

function integrateEnemies(state: GameState, dt: number): GameState {
  const next = state;
  for (const enemy of next.enemies) {
    if (!enemy.alive) continue;
    enemy.contactCooldown = Math.max(0, enemy.contactCooldown - dt);
    enemy.hitFlashTimer = Math.max(0, (enemy.hitFlashTimer ?? 0) - dt);
    enemy.pos = add(enemy.pos, mul(enemy.vel, dt));
    enemy.vel = mul(enemy.vel, Math.exp(-2.5 * dt));
    collideCircleWithWorldWalls(next, enemy);
    // Hard backstop: enemies never leave their own room (Isaac-style). Keeps
    // them out of adjacent rooms even if steering/chase pushes them at a doorway.
    if (next.worldMap && enemy.roomInstanceId) {
      const bounds = enemyRoomBounds(next, enemy);
      enemy.pos.x = clamp(enemy.pos.x, bounds.minX + enemy.radius, bounds.maxX - enemy.radius);
      enemy.pos.y = clamp(enemy.pos.y, bounds.minY + enemy.radius, bounds.maxY - enemy.radius);
    }
  }
  return next;
}

function integrateProjectiles(state: GameState, dt: number): GameState {
  const next = state;
  for (const projectile of next.projectiles) {
    if (!projectile.alive) continue;
    const previousPos = { ...projectile.pos };
    const stepVelocity = { ...projectile.vel };
    projectile.life -= dt;
    projectile.pos = add(projectile.pos, mul(stepVelocity, dt));
    projectile.vel = mul(projectile.vel, 0.995);
    if (projectile.life <= 0) projectile.alive = false;
    if (!projectile.alive) continue;

    const halfW = next.room.width / 2;
    const halfH = next.room.height / 2;
    const wallHit = next.worldMap
      ? findProjectileWorldWallHit(next, previousPos, projectile.pos, projectile.radius)
      : findProjectileRoomHit(previousPos, projectile.pos, halfW, halfH);
    const rockHit = findProjectileRockHit(previousPos, projectile.pos, projectile.radius, next.hazards);
    const firstHit = rockHit && (!wallHit || rockHit.t <= wallHit.t) ? rockHit : wallHit;

    if (firstHit?.type === 'rock') {
      if (projectile.type === 'spell' && (projectile.bouncesRemaining ?? 1) > 0) {
        projectile.vel = reflect(projectile.vel, firstHit.normal, 0.65);
        projectile.pos = placeProjectileAfterSurfaceHit(firstHit, projectile.radius);
        projectile.bouncesRemaining = Math.max(0, (projectile.bouncesRemaining ?? 1) - 1);
        projectile.life -= 0.4;
        addProjectileImpactEffect(next, projectile, firstHit.pos, firstHit.normal);
      } else {
        projectile.alive = false;
        addProjectileImpactEffect(next, projectile, firstHit.pos, firstHit.normal);
      }
      continue;
    }

    if (firstHit?.type === 'wall') {
      if (projectile.type === 'spell' && (projectile.bouncesRemaining ?? 1) > 0) {
        projectile.vel = reflect(projectile.vel, firstHit.normal, 0.65);
        projectile.pos = placeProjectileAfterSurfaceHit(firstHit, projectile.radius);
        projectile.bouncesRemaining = Math.max(0, (projectile.bouncesRemaining ?? 1) - 1);
        projectile.life -= 0.4;
        addProjectileImpactEffect(next, projectile, firstHit.pos, firstHit.normal);
      } else {
        projectile.alive = false;
        addProjectileImpactEffect(next, projectile, firstHit.pos, firstHit.normal);
      }
    }
  }
  next.projectiles = next.projectiles.filter((p) => p.alive);
  return next;
}

function addProjectileImpactEffect(state: GameState, projectile: { type: 'arrow' | 'spell'; hostile?: boolean; vel: Vec2 }, pos: Vec2, normal?: Vec2): void {
  const color = projectile.hostile ? '#f8fafc' : projectile.type === 'spell' ? '#d8b4fe' : '#fde68a';
  addEffect(state, 'impact', pos, {
    color,
    radius: projectile.type === 'spell' ? 0.58 : 0.46,
    duration: 0.28,
    height: 0.48,
    shake: projectile.hostile ? 0.2 : 0.16,
    dir: normal ?? normalize(projectile.vel),
  });
}

function resolveHazards(state: GameState, dt: number): GameState {
  const next = state;
  for (const hazard of [...next.hazards]) {
    if (hazard.type === 'pit' && !next.player.pitFallActive && next.player.pitFallTimer <= 0 && hazardContainsPitTrigger(hazard, next.player.pos)) {
      startPitFall(next);
    }

    const playerCanTouchHazards = !next.player.pitFallActive;

    if (playerCanTouchHazards && hazard.type === 'spikes' && hazardContainsCircle(hazard, next.player.pos, next.player.radius)) {
      damagePlayer(next, 1, 'Pinchos del suelo', hazard.pos);
      pushPlayerOutOfSpikeHazard(next, hazard);
    }

    if (playerCanTouchHazards && hazard.type === 'slow' && hazardContainsCircle(hazard, next.player.pos, next.player.radius)) {
      next.player.vel = mul(next.player.vel, 0.92);
    }

    if (playerCanTouchHazards && hazard.type === 'boost' && hazardContainsCircle(hazard, next.player.pos, next.player.radius)) {
      const speed = len(next.player.vel);
      if (speed > 0.05) {
        next.player.vel = add(next.player.vel, mul(normalize(next.player.vel), 8 * dt));
      }
    }

    if (hazard.type === 'rock' && !next.player.pitFallActive) {
      collidePlayerWithRectObstacle(next, hazard);
      collideEnemiesWithRectObstacle(next, hazard);
    } else if (hazard.type === 'rock') {
      collideEnemiesWithRectObstacle(next, hazard);
    }

    if (hazard.type === 'barrel' && !hazard.exploded) {
      if (playerCanTouchHazards && dist(next.player.pos, hazard.pos) <= next.player.radius + (hazard.radius ?? 0.4)) {
        explodeBarrelInPlace(next, hazard.id);
      }
      for (const projectile of next.projectiles) {
        if (projectile.alive && dist(projectile.pos, hazard.pos) <= projectile.radius + (hazard.radius ?? 0.4)) {
          projectile.alive = false;
          addProjectileImpactEffect(next, projectile, projectile.pos);
          explodeBarrelInPlace(next, hazard.id);
        }
      }
      for (const enemy of [...next.enemies]) {
        const currentHazard = next.hazards.find((candidate) => candidate.id === hazard.id);
        if (!enemy.alive || currentHazard?.exploded) continue;
        if (dist(enemy.pos, hazard.pos) <= enemy.radius + (hazard.radius ?? 0.4)) {
          explodeBarrelInPlace(next, hazard.id);
        }
      }
      if (!next.hazards.find((candidate) => candidate.id === hazard.id)?.exploded) {
        collideEnemiesWithCircleObstacle(next, hazard);
      }
    }
  }

  for (const enemy of [...next.enemies]) {
    if (!enemy.alive) continue;
    for (const hazard of [...next.hazards]) {
      if (hazard.type === 'pit' && hazardContainsCircle(hazard, enemy.pos, enemy.radius * 0.7)) {
        damageEnemy(next, enemy.id, 99, 'caída al foso');
      }
      if (hazard.type === 'spikes' && enemy.alive && hazardContainsCircle(hazard, enemy.pos, enemy.radius) && enemy.contactCooldown <= 0) {
        damageEnemy(next, enemy.id, SPIKE_DAMAGE, 'pinchos', normalize(sub(enemy.pos, hazard.pos)));
        enemy.contactCooldown = 0.5;
      }
    }
  }

  for (const trail of [...next.trails]) {
    if (!next.player.pitFallActive && dist(trail.pos, next.player.pos) <= trail.radius + next.player.radius * 0.5) {
      damagePlayer(next, trail.damage, 'Rastro dañino', trail.pos);
    }
  }

  return next;
}

function startPitFall(state: GameState): GameState {
  const next = state;
  next.player.pitFallActive = true;
  next.player.pitFallHeight = 0;
  next.player.pitFallVerticalVelocity = 0;
  next.player.isAiming = false;
  next.player.aimStart = null;
  next.player.aimCurrent = null;
  next.player.canAct = false;
  next.message = 'Caes al foso...';
  return next;
}

function resolveEnemyPlayerCollisions(state: GameState): GameState {
  if (state.player.pitFallActive) return state;
  const next = state;
  for (const enemy of [...next.enemies]) {
    if (!enemy.alive) continue;
    // No room gate: rooms are separated by a wall+gap, so a body hit on another
    // room's enemy only happens by ramming through an open doorway. (Geometry,
    // not a room filter, prevents through-wall hits now.)
    const d = dist(next.player.pos, enemy.pos);
    const minDist = next.player.radius + enemy.radius;
    if (d < minDist) {
      const normal = normalize(sub(next.player.pos, enemy.pos));
      if (!next.player.pitFallActive) {
        next.player.pos = add(enemy.pos, mul(normal, minDist + 0.01));
        next.player.vel = reflect(next.player.vel, normal, ROOM_RESTITUTION);
      }
      resolvePlayerEnemyHitInPlace(next, enemy.id);
      applyExplosiveBodySplash(next, enemy.pos, enemy.id);
    }
  }
  return next;
}

function resolveHostileEnemyPressure(state: GameState): GameState {
  if (state.player.pitFallActive) return state;
  const next = state;
  for (const enemy of [...next.enemies]) {
    if (!enemy.alive || (enemy.type !== 'chaser' && enemy.type !== 'trail' && enemy.type !== 'shooter')) continue;
    if (enemy.contactCooldown > 0) continue;
    const pressureDistance = next.player.radius + enemy.radius + 0.18;
    if (dist(next.player.pos, enemy.pos) > pressureDistance) continue;

    const nextEnemy = next.enemies.find((candidate) => candidate.id === enemy.id)!;
    nextEnemy.contactCooldown = 0.42;
    damagePlayer(next, 1, enemy.type === 'chaser' ? 'Perseguidor te arrolla' : enemy.type === 'trail' ? 'Rastro te arrolla' : 'Tirador te golpea', enemy.pos);
  }
  return next;
}

function resolveProjectileEnemyCollisions(state: GameState): GameState {
  const next = state;
  for (const projectile of [...next.projectiles]) {
    if (!projectile.alive || projectile.hostile) continue;
    for (const enemy of [...next.enemies]) {
      if (!enemy.alive) continue;
      // No room gate: a projectile can only reach another room through an open
      // doorway (it collides with world walls), so hitting a neighbouring-room
      // enemy is a legitimate ranged attack, not a through-wall hit.
      if (projectile.hitEnemyIds?.includes(enemy.id)) continue;
      if (dist(projectile.pos, enemy.pos) <= projectile.radius + enemy.radius) {
        projectile.hitEnemyIds ??= [];
        projectile.hitEnemyIds.push(enemy.id);
        addProjectileImpactEffect(next, projectile, projectile.pos);
        if (projectile.type === 'arrow' && (projectile.pierceRemaining ?? 0) > 0) {
          projectile.pierceRemaining = Math.max(0, (projectile.pierceRemaining ?? 0) - 1);
        } else {
          projectile.alive = false;
        }
        projectile.life -= projectile.alive ? 0.18 : projectile.life;
        damageEnemy(next, enemy.id, projectile.damage, projectile.type === 'spell' ? 'hechizo' : 'flecha', normalize(projectile.vel));
        if (!projectile.alive) break;
      }
    }
  }
  next.projectiles = next.projectiles.filter((p) => p.alive && p.life > 0);
  return next;
}

function resolveHostileProjectilePlayerCollisions(state: GameState): GameState {
  if (state.player.pitFallActive) return state;
  const next = state;
  for (const projectile of [...next.projectiles]) {
    if (!projectile.alive || !projectile.hostile) continue;
    if (dist(projectile.pos, next.player.pos) > projectile.radius + next.player.radius) continue;
    projectile.alive = false;
    addProjectileImpactEffect(next, projectile, projectile.pos);
    damagePlayer(next, projectile.damage, 'Disparo enemigo', projectile.pos);
  }
  next.projectiles = next.projectiles.filter((p) => p.alive && p.life > 0);
  return next;
}

function collectItems(state: GameState): GameState {
  if (state.player.pitFallActive) return state;
  const next = state;
  for (const item of next.items) {
    if (item.collected) continue;
    if (dist(item.pos, next.player.pos) <= item.radius + next.player.radius) {
      item.collected = true;
      if (item.type === 'coin') {
        next.coins += 1;
        next.score += 25;
        next.message = '+1 moneda.';
        addEffect(next, 'pickup', next.player.pos, {
          color: '#facc15',
          duration: 0.78,
          height: next.player.radius + 0.2,
          shake: 0,
        });
      } else if (item.type === 'key') {
        next.hasKey = true;
        next.message = 'Llave plateada conseguida.';
        addEffect(next, 'pickup', item.pos, {
          color: '#e5e7eb',
          duration: 0.88,
          height: next.player.radius + 0.35,
          shake: 0.08,
        });
      } else {
        next.player.hp = Math.min(next.player.maxHp, next.player.hp + 1);
        next.message = 'Poción: +1 vida.';
        addEffect(next, 'heal', item.pos);
      }
    }
  }
  return next;
}

function ageTrailsExplosionsAndEffects(state: GameState, dt: number): GameState {
  const next = state;
  for (const trail of next.trails) trail.life -= dt;
  next.trails = next.trails.filter((trail) => trail.life > 0);
  for (const hazard of next.hazards) {
    if (hazard.exploded && hazard.timer !== undefined) hazard.timer -= dt;
  }
  for (const effect of next.effects) effect.life -= dt;
  next.effects = next.effects.filter((effect) => effect.life > 0);
  return next;
}

