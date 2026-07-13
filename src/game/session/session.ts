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
import { createRng, type Rng } from '@/engine/rng';
import { applyUpgrade, rollUpgradeChoices, type UpgradeDef, type UpgradeId } from './upgrades';
import { createWorld } from '@/game/world/create';
import type { BossId, RoomData, World } from '@/game/world/types';

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
  /**
   * Run multi-mazmorra (GDD §10): orden de jefes de la run (uno por mazmorra
   * encadenada), barajado con una semilla derivada de la de la run. Vacío en
   * modo sala única (playtest/`?boss=`): esos modos no encadenan mazmorras.
   */
  bossSequence: BossId[];
  /** Índice del jefe/mazmorra actual dentro de `bossSequence` (0 = primera). */
  stageIndex: number;
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
    bossSequence: [],
    stageIndex: 0,
  };
}

/** Semilla aleatoria para una nueva run (no determinista: solo el generador en sí lo es dada una semilla). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

/**
 * Jefes de DISEÑO disponibles en el pool (salas con `boss` definido,
 * excluyendo `test-boss`: es el jefe trivial de la Fase B0, solo dev/tests —
 * ver rooms.ts), sin duplicados. Orden de aparición en el pool, sin barajar
 * (el llamador baraja con su propio RNG sembrado).
 */
function designBossesInPool(pool: readonly RoomData[]): BossId[] {
  const seen = new Set<BossId>();
  const bosses: BossId[] = [];
  for (const room of pool) {
    if (room.boss === undefined || room.boss === 'test-boss') continue;
    if (seen.has(room.boss)) continue;
    seen.add(room.boss);
    bosses.push(room.boss);
  }
  return bosses;
}

/** Baraja (Fisher-Yates a través de splice, mismo estilo que `rollUpgradeChoices`) consumiendo `rng` en orden. */
function shuffleBosses(bosses: readonly BossId[], rng: Rng): BossId[] {
  const pool = bosses.slice();
  const shuffled: BossId[] = [];
  while (pool.length > 0) {
    const index = Math.floor(rng() * pool.length);
    shuffled.push(pool[index]);
    pool.splice(index, 1);
  }
  return shuffled;
}

/**
 * Secuencia de jefes de una run (GDD §10, run multi-mazmorra): todos los
 * jefes de diseño del pool, en orden aleatorio, determinista para la semilla
 * dada (RNG propio, independiente del que usa `generateDungeon`).
 */
function deriveBossSequence(pool: readonly RoomData[], seed: number): BossId[] {
  return shuffleBosses(designBossesInPool(pool), createRng(seed));
}

/**
 * Sesión de run completa (GDD §10): genera una mazmorra de ROOMS_PER_RUN
 * salas a partir del pool. `forcedSeed` (de ?seed=N) fija el mapa también en
 * reinicios; sin ella, cada run sortea una semilla nueva.
 *
 * Run multi-mazmorra: deriva `bossSequence` (todos los jefes de diseño del
 * pool, barajados) de la semilla de la run, y genera la mazmorra del primer
 * stage con la sala de ESE jefe concreto (`generateDungeon(..., bossId)`).
 * `isFinalDungeon` es true solo si hay un único jefe en la secuencia.
 */
export function createDungeonGameSession(pool: RoomData[], forcedSeed: number | null = null): GameSession {
  const seed = forcedSeed ?? randomSeed();
  const bossSequence = deriveBossSequence(pool, seed);
  const stageIndex = 0;
  const dungeon = generateDungeon(seed, pool, ROOMS_PER_RUN, bossSequence[stageIndex]);
  const world = createDungeonWorld(dungeon, seed);
  initBossEnemies(world);
  world.isFinalDungeon = stageIndex >= bossSequence.length - 1;
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
    bossSequence,
    stageIndex,
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
 * no repetir el mismo mapa) Y re-baraja `bossSequence` desde el stage 0 (morir
 * o reiniciar pierde el progreso de la secuencia de jefes); en modo sala
 * única recrea la misma sala.
 */
export function restartSession(session: GameSession): void {
  let world: World;
  session.stageIndex = 0;
  if (session.dungeonPool) {
    session.seed = session.forcedSeed ?? randomSeed();
    session.bossSequence = deriveBossSequence(session.dungeonPool, session.seed);
    const dungeon = generateDungeon(session.seed, session.dungeonPool, ROOMS_PER_RUN, session.bossSequence[0]);
    world = createDungeonWorld(dungeon, session.seed);
    world.isFinalDungeon = session.stageIndex >= session.bossSequence.length - 1;
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

/**
 * Avanza a la siguiente mazmorra de la run (GDD §10, run multi-mazmorra):
 * jefe derrotado pero quedan más en `bossSequence` (fase 'dungeon-cleared').
 * A diferencia de `restartSession`, NO es un reinicio: traspasa el progreso
 * del héroe (hp/maxHp/modificadores) y las estadísticas ACUMULADAS del mundo
 * anterior al nuevo, no reinicia `offeredUpgrades` (las mejoras no-repetibles
 * siguen agotadas hasta morir) y no conserva `hasKey` (cada mazmorra tiene su
 * propia llave — `createDungeonWorld` ya la deja en false).
 *
 * No-op si no queda un stage siguiente (llamador solo debe invocarla desde la
 * fase 'dungeon-cleared', que ya garantiza que hay más jefes por delante).
 */
export function advanceToNextDungeon(session: GameSession): void {
  const nextStageIndex = session.stageIndex + 1;
  if (!session.dungeonPool || nextStageIndex >= session.bossSequence.length) return;

  const prevWorld = session.world;
  session.stageIndex = nextStageIndex;
  session.seed = session.forcedSeed !== null ? session.forcedSeed + session.stageIndex : randomSeed();

  const bossId = session.bossSequence[session.stageIndex];
  const dungeon = generateDungeon(session.seed, session.dungeonPool, ROOMS_PER_RUN, bossId);
  const world = createDungeonWorld(dungeon, session.seed);
  initBossEnemies(world);
  world.isFinalDungeon = session.stageIndex >= session.bossSequence.length - 1;

  // Traspaso de progreso entre mazmorras encadenadas: vida y modificadores del
  // héroe, y estadísticas ACUMULADAS de toda la run (no se reinician por
  // mazmorra). `hasKey` NO se traspasa: cada mazmorra tiene su propia llave.
  world.hero.hp = prevWorld.hero.hp;
  world.hero.maxHp = prevWorld.hero.maxHp;
  world.hero.modifiers = { ...prevWorld.hero.modifiers };
  world.stats = { ...prevWorld.stats };

  session.room = world.room;
  session.world = world;
  session.accumulator = 0;
  session.renderAlpha = 1;
  session.heroPrevX = world.hero.position.x;
  session.heroPrevY = world.hero.position.y;
  session.aim.active = false;
  session.aim.force = 0;
  // offeredUpgrades NO se resetea (persisten hasta morir, GDD §10).
  session.effects.state.trauma = 0;
  session.effects.state.hitStopRemaining = 0;
}
