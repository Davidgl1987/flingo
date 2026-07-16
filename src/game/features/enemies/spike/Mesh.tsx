/**
 * Spike (ronda 3, punto 9: "por detrás no debe tener pinchos, ponle 3 en la
 * parte delantera"): exactamente 3 púas (mismo unitSpike reescalado), TODAS
 * ancladas a la dirección `facing` (la cara peligrosa, GDD §7.3/combat.ts
 * `isSpikeContactDangerous`) en abanico frontal fijo — nunca rotan libres ni
 * aparecen en la cara trasera.
 *
 * Penitente de Púas (rama `estilo-oscuro`, solo dark>=1): además de las 3 púas
 * FUNCIONALES de arriba (que siguen marcando sin ambigüedad la cara
 * peligrosa, gameplay intacto), se añaden púas DECORATIVAS repartidas por
 * todo el cuerpo (silueta de erizo del concept) — estáticas, no siguen
 * `facing`, nunca sustituyen a las 3 reales. Un único ojo cálido grande vive
 * DENTRO del grupo que sigue `facing` (mismo criterio que las 3 púas: el ojo
 * mira siempre hacia la cara peligrosa).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { RefObject } from 'react';
import type { Group } from 'three';
import type { GameSession } from '@/game/session/session';
import type { Enemy } from '@/game/world/types';
import {
  smallDotGeometry,
  spikeConeMaterial,
  spikeEyeGlowMaterial,
  unitSpike,
} from '@/game/render/assets';
import { useDarkStore } from '@/game/render/dark-store';

/**
 * Púas del Spike (punto 9 de playtest ronda 3): exactamente 3, todas en la
 * cara peligrosa, repartidas en abanico frontal (radianes entre púas
 * contiguas). Nada en la cara trasera.
 */
const SPIKE_FRONT_SPIKE_COUNT = 3;
const SPIKE_FRONT_FAN_SPREAD = 0.55;

/** Nº de púas decorativas en el "ecuador" del erizo (dark>=1, puramente estéticas). */
const SPIKE_DECOR_RING_COUNT = 6;

export function SpikeMesh({
  session,
  enemyId,
  groupRef,
}: {
  session: GameSession;
  enemyId: string;
  groupRef: RefObject<Group | null>;
}) {
  const silhouettes = useDarkStore((s) => s.dark >= 1);
  const spikeSecondaryGroupRef = useRef<Group>(null);

  useFrame(() => {
    const world = session.world;
    const enemy = world.enemies.find((e: Enemy) => e.id === enemyId);
    const group = groupRef.current;
    if (!enemy || !group || enemy.hp <= 0) return;

    if (spikeSecondaryGroupRef.current) {
      // Punto 9 de playtest ronda 3 ("Spike por detrás no debe tener
      // pinchos, ponle 3 en la parte delantera"): las 3 púas viven en un
      // único grupo anclado a la dirección `facing` fija del mundo (la cara
      // PELIGROSA, misma normal que usa isSpikeContactDangerous en
      // combat.ts) — nunca rotan libremente ni aparecen en la cara trasera.
      // Compensa la rotación del grupo padre (que sigue la velocidad al
      // patrullar) para que el abanico quede fijo en coordenadas de mundo.
      spikeSecondaryGroupRef.current.rotation.y = Math.atan2(enemy.facing.x, enemy.facing.y) - group.rotation.y;
    }
  });

  return (
    <>
      {/* Púas decorativas del erizo (dark>=1, puramente estéticas): NUNCA
          rotan con `facing` (a diferencia de las 3 reales de abajo), para no
          confundir cuál cara es la peligrosa. Anillo ecuatorial + 2 polos. */}
      {silhouettes && (
        <>
          {Array.from({ length: SPIKE_DECOR_RING_COUNT }, (_, i) => {
            const angle = (i / SPIKE_DECOR_RING_COUNT) * Math.PI * 2;
            return (
              <mesh
                key={`ring-${i}`}
                geometry={unitSpike}
                material={spikeConeMaterial}
                position={[Math.sin(angle) * 0.38, 0.03, Math.cos(angle) * 0.38]}
                rotation-x={Math.PI / 2}
                rotation-y={angle}
                scale={[0.26, 0.24, 0.26]}
              />
            );
          })}
          <mesh geometry={unitSpike} material={spikeConeMaterial} position={[0, 0.4, 0]} scale={[0.24, 0.22, 0.24]} />
          <mesh
            geometry={unitSpike}
            material={spikeConeMaterial}
            position={[0, -0.4, 0]}
            rotation-x={Math.PI}
            scale={[0.24, 0.22, 0.24]}
          />
        </>
      )}
      {/* Punto 9 de playtest ronda 3: exactamente 3 púas, TODAS en la cara
          peligrosa (abanico centrado en +Z local, que useFrame orienta hacia
          `enemy.facing`); nada en la cara trasera — comunica "golpéame por
          aquí" sin ambigüedad. El grupo entero es lo que rota en useFrame. */}
      <group ref={spikeSecondaryGroupRef}>
        {Array.from({ length: SPIKE_FRONT_SPIKE_COUNT }, (_, i) => {
          const mid = (SPIKE_FRONT_SPIKE_COUNT - 1) / 2;
          const angle = (i - mid) * SPIKE_FRONT_FAN_SPREAD;
          return (
            <mesh
              key={i}
              geometry={unitSpike}
              material={spikeConeMaterial}
              position={[Math.sin(angle) * 0.4, 0, Math.cos(angle) * 0.4]}
              rotation-x={Math.PI / 2}
              rotation-y={angle}
              scale={[0.4, 0.38, 0.4]}
            />
          );
        })}
        {/* Penitente de Púas: un único ojo cálido grande, siempre en la cara peligrosa. */}
        {silhouettes && (
          <mesh geometry={smallDotGeometry} material={spikeEyeGlowMaterial} position={[0, 0.06, 0.42]} scale={[0.13, 0.15, 0.06]} />
        )}
      </group>
    </>
  );
}
