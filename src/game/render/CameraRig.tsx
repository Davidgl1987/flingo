/**
 * Cámara elevada e inclinada que sigue al héroe con suavizado exponencial
 * independiente del framerate.
 *
 * Fase 4:
 * - Sacudida por *trauma* (ARCHITECTURE.md): offset = trauma² × ruido,
 *   ADITIVO sobre la posición seguida (nunca toca el objetivo del lerp, así
 *   el shake es breve y amortiguado y no desplaza el encuadre).
 * - Encuadre móvil retrato (GDD §14): en viewports estrechos (aspect < 1.2)
 *   la cámara se aleja proporcionalmente para compensar el FOV horizontal
 *   reducido y que la sala siga siendo jugable con los botones sin tapar.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { GameSession } from '../session';

const CAMERA_OFFSET = new THREE.Vector3(0, 9.5, 6.2);
/** Rigidez del seguimiento (mayor = más pegado al héroe). */
const FOLLOW_STIFFNESS = 5;

/** Amplitud máxima del shake posicional (u de mundo) con trauma = 1. */
const SHAKE_MAX_OFFSET = 0.4;
/** Frecuencias inconmensuradas del ruido del shake (rad/s) por eje. */
const SHAKE_FREQ_X = 31;
const SHAKE_FREQ_Y = 37;
const SHAKE_FREQ_Z = 41;

/**
 * Factor de alejamiento según aspecto del viewport: 1 en apaisado/escritorio,
 * crece suavemente al estrechar (retrato 375×812 ⇒ aspect ≈ 0.46 ⇒ ~2.1).
 * Clamp para no alejar de más (legibilidad del héroe en pantalla de 5").
 */
function distanceScaleForAspect(aspect: number): number {
  if (aspect >= 1.2) return 1;
  const scale = Math.pow(1.2 / Math.max(0.3, aspect), 0.75);
  return Math.min(2.1, Math.max(1, scale));
}

export function CameraRig({ session }: { session: GameSession }) {
  const camera = useThree((state) => state.camera);
  const scratch = useMemo(
    () => ({ target: new THREE.Vector3(), look: new THREE.Vector3(), offset: new THREE.Vector3() }),
    [],
  );

  // Colocación inicial sin lerp (evita el "vuelo" de cámara al arrancar).
  useEffect(() => {
    const hero = session.world.hero.position;
    const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1.6;
    const s = distanceScaleForAspect(aspect);
    camera.position.set(hero.x + CAMERA_OFFSET.x * s, CAMERA_OFFSET.y * s, hero.y + CAMERA_OFFSET.z * s);
    camera.lookAt(hero.x, 0, hero.y);
  }, [camera, session]);

  useFrame((state, delta) => {
    const hero = session.world.hero;
    const alpha = session.renderAlpha;
    const x = session.heroPrevX + (hero.position.x - session.heroPrevX) * alpha;
    const z = session.heroPrevY + (hero.position.y - session.heroPrevY) * alpha;

    // Encuadre según aspecto, recalculado por frame (3 multiplicaciones: el
    // resize/rotación de pantalla queda cubierto gratis; R3F ya mantiene
    // `camera.aspect` al día).
    const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1.6;
    const s = distanceScaleForAspect(aspect);
    scratch.offset.copy(CAMERA_OFFSET).multiplyScalar(s);

    scratch.target.set(x + scratch.offset.x, scratch.offset.y, z + scratch.offset.z);
    const k = 1 - Math.exp(-FOLLOW_STIFFNESS * delta);
    camera.position.lerp(scratch.target, k);
    // Mirar a "posición de cámara − offset": pitch constante, sin bamboleo.
    scratch.look.copy(camera.position).sub(scratch.offset);
    camera.lookAt(scratch.look);

    // Shake ADITIVO tras el lookAt (ARCHITECTURE.md): trauma² × ruido, con
    // senos inconmensurados como ruido barato sin asignaciones. No participa
    // en el lerp ni en el lookAt, así que se amortigua solo al decaer el
    // trauma y nunca desplaza el encuadre (breve, no mareante).
    const trauma = session.juice.state.trauma;
    if (trauma > 0) {
      const shake = trauma * trauma * SHAKE_MAX_OFFSET;
      const t = state.clock.elapsedTime;
      camera.position.x += shake * Math.sin(t * SHAKE_FREQ_X);
      camera.position.y += shake * 0.6 * Math.sin(t * SHAKE_FREQ_Y + 1.7);
      camera.position.z += shake * Math.sin(t * SHAKE_FREQ_Z + 3.1);
    }
  });

  return null;
}
