/**
 * Bola héroe: esfera + blob shadow (SIN sombras dinámicas). Lee la sim en
 * useFrame y muta los object3D directamente, con interpolación entre ticks.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { HERO_RADIUS } from '../content/constants';
import type { GameSession } from '../session';
import { blobShadowMaterial, heroMaterial, unitCircle, unitSphere } from './assets';

export function HeroView({ session }: { session: GameSession }) {
  const bodyRef = useRef<Mesh>(null);
  const shadowRef = useRef<Mesh>(null);

  useFrame(() => {
    const hero = session.world.hero;
    const alpha = session.renderAlpha;
    const x = session.heroPrevX + (hero.position.x - session.heroPrevX) * alpha;
    const z = session.heroPrevY + (hero.position.y - session.heroPrevY) * alpha;
    const body = bodyRef.current;
    if (body) {
      body.position.set(x, HERO_RADIUS, z);
    }
    const shadow = shadowRef.current;
    if (shadow) {
      shadow.position.set(x, 0.02, z);
    }
  });

  return (
    <>
      <mesh ref={bodyRef} geometry={unitSphere} material={heroMaterial} scale={HERO_RADIUS} />
      <mesh
        ref={shadowRef}
        geometry={unitCircle}
        material={blobShadowMaterial}
        rotation-x={-Math.PI / 2}
        scale={HERO_RADIUS * 1.25}
      />
    </>
  );
}
