/**
 * Cámara elevada e inclinada que sigue al héroe con suavizado exponencial
 * independiente del framerate. El shake de fase 3 se añadirá como offset
 * aditivo sobre esta posición.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { GameSession } from '../session';

const CAMERA_OFFSET = new THREE.Vector3(0, 9.5, 6.2);
/** Rigidez del seguimiento (mayor = más pegado al héroe). */
const FOLLOW_STIFFNESS = 5;

export function CameraRig({ session }: { session: GameSession }) {
  const camera = useThree((state) => state.camera);
  const scratch = useMemo(
    () => ({ target: new THREE.Vector3(), look: new THREE.Vector3() }),
    [],
  );

  // Colocación inicial sin lerp (evita el "vuelo" de cámara al arrancar).
  useEffect(() => {
    const hero = session.world.hero.position;
    camera.position.set(hero.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, hero.y + CAMERA_OFFSET.z);
    camera.lookAt(hero.x, 0, hero.y);
  }, [camera, session]);

  useFrame((_, delta) => {
    const hero = session.world.hero;
    const alpha = session.renderAlpha;
    const x = session.heroPrevX + (hero.position.x - session.heroPrevX) * alpha;
    const z = session.heroPrevY + (hero.position.y - session.heroPrevY) * alpha;
    scratch.target.set(x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, z + CAMERA_OFFSET.z);
    const k = 1 - Math.exp(-FOLLOW_STIFFNESS * delta);
    camera.position.lerp(scratch.target, k);
    // Mirar a "posición de cámara − offset": pitch constante, sin bamboleo.
    scratch.look.copy(camera.position).sub(CAMERA_OFFSET);
    camera.lookAt(scratch.look);
  });

  return null;
}
