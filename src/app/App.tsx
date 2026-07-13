/**
 * Raíz de la aplicación. Routing por hash A MANO (sin react-router):
 *
 *   (sin hash)    → pantalla de título → juego (run completa de mazmorra procedural)
 *   #/editor      → editor de niveles (GDD §13)
 *   #/playtest    → playtest de la sala en edición (sala única) + volver
 *
 * Hash y no pathname: la app se sirve desde GitHub Pages con base relativa,
 * donde las rutas de pathname devolverían 404 al recargar.
 *
 * Pantalla de título (feature de presentación): la ruta 'game' muestra
 * `TitleScreen` hasta que el jugador pulsa "Jugar" (estado `started`), que
 * monta `GameRoot` (crea la sesión). `?boss=<id>` (debug de playtest de
 * jefes) y `#/playtest` son herramientas de desarrollo: saltan DIRECTO al
 * juego, sin pasar por el título.
 */

import { useEffect, useState } from 'react';
import { EditorPage } from '@/editor/EditorPage';
import { loadPlaytestRoom } from '@/editor/storage';
import { GameRoot } from '@/game/render/GameRoot';
import { useUiStore } from '@/game/session/store';
import { TitleScreen } from '@/game/ui/TitleScreen';

type Route = 'game' | 'editor' | 'playtest';

function currentRoute(): Route {
  const hash = window.location.hash;
  if (hash.startsWith('#/editor')) return 'editor';
  if (hash.startsWith('#/playtest')) return 'playtest';
  return 'game';
}

/** `?boss=` (herramienta de playtest de jefes, ver debug-params.ts): salta directo al juego, sin título. */
function hasForcedBossParam(): boolean {
  return new URLSearchParams(window.location.search).has('boss');
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);
  // Pantalla de título: arranca ya "jugando" si `?boss=` fuerza una arena de
  // jefe (herramienta de dev, no debe interponerse el título).
  const [started, setStarted] = useState(hasForcedBossParam);

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

  if (!started) {
    return <TitleScreen onPlay={() => setStarted(true)} />;
  }

  const handleExitToTitle = () => {
    // Evita arrastrar HUD (hp/monedas/mejoras) de la run anterior al volver al
    // título: al pulsar "Jugar" de nuevo, GameRoot se remonta y crea sesión
    // nueva desde cero.
    useUiStore.getState().resetRun();
    setStarted(false);
  };

  return <GameRoot key="game" onExitToTitle={handleExitToTitle} />;
}
