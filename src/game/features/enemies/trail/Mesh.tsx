/**
 * Trail: squash de babosa (aplastamiento rítmico) + gotas de baba goteando.
 *
 * Lacrimera (rama `estilo-oscuro`, solo dark>=1): silueta de gota (esfera +
 * `unitCone` con su apex por defecto hacia +Y, sin rotación — así la base
 * ancha se funde con el cuerpo y la punta queda arriba, forma de lágrima).
 * El cono es SIBLING del cuerpo (no hijo de `bodyRef`: ese mesh vive en
 * `../EnemyViews.tsx`, no aquí), así que su squash de babosa se replica a
 * mano cada frame con la misma fórmula que el cuerpo. Dos ojos oscuros
 * (reutiliza `eyePupilMaterial`, ya suficientemente oscuro) — el brillo
 * interior violeta pálido vive en el `emissive` de `trailMaterial`
 * (assets.ts), no aquí.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { RefObject } from 'react';
import type { Group, Mesh } from 'three';
import type { GameSession } from '@/game/session/session';
import type { Enemy } from '@/game/world/types';
import {
  eyePupilMaterial,
  smallDotGeometry,
  trailDripMaterial,
  trailMaterial,
  unitCone,
} from '@/game/render/assets';
import { useDarkStore } from '@/game/render/dark-store';

/**
 * Radio visual del cuerpo: igual que ENEMY_RADIUS_RENDER en
 * `../EnemyViews.tsx` (el Trail nunca es jefe/larva, así que su radio visual
 * es siempre este fijo; se duplica aquí para no crear un import circular con
 * el dispatcher).
 */
const TRAIL_BODY_RADIUS = 0.4;
/** Nº de gotas de baba del Trail. */
const TRAIL_DRIP_COUNT = 2;

export function TrailMesh({
  session,
  enemyId,
  bodyRef,
}: {
  session: GameSession;
  enemyId: string;
  bodyRef: RefObject<Mesh | null>;
}) {
  const silhouettes = useDarkStore((s) => s.dark >= 1);
  const trailDripRefs = useRef<(Mesh | null)[]>([]);
  // Lacrimera (dark>=1): punta de la gota + ojos oscuros, siblings del
  // cuerpo (mismo espacio local que las gotas de arriba, no hijos de
  // `bodyRef` — así se les aplica a mano el mismo squash/widen del cuerpo,
  // ver comentario de cabecera).
  const teardropRef = useRef<Mesh>(null);
  const eyeGroupRef = useRef<Group>(null);

  useFrame(() => {
    const world = session.world;
    const enemy = world.enemies.find((e: Enemy) => e.id === enemyId);
    if (!enemy || enemy.hp <= 0) return;

    // Squash de babosa: aplastamiento rítmico vertical, compensado en XZ
    // para conservar volumen aproximado (mismo patrón que el héroe).
    const squash = 1 + Math.sin(world.time * 4.2 + enemy.position.y) * 0.09;
    const widen = 1 / Math.sqrt(squash);

    const body = bodyRef.current;
    if (body) {
      body.scale.set(TRAIL_BODY_RADIUS * widen, TRAIL_BODY_RADIUS * squash, TRAIL_BODY_RADIUS * widen);
    }
    if (silhouettes) {
      const teardrop = teardropRef.current;
      if (teardrop) {
        teardrop.position.set(0, TRAIL_BODY_RADIUS * squash * 0.85, 0);
        teardrop.scale.set(TRAIL_BODY_RADIUS * 0.55 * widen, TRAIL_BODY_RADIUS * 0.75 * squash, TRAIL_BODY_RADIUS * 0.55 * widen);
      }
      const eyeGroup = eyeGroupRef.current;
      if (eyeGroup) {
        eyeGroup.position.set(0, TRAIL_BODY_RADIUS * 0.05 * squash, TRAIL_BODY_RADIUS * 0.78 * widen);
      }
    }
    for (let i = 0; i < TRAIL_DRIP_COUNT; i++) {
      const drip = trailDripRefs.current[i];
      if (!drip) continue;
      const phase = (world.time * 0.9 + i / TRAIL_DRIP_COUNT) % 1;
      const angle = (i / TRAIL_DRIP_COUNT) * Math.PI * 2;
      const r = TRAIL_BODY_RADIUS * 0.75;
      drip.position.set(
        Math.sin(angle) * r,
        -phase * 0.3,
        Math.cos(angle) * r * 0.6 - TRAIL_BODY_RADIUS * 0.15,
      );
      drip.scale.setScalar(0.06 * (1 - phase * 0.5));
      drip.visible = true;
    }
  });

  return (
    <>
      {Array.from({ length: TRAIL_DRIP_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            trailDripRefs.current[i] = el;
          }}
          geometry={smallDotGeometry}
          material={trailDripMaterial}
          visible={false}
        />
      ))}
      {silhouettes && (
        <>
          {/* Punta de la gota (cono apex-arriba, base fundida con el cuerpo):
              mismo material MUTABLE que el cuerpo (trailMaterial, ya
              oscurecido/translúcido en assets.ts) para que tono y opacidad
              coincidan exactamente. */}
          <mesh ref={teardropRef} geometry={unitCone} material={trailMaterial} />
          {/* Dos ojos oscuros simples. */}
          <group ref={eyeGroupRef}>
            <mesh geometry={smallDotGeometry} material={eyePupilMaterial} position={[-0.1, 0, 0]} scale={0.045} />
            <mesh geometry={smallDotGeometry} material={eyePupilMaterial} position={[0.1, 0, 0]} scale={0.045} />
          </group>
        </>
      )}
    </>
  );
}
