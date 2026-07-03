/**
 * Proyectiles: pool preasignado de meshes (uno por slot de `world.projectiles`,
 * nunca se crean/destruyen, solo se muestran/ocultan). Flecha/hechizo del
 * héroe con color propio; proyectil hostil visualmente distinto (rojo).
 *
 * El material se reasigna en useFrame (no como prop JSX) porque un slot del
 * pool puede reciclarse de un `kind`/`owner` a otro entre disparos.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh } from 'three';
import type { GameSession } from '../session';
import { arrowMaterial, enemyProjectileMaterial, spellMaterial, unitSphere } from './assets';

function materialForSlot(kind: 'arrow' | 'spell' | 'enemy') {
  if (kind === 'enemy') return enemyProjectileMaterial;
  return kind === 'spell' ? spellMaterial : arrowMaterial;
}

function ProjectileSlot({ session, index }: { session: GameSession; index: number }) {
  const groupRef = useRef<Group>(null);
  const bodyRef = useRef<Mesh>(null);
  const lastKind = useRef<'arrow' | 'spell' | 'enemy' | null>(null);

  useFrame(() => {
    const p = session.world.projectiles[index];
    const group = groupRef.current;
    if (!group) return;
    if (!p.active) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.position.set(p.position.x, 0.3, p.position.y);
    const body = bodyRef.current;
    if (body) {
      body.scale.setScalar(p.radius);
      if (lastKind.current !== p.kind) {
        lastKind.current = p.kind;
        body.material = materialForSlot(p.kind);
      }
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={bodyRef} geometry={unitSphere} material={arrowMaterial} />
    </group>
  );
}

export function ProjectileViews({ session }: { session: GameSession }) {
  const count = session.world.projectiles.length;
  const indices = Array.from({ length: count }, (_, i) => i);
  return (
    <>
      {indices.map((i) => (
        <ProjectileSlot key={i} session={session} index={i} />
      ))}
    </>
  );
}
