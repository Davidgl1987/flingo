/**
 * Sesión de juego: el objeto mutable que posee la sim y el estado de alta
 * frecuencia compartido entre input y render. Vive fuera de React (se guarda
 * en un ref/useState-inicial); NUNCA se usa como estado de React.
 */

import { ROOMS_PER_RUN, UPGRADE_CHOICES } from '@/game/world/constants';
import { createEffectsState, type EffectsState } from '@/game/features/effects/effectsState';
import { ParticlePool } from '@/game/features/effects/particles';
import { ShockwavePool } from '@/game/features/effects/shockwave';
import { TrailPool } from '@/game/features/effects/trail';
import { initBossEnemies } from '@/game/features/bosses/lifecycle';
import { generateDungeon } from '@/game/features/dungeon/dungeon';
import { createDungeonWorld } from '@/game/features/dungeon/dungeon-world';
import { createEventQueue, type EventQueue } from '@/engine/events';
import { applyUpgrade, rollUpgradeChoices, type UpgradeDef, type UpgradeId } from './upgrades';
import { createWorld } from '@/game/world/create';
import type { RoomData, World } from '@/game/world/types';

/** Estado de effects de la sesión: sobrevive a los reinicios de run (no se recrea en restartSession). */
export interface EffectsSession {
  particles: ParticlePool;
  trail: TrailPool;
  shockwaves: ShockwavePool;
  state: EffectsState;
}

function createEffectsSession(): EffectsSession {
  return {
    particles: new ParticlePool(),
    trail: new TrailPool(),
    shockwaves: new ShockwavePool(),
    state: createEffectsState(),
  };
}

/** Estado de puntería escrito por input/ y leído por render/ (sin re-renders). */
export interface AimState {
  active: boolean;
  /** Dirección de tiro unitaria (arrastre invertido), plano del suelo. */
  dirX: number;
  dirY: number;
  /** Fuerza normalizada [0,1] (arrastre clampado a MAX_DRAG_DISTANCE). */
  force: number;
}

export interface GameSession {
  world: World;
  events: EventQueue;
  aim: AimState;
  /** Acumulador de timestep fijo (s pendientes de simular). */
  accumulator: number;
  /** Fracción [0,1) del tick actual, para interpolar el render. */
  renderAlpha: number;
  /** Posición del héroe en el tick anterior, para interpolación de render. */
  heroPrevX: number;
  heroPrevY: number;
  /** IDs de mejoras no-repetibles ya ofrecidas/aplicadas en esta run. */
  offeredUpgrades: Set<UpgradeId>;
  /** Las 3 opciones actuales del modal de mejora (recalculadas al limpiar sala). */
  upgradeChoices: UpgradeDef[];
  /** Sala original con la que se creó el mundo (modo sala única: playtest del editor). */
  room: RoomData;
  /** Pool de salas y semilla usados para (re)generar la mazmorra (modo run completa); null en modo sala única. */
  dungeonPool: RoomData[] | null;
  seed: number;
  /**
   * Semilla forzada (?seed=N en la URL, para verificación/depuración): si no
   * es null, los reinicios regeneran SIEMPRE el mismo mapa en vez de sortear
   * una semilla nueva.
   */
  forcedSeed: number | null;
  /** Partículas/estela/trauma/hit-stop (fase 4, GDD §12): independiente del mundo, sobrevive a reinicios de run. */
  effects: EffectsSession;
}

/** Sesión de sala única (playtest del editor, fases 1-2): sin mazmorra multi-sala. */
export function createGameSession(room: RoomData): GameSession {
  const world = createWorld(room);
  initBossEnemies(world);
  return {
    world,
    events: createEventQueue(64),
    aim: { active: false, dirX: 0, dirY: 0, force: 0 },
    accumulator: 0,
    renderAlpha: 1,
    heroPrevX: world.hero.position.x,
    heroPrevY: world.hero.position.y,
    offeredUpgrades: new Set(),
    upgradeChoices: [],
    room,
    dungeonPool: null,
    seed: 1,
    forcedSeed: null,
    effects: createEffectsSession(),
  };
}

/** Semilla aleatoria para una nueva run (no determinista: solo el generador en sí lo es dada una semilla). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

/**
 * Sesión de run completa (GDD §10): genera una mazmorra de ROOMS_PER_RUN
 * salas a partir del pool. `forcedSeed` (de ?seed=N) fija el mapa también en
 * reinicios; sin ella, cada run sortea una semilla nueva.
 */
export function createDungeonGameSession(pool: RoomData[], forcedSeed: number | null = null): GameSession {
  const seed = forcedSeed ?? randomSeed();
  const dungeon = generateDungeon(seed, pool, ROOMS_PER_RUN);
  const world = createDungeonWorld(dungeon, seed);
  initBossEnemies(world);
  return {
    world,
    events: createEventQueue(64),
    aim: { active: false, dirX: 0, dirY: 0, force: 0 },
    accumulator: 0,
    renderAlpha: 1,
    heroPrevX: world.hero.position.x,
    heroPrevY: world.hero.position.y,
    offeredUpgrades: new Set(),
    upgradeChoices: [],
    room: world.room,
    dungeonPool: pool,
    seed,
    forcedSeed,
    effects: createEffectsSession(),
  };
}

/** Calcula las 3 opciones de mejora al entrar en fase 'room-cleared'; idempotente si ya hay opciones calculadas para esta sala. */
export function ensureUpgradeChoices(session: GameSession): UpgradeDef[] {
  if (session.upgradeChoices.length === 0) {
    session.upgradeChoices = rollUpgradeChoices(
      session.world.hero,
      session.world.rng,
      UPGRADE_CHOICES,
      session.offeredUpgrades,
    );
  }
  return session.upgradeChoices;
}

/** Aplica la mejora elegida, marca las no-repetibles como ofrecidas y reanuda el juego. */
export function chooseUpgrade(session: GameSession, def: UpgradeDef): void {
  applyUpgrade(session.world, def, session.events);
  if (!def.repeatable) {
    session.offeredUpgrades.add(def.id);
  }
  session.upgradeChoices = [];
  session.world.phase = 'playing';
}

/**
 * Pausa la sim (GDD §12: botón de pausa + modal). Solo tiene efecto durante
 * 'playing' (no se puede pausar sobre un modal de mejora/fin de run). La sim
 * se detiene por fase, sin desmontar nada: `stepWorld` ya trata cualquier
 * fase != 'playing' como "solo avanzar el reloj".
 */
export function pauseGame(session: GameSession): void {
  if (session.world.phase === 'playing') {
    session.world.phase = 'paused';
  }
}

/** Reanuda desde pausa; no-op si la fase no es 'paused' (ej. si mientras tanto hubo game-over). */
export function resumeGame(session: GameSession): void {
  if (session.world.phase === 'paused') {
    session.world.phase = 'playing';
  }
}

/**
 * Reinicia la run completa. En modo mazmorra (dungeonPool no nulo) genera un
 * mapa NUEVO con una semilla nueva (GDD §10.3: reinicio de run = nueva run,
 * no repetir el mismo mapa); en modo sala única recrea la misma sala.
 */
export function restartSession(session: GameSession): void {
  let world: World;
  if (session.dungeonPool) {
    session.seed = session.forcedSeed ?? randomSeed();
    const dungeon = generateDungeon(session.seed, session.dungeonPool, ROOMS_PER_RUN);
    world = createDungeonWorld(dungeon, session.seed);
    session.room = world.room;
  } else {
    world = createWorld(session.room);
  }
  initBossEnemies(world);
  session.world = world;
  session.accumulator = 0;
  session.renderAlpha = 1;
  session.heroPrevX = world.hero.position.x;
  session.heroPrevY = world.hero.position.y;
  session.aim.active = false;
  session.aim.force = 0;
  session.offeredUpgrades = new Set();
  session.upgradeChoices = [];
  // Trauma/hit-stop no deben sobrevivir a un reinicio de run (evita un shake
  // heredado de la muerte al aparecer en la nueva run); los pools de
  // partículas/estela sí se conservan (son geometría pura, sin estado de sala).
  session.effects.state.trauma = 0;
  session.effects.state.hitStopRemaining = 0;
}
