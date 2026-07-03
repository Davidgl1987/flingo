/**
 * Enemigos (GDD §7): un mesh por enemigo (≤10 por sala, el presupuesto lo
 * permite explícitamente). Lee la sim en useFrame; nunca la muta.
 *
 * Flash blanco de golpe: se implementa INTERCAMBIANDO materiales compartidos
 * de assets.ts (material del arquetipo ↔ enemyHitFlashMaterial) en vez de
 * mutar colores o crear materiales por instancia — cumple estrictamente la
 * regla de "materiales compartidos, creados una vez".
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Material, Mesh } from 'three';
import type { GameSession } from '../session';
import type { Enemy, EnemyKind } from '../sim/world';
import {
  blobShadowMaterial,
  chaserMaterial,
  dummyMaterial,
  enemyHitFlashMaterial,
  shooterMaterial,
  shooterTelegraphMaterial,
  spikeConeMaterial,
  spikeMaterial,
  trailMaterial,
  unitCircle,
  unitSphere,
  unitSpike,
} from './assets';

const ENEMY_MATERIAL: Record<EnemyKind, Material> = {
  dummy: dummyMaterial,
  chaser: chaserMaterial,
  spike: spikeMaterial,
  trail: trailMaterial,
  shooter: shooterMaterial,
};

const ENEMY_RADIUS_RENDER = 0.4;

function EnemyMesh({
  session,
  enemyId,
  kind,
}: {
  session: GameSession;
  enemyId: string;
  kind: EnemyKind;
}) {
  const bodyRef = useRef<Mesh>(null);
  const shadowRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const spikeFaceRef = useRef<Mesh>(null);
  const telegraphRef = useRef<Mesh>(null);
  const wasFlashing = useRef(false);

  useFrame(() => {
    const world = session.world;
    const enemy = world.enemies.find((e: Enemy) => e.id === enemyId);
    const group = groupRef.current;
    if (!enemy || !group) return;

    if (enemy.hp <= 0) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.position.set(enemy.position.x, ENEMY_RADIUS_RENDER, enemy.position.y);

    const shadow = shadowRef.current;
    if (shadow) shadow.position.set(enemy.position.x, 0.02, enemy.position.y);

    const flashing = world.time < enemy.hitFlashUntil;
    if (flashing !== wasFlashing.current) {
      wasFlashing.current = flashing;
      const body = bodyRef.current;
      if (body) {
        body.material = flashing ? enemyHitFlashMaterial : ENEMY_MATERIAL[kind];
      }
    }

    const speed = Math.hypot(enemy.velocity.x, enemy.velocity.y);
    if (speed > 0.05) {
      group.rotation.y = Math.atan2(enemy.velocity.x, enemy.velocity.y);
    }

    if (kind === 'spike' && spikeFaceRef.current) {
      // La púa apunta siempre en la dirección `facing` fija del mundo, no en
      // la de movimiento (el Spike no rota al patrullar): compensa la
      // rotación del grupo para que quede en coordenadas de mundo.
      spikeFaceRef.current.rotation.y = Math.atan2(enemy.facing.x, enemy.facing.y) - group.rotation.y;
    }

    if (kind === 'shooter' && telegraphRef.current) {
      const charging = enemy.shooterPhase === 'charge';
      telegraphRef.current.visible = charging;
      if (charging) {
        telegraphRef.current.scale.setScalar(0.85 + 0.25 * Math.sin(world.time * 14));
      }
    }
  });

  return (
    <group ref={groupRef}>
      <mesh
        ref={bodyRef}
        geometry={unitSphere}
        material={ENEMY_MATERIAL[kind]}
        scale={ENEMY_RADIUS_RENDER}
      />
      <mesh
        ref={shadowRef}
        geometry={unitCircle}
        material={blobShadowMaterial}
        rotation-x={-Math.PI / 2}
        scale={ENEMY_RADIUS_RENDER * 1.3}
      />
      {kind === 'spike' && (
        <mesh
          ref={spikeFaceRef}
          geometry={unitSpike}
          material={spikeConeMaterial}
          position={[0, 0, 0.42]}
          rotation-x={Math.PI / 2}
          scale={[0.45, 0.4, 0.45]}
        />
      )}
      {kind === 'shooter' && (
        <mesh
          ref={telegraphRef}
          geometry={unitCircle}
          material={shooterTelegraphMaterial}
          rotation-x={-Math.PI / 2}
          position={[0, -0.35, 0]}
          scale={0.75}
          visible={false}
        />
      )}
    </group>
  );
}

export function EnemyViews({ session }: { session: GameSession }) {
  return (
    <>
      {session.world.enemies.map((enemy) => (
        <EnemyMesh key={enemy.id} session={session} enemyId={enemy.id} kind={enemy.kind} />
      ))}
    </>
  );
}
