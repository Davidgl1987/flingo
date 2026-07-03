import { GameRoot } from '../game/render/GameRoot';

/**
 * Raíz de la aplicación.
 *
 * Fase 1: solo existe la ruta del juego. El editor de salas (src/editor/)
 * se añadirá en una fase posterior con su propia ruta.
 */
export function App() {
  return <GameRoot />;
}
