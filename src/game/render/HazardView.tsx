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
 * - Los pinchos (punto 1 de playtest: "los pinchos no lo parecen") son una
 *   base + un InstancedMesh de agujas cónicas afiladas apuntando hacia arriba
 *   sobre una rejilla determinista (sin Math.random: jitter por índice, mismo
 *   layout siempre para la misma sala), color hueso claro que contrasta con
 *   el suelo. Estático, se construye una vez por hazard (useMemo), igual que
 *   el resto de hazards no vivos.
 */

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
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
  spikesNeedleMaterial,
  unitCircle,
  unitCylinder,
  unitPlane,
  unitSpikeNeedle,
} from './assets';

const HAZARD_QUAD_Y = 0.03;
const BARREL_HEIGHT = 0.7;
/** Anchura del reborde visible alrededor del foso (u de mundo). */
const PIT_RIM_WIDTH = 0.14;
/** Separación aproximada entre agujas del campo de pinchos (u de mundo). */
const SPIKE_NEEDLE_SPACING = 0.32;
/** Altura de la aguja instanciada (debe coincidir con la geometría unitSpikeNeedle). */
const SPIKE_NEEDLE_HEIGHT = 0.32;

/** Hash determinista barato [0,1) por índice entero (sin Math.random: mismo layout siempre para la misma sala). */
function hash01(i: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** Rejilla de posiciones locales (centradas en 0,0) con jitter determinista, para un campo denso de agujas. */
function buildNeedleLayout(width: number, height: number): { x: number; z: number; scale: number; rot: number }[] {
  const cols = Math.max(1, Math.round(width / SPIKE_NEEDLE_SPACING));
  const rows = Math.max(1, Math.round(height / SPIKE_NEEDLE_SPACING));
  const cellW = width / cols;
  const cellH = height / rows;
  const layout: { x: number; z: number; scale: number; rot: number }[] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jitterX = (hash01(i * 2) - 0.5) * cellW * 0.4;
      const jitterZ = (hash01(i * 2 + 1) - 0.5) * cellH * 0.4;
      const x = -width / 2 + cellW * (c + 0.5) + jitterX;
      const z = -height / 2 + cellH * (r + 0.5) + jitterZ;
      const scale = 0.75 + hash01(i * 3 + 5) * 0.5;
      const rot = hash01(i * 5 + 7) * Math.PI * 2;
      layout.push({ x, z, scale, rot });
      i++;
    }
  }
  return layout;
}

/** Instancias de agujas del campo de pinchos: matrices escritas UNA vez al montar (hazard estático, mismo patrón que InstancedBoxes de RoomView). */
function NeedleInstances({ layout }: { layout: { x: number; z: number; scale: number; rot: number }[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const scratch = new THREE.Object3D();
    for (let i = 0; i < layout.length; i++) {
      const n = layout[i];
      scratch.position.set(n.x, (SPIKE_NEEDLE_HEIGHT * n.scale) / 2, n.z);
      scratch.rotation.set(0, n.rot, 0);
      scratch.scale.setScalar(n.scale);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [layout]);

  if (layout.length === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[unitSpikeNeedle, spikesNeedleMaterial, layout.length]} frustumCulled={false} />
  );
}

/** Campo de pinchos: base plana + InstancedMesh de agujas afiladas apuntando hacia arriba. */
function SpikesField({ hazard }: { hazard: HazardSpawn }) {
  const layout = useMemo(() => buildNeedleLayout(hazard.width, hazard.height), [hazard.width, hazard.height]);

  return (
    <group position={[hazard.position.x, HAZARD_QUAD_Y, hazard.position.y]}>
      <mesh
        geometry={unitPlane}
        material={spikesMaterial}
        rotation-x={-Math.PI / 2}
        scale={[hazard.width, hazard.height, 1]}
      />
      <NeedleInstances layout={layout} />
    </group>
  );
}

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
  if (hazard.kind === 'spikes') {
    return <SpikesField hazard={hazard} />;
  }
  const material = hazard.kind === 'slow' ? mudMaterial : boostMaterial;
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
