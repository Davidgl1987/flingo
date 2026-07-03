/**
 * Tipos del mundo y factoría. Simulación pura: SIN imports de React ni three.js.
 *
 * Sistema de coordenadas: la sim vive en 2D sobre el plano del suelo.
 * `Vec2.x` ≡ X del mundo 3D y `Vec2.y` ≡ Z del mundo 3D (plano XZ).
 * El origen (0,0) es el centro de la sala; +y apunta "hacia la cámara" (sur).
 */

import { HERO_RADIUS, HERO_START_HP, SHOOTER_CHASE_DURATION } from '../content/constants';
import { createRng, type Rng } from './rng';

export interface Vec2 {
  x: number;
  y: number;
}

/** Caja alineada a ejes en el plano del suelo. */
export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ── Formato de sala (contrato de datos del GDD §13) ───────────────────────

export type RoomTag = 'inicio' | 'combate' | 'llave' | 'recompensa' | 'jefe';

export type DoorSide = 'north' | 'south' | 'east' | 'west';

/** Hueco de puerta en un borde: posición del centro a lo largo del borde (u, desde el centro del lado). */
export interface DoorSlot {
  side: DoorSide;
  offset: number;
}

export type EnemyKind = 'dummy' | 'chaser' | 'spike' | 'trail' | 'shooter';

/** Colocación de enemigo en la sala: posición inicial + destino de patrulla (recorrido ida/vuelta). */
export interface EnemySpawn {
  id: string;
  kind: EnemyKind;
  position: Vec2;
  /** Punto opuesto de la patrulla; si se omite, se deriva automáticamente (eje con más espacio). */
  patrolTarget?: Vec2;
  /** Dirección de la púa del Spike (unitaria); por defecto (0,1). */
  facing?: Vec2;
}

export type HazardKind = 'pit' | 'spikes' | 'barrel' | 'rock' | 'slow' | 'boost';

/** Hazard rectangular centrado en `position` (los circulares, ej. barril, usarán width=height). */
export interface HazardSpawn {
  id: string;
  kind: HazardKind;
  position: Vec2;
  width: number;
  height: number;
  /** Dirección del acelerador (unitaria); por defecto (0,1). Ignorado en otros hazards. */
  direction?: Vec2;
}

export type ItemKind = 'coin' | 'potion' | 'key';

export interface ItemSpawn {
  id: string;
  kind: ItemKind;
  position: Vec2;
}

/** Sala serializable: la moneda de intercambio entre editor, juego y generador procedural. */
export interface RoomData {
  version: 1;
  id: string;
  name: string;
  /** Interior jugable en unidades de mundo (los muros de WALL_THICKNESS quedan fuera). */
  width: number;
  height: number;
  playerStart: Vec2;
  tags: RoomTag[];
  doorSlots: DoorSlot[];
  enemies: EnemySpawn[];
  hazards: HazardSpawn[];
  items: ItemSpawn[];
}

// ── Estado vivo del mundo ─────────────────────────────────────────────────

export type WeaponMode = 'body' | 'arrow' | 'spell';

/** Modificadores acumulados por mejoras (GDD §11): todo empieza en su valor neutro. */
export interface HeroModifiers {
  ramDamageBonus: number;
  arrowDamageBonus: number;
  spellDamageBonus: number;
  spellRadiusBonus: number;
  /** Multiplicador de recarga flecha/hechizo (1 = normal, 0.72 con Pulso Firme). */
  reloadMultiplier: number;
  /** Multiplicador del factor de fricción (mayor = frena antes; menor = desliza más). */
  frictionMultiplier: number;
  explosiveRam: boolean;
  shieldCharges: number;
}

export interface Hero {
  position: Vec2;
  velocity: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  /** I-frames tras recibir daño (world.time hasta el que dura). */
  invulnerableUntil: number;
  /** Momento (world.time) del último lanzamiento corporal, para el cooldown. */
  lastLaunchTime: number;
  weaponMode: WeaponMode;
  lastArrowTime: number;
  lastSpellTime: number;
  hasKey: boolean;
  modifiers: HeroModifiers;
}

/** Obstáculo sólido derivado de los hazards 'rock' de la sala. */
export interface Obstacle {
  id: string;
  aabb: AABB;
}

export type ProjectileOwner = 'hero' | 'enemy';

/** Proyectiles en pool preasignado: activar/desactivar, nunca crear/destruir. */
export interface Projectile {
  active: boolean;
  kind: 'arrow' | 'spell' | 'enemy';
  owner: ProjectileOwner;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  damage: number;
  ttl: number;
  bouncesLeft: number;
  /** Número de enemigos que puede atravesar todavía (flecha). */
  pierceLeft: number;
  /** IDs de enemigos ya golpeados por este proyectil (evita doble impacto el mismo tick). */
  hitEnemyIds: string[];
}

export type ShooterPhase = 'chase' | 'charge';

/** Estado de IA por enemigo (fase 2): campos específicos por arquetipo, todos opcionales salvo los comunes. */
export interface Enemy {
  id: string;
  kind: EnemyKind;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  /** Origen y destino de patrulla (Dummy/Spike/Trail). */
  patrolFrom: Vec2;
  patrolTo: Vec2;
  /** true = moviéndose hacia patrolTo; false = volviendo a patrolFrom. */
  patrolForward: boolean;
  /** Dummy: si está en modo persecución (para aplicar la correa). */
  chasing: boolean;
  /** Spike: dirección de la púa (unitaria), fija. */
  facing: Vec2;
  /** Trail: tiempo restante hasta soltar el próximo charco. */
  trailDropTimer: number;
  /** Shooter: fase del ciclo y tiempo restante en la fase actual. */
  shooterPhase: ShooterPhase;
  shooterPhaseTimer: number;
  /** Flash blanco al ser golpeado: world.time hasta el que dura. */
  hitFlashUntil: number;
  /** Timestamp (world.time) hasta el que el hazard de pinchos no vuelve a dañarle. */
  spikeDamageCooldownUntil: number;
  /** world.time hasta el que el knockback controla la velocidad (la IA no la sobreescribe). */
  knockbackUntil: number;
  /**
   * Lado de giro (+1/−1) elegido al esquivar un obstáculo; persiste mientras
   * el camino directo siga bloqueado (evita oscilar entre lados) y se
   * resetea a 0 al despejarse.
   */
  steerBias: number;
}

/** Charco dejado por el Trail: pool preasignado, activar/desactivar. */
export interface Puddle {
  active: boolean;
  position: Vec2;
  radius: number;
  ttl: number;
}

/** Moneda/poción/llave viva en el mundo (recogible). */
export interface Item {
  id: string;
  kind: ItemKind;
  position: Vec2;
  active: boolean;
}

/** Barril vivo: puede explotar una sola vez (encadena con otros al morir). */
export interface Barrel {
  id: string;
  position: Vec2;
  radius: number;
  exploded: boolean;
}

export type GamePhase = 'playing' | 'room-cleared' | 'game-over';

export interface RunStats {
  roomsCleared: number;
  coinsCollected: number;
  damageDealt: number;
  score: number;
}

export interface World {
  room: RoomData;
  /** Interior jugable: las caras internas de las 4 paredes. */
  bounds: AABB;
  obstacles: Obstacle[];
  hero: Hero;
  enemies: Enemy[];
  projectiles: Projectile[];
  puddles: Puddle[];
  items: Item[];
  barrels: Barrel[];
  /** Hazards no-roca, no-barril (pit/spikes/slow/boost), estáticos durante la sala. */
  hazards: HazardSpawn[];
  /** Última posición firme (fuera de fosos) del héroe, para respawn tras caer. */
  safePosition: Vec2;
  /** world.time hasta el que dura la animación de caída (0 = no está cayendo). */
  fallingUntil: number;
  phase: GamePhase;
  stats: RunStats;
  rng: Rng;
  /**
   * true mientras el jugador tiene el gesto de puntería activo (drag en
   * curso). Lo escribe el driver de render/input antes de cada tick; el
   * Chaser lo usa para acelerar (GDD §7.2). No es estado de física: es una
   * señal externa que la sim solo lee.
   */
  heroAiming: boolean;
  /**
   * Cooldowns por-enemigo reutilizados entre ticks (evita asignar un Map por
   * tick): último world.time en que ese enemigo hizo tick de daño de
   * contacto al héroe / recibió tick de daño de pinchos.
   */
  contactDamageCooldowns: Map<string, number>;
  spikeDamageCooldowns: Map<string, number>;
  /** IDs de enemigos cuya muerte ya soltó su moneda (evita doble drop del mismo cadáver). */
  deadEnemiesDropped: Set<string>;
  /** Tiempo de simulación acumulado (s). */
  time: number;
}

const PROJECTILE_POOL_SIZE = 32;
const PUDDLE_POOL_SIZE = 32;

function createProjectilePool(): Projectile[] {
  const pool: Projectile[] = [];
  for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) {
    pool.push({
      active: false,
      kind: 'arrow',
      owner: 'hero',
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      radius: 0.18,
      damage: 0,
      ttl: 0,
      bouncesLeft: 0,
      pierceLeft: 0,
      hitEnemyIds: [],
    });
  }
  return pool;
}

function createPuddlePool(): Puddle[] {
  const pool: Puddle[] = [];
  for (let i = 0; i < PUDDLE_POOL_SIZE; i++) {
    pool.push({ active: false, position: { x: 0, y: 0 }, radius: 0, ttl: 0 });
  }
  return pool;
}

function createDefaultModifiers(): HeroModifiers {
  return {
    ramDamageBonus: 0,
    arrowDamageBonus: 0,
    spellDamageBonus: 0,
    spellRadiusBonus: 0,
    reloadMultiplier: 1,
    frictionMultiplier: 1,
    explosiveRam: false,
    shieldCharges: 0,
  };
}

/** Deriva el destino de patrulla automático: el eje con más espacio libre dentro de la sala. */
function deriveAutoPatrolTarget(bounds: AABB, position: Vec2, margin: number): Vec2 {
  const spaceLeft = position.x - bounds.minX;
  const spaceRight = bounds.maxX - position.x;
  const spaceDown = position.y - bounds.minY;
  const spaceUp = bounds.maxY - position.y;
  const maxSpace = Math.max(spaceLeft, spaceRight, spaceDown, spaceUp);
  if (maxSpace === spaceLeft) return { x: position.x - Math.min(margin, spaceLeft), y: position.y };
  if (maxSpace === spaceRight) return { x: position.x + Math.min(margin, spaceRight), y: position.y };
  if (maxSpace === spaceDown) return { x: position.x, y: position.y - Math.min(margin, spaceDown) };
  return { x: position.x, y: position.y + Math.min(margin, spaceUp) };
}

function enemyHpFor(kind: EnemyKind, rng: Rng): number {
  switch (kind) {
    case 'dummy':
      return 2;
    case 'chaser':
      return 3;
    case 'spike':
      return 3;
    case 'trail':
      return 3 + Math.floor(rng() * 2); // 3–4
    case 'shooter':
      return 3 + Math.floor(rng() * 2); // 3–4
  }
}

function createEnemy(spawn: EnemySpawn, bounds: AABB, rng: Rng): Enemy {
  const patrolFrom = { x: spawn.position.x, y: spawn.position.y };
  const patrolTo = spawn.patrolTarget
    ? { x: spawn.patrolTarget.x, y: spawn.patrolTarget.y }
    : deriveAutoPatrolTarget(bounds, spawn.position, 1.6);
  const hp = enemyHpFor(spawn.kind, rng);
  return {
    id: spawn.id,
    kind: spawn.kind,
    position: { x: spawn.position.x, y: spawn.position.y },
    velocity: { x: 0, y: 0 },
    radius: 0.4,
    hp,
    maxHp: hp,
    patrolFrom,
    patrolTo,
    patrolForward: true,
    chasing: false,
    facing: spawn.facing ? { x: spawn.facing.x, y: spawn.facing.y } : { x: 0, y: 1 },
    trailDropTimer: 0,
    shooterPhase: 'chase',
    shooterPhaseTimer: SHOOTER_CHASE_DURATION,
    hitFlashUntil: 0,
    spikeDamageCooldownUntil: 0,
    knockbackUntil: 0,
    steerBias: 0,
  };
}

/** Construye el estado vivo inicial a partir de los datos de una sala. Determinista: RNG con semilla. */
export function createWorld(room: RoomData, seed = 1): World {
  const halfW = room.width / 2;
  const halfH = room.height / 2;
  const bounds: AABB = { minX: -halfW, minY: -halfH, maxX: halfW, maxY: halfH };
  const rng = createRng(seed);

  const obstacles: Obstacle[] = [];
  const hazards: HazardSpawn[] = [];
  const barrels: Barrel[] = [];
  for (const hazard of room.hazards) {
    if (hazard.kind === 'rock') {
      obstacles.push({
        id: hazard.id,
        aabb: {
          minX: hazard.position.x - hazard.width / 2,
          maxX: hazard.position.x + hazard.width / 2,
          minY: hazard.position.y - hazard.height / 2,
          maxY: hazard.position.y + hazard.height / 2,
        },
      });
    } else if (hazard.kind === 'barrel') {
      barrels.push({
        id: hazard.id,
        position: { x: hazard.position.x, y: hazard.position.y },
        radius: Math.max(hazard.width, hazard.height) / 2,
        exploded: false,
      });
    } else {
      hazards.push(hazard);
    }
  }

  const enemies = room.enemies.map((spawn) => createEnemy(spawn, bounds, rng));

  const items: Item[] = room.items.map((spawn) => ({
    id: spawn.id,
    kind: spawn.kind,
    position: { x: spawn.position.x, y: spawn.position.y },
    active: true,
  }));

  const playerStart = { x: room.playerStart.x, y: room.playerStart.y };

  return {
    room,
    bounds,
    obstacles,
    hero: {
      position: { x: playerStart.x, y: playerStart.y },
      velocity: { x: 0, y: 0 },
      radius: HERO_RADIUS,
      hp: HERO_START_HP,
      maxHp: HERO_START_HP,
      invulnerableUntil: 0,
      lastLaunchTime: -10,
      weaponMode: 'body',
      lastArrowTime: -10,
      lastSpellTime: -10,
      hasKey: false,
      modifiers: createDefaultModifiers(),
    },
    enemies,
    projectiles: createProjectilePool(),
    puddles: createPuddlePool(),
    items,
    barrels,
    hazards,
    safePosition: { x: playerStart.x, y: playerStart.y },
    fallingUntil: 0,
    phase: 'playing',
    stats: { roomsCleared: 0, coinsCollected: 0, damageDealt: 0, score: 0 },
    rng,
    heroAiming: false,
    contactDamageCooldowns: new Map(),
    spikeDamageCooldowns: new Map(),
    deadEnemiesDropped: new Set(),
    time: 0,
  };
}
