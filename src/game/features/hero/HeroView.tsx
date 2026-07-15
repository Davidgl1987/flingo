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
 * - Identificador visual de mejoras (F5, docs/plans/ECONOMY_PLAN.md): pinchos
 *   del Erizo de Acero, estiramiento amplificado de la Estela de Cometa,
 *   escala extra del Canto Rodado y burbuja de la Burbuja de Cuarzo. Pinchos
 *   y burbuja viven como HIJOS del mesh del héroe (bodyRef) para heredar
 *   gratis su squash/stretch/escala y su parpadeo de i-frames — solo su
 *   posición/orientación se fija una vez al montar (son estáticos relativos
 *   a la bola); useFrame solo cambia visibilidad/opacidad, nunca su pose.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3, type Mesh } from 'three';
import { HERO_RADIUS } from './constants';
import { PIT_FALL_DURATION } from '@/game/features/hazards/constants';
import { TRAIL_EMIT_INTERVAL, TRAIL_SPEED_THRESHOLD } from '@/game/features/effects/trail';
import { getUpgradeLevel } from '@/game/session/upgrades';
import type { GameSession } from '@/game/session/session';
import type { WeaponMode } from '@/game/world/types';
import {
  aimDotMaterial,
  blobShadowMaterial,
  heroMaterial,
  heroShieldMaterial,
  heroSpikeGeometry,
  heroSpikeMaterial,
  unitCircle,
  unitSphere,
  WEAPON_COLOR,
} from '@/game/render/assets';
import { boulderScaleFactor, cometStretchFactor, shieldBubbleOpacity, spikeCountForLevel } from './upgrade-visuals';

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

/** Escala uniforme de la Burbuja de Cuarzo (F5) respecto al radio del héroe: envuelve la bola, no la toca. */
const SHIELD_BUBBLE_SCALE = 1.4;

/**
 * Gesto de victoria (playtest 2026-07-15, David: "quizá algún gesto de
 * victoria antes de la modal") durante 'boss-victory-pause' (world/step.ts,
 * BOSS_VICTORY_PAUSE_DURATION): saltitos suaves. SOLO render — no toca
 * velocity/posición de la sim, y usa `world.time` (no un reloj propio),
 * mismo patrón determinista que el bob de items (ItemView.tsx). abs(sin) da
 * un rebote que siempre sale del suelo hacia arriba (nunca se hunde por
 * debajo de la posición de reposo), corte limpio al abrirse el modal porque
 * `world.phase` deja de ser 'boss-victory-pause' ese mismo frame.
 */
const VICTORY_HOP_HEIGHT = 0.16;
const VICTORY_HOP_FREQUENCY = 6.5; // rad/s: ritmo alegre, no frenético

/**
 * Direcciones (en la esfera unitaria) de los 12 pinchos del Erizo de Acero
 * (F5): 3 "anillos ecuatoriales" de 4 pinchos, con un pequeño desfase de
 * ángulo entre anillos para que no queden alineados verticalmente. El orden
 * importa: `spikeCountForLevel` revela los índices [0,4) en nivel 1, [0,8)
 * en nivel 2 y los 12 en nivel 3 — así que el anillo 0 (ecuador puro) es el
 * primero en aparecer. Geometría pura, no se testea (sin infra de render 3D).
 */
function buildSpikeDirections(): Array<{ x: number; y: number; z: number }> {
  const RING_Y = [0, 0.5, -0.5];
  const RING_OFFSET_DEG = [0, 45, 20];
  const dirs: Array<{ x: number; y: number; z: number }> = [];
  for (let ring = 0; ring < RING_Y.length; ring++) {
    const y = RING_Y[ring];
    const xzRadius = Math.sqrt(Math.max(0, 1 - y * y));
    for (let i = 0; i < 4; i++) {
      const angle = ((i * 90 + RING_OFFSET_DEG[ring]) * Math.PI) / 180;
      dirs.push({ x: Math.sin(angle) * xzRadius, y, z: Math.cos(angle) * xzRadius });
    }
  }
  return dirs;
}

const SPIKE_DIRECTIONS = buildSpikeDirections();

export function HeroView({ session }: { session: GameSession }) {
  const bodyRef = useRef<Mesh>(null);
  const shadowRef = useRef<Mesh>(null);
  const shieldRef = useRef<Mesh>(null);
  const spikeRefs = useRef<(Mesh | null)[]>([]);
  const prevSpeed = useRef(0);
  const squashUntil = useRef(0);
  const trailAccumulator = useRef(0);
  // Arma del frame anterior: detecta el CAMBIO para disparar el burst de
  // partículas una sola vez (no cada frame mientras se mantiene el modo).
  const prevWeaponMode = useRef<WeaponMode | null>(null);

  // Pose de los pinchos (F5): fija UNA vez al montar, nunca en useFrame — son
  // hijos estáticos del mesh del héroe (heredan su transform cada frame sin
  // recálculo propio). Usa Quaternion.setFromUnitVectors para orientar el
  // cono (eje +Y local) hacia fuera, en vez de trigonometría de Euler frágil.
  useEffect(() => {
    const up = new Vector3(0, 1, 0);
    SPIKE_DIRECTIONS.forEach((dir, i) => {
      const mesh = spikeRefs.current[i];
      if (!mesh) return;
      const dirVec = new Vector3(dir.x, dir.y, dir.z);
      mesh.position.copy(dirVec);
      mesh.quaternion.setFromUnitVectors(up, dirVec);
    });
  }, []);

  useFrame((_, delta) => {
    const world = session.world;
    const hero = world.hero;
    const alpha = session.renderAlpha;
    const x = session.heroPrevX + (hero.position.x - session.heroPrevX) * alpha;
    const z = session.heroPrevY + (hero.position.y - session.heroPrevY) * alpha;

    const body = bodyRef.current;
    const shadow = shadowRef.current;
    const shield = shieldRef.current;

    // Niveles de mejora relevantes al render (F5): leídos cada frame desde
    // `hero.upgradeLevels`/`hero.modifiers` — barato (lookups en objeto
    // pequeño) y así una compra en tienda se refleja sin remontar nada.
    const firmezaLevel = getUpgradeLevel(hero, 'cuerpo-firmeza');
    const visualRadius = HERO_RADIUS * boulderScaleFactor(firmezaLevel);
    const cometFactor = cometStretchFactor(getUpgradeLevel(hero, 'cuerpo-velocidad'));
    const spikeVisibleCount = spikeCountForLevel(getUpgradeLevel(hero, 'cuerpo-dano'));
    const shieldCharges = hero.modifiers.shieldCharges;

    for (let i = 0; i < SPIKE_DIRECTIONS.length; i++) {
      const spike = spikeRefs.current[i];
      if (spike) spike.visible = i < spikeVisibleCount;
    }
    if (shield) {
      shield.visible = shieldCharges > 0;
      heroShieldMaterial.opacity = shieldBubbleOpacity(shieldCharges);
    }

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
      const scale = visualRadius * Math.max(0.05, 1 - t);
      if (body) {
        body.visible = true;
        body.position.set(x, visualRadius * (1 - t) - 0.4 * t, z);
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

    // Saltito de victoria: ver comentario de VICTORY_HOP_HEIGHT más arriba.
    const victoryHop =
      world.phase === 'boss-victory-pause' ? Math.abs(Math.sin(world.time * VICTORY_HOP_FREQUENCY)) * VICTORY_HOP_HEIGHT : 0;

    if (body) {
      body.visible = blinkOn;
      body.position.set(x, visualRadius + victoryHop, z);

      if (world.time < squashUntil.current) {
        // Aplastamiento: bajo y ancho, conservando volumen aproximado.
        const widen = 1 / Math.sqrt(SQUASH_FLATTEN);
        body.rotation.y = 0;
        body.scale.set(visualRadius * widen, visualRadius * SQUASH_FLATTEN, visualRadius * widen);
      } else if (speed > 0.5) {
        // Estiramiento a lo largo de la velocidad (eje Z local rotado hacia
        // la dirección de movimiento), compensado en los otros ejes. La
        // Estela de Cometa (F5) amplifica SOLO el bono que ya depende de la
        // velocidad (nunca el "1" base), así a velocidad 0 no cambia nada.
        const stretchBonus = Math.min(STRETCH_MAX, speed * STRETCH_PER_SPEED) * cometFactor;
        const stretch = 1 + stretchBonus;
        const thin = 1 / Math.sqrt(stretch);
        body.rotation.y = Math.atan2(hero.velocity.x, hero.velocity.y);
        body.scale.set(visualRadius * thin, visualRadius * thin, visualRadius * stretch);
      } else {
        body.rotation.y = 0;
        body.scale.setScalar(visualRadius);
      }
    }
    if (shadow) {
      shadow.visible = true;
      shadow.position.set(x, 0.02, z);
    }
  });

  return (
    <>
      <mesh ref={bodyRef} geometry={unitSphere} material={heroMaterial} scale={HERO_RADIUS}>
        {/* Pinchos del Erizo de Acero (F5): 12 pre-creados, visibilidad por nivel. */}
        {SPIKE_DIRECTIONS.map((_, i) => (
          <mesh
            key={i}
            ref={(el) => {
              spikeRefs.current[i] = el;
            }}
            geometry={heroSpikeGeometry}
            material={heroSpikeMaterial}
            visible={false}
          />
        ))}
        {/* Burbuja de Cuarzo (F5): visible mientras haya cargas de escudo. */}
        <mesh ref={shieldRef} geometry={unitSphere} material={heroShieldMaterial} scale={SHIELD_BUBBLE_SCALE} visible={false} />
      </mesh>
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
