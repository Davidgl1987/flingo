/**
 * Raíz del juego: Canvas R3F + HUD DOM superpuesto. Posee la sesión de juego
 * (objeto mutable fuera del estado de React).
 *
 * Modos:
 * - Run completa (por defecto): mazmorra procedural generada desde el pool de
 *   salas (src/game/features/dungeon/levels/*.json + salas exportadas del editor). La semilla es
 *   aleatoria por run; `?seed=N` en la URL la fuerza (también en reinicios),
 *   para verificación y depuración.
 * - Playtest (prop `playtestRoom`): una sola sala del editor, con botón para
 *   volver a él.
 *
 * Reinicio de run: `restartSession` recrea `session.world` (nueva referencia),
 * así que el árbol del canvas se remonta con una key de secuencia de run —
 * es un evento rarísimo (muerte/victoria), no un patrón de render por estado.
 */

import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useState } from 'react';
import type { Material, Object3D } from 'three';
import { getRoomPool } from '@/game/features/dungeon/rooms';
import { applyForcedUpgrades, readForcedBossPhase, readForcedBossRoom, readForcedSeed, readForcedUpgrades, readGodMode } from './debug-params';
import { useDarkStore } from './dark-store';
import { AimInput } from '@/game/features/hero/AimInput';
import { CandleLightView } from '@/game/features/hero/CandleLightView';
import { ParticleView } from '@/game/features/effects/ParticleView';
import { ShockwaveView } from '@/game/features/effects/ShockwaveView';
import { TrailView } from '@/game/features/effects/TrailView';
import { WaxView } from '@/game/features/effects/WaxView';
import { forceBossPhase } from '@/game/features/bosses/lifecycle';
import { QueenColumnsView, QueenTethersView } from '@/game/features/bosses/queen/QueenColumnsView';
import { BossCandlesView } from '@/game/features/dungeon/BossCandlesView';
import { ShopLightsView } from '@/game/features/dungeon/ShopLightsView';
import { EnemyViews } from '@/game/features/enemies/EnemyViews';
import {
  advanceToNextDungeon,
  createDungeonGameSession,
  createGameSession,
  restartSession,
  type GameSession,
} from '@/game/session/session';
import type { RoomData } from '@/game/world/types';
import { useUiStore } from '@/game/session/store';
import { BossRewardModal } from '@/game/ui/BossRewardModal';
import { DamageVignette } from '@/game/ui/DamageVignette';
import { FpsCounter } from '@/game/ui/FpsCounter';
import { GameOverModal } from '@/game/ui/GameOverModal';
import { HUD } from '@/game/ui/HUD';
import { NextDungeonModal } from '@/game/ui/NextDungeonModal';
import { PauseModal } from '@/game/ui/PauseModal';
import { ShopModal } from '@/game/ui/ShopModal';
import { VictoryModal } from '@/game/ui/VictoryModal';
import { AimIndicatorView } from '@/game/features/hero/AimIndicatorView';
import { CameraRig } from './CameraRig';
import './game-root.css';
import { BarrelViews, HazardViews } from '@/game/features/hazards/HazardView';
import { HeroView } from '@/game/features/hero/HeroView';
import { ItemViews } from '@/game/features/items/ItemView';
import { ProjectileViews } from '@/game/features/combat/ProjectileView';
import { PuddleViews } from '@/game/features/hazards/PuddleView';
import { RoomView } from './RoomView';
import { useGameLoop } from './useGameLoop';

/** Componente-driver: registra el loop de sim ANTES que los lectores (orden de montaje). */
function SimDriver({ session }: { session: GameSession }) {
  useGameLoop(session);
  return null;
}

/**
 * Sincroniza `gl.shadowMap.enabled` con el store en RUNTIME (controles en
 * vivo de dark/glow desde el menú de pausa): el prop `shadows` del Canvas
 * (más abajo) solo aplica al CREAR el contexto WebGL, así que alternar
 * `dark` en caliente después de montado necesita tocar el renderer
 * directamente aquí. Solo al CAMBIAR `dark` (deps del efecto), nunca cada
 * frame: fuerza `needsUpdate` en todos los materiales de la escena porque
 * activar/desactivar el shadowMap exige que three.js recompile los shaders
 * de sombra — sin esto las sombras quedarían a medio aplicar tras el toggle.
 * Defensivo con `background`/`fog`: aunque `attach` (RoomView.tsx/GameRoot
 * JSX de abajo) ya debería limpiarlos solo al desmontar el JSX condicional
 * de dark=0, forzarlos a `null` aquí es gratis y cierra cualquier resquicio.
 */
function DarkModeSync({ dark }: { dark: 0 | 1 | 2 }) {
  const { gl, scene, setDpr } = useThree();
  useEffect(() => {
    gl.shadowMap.enabled = dark >= 1;
    // Presupuesto de píxeles (playtest ronda 6: 23 FPS en ventana grande):
    // en dark>=1 cada frame paga la escena + 6 caras de sombra cúbica de la
    // vela — a dpr 2 en un monitor grande eso hunde el framerate. Tope 1.5
    // solo en oscuro (la nitidez extra de dpr 2 no se aprecia en penumbra);
    // dark=0 conserva el presupuesto clásico [1, 2] exacto.
    setDpr(Math.min(window.devicePixelRatio, dark >= 1 ? 1.5 : 2));
    scene.traverse((obj: Object3D) => {
      const material = (obj as unknown as { material?: Material | Material[] }).material;
      if (!material) return;
      if (Array.isArray(material)) {
        material.forEach((m) => {
          m.needsUpdate = true;
        });
      } else {
        material.needsUpdate = true;
      }
    });
    if (dark === 0) {
      scene.background = null;
      scene.fog = null;
    }
  }, [dark, gl, scene, setDpr]);
  return null;
}

export function GameRoot({
  playtestRoom = null,
  onExitToTitle,
}: {
  playtestRoom?: RoomData | null;
  onExitToTitle?: () => void;
}) {
  // useState con inicializador: la sesión se crea una sola vez y nunca causa re-render.
  const [session] = useState(() => {
    // Modo dios de playtest (?godmode, herramienta B5 de David 2026-07-15):
    // se lee UNA vez aquí y se aplica a los 3 modos por igual (run completa,
    // arena de jefe suelta vía ?boss, playtest de sala del editor).
    const godMode = readGodMode();
    let s: GameSession;
    if (playtestRoom) {
      s = createGameSession(playtestRoom, godMode);
    } else {
      const bossRoom = readForcedBossRoom();
      if (bossRoom) {
        s = createGameSession(bossRoom, godMode);
        const phase = readForcedBossPhase();
        if (phase) forceBossPhase(s.world, phase);
      } else {
        s = createDungeonGameSession(getRoomPool(), readForcedSeed(), godMode);
      }
    }
    // Herramienta de playtest/verificación (F5, docs/plans/ECONOMY_PLAN.md):
    // `?upgrades=cuerpo-dano:3,escudo:2,flecha-dano:1` fuerza niveles de
    // mejora justo tras crear la sesión, vía `applyUpgrade` (sube nivel Y
    // modificadores coherentes, como una compra/recompensa real). No-op si
    // no hay parámetro.
    applyForcedUpgrades(s.world, s.events, readForcedUpgrades());
    return s;
  });
  // Secuencia de run: cambia solo al reiniciar tras game-over/victoria (remonta el canvas).
  const [runSeq, setRunSeq] = useState(0);

  // Penumbra experimental (rama estilo-oscuro): controles en vivo desde el
  // menú de pausa (PauseModal → useDarkStore → dark-store.ts). El valor
  // INICIAL sigue viniendo de `?dark=` (mismo default de siempre), pero a
  // partir de ahí el store manda — este selector reacciona a cada cambio.
  const darkMode = useDarkStore((s) => s.dark);

  const handleRestart = useCallback(() => {
    restartSession(session);
    useUiStore.getState().resetRun();
    setRunSeq((n) => n + 1);
  }, [session]);

  // Run multi-mazmorra (GDD §10): jefe derrotado pero quedan más por delante
  // (fase 'dungeon-cleared'). A diferencia de handleRestart, NO se llama a
  // resetRun (hp/monedas/mejoras deben sobrevivir a la nueva mazmorra).
  const handleAdvanceDungeon = useCallback(() => {
    advanceToNextDungeon(session);
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
            // Estado R3F completo para verificación headless (?rafshim): en
            // páginas ocultas el ResizeObserver no dispara y el renderer se
            // queda en 300x150 — el driver externo llama a state.setSize().
            (window as unknown as { __flingoR3F?: unknown }).__flingoR3F = state;
          }
        }}
        dpr={[1, 2]}
        gl={{
          powerPreference: 'high-performance',
          antialias: true,
          // Solo dev+?rafshim: conserva el framebuffer tras presentar para que
          // la verificación headless pueda leer el frame con toDataURL (ver
          // shim de rAF en src/app/main.tsx). Coste de memoria irrelevante en dev.
          preserveDrawingBuffer:
            import.meta.env.DEV && new URLSearchParams(window.location.search).has('rafshim'),
        }}
        camera={{ fov: 45, near: 0.5, far: 80, position: [0, 9.5, 11] }}
        // Sombras (rama estilo-oscuro, punto 1 de playtest: "la luz de la
        // vela no debe atravesar paredes"): SOLO dark>=1 — en dark=0
        // (paridad EXACTA con `main`) el motor de sombras ni se activa, cero
        // coste y cero diferencia visual con el look clásico. Una única luz
        // con sombra (CandleLightView, cúbica por ser pointLight) es
        // asumible en forward rendering.
        shadows={darkMode >= 1}
      >
        <SimDriver session={session} />
        <DarkModeSync dark={darkMode} />
        {/* Penumbra experimental (?dark=, debug-params.ts): dark=0 mantiene la
            luz EXACTA de siempre (paridad con main, cero regresiones); dark 1-2
            la bajan casi a cero para que la vela del héroe (CandleLightView)
            sea la fuente de luz principal de la sala. */}
        {darkMode === 0 ? (
          <>
            <ambientLight intensity={0.75} />
            <directionalLight position={[4, 8, 3]} intensity={1.15} />
          </>
        ) : (
          <>
            <ambientLight intensity={darkMode === 1 ? 0.22 : 0.04} color="#7c8fc9" />
            {darkMode === 1 && <directionalLight position={[4, 8, 3]} intensity={0.15} color="#aab6e0" />}
            <color attach="background" args={['#050508']} />
            {/* El fog arranca más allá de la distancia cámara→suelo (~15 u):
                solo funde los bordes lejanos de la sala, nunca el área de juego. */}
            <fog attach="fog" args={['#05050a', 20, 48]} />
          </>
        )}
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
        {/* Vela del héroe (solo dark 1-2): luz principal de la sala en penumbra. */}
        {darkMode >= 1 && <CandleLightView session={session} />}
        {/* Antorchas de la sala del jefe (punto 2b de playtest, solo dark 1-2): no-op fuera de la mazmorra (sin boss vivo). */}
        {darkMode >= 1 && <BossCandlesView session={session} />}
        {/* Luz de la sala de tienda (playtest: "la tienda puede emitir luz"), solo dark 1-2: no-op fuera de la mazmorra (sin tendero). */}
        {darkMode >= 1 && <ShopLightsView session={session} />}
        {/* Effects (GDD §12): partículas, estela y ondas expansivas, todos pools preasignados. */}
        <ParticleView pool={session.effects.particles} />
        <TrailView pool={session.effects.trail} />
        {/* Capa de cera persistente (solo dark 1-2, playtest ronda 7): rastro
            de TODOS los movimientos del héroe/sus proyectiles, sin
            desvanecido — ver wax.ts. Gateada como CandleLightView/
            BossCandlesView: en dark=0 ni se monta. */}
        {darkMode >= 1 && <WaxView pool={session.effects.wax} />}
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
      <PauseModal session={session} onRestart={handleRestart} />
      <BossRewardModal session={session} />
      <NextDungeonModal session={session} onAdvance={handleAdvanceDungeon} />
      <ShopModal session={session} />
      <GameOverModal session={session} onRestart={handleRestart} onExitToTitle={onExitToTitle} />
      <VictoryModal session={session} onRestart={handleRestart} onExitToTitle={onExitToTitle} />
    </div>
  );
}
