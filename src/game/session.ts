/**
 * Sesión de juego: el objeto mutable que posee la sim y el estado de alta
 * frecuencia compartido entre input y render. Vive fuera de React (se guarda
 * en un ref/useState-inicial); NUNCA se usa como estado de React.
 */

import { createEventQueue, type EventQueue } from './sim/events';
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
  };
}
