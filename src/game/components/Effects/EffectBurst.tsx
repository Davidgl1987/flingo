import { DoubleSide } from 'three';
import type { EffectState } from '../../core/types';

type EffectBurstProps = {
  effect: EffectState;
};

export function EffectBurst({ effect }: EffectBurstProps) {
  const progress = 1 - effect.life / effect.duration;
  const opacity = Math.max(0, 1 - progress);
  const scale = 0.45 + progress * 1.45;
  const lift = effect.height + progress * 0.45;

  if (effect.type === 'launch') {
    const direction = effect.dir ?? { x: 0, y: 1 };
    const angle = Math.atan2(direction.x, direction.y);
    const travelScale = Math.max(0.55, Math.min(1.7, effect.radius));
    const spread = Math.sqrt(travelScale);
    const streaks = [
      { x: 0, z: -0.28, length: 0.72, width: 0.055, delay: 0 },
      { x: -0.22, z: -0.16, length: 0.46, width: 0.04, delay: 0.08 },
      { x: 0.22, z: -0.2, length: 0.5, width: 0.04, delay: 0.14 },
      { x: -0.1, z: -0.5, length: 0.34, width: 0.035, delay: 0.2 },
      { x: 0.12, z: -0.56, length: 0.36, width: 0.035, delay: 0.26 },
    ];

    return (
      <group position={[effect.pos.x, effect.height + 0.03, effect.pos.y]} rotation={[0, angle, 0]}>
        {streaks.map((streak, index) => {
          const localProgress = Math.max(0, Math.min(1, progress + streak.delay));
          const length = streak.length * travelScale;
          return (
            <mesh
              key={index}
              position={[streak.x * spread, 0, streak.z * travelScale - localProgress * 0.34 * travelScale]}
              scale={[1 + localProgress * 0.9, 1, 1]}
            >
              <boxGeometry args={[streak.width * spread, 0.035, length]} />
              <meshBasicMaterial color={effect.color} transparent opacity={opacity * (0.72 - index * 0.08)} />
            </mesh>
          );
        })}
      </group>
    );
  }

  if (effect.type === 'impact') {
    const direction = effect.dir ?? { x: 0, y: 1 };
    const angle = Math.atan2(direction.x, direction.y);

    return (
      <group position={[effect.pos.x, effect.height, effect.pos.y]} rotation={[0, angle, 0]}>
        <mesh scale={[scale, scale, scale]} renderOrder={30}>
          <ringGeometry args={[effect.radius * 0.45, effect.radius, 24]} />
          <meshBasicMaterial color={effect.color} transparent opacity={opacity * 0.9} side={DoubleSide} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, -0.02]} scale={[1, scale * 0.8, 1]} renderOrder={31}>
          <boxGeometry args={[effect.radius * 0.16, effect.radius * 1.35, 0.035]} />
          <meshBasicMaterial color={effect.color} transparent opacity={opacity * 0.58} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, 0.02]} renderOrder={32}>
          <sphereGeometry args={[effect.radius * 0.16, 10, 8]} />
          <meshBasicMaterial color={effect.color} transparent opacity={opacity * 0.82} depthTest={false} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  if (effect.type === 'explosion') {
    return (
      <group position={[effect.pos.x, effect.height, effect.pos.y]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[scale, scale, scale]}>
          <ringGeometry args={[effect.radius * 0.35, effect.radius, 36]} />
          <meshBasicMaterial color={effect.color} transparent opacity={opacity * 0.6} />
        </mesh>
        <mesh position={[0, lift, 0]} scale={[scale, scale * 0.55, scale]}>
          <sphereGeometry args={[effect.radius * 0.35, 18, 10]} />
          <meshBasicMaterial color={effect.color} transparent opacity={opacity * 0.28} />
        </mesh>
      </group>
    );
  }

  if (effect.type === 'death' || effect.type === 'damage') {
    return (
      <group position={[effect.pos.x, effect.height, effect.pos.y]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[scale, scale, scale]}>
          <ringGeometry args={[effect.radius * 0.45, effect.radius, 28]} />
          <meshBasicMaterial color={effect.color} transparent opacity={opacity * 0.78} />
        </mesh>
        <mesh position={[0, lift, 0]}>
          <sphereGeometry args={[effect.radius * (0.18 + progress * 0.12), 12, 8]} />
          <meshBasicMaterial color={effect.color} transparent opacity={opacity * 0.75} />
        </mesh>
      </group>
    );
  }

  if (effect.type === 'pickup') {
    const riseProgress = Math.min(1, progress / 0.58);
    const fadeProgress = progress <= 0.58 ? 0 : Math.min(1, (progress - 0.58) / 0.42);
    const pickupOpacity = Math.max(0, 1 - fadeProgress);

    return (
      <group position={[effect.pos.x, effect.height + riseProgress * 1.18, effect.pos.y]} rotation={[0, progress * Math.PI * 3.4, 0]}>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[effect.radius * 0.62, effect.radius * 0.62, 0.07, 20]} />
          <meshBasicMaterial color={effect.color} transparent opacity={pickupOpacity} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={[effect.pos.x, effect.height, effect.pos.y]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[scale, scale, scale]}>
        <ringGeometry args={[effect.radius * 0.55, effect.radius, 24]} />
        <meshBasicMaterial color={effect.color} transparent opacity={opacity * 0.7} />
      </mesh>
      {(effect.type === 'heal' || effect.type === 'shield') && (
        <mesh position={[0, lift, 0]}>
          <sphereGeometry args={[effect.radius * 0.18, 10, 8]} />
          <meshBasicMaterial color={effect.color} transparent opacity={opacity} />
        </mesh>
      )}
    </group>
  );
}
