/**
 * Sesión de juego: el objeto mutable que posee la sim y el estado de alta
 * frecuencia compartido entre input y render. Vive fuera de React (se guarda
 * en un ref/useState-inicial); NUNCA se usa como estado de React.
 */

import { UPGRADE_CHOICES } from './content/constants';
import { createEventQueue, type EventQueue } from './sim/events';
import { applyUpgrade, rollUpgradeChoices, type UpgradeDef, type UpgradeId } from './sim/upgrades';
import { createWorld, type RoomData, type World } from './sim/world';

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
  /** Sala original con la que se creó el mundo (para reiniciar la run). */
  room: RoomData;
}

export function createGameSession(room: RoomData): GameSession {
  const world = createWorld(room);
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

/** Reinicia la run completa: recrea el mundo desde la sala original de la sesión. */
export function restartSession(session: GameSession): void {
  const world = createWorld(session.room);
  session.world = world;
  session.accumulator = 0;
  session.renderAlpha = 1;
  session.heroPrevX = world.hero.position.x;
  session.heroPrevY = world.hero.position.y;
  session.aim.active = false;
  session.aim.force = 0;
  session.offeredUpgrades = new Set();
  session.upgradeChoices = [];
}
