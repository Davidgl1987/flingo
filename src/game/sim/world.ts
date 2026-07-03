/**
 * Tipos del mundo y factoría. Simulación pura: SIN imports de React ni three.js.
 *
 * Sistema de coordenadas: la sim vive en 2D sobre el plano del suelo.
 * `Vec2.x` ≡ X del mundo 3D y `Vec2.y` ≡ Z del mundo 3D (plano XZ).
 * El origen (0,0) es el centro de la sala; +y apunta "hacia la cámara" (sur).
 */

import { HERO_RADIUS, HERO_START_HP } from '../content/constants';

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

/** Colocación de enemigo en la sala (fase 2 ampliará: hp, ruta de patrulla, dirección...). */
export interface EnemySpawn {
  id: string;
  kind: EnemyKind;
  position: Vec2;
}

export type HazardKind = 'pit' | 'spikes' | 'barrel' | 'rock' | 'slow' | 'boost';

/** Hazard rectangular centrado en `position` (los circulares, ej. barril, usarán width=height). */
export interface HazardSpawn {
  id: string;
  kind: HazardKind;
  position: Vec2;
  width: number;
  height: number;
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

export interface Hero {
  position: Vec2;
  velocity: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  /** Fase 2: i-frames tras recibir daño. */
  invulnerableUntil: number;
  /** Momento (world.time) del último lanzamiento corporal, para el cooldown. */
  lastLaunchTime: number;
}

/** Obstáculo sólido derivado de los hazards 'rock' de la sala. */
export interface Obstacle {
  id: string;
  aabb: AABB;
}

/** Fase 2: proyectiles en pool preasignado. Tipado ya para no romper contratos. */
export interface Projectile {
  active: boolean;
  kind: 'arrow' | 'spell' | 'enemy';
  position: Vec2;
  velocity: Vec2;
  radius: number;
  ttl: number;
  bouncesLeft: number;
}

/** Fase 2: enemigos vivos. Tipado ya para no romper contratos. */
export interface Enemy {
  id: string;
  kind: EnemyKind;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  hp: number;
}

export interface World {
  room: RoomData;
  /** Interior jugable: las caras internas de las 4 paredes. */
  bounds: AABB;
  obstacles: Obstacle[];
  hero: Hero;
  enemies: Enemy[];
  projectiles: Projectile[];
  /** Tiempo de simulación acumulado (s). */
  time: number;
}

/** Construye el estado vivo inicial a partir de los datos de una sala. */
export function createWorld(room: RoomData): World {
  const halfW = room.width / 2;
  const halfH = room.height / 2;

  const obstacles: Obstacle[] = [];
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
    }
  }

  return {
    room,
    bounds: { minX: -halfW, minY: -halfH, maxX: halfW, maxY: halfH },
    obstacles,
    hero: {
      position: { x: room.playerStart.x, y: room.playerStart.y },
      velocity: { x: 0, y: 0 },
      radius: HERO_RADIUS,
      hp: HERO_START_HP,
      maxHp: HERO_START_HP,
      invulnerableUntil: 0,
      lastLaunchTime: -10,
    },
    enemies: [],
    projectiles: [],
    time: 0,
  };
}
