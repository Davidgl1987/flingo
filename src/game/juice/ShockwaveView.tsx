/**
 * Render de ondas expansivas: un mesh de anillo por slot del pool (4), con
 * material propio por slot creado UNA vez a nivel de módulo (la opacidad se
 * anima por slot, así que no pueden compartir material). Plano sobre el
 * suelo, crece de 0 al radio de la explosión y se desvanece.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { SHOCKWAVE_LIFE, SHOCKWAVE_POOL_SIZE, type ShockwavePool } from './shockwave';

/** Anillo unitario (radio exterior 1, grosor 18%): se escala por onda. */
const ringGeometry = new THREE.RingGeometry(0.82, 1, 48);

const ringMaterials: THREE.MeshBasicMaterial[] = [];
for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
  ringMaterials.push(
    new THREE.MeshBasicMaterial({
      color: '#ffb066',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}

export function ShockwaveView({ pool }: { pool: ShockwavePool }) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>(new Array<THREE.Mesh | null>(SHOCKWAVE_POOL_SIZE).fill(null));

  useFrame(() => {
    for (let i = 0; i < pool.capacity; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      if (!pool.active[i]) {
        mesh.visible = false;
        continue;
      }
      // t: 0 (recién nacida) → 1 (muere). Radio con ease-out, opacidad decae.
      const t = 1 - pool.life[i] / SHOCKWAVE_LIFE;
      const eased = 1 - (1 - t) * (1 - t);
      const radius = Math.max(0.05, pool.maxRadius[i] * eased);
      mesh.visible = true;
      mesh.position.set(pool.x[i], 0.04, pool.z[i]);
      mesh.scale.setScalar(radius);
      ringMaterials[i].opacity = 0.85 * (1 - t);
    }
  });

  return (
    <>
      {ringMaterials.map((material, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          geometry={ringGeometry}
          material={material}
          rotation-x={-Math.PI / 2}
          visible={false}
        />
      ))}
    </>
  );
}
