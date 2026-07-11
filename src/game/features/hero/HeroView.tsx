/**
 * Bola héroe: esfera + blob shadow (SIN sombras dinámicas). Lee la sim en
 * useFrame y muta los object3D directamente, con interpolación entre ticks.
 *
 * Feedback visual:
 * - Parpadeo durante los i-frames (GDD §6) y caída al foso (fase 2).
 * - Squash & stretch (fase 4, SOLO render): estiramiento a lo largo de la
 *   velocidad cuando va rápido, aplastamiento breve al detectar una frenada
 *   brusca (impacto). La sim nunca se entera.
 * - Emisión de la estela (GDD §12): deposita puntos en session.effects.trail
 *   cuando supera el umbral de velocidad (el pool lo dibuja TrailView).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { HERO_RADIUS } from './constants';
import { PIT_FALL_DURATION } from '@/game/features/hazards/constants';
import { TRAIL_EMIT_INTERVAL, TRAIL_SPEED_THRESHOLD } from '@/game/features/effects/trail';
import type { GameSession } from '@/game/session/session';
import type { WeaponMode } from '@/game/world/types';
import { aimDotMaterial, blobShadowMaterial, heroMaterial, unitCircle, unitSphere, WEAPON_COLOR } from '@/game/render/assets';

/** Frecuencia del parpadeo de invulnerabilidad (alternancias por segundo). */
const IFRAME_BLINK_HZ = 12;

/**
 * Color del héroe por arma (punto 1 de playtest ronda 3): rigidez del lerp
 * de color (mayor = transición más rápida, pero siempre suave, nunca un
 * corte brusco) y tuning del burst de partículas al cambiar de arma.
 */
const WEAPON_COLOR_LERP_STIFFNESS = 10;
const WEAPON_SWITCH_BURST_COUNT = 14;
const WEAPON_SWITCH_BURST_SPEED = 2.4;
const WEAPON_SWITCH_BURST_SIZE = 0.08;
const WEAPON_SWITCH_BURST_LIFE = 0.32;

/** Estiramiento por u/s de velocidad, con tope de +35% a velocidad alta. */
const STRETCH_PER_SPEED = 0.028;
const STRETCH_MAX = 0.35;
/** Frenada (u/s perdidos entre frames) que dispara el squash de impacto. */
const SQUASH_DECEL_THRESHOLD = 3.5;
const SQUASH_DURATION = 0.12;
/** Aplastamiento del squash: escala vertical 0.62, horizontal compensada. */
const SQUASH_FLATTEN = 0.62;

export function HeroView({ session }: { session: GameSession }) {
  const bodyRef = useRef<Mesh>(null);
  const shadowRef = useRef<Mesh>(null);
  const prevSpeed = useRef(0);
  const squashUntil = useRef(0);
  const trailAccumulator = useRef(0);
  // Arma del frame anterior: detecta el CAMBIO para disparar el burst de
  // partículas una sola vez (no cada frame mientras se mantiene el modo).
  const prevWeaponMode = useRef<WeaponMode | null>(null);

  useFrame((_, delta) => {
    const world = session.world;
    const hero = world.hero;
    const alpha = session.renderAlpha;
    const x = session.heroPrevX + (hero.position.x - session.heroPrevX) * alpha;
    const z = session.heroPrevY + (hero.position.y - session.heroPrevY) * alpha;

    const body = bodyRef.current;
    const shadow = shadowRef.current;

    // Color del héroe según arma activa (punto 1 de playtest ronda 3): lerp
    // continuo hacia el color objetivo (nunca un corte brusco), independiente
    // del framerate. El indicador de puntería (aimDotMaterial) comparte el
    // mismo objetivo para que apunten siempre al mismo lenguaje de color.
    const targetColor = WEAPON_COLOR[hero.weaponMode];
    const colorK = 1 - Math.exp(-WEAPON_COLOR_LERP_STIFFNESS * delta);
    heroMaterial.color.lerp(targetColor, colorK);
    aimDotMaterial.color.lerp(targetColor, colorK);

    // Cambio de arma: burst de partículas del color NUEVO alrededor del
    // héroe (feedback inmediato, independiente del lerp de color que sigue
    // en curso). Se dispara una sola vez por transición, en el frame en que
    // se detecta el cambio.
    if (prevWeaponMode.current !== null && prevWeaponMode.current !== hero.weaponMode) {
      session.effects.particles.burst(
        x,
        z,
        WEAPON_SWITCH_BURST_COUNT,
        WEAPON_SWITCH_BURST_SPEED,
        WEAPON_SWITCH_BURST_SIZE,
        WEAPON_SWITCH_BURST_LIFE,
        targetColor.r,
        targetColor.g,
        targetColor.b,
        world.rng,
      );
    }
    prevWeaponMode.current = hero.weaponMode;

    // Caída al foso: encoge y se hunde durante la animación.
    if (world.fallingUntil > 0) {
      const remaining = world.fallingUntil - world.time;
      const t = 1 - Math.max(0, remaining) / PIT_FALL_DURATION; // 0 → 1
      const scale = HERO_RADIUS * Math.max(0.05, 1 - t);
      if (body) {
        body.visible = true;
        body.position.set(x, HERO_RADIUS * (1 - t) - 0.4 * t, z);
        body.rotation.y = 0;
        body.scale.setScalar(scale);
      }
      if (shadow) shadow.visible = false;
      prevSpeed.current = 0;
      return;
    }

    const speed = Math.hypot(hero.velocity.x, hero.velocity.y);

    // Squash de impacto: frenada brusca entre frames (rebote/embestida).
    if (prevSpeed.current - speed > SQUASH_DECEL_THRESHOLD) {
      squashUntil.current = world.time + SQUASH_DURATION;
    }
    prevSpeed.current = speed;

    // Estela mientras va rápido (cadencia fija; el pool es circular, nunca crece).
    if (speed > TRAIL_SPEED_THRESHOLD && world.phase === 'playing') {
      trailAccumulator.current += delta;
      while (trailAccumulator.current >= TRAIL_EMIT_INTERVAL) {
        trailAccumulator.current -= TRAIL_EMIT_INTERVAL;
        session.effects.trail.emit(x, z, HERO_RADIUS * 0.8, undefined, targetColor.r, targetColor.g, targetColor.b);
      }
    } else {
      trailAccumulator.current = 0;
    }

    // Parpadeo de i-frames: alterna visibilidad a frecuencia fija.
    const invulnerable = world.time < hero.invulnerableUntil;
    const blinkOn = !invulnerable || Math.floor(world.time * IFRAME_BLINK_HZ) % 2 === 0;

    if (body) {
      body.visible = blinkOn;
      body.position.set(x, HERO_RADIUS, z);

      if (world.time < squashUntil.current) {
        // Aplastamiento: bajo y ancho, conservando volumen aproximado.
        const widen = 1 / Math.sqrt(SQUASH_FLATTEN);
        body.rotation.y = 0;
        body.scale.set(HERO_RADIUS * widen, HERO_RADIUS * SQUASH_FLATTEN, HERO_RADIUS * widen);
      } else if (speed > 0.5) {
        // Estiramiento a lo largo de la velocidad (eje Z local rotado hacia
        // la dirección de movimiento), compensado en los otros ejes.
        const stretch = 1 + Math.min(STRETCH_MAX, speed * STRETCH_PER_SPEED);
        const thin = 1 / Math.sqrt(stretch);
        body.rotation.y = Math.atan2(hero.velocity.x, hero.velocity.y);
        body.scale.set(HERO_RADIUS * thin, HERO_RADIUS * thin, HERO_RADIUS * stretch);
      } else {
        body.rotation.y = 0;
        body.scale.setScalar(HERO_RADIUS);
      }
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
