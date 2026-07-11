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
import { getRoomPool } from '@/game/content/rooms';
import { AimInput } from '@/game/input/AimInput';
import { ParticleView } from '@/game/effects/ParticleView';
import { ShockwaveView } from '@/game/effects/ShockwaveView';
import { TrailView } from '@/game/effects/TrailView';
import { createDungeonGameSession, createGameSession, restartSession } from '@/game/session';
import type { GameSession } from '@/game/session';
import { forceBossPhase } from '@/game/sim/boss';
import type { RoomData } from '@/game/sim/world';
import { useUiStore } from '@/game/store';
import { DamageVignette } from '@/game/ui/DamageVignette';
import { FpsCounter } from '@/game/ui/FpsCounter';
import { GameOverModal } from '@/game/ui/GameOverModal';
import { HUD } from '@/game/ui/HUD';
import { PauseModal } from '@/game/ui/PauseModal';
import { UpgradeModal } from '@/game/ui/UpgradeModal';
import { VictoryModal } from '@/game/ui/VictoryModal';
import { AimIndicatorView } from './AimIndicatorView';
import { CameraRig } from './CameraRig';
import { EnemyViews } from './EnemyView';
import { BarrelViews, HazardViews } from './HazardView';
import { HeroView } from './HeroView';
import { ItemViews } from './ItemView';
import { ProjectileViews } from './ProjectileView';
import { PuddleViews } from './PuddleView';
import { QueenColumnsView, QueenTethersView } from './QueenColumnsView';
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

/**
 * Alias cortos de `?boss=` (herramienta de playtest, BOSSES_PLAN B5): salta
 * directo a la arena del jefe en modo sala única, sin recorrer la mazmorra.
 * Acepta el id del jefe (`?boss=guardian`) o el alias de fase (`?boss=b1`).
 * `b0`/`test-boss` solo existe en dev (DEV_ONLY_LEVEL_JSON de rooms.ts).
 */
const BOSS_PARAM_ALIAS: Record<string, string> = {
  b0: 'test-boss',
  test: 'test-boss',
  b1: 'guardian',
  b2: 'queen',
  b3: 'prisma',
  b4: 'storm',
};

/** Sala del jefe pedido vía ?boss=<id|alias>; null si no hay parámetro o no existe tal jefe en el pool. */
function readForcedBossRoom(): RoomData | null {
  const raw = new URLSearchParams(window.location.search).get('boss');
  if (raw === null) return null;
  const bossId = BOSS_PARAM_ALIAS[raw.toLowerCase()] ?? raw.toLowerCase();
  return getRoomPool().find((room) => room.boss === bossId) ?? null;
}

/** Fase forzada del jefe vía `?phase=2|3` (solo con `?boss=`, herramienta de playtest); null si no aplica. */
function readForcedBossPhase(): 2 | 3 | null {
  const raw = new URLSearchParams(window.location.search).get('phase');
  if (raw === '2') return 2;
  if (raw === '3') return 3;
  return null;
}

export function GameRoot({ playtestRoom = null }: { playtestRoom?: RoomData | null }) {
  // useState con inicializador: la sesión se crea una sola vez y nunca causa re-render.
  const [session] = useState(() => {
    if (playtestRoom) return createGameSession(playtestRoom);
    const bossRoom = readForcedBossRoom();
    if (bossRoom) {
      const bossSession = createGameSession(bossRoom);
      const phase = readForcedBossPhase();
      if (phase) forceBossPhase(bossSession.world, phase);
      return bossSession;
    }
    return createDungeonGameSession(getRoomPool(), readForcedSeed());
  });
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
        onCreated={(state) => {
          // Solo dev: expone la escena para el puente de verificación
          // (inspección de objetos huérfanos; complementa a __flingo).
          if (import.meta.env.DEV) {
            (window as unknown as { __flingoScene?: unknown }).__flingoScene = state.scene;
          }
        }}
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance', antialias: true }}
        camera={{ fov: 45, near: 0.5, far: 80, position: [0, 9.5, 11] }}
        shadows={false}
      >
        <SimDriver session={session} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 8, 3]} intensity={1.15} />
        <RoomView world={session.world} />
        {/* Columnas de la Reina del Enjambre + sus cuerdas (GDD §15.3): no-op
            (return null) fuera de su sala, ver QueenColumnsView.tsx. */}
        <QueenColumnsView session={session} />
        <QueenTethersView session={session} />
        <HazardViews world={session.world} />
        <BarrelViews session={session} />
        <PuddleViews session={session} />
        <ItemViews session={session} />
        <EnemyViews session={session} />
        <ProjectileViews session={session} />
        <HeroView session={session} />
        {/* Effects (GDD §12): partículas, estela y ondas expansivas, todos pools preasignados. */}
        <ParticleView pool={session.effects.particles} />
        <TrailView pool={session.effects.trail} />
        <ShockwaveView pool={session.effects.shockwaves} />
        <AimIndicatorView session={session} />
        <CameraRig session={session} />
        <AimInput session={session} />
      </Canvas>
      <DamageVignette />
      <FpsCounter />
      <HUD session={session} />
      <a className="editor-link" href="#/editor">
        {playtestRoom ? '← Volver al editor' : '✎ Editor'}
      </a>
      <UpgradeModal session={session} />
      <PauseModal session={session} onRestart={handleRestart} />
      <GameOverModal onRestart={handleRestart} />
      <VictoryModal onRestart={handleRestart} />
    </div>
  );
}
