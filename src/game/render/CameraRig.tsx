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
 *
 * Fase 5 (fix playtest, punto 6): el placement inicial se hacía en un
 * `useEffect` que leía `camera.aspect` en el commit de montaje — en viewports
 * con `100dvh` (móvil: la UI del navegador puede reflow el alto tras el
 * primer paint) ese aspect podía no coincidir con el que R3F resuelve para el
 * primer `useFrame`, así que la cámara "saltaba" de una posición a otra en el
 * primer par de frames: un salto de posición idéntico a un shake de trauma,
 * pero sin que trauma valiera nada (trauma arranca en 0, confirmado por
 * `createJuiceState`/`createGameSession`/`createDungeonGameSession`: no hay
 * evento inicial que le sume nada). Fix: el snap inicial ahora ocurre dentro
 * del primer `useFrame` (donde `camera.aspect` ya está resuelto contra el
 * tamaño real del canvas), nunca en un efecto aparte.
 *
 * Zoom de puntería (punto 7, GDD "juice"): mientras `session.aim.active`, el
 * factor de distancia se acerca un ~10% (lerp propio, independiente del
 * seguimiento) y vuelve suavemente al soltar. Puramente aditivo sobre el
 * mismo `distanceScaleForAspect`, así que no interfiere con el encuadre móvil.
 *
 * Ajuste manual de distancia (ronda 3, punto 5): slider en el modal de pausa
 * (0.75×-1.5×), leído de `cameraSettings.distanceScale` (módulo mutable
 * persistido en localStorage, ver cameraSettings.ts) y aplicado con su propio
 * lerp — multiplicativo sobre el mismo `s` que ya combina aspecto + zoom de
 * puntería, así que compone con ambos sin pisarlos.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GameSession } from '../session';
import { cameraSettings } from './cameraSettings';

const CAMERA_OFFSET = new THREE.Vector3(0, 9.5, 6.2);
/** Rigidez del seguimiento (mayor = más pegado al héroe). */
const FOLLOW_STIFFNESS = 5;

/** Acercamiento de cámara mientras se apunta (fracción de distancia que se recorta). */
const AIM_ZOOM_FACTOR = 0.1;
/** Rigidez del lerp de zoom (mismo orden que el seguimiento: suave, nunca brusco). */
const AIM_ZOOM_STIFFNESS = 6;

/** Rigidez del lerp del ajuste manual de distancia (punto 5): suave, nunca un salto al mover el slider. */
const USER_DISTANCE_LERP_STIFFNESS = 4;

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
  // Fracción de zoom de puntería actual [0,1]; lerpea hacia 1 (apuntando) o 0
  // (soltado). Empieza en 0 (sin zoom) y sobrevive entre frames en un ref
  // porque no debe disparar re-render de React.
  const aimZoom = useRef(0);
  // Factor de distancia manual (punto 5 de playtest ronda 3): lerpea hacia
  // `cameraSettings.distanceScale` (mutado por el slider del modal de
  // pausa) para que mover el slider nunca "salte" de golpe. Arranca ya en el
  // valor persistido (no en 1) para no animar un salto falso al entrar.
  const userDistance = useRef(cameraSettings.distanceScale);
  // true tras el primer useFrame: el placement inicial (snap sin lerp) solo
  // ocurre una vez, y DENTRO de useFrame (nunca en un useEffect aparte) para
  // que `camera.aspect` ya esté resuelto contra el tamaño real del canvas
  // (punto 6: fix del shake al arrancar, ver comentario de arriba del fichero).
  const initialized = useRef(false);

  useFrame((state, delta) => {
    const hero = session.world.hero;
    const alpha = session.renderAlpha;
    const x = session.heroPrevX + (hero.position.x - session.heroPrevX) * alpha;
    const z = session.heroPrevY + (hero.position.y - session.heroPrevY) * alpha;

    // Encuadre según aspecto, recalculado por frame (3 multiplicaciones: el
    // resize/rotación de pantalla queda cubierto gratis; R3F ya mantiene
    // `camera.aspect` al día).
    const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1.6;
    let s = distanceScaleForAspect(aspect);

    // Zoom de puntería: lerp suave de la fracción hacia el objetivo (1 mientras
    // se apunta, 0 al soltar), aplicado como recorte multiplicativo de `s`.
    const aimTarget = session.aim.active ? 1 : 0;
    const zoomK = 1 - Math.exp(-AIM_ZOOM_STIFFNESS * delta);
    aimZoom.current += (aimTarget - aimZoom.current) * zoomK;
    s *= 1 - AIM_ZOOM_FACTOR * aimZoom.current;

    // Ajuste manual de distancia (punto 5): multiplicativo, aplicado DESPUÉS
    // del encuadre por aspecto y del zoom de puntería, así que compone con
    // ambos sin interferir (el usuario aleja/acerca la base, el zoom de
    // puntería sigue recortando un 10% adicional sobre esa base).
    const userK = 1 - Math.exp(-USER_DISTANCE_LERP_STIFFNESS * delta);
    userDistance.current += (cameraSettings.distanceScale - userDistance.current) * userK;
    s *= userDistance.current;

    scratch.offset.copy(CAMERA_OFFSET).multiplyScalar(s);

    scratch.target.set(x + scratch.offset.x, scratch.offset.y, z + scratch.offset.z);
    if (!initialized.current) {
      // Snap sin lerp en el primer frame (evita el "vuelo" de cámara al
      // arrancar), ya con el aspect real del canvas.
      initialized.current = true;
      camera.position.copy(scratch.target);
    } else {
      const k = 1 - Math.exp(-FOLLOW_STIFFNESS * delta);
      camera.position.lerp(scratch.target, k);
    }
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
