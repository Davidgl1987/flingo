/** Helpers de test compartidos entre los tests de jefes (lifecycle/guardian/queen/movement). */

import { drainEvents, type EventQueue, type GameEvent } from '@/game/sim/events';

/** Drena la cola de eventos y devuelve solo sus tipos, en orden, para asserts legibles. */
export function collectTypes(events: EventQueue): GameEvent['type'][] {
  const types: GameEvent['type'][] = [];
  drainEvents(events, (e) => types.push(e.type));
  return types;
}
