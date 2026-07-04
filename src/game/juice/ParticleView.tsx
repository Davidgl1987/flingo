/**
 * Render del pool de partículas: UN InstancedMesh (ARCHITECTURE.md,
 * "Instancing obligatorio"), actualizado por CPU en useFrame. Cero
 * asignaciones por frame: la matriz y el color se escriben en objetos
 * `THREE.Object3D`/`THREE.Color` reutilizados (creados una vez en useMemo),
 * y `instanceMatrix`/`instanceColor` se marcan `needsUpdate` cada frame.
 *
 * La física/vida del pool la posee `ParticlePool` (juice/particles.ts, sin
 * three.js); este componente es "render tonto" puro sobre esos datos.
 */

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { unitSphere } from '../render/assets';
import type { ParticlePool } from './particles';

const particleMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });

/** Escala visual de vida→opacidad/tamaño: se desvanece el último 40% de su vida. */
function fadeFactor(life: number, maxLife: number): number {
  if (maxLife <= 0) return 0;
  const t = life / maxLife;
  return t > 0.4 ? 1 : t / 0.4;
}

export function ParticleView({ pool }: { pool: ParticlePool }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(
    () => ({ obj: new THREE.Object3D(), color: new THREE.Color() }),
    [],
  );

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { obj, color } = scratch;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.active[i]) {
        const fade = fadeFactor(pool.life[i], pool.maxLife[i]);
        obj.position.set(pool.x[i], pool.y[i] + 0.05, pool.z[i]);
        obj.scale.setScalar(pool.size[i] * fade);
        obj.rotation.set(0, 0, 0);
        obj.updateMatrix();
        color.setRGB(pool.r[i], pool.g[i], pool.b[i]);
      } else {
        obj.position.set(0, -1000, 0); // fuera de vista: forma barata de "ocultar" una instancia
        obj.scale.setScalar(0);
        obj.updateMatrix();
        color.setRGB(0, 0, 0);
      }
      mesh.setMatrixAt(i, obj.matrix);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[unitSphere, particleMaterial, pool.capacity]}
      frustumCulled={false}
    />
  );
}
