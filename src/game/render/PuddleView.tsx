/**
 * Charcos del Trail (GDD §7.4): InstancedMesh (pool ~32, ver world.ts). Los
 * charcos inactivos se escalan a 0 en vez de eliminarse (cero asignaciones,
 * cero cambios de conteo de instancias).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { GameSession } from '../session';
import { puddleMaterial, unitCircle } from './assets';

const scratchMatrix = new THREE.Matrix4();
const scratchScale = new THREE.Vector3();
const scratchPos = new THREE.Vector3();
const FLAT_ROTATION = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export function PuddleViews({ session }: { session: GameSession }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = session.world.puddles.length;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const puddles = session.world.puddles;
    for (let i = 0; i < puddles.length; i++) {
      const puddle = puddles[i];
      const scale = puddle.active ? puddle.radius : 0;
      scratchPos.set(puddle.position.x, 0.015, puddle.position.y);
      scratchScale.set(scale, scale, scale);
      scratchMatrix.compose(scratchPos, FLAT_ROTATION, scratchScale);
      mesh.setMatrixAt(i, scratchMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[unitCircle, puddleMaterial, count]} frustumCulled={false} />
  );
}
