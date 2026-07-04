/**
 * Hazards estáticos de la sala (GDD §8): foso, pinchos, barro, acelerador
 * como quads planos (no cambian de tamaño/posición durante la sala, se
 * construyen una vez). Los barriles son vivos (pueden explotar) y se
 * gestionan aparte con BarrelViews, que sí lee la sim cada frame.
 *
 * Legibilidad (feedback de playtest):
 * - El foso es un agujero casi negro con REBORDE de piedra clara: tres quads
 *   apilados (reborde > sombra interior > agujero) que lo hacen inconfundible
 *   contra el suelo desde cualquier ángulo.
 * - El barril es un CILINDRO con aros claros (silueta de barril); al explotar
 *   desaparece y deja una mancha chamuscada en el suelo.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh } from 'three';
import type { GameSession } from '../session';
import type { HazardSpawn } from '../sim/world';
import {
  barrelHoopMaterial,
  barrelMaterial,
  boostMaterial,
  mudMaterial,
  pitMaterial,
  pitRimMaterial,
  scorchMaterial,
  spikesMaterial,
  unitCircle,
  unitCylinder,
  unitPlane,
} from './assets';

const HAZARD_QUAD_Y = 0.03;
const BARREL_HEIGHT = 0.7;
/** Anchura del reborde visible alrededor del foso (u de mundo). */
const PIT_RIM_WIDTH = 0.14;

function PitQuad({ hazard }: { hazard: HazardSpawn }) {
  const x = hazard.position.x;
  const z = hazard.position.y;
  return (
    <group>
      {/* Reborde de piedra clara: contrasta contra suelo y agujero. */}
      <mesh
        geometry={unitPlane}
        material={pitRimMaterial}
        rotation-x={-Math.PI / 2}
        position={[x, HAZARD_QUAD_Y - 0.012, z]}
        scale={[hazard.width + PIT_RIM_WIDTH * 2, hazard.height + PIT_RIM_WIDTH * 2, 1]}
      />
      {/* Agujero: negro casi absoluto. */}
      <mesh
        geometry={unitPlane}
        material={pitMaterial}
        rotation-x={-Math.PI / 2}
        position={[x, HAZARD_QUAD_Y, z]}
        scale={[hazard.width, hazard.height, 1]}
      />
    </group>
  );
}

function StaticHazardQuad({ hazard }: { hazard: HazardSpawn }) {
  if (hazard.kind === 'pit') {
    return <PitQuad hazard={hazard} />;
  }
  const material =
    hazard.kind === 'spikes' ? spikesMaterial : hazard.kind === 'slow' ? mudMaterial : boostMaterial;
  return (
    <mesh
      geometry={unitPlane}
      material={material}
      rotation-x={-Math.PI / 2}
      position={[hazard.position.x, HAZARD_QUAD_Y, hazard.position.y]}
      scale={[hazard.width, hazard.height, 1]}
    />
  );
}

export function HazardViews({ world }: { world: { hazards: HazardSpawn[] } }) {
  return (
    <>
      {world.hazards.map((hazard) => (
        <StaticHazardQuad key={hazard.id} hazard={hazard} />
      ))}
    </>
  );
}

function BarrelMesh({ session, barrelId }: { session: GameSession; barrelId: string }) {
  const groupRef = useRef<Group>(null);
  const scorchRef = useRef<Mesh>(null);

  useFrame(() => {
    const barrel = session.world.barrels.find((b) => b.id === barrelId);
    const group = groupRef.current;
    const scorch = scorchRef.current;
    if (!barrel || !group) return;
    group.visible = !barrel.exploded;
    group.position.set(barrel.position.x, 0, barrel.position.y);
    if (scorch) {
      scorch.visible = barrel.exploded;
      scorch.position.set(barrel.position.x, 0.025, barrel.position.y);
    }
  });

  const barrel = session.world.barrels.find((b) => b.id === barrelId);
  const radius = barrel ? barrel.radius : 0.4;
  const diameter = radius * 2;

  return (
    <>
      <group ref={groupRef}>
        {/* Cuerpo: cilindro rojo barril. */}
        <mesh
          geometry={unitCylinder}
          material={barrelMaterial}
          position={[0, BARREL_HEIGHT / 2, 0]}
          scale={[diameter, BARREL_HEIGHT, diameter]}
        />
        {/* Aros metálicos claros (arriba y abajo): silueta de barril. */}
        <mesh
          geometry={unitCylinder}
          material={barrelHoopMaterial}
          position={[0, BARREL_HEIGHT * 0.22, 0]}
          scale={[diameter * 1.06, BARREL_HEIGHT * 0.08, diameter * 1.06]}
        />
        <mesh
          geometry={unitCylinder}
          material={barrelHoopMaterial}
          position={[0, BARREL_HEIGHT * 0.78, 0]}
          scale={[diameter * 1.06, BARREL_HEIGHT * 0.08, diameter * 1.06]}
        />
      </group>
      {/* Mancha chamuscada tras la explosión. */}
      <mesh
        ref={scorchRef}
        geometry={unitCircle}
        material={scorchMaterial}
        rotation-x={-Math.PI / 2}
        scale={radius * 2.2}
        visible={false}
      />
    </>
  );
}

export function BarrelViews({ session }: { session: GameSession }) {
  return (
    <>
      {session.world.barrels.map((barrel) => (
        <BarrelMesh key={barrel.id} session={session} barrelId={barrel.id} />
      ))}
    </>
  );
}
