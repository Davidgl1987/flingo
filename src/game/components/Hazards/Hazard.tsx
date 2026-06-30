import { memo } from 'react';
import type { HazardState } from '../../core/types';
import { BARREL_RADIUS } from '../../core/constants';

type HazardProps = {
  hazard: HazardState;
};

export const Hazard = memo(function Hazard({ hazard }: HazardProps) {
  if (hazard.type === 'pit') {
    return null;
  }

  if (hazard.type === 'spikes') {
    return (
      <group position={[hazard.pos.x, 0.05, hazard.pos.y]}>
        <mesh receiveShadow>
          <boxGeometry args={[hazard.width ?? 1, 0.08, hazard.height ?? 1]} />
          <meshStandardMaterial color="#7f1d1d" />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <coneGeometry args={[0.18, 0.32, 4]} />
          <meshStandardMaterial color="#e5e7eb" />
        </mesh>
      </group>
    );
  }

  if (hazard.type === 'barrel') {
    if (hazard.exploded && (hazard.timer ?? 0) <= 0) return null;
    return (
      <group position={[hazard.pos.x, 0.36, hazard.pos.y]}>
        {!hazard.exploded && (
          <mesh castShadow>
            <cylinderGeometry args={[hazard.radius ?? 0.42, hazard.radius ?? 0.42, 0.72, 18]} />
            <meshStandardMaterial color="#b45309" />
          </mesh>
        )}
        {hazard.exploded && (
          <mesh position={[0, 0.02, 0]}>
            <sphereGeometry args={[BARREL_RADIUS, 24, 12]} />
            <meshBasicMaterial color="#fb923c" transparent opacity={0.22} />
          </mesh>
        )}
      </group>
    );
  }

  if (hazard.type === 'slow') {
    return (
      <mesh position={[hazard.pos.x, 0.04, hazard.pos.y]}>
        <boxGeometry args={[hazard.width ?? 1, 0.05, hazard.height ?? 1]} />
        <meshStandardMaterial color="#2563eb" transparent opacity={0.55} />
      </mesh>
    );
  }

  if (hazard.type === 'boost') {
    return (
      <mesh position={[hazard.pos.x, 0.045, hazard.pos.y]}>
        <boxGeometry args={[hazard.width ?? 1, 0.06, hazard.height ?? 1]} />
        <meshStandardMaterial color="#14b8a6" transparent opacity={0.62} />
      </mesh>
    );
  }

  return (
    <mesh position={[hazard.pos.x, 0.32, hazard.pos.y]} castShadow receiveShadow>
      <boxGeometry args={[hazard.width ?? 1, 0.64, hazard.height ?? 1]} />
      <meshStandardMaterial color="#64748b" />
    </mesh>
  );
});
