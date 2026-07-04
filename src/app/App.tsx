/**
 * Raíz de la aplicación. Routing por hash A MANO (sin react-router):
 *
 *   (sin hash)    → juego (run completa de mazmorra procedural)
 *   #/editor      → editor de niveles (GDD §13)
 *   #/playtest    → playtest de la sala en edición (sala única) + volver
 *
 * Hash y no pathname: la app se sirve desde GitHub Pages con base relativa,
 * donde las rutas de pathname devolverían 404 al recargar.
 */

import { useEffect, useState } from 'react';
import { EditorPage } from '../editor/EditorPage';
import { loadPlaytestRoom } from '../editor/editor-storage';
import { GameRoot } from '../game/render/GameRoot';

type Route = 'game' | 'editor' | 'playtest';

function currentRoute(): Route {
  const hash = window.location.hash;
  if (hash.startsWith('#/editor')) return 'editor';
  if (hash.startsWith('#/playtest')) return 'playtest';
  return 'game';
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (route === 'editor') {
    return <EditorPage />;
  }
  if (route === 'playtest') {
    const room = loadPlaytestRoom();
    // Sin sala válida que probar: vuelve al editor en vez de romper.
    if (!room) {
      window.location.hash = '#/editor';
      return null;
    }
    // key: remonta el juego si se prueba otra sala distinta.
    return <GameRoot key={`playtest-${room.id}`} playtestRoom={room} />;
  }
  return <GameRoot key="game" />;
}
