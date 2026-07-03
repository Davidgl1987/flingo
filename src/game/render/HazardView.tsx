/**
 * Hazards estáticos de la sala (GDD §8): foso, pinchos, barro, acelerador
 * como quads planos (no cambian de tamaño/posición durante la sala, se
 * construyen una vez). Los barriles son vivos (pueden explotar) y se
 * gestionan aparte con BarrelViews, que sí lee la sim cada frame.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import type { GameSession } from '../session';
import type { HazardSpawn } from '../sim/world';
import {
  barrelMaterial,
  boostMaterial,
  mudMaterial,
  pitMaterial,
  spikesMaterial,
  unitBox,
  unitPlane,
} from './assets';

const HAZARD_QUAD_Y = 0.03;
const BARREL_HEIGHT = 0.7;

function StaticHazardQuad({ hazard }: { hazard: HazardSpawn }) {
  const material =
    hazard.kind === 'pit'
      ? pitMaterial
      : hazard.kind === 'spikes'
        ? spikesMaterial
        : hazard.kind === 'slow'
          ? mudMaterial
          : boostMaterial;
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
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    const barrel = session.world.barrels.find((b) => b.id === barrelId);
    const mesh = meshRef.current;
    if (!barrel || !mesh) return;
    mesh.visible = !barrel.exploded;
    mesh.position.set(barrel.position.x, BARREL_HEIGHT / 2, barrel.position.y);
  });

  const barrel = session.world.barrels.find((b) => b.id === barrelId);
  const radius = barrel ? barrel.radius : 0.4;

  return (
    <mesh
      ref={meshRef}
      geometry={unitBox}
      material={barrelMaterial}
      scale={[radius * 1.6, BARREL_HEIGHT, radius * 1.6]}
    />
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
