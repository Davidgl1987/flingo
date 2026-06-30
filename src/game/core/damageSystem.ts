import { cloneState } from './clone';
import { BARREL_DAMAGE, BARREL_RADIUS, IMPACT_DAMAGE_MIN_SPEED, PIT_DAMAGE, PIT_FALL_DURATION, SPIKE_DAMAGE } from './constants';
import { addEffect } from './effects';
import { enemyRoomBounds } from './enemyAi';
import type { EnemyState, GameState, Vec2 } from './types';
import { add, clamp, dist, dot, len, mul, normalize, sub } from './vector';

const ENEMY_HIT_FLASH_TIME = 0.18;
const ENEMY_HIT_PUSH_DISTANCE = 0.18;
const ENEMY_HIT_PUSH_SPEED = 2.4;
const PLAYER_HIT_PUSH_SPEED = 3.2;

// NOTE: the functions in this module mutate the GameState passed to them. The
// tick pipeline (simulation.ts) calls them on a single per-frame draft, so they
// must not deep-clone. The pure wrappers exported at the bottom clone once and
// delegate, preserving the immutable contract relied on by the logic tests.

export function damagePlayer(state: GameState, amount: number, reason: string, sourcePos?: Vec2): void {
  if (amount <= 0) return;
  if (state.player.invulnerableTimer > 0) return;

  if (state.player.shieldCharges > 0) {
    state.player.shieldCharges -= 1;
    state.player.invulnerableTimer = 0.45;
    state.message = `Escudo bloqueado: ${reason}.`;
    addEffect(state, 'shield', state.player.pos, { color: playerColor(state) });
    return;
  }

  state.player.hp = Math.max(0, state.player.hp - amount);
  state.player.invulnerableTimer = 0.7;
  state.message = `${reason}: -${amount} vida.`;
  if (sourcePos) {
    const pushDir = normalize(sub(state.player.pos, sourcePos));
    state.player.vel = add(state.player.vel, mul(pushDir, PLAYER_HIT_PUSH_SPEED));
  }
  addEffect(state, 'damage', state.player.pos, {
    color: playerColor(state),
    dir: sourcePos ? normalize(sub(state.player.pos, sourcePos)) : undefined,
  });

  if (state.player.hp <= 0) {
    state.phase = 'game-over';
    state.message = 'Has caído. Reinicia y ajusta la estrategia.';
  }
}

export function respawnAfterPitInPlace(state: GameState, fallPosOverride?: Vec2): void {
  const fallPos = fallPosOverride ? { ...fallPosOverride } : { ...state.player.pos };
  if (state.player.invulnerableTimer <= 0) {
    state.player.hp = Math.max(0, state.player.hp - PIT_DAMAGE);
    state.player.invulnerableTimer = 0.7;
    state.message = `Foso: -${PIT_DAMAGE} vida.`;
  }
  state.player.pos = { ...state.player.lastSafePos };
  state.player.vel = { x: 0, y: 0 };
  state.player.pitFallActive = false;
  state.player.pitFallHeight = 0;
  state.player.pitFallVerticalVelocity = 0;
  state.player.isAiming = false;
  state.player.aimStart = null;
  state.player.aimCurrent = null;
  state.player.actionCooldown = PIT_FALL_DURATION;
  state.player.actionCooldowns[state.player.weaponMode] = PIT_FALL_DURATION;
  state.player.canAct = false;
  state.player.pitFallTimer = PIT_FALL_DURATION;
  state.player.pitFallPos = fallPos;
  if (state.player.hp <= 0) {
    state.phase = 'game-over';
    state.message = 'Has caído. Reinicia y ajusta la estrategia.';
  }
}

export function resolvePlayerEnemyHitInPlace(state: GameState, enemyId: string): void {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy || !enemy.alive) return;

  const speed = len(state.player.vel);
  const isBodyImpact = speed >= IMPACT_DAMAGE_MIN_SPEED;
  if (enemy.contactCooldown > 0 && !isBodyImpact) return;

  enemy.contactCooldown = Math.max(enemy.contactCooldown, isBodyImpact ? 0.08 : 0.22);

  if (enemy.type === 'spike' && enemy.spikeDir) {
    const fromEnemyToPlayer = normalize(sub(state.player.pos, enemy.pos));
    const dangerous = dot(fromEnemyToPlayer, normalize(enemy.spikeDir)) > 0.25;
    if (dangerous) {
      damagePlayer(state, SPIKE_DAMAGE, 'Has golpeado pinchos', enemy.pos);
      return;
    }
  }

  if (isBodyImpact) {
    const damage = Math.max(1, Math.floor(state.player.bodyDamage + speed * 0.32));
    damageEnemy(state, enemyId, damage, 'impacto', normalize(sub(enemy.pos, state.player.pos)));
    return;
  }

  damagePlayer(state, 1, 'Contacto enemigo', enemy.pos);
}

export function damageEnemy(state: GameState, enemyId: string, amount: number, source: string, impactDir?: Vec2): void {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy || !enemy.alive) return;

  applyEnemyHitFeedback(state, enemy, impactDir);
  enemy.hp -= amount;
  state.score += amount * 10;
  state.message = `${enemyLabel(enemy)} recibe ${amount} daño por ${source}.`;
  addEffect(state, 'impact', enemy.pos);

  if (enemy.hp <= 0) {
    enemy.alive = false;
    enemy.hp = 0;
    state.coins += 1;
    state.score += 50;
    state.message = `${enemyLabel(enemy)} eliminado. +1 moneda.`;
    addEffect(state, 'death', enemy.pos);
  }
}

export function explodeBarrelInPlace(state: GameState, barrelId: string): void {
  const barrel = state.hazards.find((h) => h.id === barrelId && h.type === 'barrel');
  if (!barrel || barrel.exploded) return;

  barrel.exploded = true;
  barrel.timer = 0.3;
  state.message = '¡Barril explosivo!';
  addEffect(state, 'explosion', barrel.pos, { radius: BARREL_RADIUS });

  for (const enemy of [...state.enemies]) {
    if (enemy.alive && dist(enemy.pos, barrel.pos) <= BARREL_RADIUS + enemy.radius) {
      damageEnemy(state, enemy.id, BARREL_DAMAGE, 'explosión', normalize(sub(enemy.pos, barrel.pos)));
    }
  }

  if (dist(state.player.pos, barrel.pos) <= BARREL_RADIUS + state.player.radius) {
    damagePlayer(state, 1, 'Explosión cercana', barrel.pos);
  }
}

export function applyExplosiveBodySplash(state: GameState, origin: Vec2, excludedEnemyId: string): void {
  if (!state.player.upgrades.includes('explosive_body')) return;
  for (const enemy of [...state.enemies]) {
    if (!enemy.alive || enemy.id === excludedEnemyId) continue;
    if (dist(enemy.pos, origin) < 1.55 + enemy.radius) {
      damageEnemy(state, enemy.id, 1, 'onda de choque', normalize(sub(enemy.pos, origin)));
    }
  }
}

export function enemyLabel(enemy: EnemyState): string {
  switch (enemy.type) {
    case 'dummy': return 'Dummy';
    case 'chaser': return 'Perseguidor';
    case 'spike': return 'Pinchos';
    case 'trail': return 'Rastro';
    case 'shooter': return 'Tirador';
  }
}

function applyEnemyHitFeedback(state: GameState, enemy: EnemyState, impactDir?: Vec2): void {
  const direction = normalize(impactDir ?? enemy.vel);
  if (len(direction) <= 0) {
    enemy.hitFlashTimer = ENEMY_HIT_FLASH_TIME;
    return;
  }

  enemy.pos = add(enemy.pos, mul(direction, ENEMY_HIT_PUSH_DISTANCE));
  enemy.vel = add(enemy.vel, mul(direction, ENEMY_HIT_PUSH_SPEED));
  // Clamp the knockback to the enemy's OWN room (world coords), not the
  // origin-centered state.room, which teleported enemies of offset rooms toward
  // the map origin when hit (they "reappeared" elsewhere / became unreachable).
  const bounds = enemyRoomBounds(state, enemy);
  enemy.pos.x = clamp(enemy.pos.x, bounds.minX + enemy.radius, bounds.maxX - enemy.radius);
  enemy.pos.y = clamp(enemy.pos.y, bounds.minY + enemy.radius, bounds.maxY - enemy.radius);
  enemy.hitFlashTimer = ENEMY_HIT_FLASH_TIME;
}

function playerColor(state: GameState): string {
  switch (state.player.weaponMode) {
    case 'body': return '#38bdf8';
    case 'arrow': return '#facc15';
    case 'spell': return '#c084fc';
  }
}

// --- Pure wrappers: clone once, then delegate. Used by the logic tests, which
// rely on the input state staying untouched. ---

export function respawnAfterPit(state: GameState, fallPosOverride?: Vec2): GameState {
  const next: GameState = cloneState(state);
  respawnAfterPitInPlace(next, fallPosOverride);
  return next;
}

export function resolvePlayerEnemyHit(state: GameState, enemyId: string): GameState {
  const next: GameState = cloneState(state);
  resolvePlayerEnemyHitInPlace(next, enemyId);
  return next;
}

export function explodeBarrel(state: GameState, barrelId: string): GameState {
  const next: GameState = cloneState(state);
  explodeBarrelInPlace(next, barrelId);
  return next;
}
