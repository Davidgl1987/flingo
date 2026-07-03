/**
 * Bola héroe: esfera + blob shadow (SIN sombras dinámicas). Lee la sim en
 * useFrame y muta los object3D directamente, con interpolación entre ticks.
 *
 * Feedback visual de fase 2: parpadeo durante los i-frames (GDD §6) y
 * animación de caída al foso (encoge y se hunde durante fallingUntil).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { HERO_RADIUS, PIT_FALL_DURATION } from '../content/constants';
import type { GameSession } from '../session';
import { blobShadowMaterial, heroMaterial, unitCircle, unitSphere } from './assets';

/** Frecuencia del parpadeo de invulnerabilidad (alternancias por segundo). */
const IFRAME_BLINK_HZ = 12;

export function HeroView({ session }: { session: GameSession }) {
  const bodyRef = useRef<Mesh>(null);
  const shadowRef = useRef<Mesh>(null);

  useFrame(() => {
    const world = session.world;
    const hero = world.hero;
    const alpha = session.renderAlpha;
    const x = session.heroPrevX + (hero.position.x - session.heroPrevX) * alpha;
    const z = session.heroPrevY + (hero.position.y - session.heroPrevY) * alpha;

    const body = bodyRef.current;
    const shadow = shadowRef.current;

    // Caída al foso: encoge y se hunde durante la animación.
    if (world.fallingUntil > 0) {
      const remaining = world.fallingUntil - world.time;
      const t = 1 - Math.max(0, remaining) / PIT_FALL_DURATION; // 0 → 1
      const scale = HERO_RADIUS * Math.max(0.05, 1 - t);
      if (body) {
        body.visible = true;
        body.position.set(x, HERO_RADIUS * (1 - t) - 0.4 * t, z);
        body.scale.setScalar(scale);
      }
      if (shadow) shadow.visible = false;
      return;
    }

    // Parpadeo de i-frames: alterna visibilidad a frecuencia fija.
    const invulnerable = world.time < hero.invulnerableUntil;
    const blinkOn = !invulnerable || Math.floor(world.time * IFRAME_BLINK_HZ) % 2 === 0;

    if (body) {
      body.visible = blinkOn;
      body.position.set(x, HERO_RADIUS, z);
      body.scale.setScalar(HERO_RADIUS);
    }
    if (shadow) {
      shadow.visible = true;
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
