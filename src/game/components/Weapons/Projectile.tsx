import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import type { ProjectileState } from '../../core/types';
import { len, normalize } from '../../core/vector';

type ProjectileProps = {
  projectile: ProjectileState;
};

export function Projectile({ projectile }: ProjectileProps) {
  const groupRef = useRef<Group>(null);
  const direction = normalize(projectile.vel);
  const speed = len(projectile.vel);
  const angle = Math.atan2(direction.x, direction.y);
  const blink = projectile.type === 'spell' ? 0.55 + Math.sin((projectile.life * 28) + projectile.pos.x) * 0.35 : 0;

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    if (projectile.type === 'spell') {
      const pulse = 1 + Math.sin(clock.elapsedTime * 18 + projectile.pos.y) * 0.14;
      groupRef.current.scale.setScalar(pulse);
    }
  });

  const trailLength = projectile.type === 'arrow' ? Math.min(1.05, 0.18 + speed * 0.06) : Math.min(0.9, 0.24 + speed * 0.04);
  const trailColor = projectile.hostile ? '#f8fafc' : projectile.type === 'arrow' ? '#fde68a' : '#d8b4fe';
  const spellLightIntensity = projectile.type === 'spell' ? 1.4 + blink * 1.6 : 0;
  const spellTrail = [
    { z: -0.28, radius: projectile.radius * 0.9, opacity: 0.22 + blink * 0.1 },
    { z: -0.52, radius: projectile.radius * 0.62, opacity: 0.16 + blink * 0.08 },
    { z: -0.72, radius: projectile.radius * 0.42, opacity: 0.1 + blink * 0.06 },
  ];

  return (
    <group ref={groupRef} position={[projectile.pos.x, 0.28, projectile.pos.y]} rotation={[0, angle, 0]}>
      {projectile.type === 'arrow' && (
        <mesh position={[0, 0, -trailLength / 2 - 0.12]}>
          <boxGeometry args={[0.08, 0.045, trailLength]} />
          <meshBasicMaterial color={trailColor} transparent opacity={0.42} />
        </mesh>
      )}
      {projectile.type === 'arrow' ? (
        <group>
          <mesh castShadow position={[0, 0, 0.08]}>
            <coneGeometry args={[0.12, 0.34, 4]} />
            <meshStandardMaterial color={projectile.hostile ? '#f8fafc' : '#facc15'} emissive={projectile.hostile ? '#ffffff' : '#713f12'} emissiveIntensity={projectile.hostile ? 0.55 : 0.25} />
          </mesh>
          <mesh castShadow position={[0, 0, -0.18]}>
            <boxGeometry args={[0.07, 0.08, 0.42]} />
            <meshStandardMaterial color={projectile.hostile ? '#e5e7eb' : '#fde68a'} emissive={projectile.hostile ? '#ffffff' : '#713f12'} emissiveIntensity={projectile.hostile ? 0.35 : 0.2} />
          </mesh>
        </group>
      ) : (
        <group>
          <pointLight color="#d8b4fe" intensity={spellLightIntensity} distance={3.1} decay={2.1} />
          {spellTrail.map((trail, index) => (
            <mesh key={index} position={[0, 0, trail.z]}>
              <sphereGeometry args={[trail.radius, 14, 10]} />
              <meshBasicMaterial color="#d8b4fe" transparent opacity={trail.opacity} />
            </mesh>
          ))}
          <mesh>
            <sphereGeometry args={[projectile.radius * 2.2, 18, 12]} />
            <meshBasicMaterial color="#d8b4fe" transparent opacity={0.12 + blink * 0.08} />
          </mesh>
          <mesh castShadow>
            <sphereGeometry args={[projectile.radius, 18, 12]} />
            <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={1.1 + blink * 1.5} transparent opacity={0.78 + blink * 0.18} />
          </mesh>
        </group>
      )}
    </group>
  );
}
