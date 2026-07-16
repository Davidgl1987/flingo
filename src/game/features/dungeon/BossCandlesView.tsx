/**
 * Cirios de sala de jefe (rama `estilo-oscuro`, punto 2b de playtest: "en los
 * bosses debería haber más luz, algunas columnas que sean como cirios"): 4
 * columnas-cirio fijas en las esquinas de la sala del jefe — atrezzo visual
 * puro (SIN colisión, la sim no las conoce), montado SOLO en dark>=1 desde
 * GameRoot.
 *
 * Sala del jefe: se localiza vía el propio enemigo `kind==='boss'` +
 * `bossRoomBounds` (mismo utilitario que ya usa el movimiento de jefes para
 * no salirse de su sala, `features/bosses/movement.ts`) — así no hace falta
 * leer la mazmorra/topología aparte ni duplicar esa búsqueda. Colocación:
 * offsets FIJOS desde las 4 esquinas de `bounds` (interior jugable, YA
 * excluye el grosor de muro) — el layout interior de una sala de jefe
 * concreta (rocas, fosos...) no es trivial de leer desde aquí sin
 * acoplarse a cada sala, así que se usa el criterio simple que el propio
 * playtest habilita explícitamente ("si el layout no es trivial de leer, usa
 * offsets fijos desde las esquinas"); el inset se recorta si la sala es más
 * pequeña que el offset por defecto, para no salirse de una sala diminuta
 * (modo de pruebas/tests con `world.bounds`).
 *
 * Parpadeo: misma suma de senos (barata, sin asignaciones) que
 * `CandleLightView`, desfasada por índice de cirio para que no titilen
 * sincronizados entre sí.
 */

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Mesh, PointLight } from 'three';
import type { GameSession } from '@/game/session/session';
import { bossRoomBounds } from '@/game/features/bosses/movement';
import { bossCandleFlameMaterial, bossCandleWaxGeometry, bossCandleWaxMaterial, unitCone } from '@/game/render/assets';

/** Distancia desde cada pared de la sala (bounds ya es el interior jugable, sin el grosor de muro). */
const CANDLE_INSET = 1.1;
/** Margen mínimo respecto al borde si la sala es más pequeña que 2×CANDLE_INSET (salas de test). */
const CANDLE_MIN_MARGIN = 0.4;
/** Alto total del cirio — igual que `bossCandleWaxGeometry` (render/assets.ts). */
const CANDLE_HEIGHT = 1.4;
const FLAME_HEIGHT = CANDLE_HEIGHT + 0.15;
const FLAME_SCALE_XZ = 0.18;
const FLAME_SCALE_Y = 0.34;

/** Luz cálida del cirio (punto 2b): pointLight sin sombra, cerca de la llama. */
const LIGHT_HEIGHT = CANDLE_HEIGHT + 0.1;
const LIGHT_INTENSITY = 10;
const LIGHT_DISTANCE = 4.5;
const LIGHT_DECAY = 2;
const LIGHT_COLOR = '#ffb469';

/** Parpadeo: mismo criterio que CandleLightView (2 senos inconmensurados), desfasado por índice de cirio. */
const FLICKER_FREQ_A = 4.3;
const FLICKER_FREQ_B = 9.1;
const FLICKER_WEIGHT_A = 0.6;
const FLICKER_WEIGHT_B = 0.4;
const FLICKER_AMPLITUDE = 0.16;
/** Desfase fijo (rad) por índice de cirio — no coincide con las frecuencias de arriba, así que no vuelven a alinearse periódicamente. */
const FLICKER_PHASE_STEP = 2.3;

function BossCandle({ x, z, index }: { x: number; z: number; index: number }) {
  const lightRef = useRef<PointLight>(null);
  const flameRef = useRef<Mesh>(null);

  useFrame((state) => {
    const light = lightRef.current;
    const flame = flameRef.current;
    if (!light && !flame) return;
    const t = state.clock.elapsedTime + index * FLICKER_PHASE_STEP;
    const flicker = FLICKER_WEIGHT_A * Math.sin(t * FLICKER_FREQ_A) + FLICKER_WEIGHT_B * Math.sin(t * FLICKER_FREQ_B);
    if (light) light.intensity = LIGHT_INTENSITY * (1 + FLICKER_AMPLITUDE * flicker);
    if (flame) flame.scale.set(FLAME_SCALE_XZ, FLAME_SCALE_Y * (1 + flicker * 0.1), FLAME_SCALE_XZ);
  });

  return (
    <group position={[x, 0, z]}>
      <mesh geometry={bossCandleWaxGeometry} material={bossCandleWaxMaterial} position={[0, CANDLE_HEIGHT / 2, 0]} />
      <mesh
        ref={flameRef}
        geometry={unitCone}
        material={bossCandleFlameMaterial}
        position={[0, FLAME_HEIGHT, 0]}
        scale={[FLAME_SCALE_XZ, FLAME_SCALE_Y, FLAME_SCALE_XZ]}
      />
      <pointLight
        ref={lightRef}
        color={LIGHT_COLOR}
        intensity={LIGHT_INTENSITY}
        distance={LIGHT_DISTANCE}
        decay={LIGHT_DECAY}
        position={[0, LIGHT_HEIGHT, 0]}
      />
    </group>
  );
}

export function BossCandlesView({ session }: { session: GameSession }) {
  const world = session.world;
  const boss = world.enemies.find((e) => e.kind === 'boss');
  // La sala del jefe no cambia durante la partida (mazmorra fija tras
  // generarse): recalcular solo si cambia qué enemigo boss existe (en la
  // práctica, solo al montar) evita recomputar bounds cada render.
  const positions = useMemo(() => {
    if (!boss) return [];
    const bounds = bossRoomBounds(world, boss);
    const insetX = Math.min(CANDLE_INSET, (bounds.maxX - bounds.minX) / 2 - CANDLE_MIN_MARGIN);
    const insetY = Math.min(CANDLE_INSET, (bounds.maxY - bounds.minY) / 2 - CANDLE_MIN_MARGIN);
    if (insetX <= 0 || insetY <= 0) return [];
    return [
      { x: bounds.minX + insetX, z: bounds.minY + insetY },
      { x: bounds.minX + insetX, z: bounds.maxY - insetY },
      { x: bounds.maxX - insetX, z: bounds.minY + insetY },
      { x: bounds.maxX - insetX, z: bounds.maxY - insetY },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boss]);

  if (positions.length === 0) return null;

  return (
    <>
      {positions.map((p, i) => (
        <BossCandle key={i} x={p.x} z={p.z} index={i} />
      ))}
    </>
  );
}
