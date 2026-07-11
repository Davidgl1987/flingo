/**
 * Spike (ronda 3, punto 9: "por detrás no debe tener pinchos, ponle 3 en la
 * parte delantera"): exactamente 3 púas (mismo unitSpike reescalado), TODAS
 * ancladas a la dirección `facing` (la cara peligrosa, GDD §7.3/combat.ts
 * `isSpikeContactDangerous`) en abanico frontal fijo — nunca rotan libres ni
 * aparecen en la cara trasera.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { RefObject } from 'react';
import type { Group } from 'three';
import type { GameSession } from '@/game/session/session';
import type { Enemy } from '@/game/world/types';
import { spikeConeMaterial, unitSpike } from '@/game/render/assets';

/**
 * Púas del Spike (punto 9 de playtest ronda 3): exactamente 3, todas en la
 * cara peligrosa, repartidas en abanico frontal (radianes entre púas
 * contiguas). Nada en la cara trasera.
 */
const SPIKE_FRONT_SPIKE_COUNT = 3;
const SPIKE_FRONT_FAN_SPREAD = 0.55;

export function SpikeMesh({
  session,
  enemyId,
  groupRef,
}: {
  session: GameSession;
  enemyId: string;
  groupRef: RefObject<Group | null>;
}) {
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
    // Punto 9 de playtest ronda 3: exactamente 3 púas, TODAS en la cara
    // peligrosa (abanico centrado en +Z local, que useFrame orienta hacia
    // `enemy.facing`); nada en la cara trasera — comunica "golpéame por
    // aquí" sin ambigüedad. El grupo entero es lo que rota en useFrame.
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
    </group>
  );
}
