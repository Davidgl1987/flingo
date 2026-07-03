/**
 * Loop raíz: hace tick de la sim con acumulador de timestep fijo (60 Hz)
 * dentro de useFrame. Guarda la posición previa del héroe para que los
 * componentes de render interpolen. React NUNCA está en el hot path:
 * aquí no hay setState, solo mutación del objeto sesión.
 */

import { useFrame } from '@react-three/fiber';
import { FIXED_DT } from '../content/constants';
import type { GameSession } from '../session';
import { drainEvents, type GameEvent } from '../sim/events';
import { stepWorld } from '../sim/step';

/** Tope de tiempo de frame acumulable (evita la espiral de la muerte en tabs suspendidas). */
const MAX_FRAME_TIME = 0.25;

// Fase 3 (juice): partículas/shake/hit-stop consumirán aquí los eventos.
// De momento se drenan para que el ring buffer no se sature.
const discardEvent = (_event: GameEvent): void => {};

export function useGameLoop(session: GameSession): void {
  useFrame((_, delta) => {
    const world = session.world;
    let accumulator = session.accumulator + (delta > MAX_FRAME_TIME ? MAX_FRAME_TIME : delta);
    while (accumulator >= FIXED_DT) {
      session.heroPrevX = world.hero.position.x;
      session.heroPrevY = world.hero.position.y;
      stepWorld(world, session.events);
      accumulator -= FIXED_DT;
    }
    session.accumulator = accumulator;
    session.renderAlpha = accumulator / FIXED_DT;
    drainEvents(session.events, discardEvent);
  });
}
