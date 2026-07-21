/**
 * Reina del Enjambre (GDD §15.3, Fase B2, `bossId==='queen'`): extraído de
 * `EnemyViews.tsx` en la pasada pre-release. Corona estática (5 púas en
 * abanico) + pulso de invocación: `enemy.bossTelegraphUntil` se reutiliza en
 * `queenStepPattern` como cuenta atrás (no un timestamp) hasta la próxima
 * oleada de larvas — se RESETEA a `QUEEN_WAVE_INTERVAL` justo cuando invoca;
 * detectar ese salto hacia arriba (en vez de su decaimiento normal) es la
 * señal de "acaba de invocar", sin necesitar leer eventos de sim desde el
 * render.
 *
 * `applyQueenBossFrame` se llama desde el ÚNICO `useFrame` de `EnemyMesh`
 * (EnemyViews.tsx), en el mismo punto exacto donde vivía este bloque antes de
 * la extracción — los refs los sigue poseyendo `EnemyMesh` (se pasan aquí por
 * parámetro) para no alterar el orden de mutación dentro del frame.
 */

import type { RefObject } from 'react';
import type { Mesh } from 'three';
import { queenCrownMaterial, queenCrownSpikeGeometry, queenSummonPulseMaterial, unitCircle } from '@/game/render/assets';
import type { Enemy, World } from '@/game/world/types';

export function applyQueenBossFrame(params: {
  enemy: Enemy;
  world: World;
  bodyRadius: number;
  queenSummonPulseRef: RefObject<Mesh | null>;
  queenSummonPulseUntil: { current: number };
  lastQueenWaveTimer: { current: number };
}): void {
  const { enemy, world, bodyRadius, queenSummonPulseRef, queenSummonPulseUntil, lastQueenWaveTimer } = params;
  // Pulso de invocación (GDD §15.3): `enemy.bossTelegraphUntil` se reutiliza
  // en queenStepPattern como cuenta atrás (no un timestamp) hasta la próxima
  // oleada de larvas — se RESETEA a QUEEN_WAVE_INTERVAL justo cuando invoca.
  // Detectar ese salto hacia arriba (en vez de su decaimiento normal) es la
  // señal de "acaba de invocar", sin necesitar leer eventos de sim desde el
  // render.
  if (enemy.bossTelegraphUntil > lastQueenWaveTimer.current + 0.05) {
    queenSummonPulseUntil.current = world.time + 0.35;
  }
  lastQueenWaveTimer.current = enemy.bossTelegraphUntil;

  const pulsing = world.time < queenSummonPulseUntil.current;
  if (queenSummonPulseRef.current) {
    queenSummonPulseRef.current.visible = pulsing;
    if (pulsing) {
      const t = 1 - Math.max(0, queenSummonPulseUntil.current - world.time) / 0.35;
      queenSummonPulseRef.current.scale.setScalar(bodyRadius * (1.2 + t * 1.8));
    }
  }
}

/**
 * JSX específico de la Reina: corona estática (5 púas en abanico) + anillo
 * del pulso de invocación (posición/escala reales en `applyQueenBossFrame`).
 * Vive dentro del `<group ref={groupRef}>` del padre (EnemyViews.tsx), como
 * el resto de composición específica de jefe.
 */
export function QueenBossExtras({ queenSummonPulseRef }: { queenSummonPulseRef: RefObject<Mesh | null> }) {
  return (
    <>
      {/* Corona: 5 púas finas en abanico sobre la cabeza (silueta de "reina
          de enjambre", distinta del Guardián) — estática en local, ya vive
          dentro del `group` que escala con `enemy.radius`. */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i - 2) * 0.5;
        return (
          <mesh
            key={i}
            geometry={queenCrownSpikeGeometry}
            material={queenCrownMaterial}
            position={[Math.sin(angle) * 0.32, 0.55, Math.cos(angle) * 0.32]}
            rotation-x={-0.25}
            rotation-z={angle * 0.4}
          />
        );
      })}

      {/* Pulso de invocación (GDD §15.3): anillo que se expande brevemente
          bajo los pies cada vez que suelta una oleada de larvas;
          posición/escala reales en `applyQueenBossFrame`. */}
      <mesh
        ref={queenSummonPulseRef}
        geometry={unitCircle}
        material={queenSummonPulseMaterial}
        rotation-x={-Math.PI / 2}
        position={[0, -0.38, 0]}
        visible={false}
      />
    </>
  );
}
