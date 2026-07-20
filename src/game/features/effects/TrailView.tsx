/**
 * Render de la estela del héroe: InstancedMesh pequeño (pool ~24), mismo
 * patrón que ParticleView pero con datos de TrailPool (sin física, solo
 * desvanecido). Color por instancia (punto 1 de playtest ronda 3): sigue el
 * color del arma activa del héroe en el momento de depositarse (TrailPool ya
 * guarda r/g/b por punto), mismo lenguaje visual que heroMaterial.
 *
 * Rastro de cera (playtest ronda 5, punto 4, solo dark>=1): en silueta,
 * `HeroView.tsx` ya emite estos puntos con color/vida de cera en vez de
 * color de arma (ver WAX_TRAIL_COLOR allí) — aquí solo falta el APLASTADO
 * ("goterón contra el suelo", no esferita): se lee el store directamente
 * (menos invasivo que añadir un flag por punto al pool, ya que en silueta
 * NUNCA se emiten esferitas de color de arma, todos los puntos activos son
 * cera) y se aplica a TODOS los puntos activos por igual cuando dark>=1.
 * En clásico (dark=0) el render es EXACTAMENTE el de siempre.
 *
 * Legibilidad (playtest 2026-07-20, David: "el rastro de cera no se ve"):
 * el material es ÚNICO para todo el pool (no hay uno por punto), así que la
 * opacidad no puede variar punto a punto — se sube un poco en silueta
 * (mismo `silhouettes` que ya bifurca posición/escala aquí abajo) para que
 * la cera se lea tanto dentro como fuera del halo de la vela sin tocar el
 * 0.5 clásico.
 */

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { unitSphere } from '@/game/render/assets';
import { useDarkStore } from '@/game/render/dark-store';
import type { TrailPool } from './trail';

const trailMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});

/** Altura del goterón de cera: casi a ras de suelo (evita z-fighting con el suelo de la sala). */
const WAX_DROP_GROUND_Y = 0.03;
/** Aplastamiento vertical del goterón: escala Y mínima, se lee como disco/gota, no como bola. */
const WAX_DROP_FLATTEN = 0.12;
/** Opacidad del material en silueta (dark>=1): más alta que el 0.5 clásico para que la cera pálida destaque sobre un suelo ya iluminado por la vela. */
const WAX_DROP_OPACITY = 0.6;
/** Opacidad clásica (dark=0): sin cambios respecto a siempre. */
const CLASSIC_TRAIL_OPACITY = 0.5;

export function TrailView({ pool }: { pool: TrailPool }) {
  const silhouettes = useDarkStore((s) => s.dark >= 1);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => ({ obj: new THREE.Object3D(), color: new THREE.Color() }), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    trailMaterial.opacity = silhouettes ? WAX_DROP_OPACITY : CLASSIC_TRAIL_OPACITY;
    const { obj, color } = scratch;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.active[i]) {
        const t = pool.life[i] / pool.maxLife[i];
        const scale = pool.size[i] * t;
        if (silhouettes) {
          obj.position.set(pool.x[i], WAX_DROP_GROUND_Y, pool.z[i]);
          obj.scale.set(scale, scale * WAX_DROP_FLATTEN, scale);
        } else {
          obj.position.set(pool.x[i], 0.25, pool.z[i]);
          obj.scale.setScalar(scale);
        }
        color.setRGB(pool.r[i], pool.g[i], pool.b[i]);
      } else {
        obj.position.set(0, -1000, 0);
        obj.scale.setScalar(0);
        color.setRGB(0, 0, 0);
      }
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[unitSphere, trailMaterial, pool.capacity]} frustumCulled={false} />
  );
}
