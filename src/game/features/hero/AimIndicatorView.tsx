/**
 * Indicador de puntería: hilera de puntos desde el héroe en la dirección de
 * tiro; longitud y tamaño crecen con la fuerza. Lee session.aim en useFrame
 * (visible bajo el dedo, sin re-renders, sin asignaciones).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import type { GameSession } from '@/game/session/session';
import { aimDotMaterial, unitCircle } from '@/game/render/assets';

const DOT_COUNT = 8;
/** Longitud de la guía a fuerza máxima (u). Solo lectura visual, no predicción física. */
const MAX_GUIDE_LENGTH = 3.4;
const MIN_GUIDE_LENGTH = 0.9;

const dotIndices = Array.from({ length: DOT_COUNT }, (_, i) => i);

export function AimIndicatorView({ session }: { session: GameSession }) {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const aim = session.aim;
    if (!aim.active || aim.force <= 0) {
      group.visible = false;
      return;
    }
    group.visible = true;
    const hero = session.world.hero.position;
    const reach = MIN_GUIDE_LENGTH + (MAX_GUIDE_LENGTH - MIN_GUIDE_LENGTH) * aim.force;
    for (let i = 0; i < DOT_COUNT; i++) {
      const dot = group.children[i];
      if (!dot) continue;
      const t = (i + 1) / DOT_COUNT;
      dot.position.set(hero.x + aim.dirX * reach * t, 0.05, hero.y + aim.dirY * reach * t);
      // Puntos más gordos cuanta más fuerza; se afinan hacia la punta.
      dot.scale.setScalar(0.05 + 0.13 * aim.force * (1 - t * 0.45));
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {dotIndices.map((i) => (
        <mesh key={i} geometry={unitCircle} material={aimDotMaterial} rotation-x={-Math.PI / 2} />
      ))}
    </group>
  );
}
