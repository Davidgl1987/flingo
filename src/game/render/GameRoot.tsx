/**
 * Raíz del juego: Canvas R3F + HUD DOM superpuesto. Posee la sesión de juego
 * (objeto mutable fuera del estado de React).
 *
 * Modos:
 * - Run completa (por defecto): mazmorra procedural generada desde el pool de
 *   salas (src/levels/*.json + salas exportadas del editor). La semilla es
 *   aleatoria por run; `?seed=N` en la URL la fuerza (también en reinicios),
 *   para verificación y depuración.
 * - Playtest (prop `playtestRoom`): una sola sala del editor, con botón para
 *   volver a él.
 *
 * Reinicio de run: `restartSession` recrea `session.world` (nueva referencia),
 * así que el árbol del canvas se remonta con una key de secuencia de run —
 * es un evento rarísimo (muerte/victoria), no un patrón de render por estado.
 */

import { Canvas } from '@react-three/fiber';
import { useCallback, useState } from 'react';
import { getRoomPool } from '../content/rooms';
import { AimInput } from '../input/AimInput';
import { createDungeonGameSession, createGameSession, restartSession } from '../session';
import type { GameSession } from '../session';
import type { RoomData } from '../sim/world';
import { useUiStore } from '../store';
import { GameOverModal } from '../ui/GameOverModal';
import { HUD } from '../ui/HUD';
import { UpgradeModal } from '../ui/UpgradeModal';
import { VictoryModal } from '../ui/VictoryModal';
import { AimIndicatorView } from './AimIndicatorView';
import { CameraRig } from './CameraRig';
import { EnemyViews } from './EnemyView';
import { BarrelViews, HazardViews } from './HazardView';
import { HeroView } from './HeroView';
import { ItemViews } from './ItemView';
import { ProjectileViews } from './ProjectileView';
import { PuddleViews } from './PuddleView';
import { RoomView } from './RoomView';
import { useGameLoop } from './useGameLoop';

/** Componente-driver: registra el loop de sim ANTES que los lectores (orden de montaje). */
function SimDriver({ session }: { session: GameSession }) {
  useGameLoop(session);
  return null;
}

/** Semilla forzada vía ?seed=N (para verificar una mazmorra concreta); null si no hay o no es un entero. */
function readForcedSeed(): number | null {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function GameRoot({ playtestRoom = null }: { playtestRoom?: RoomData | null }) {
  // useState con inicializador: la sesión se crea una sola vez y nunca causa re-render.
  const [session] = useState(() =>
    playtestRoom
      ? createGameSession(playtestRoom)
      : createDungeonGameSession(getRoomPool(), readForcedSeed()),
  );
  // Secuencia de run: cambia solo al reiniciar tras game-over/victoria (remonta el canvas).
  const [runSeq, setRunSeq] = useState(0);

  const handleRestart = useCallback(() => {
    restartSession(session);
    useUiStore.getState().resetRun();
    setRunSeq((n) => n + 1);
  }, [session]);

  return (
    <div className="game-root">
      <Canvas
        key={runSeq}
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance', antialias: true }}
        camera={{ fov: 45, near: 0.5, far: 80, position: [0, 9.5, 11] }}
        shadows={false}
      >
        <SimDriver session={session} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 8, 3]} intensity={1.15} />
        <RoomView world={session.world} />
        <HazardViews world={session.world} />
        <BarrelViews session={session} />
        <PuddleViews session={session} />
        <ItemViews session={session} />
        <EnemyViews session={session} />
        <ProjectileViews session={session} />
        <HeroView session={session} />
        <AimIndicatorView session={session} />
        <CameraRig session={session} />
        <AimInput session={session} />
      </Canvas>
      <HUD session={session} />
      <a className="editor-link" href="#/editor">
        {playtestRoom ? '← Volver al editor' : '✎ Editor'}
      </a>
      <UpgradeModal session={session} />
      <GameOverModal onRestart={handleRestart} />
      <VictoryModal onRestart={handleRestart} />
    </div>
  );
}
