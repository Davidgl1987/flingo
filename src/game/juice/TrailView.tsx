/**
 * Render de la estela del héroe: InstancedMesh pequeño (pool ~24), mismo
 * patrón que ParticleView pero con datos de TrailPool (sin física, solo
 * desvanecido). Azul-blanco translúcido: mismo lenguaje de color que el
 * héroe (assets.ts `heroMaterial`).
 */

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { unitSphere } from '../render/assets';
import type { TrailPool } from './trail';

const trailMaterial = new THREE.MeshBasicMaterial({
  color: '#bfe8ff',
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});

export function TrailView({ pool }: { pool: TrailPool }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const obj = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.active[i]) {
        const t = pool.life[i] / pool.maxLife[i];
        obj.position.set(pool.x[i], 0.25, pool.z[i]);
        obj.scale.setScalar(pool.size[i] * t);
      } else {
        obj.position.set(0, -1000, 0);
        obj.scale.setScalar(0);
      }
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[unitSphere, trailMaterial, pool.capacity]} frustumCulled={false} />
  );
}
