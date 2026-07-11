/**
 * Trail: squash de babosa (aplastamiento rítmico) + gotas de baba goteando.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { RefObject } from 'react';
import type { Mesh } from 'three';
import type { GameSession } from '@/game/session/session';
import type { Enemy } from '@/game/world/types';
import { smallDotGeometry, trailDripMaterial } from '@/game/render/assets';

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
  const trailDripRefs = useRef<(Mesh | null)[]>([]);

  useFrame(() => {
    const world = session.world;
    const enemy = world.enemies.find((e: Enemy) => e.id === enemyId);
    if (!enemy || enemy.hp <= 0) return;

    const body = bodyRef.current;
    if (body) {
      // Squash de babosa: aplastamiento rítmico vertical, compensado en XZ
      // para conservar volumen aproximado (mismo patrón que el héroe).
      const squash = 1 + Math.sin(world.time * 4.2 + enemy.position.y) * 0.09;
      const widen = 1 / Math.sqrt(squash);
      body.scale.set(TRAIL_BODY_RADIUS * widen, TRAIL_BODY_RADIUS * squash, TRAIL_BODY_RADIUS * widen);
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
    </>
  );
}
