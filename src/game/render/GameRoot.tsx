/**
 * Raíz del juego: Canvas R3F + HUD DOM superpuesto. Posee la sesión de juego
 * (objeto mutable fuera del estado de React).
 */

import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { testRoom } from '../content/rooms';
import { AimInput } from '../input/AimInput';
import { createGameSession, type GameSession } from '../session';
import { HUD } from '../ui/HUD';
import { AimIndicatorView } from './AimIndicatorView';
import { CameraRig } from './CameraRig';
import { HeroView } from './HeroView';
import { RoomView } from './RoomView';
import { useGameLoop } from './useGameLoop';

/** Componente-driver: registra el loop de sim ANTES que los lectores (orden de montaje). */
function SimDriver({ session }: { session: GameSession }) {
  useGameLoop(session);
  return null;
}

export function GameRoot() {
  // useState con inicializador: la sesión se crea una sola vez y nunca causa re-render.
  const [session] = useState(() => createGameSession(testRoom));

  return (
    <div className="game-root">
      <Canvas
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance', antialias: true }}
        camera={{ fov: 45, near: 0.5, far: 80, position: [0, 9.5, 11] }}
        shadows={false}
      >
        <SimDriver session={session} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 8, 3]} intensity={1.15} />
        <RoomView world={session.world} />
        <HeroView session={session} />
        <AimIndicatorView session={session} />
        <CameraRig session={session} />
        <AimInput session={session} />
      </Canvas>
      <HUD />
    </div>
  );
}
