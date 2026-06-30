import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { PLAYER_MAX_SPEED } from '../../core/constants';
import { len, normalize } from '../../core/vector';
import type { WeaponMode } from '../../core/types';
import { useGameStore } from '../../stores/useGameStore';

const BODY_COLORS: Record<WeaponMode, string> = { body: '#38bdf8', arrow: '#facc15', spell: '#c084fc' };
const TRAIL_COLORS: Record<WeaponMode, string> = { body: '#7dd3fc', arrow: '#fde68a', spell: '#d8b4fe' };

const STREAKS = [
  { x: 0, z: -0.42, length: 1, width: 1, opacity: 1 },
  { x: -1, z: -0.26, length: 0.72, width: 0.72, opacity: 0.72 },
  { x: 1, z: -0.3, length: 0.78, width: 0.72, opacity: 0.72 },
  { x: -0.55, z: -0.72, length: 0.48, width: 0.6, opacity: 0.46 },
  { x: 0.62, z: -0.78, length: 0.52, width: 0.6, opacity: 0.46 },
];

// Imperative player: position, color, invulnerability and the speed trail are
// updated each frame via refs in useFrame, so the component never re-renders.
// The speed trail uses scale (not geometry args) so geometry isn't recreated.
export function Player() {
  const radius = useGameStore.getState().player.radius;
  const groupRef = useRef<Group>(null);
  const bodyRef = useRef<Mesh>(null);
  const shieldRef = useRef<Mesh>(null);
  const trailGroupRef = useRef<Group>(null);
  const streakRefs = useRef<(Mesh | null)[]>([]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const player = useGameStore.getState().player;
    group.position.set(player.pos.x, player.radius + 0.02 + player.pitFallHeight, player.pos.y);

    if (bodyRef.current) {
      const material = bodyRef.current.material as MeshStandardMaterial;
      material.color.set(BODY_COLORS[player.weaponMode]);
      material.opacity = player.invulnerableTimer > 0 ? 0.55 : 1;
    }
    if (shieldRef.current) shieldRef.current.visible = player.shieldCharges > 0;

    const speed = len(player.vel);
    const speedRatio = Math.max(0, Math.min(1, (speed - 0.45) / (PLAYER_MAX_SPEED * 0.72)));
    const showTrail = speedRatio > 0.04;
    const trailGroup = trailGroupRef.current;
    if (trailGroup) {
      trailGroup.visible = showTrail;
      if (showTrail) {
        const direction = normalize(player.vel);
        trailGroup.rotation.y = Math.atan2(direction.x, direction.y);
        const trailLength = 0.3 + speedRatio * 2.4;
        const trailSpread = 0.12 + speedRatio * 0.26;
        const trailOpacity = 0.18 + speedRatio * 0.42;
        const color = TRAIL_COLORS[player.weaponMode];
        STREAKS.forEach((streak, index) => {
          const mesh = streakRefs.current[index];
          if (!mesh) return;
          mesh.position.set(streak.x * trailSpread, 0, streak.z * trailLength);
          mesh.scale.z = streak.length * trailLength;
          const material = mesh.material as MeshBasicMaterial;
          material.color.set(color);
          material.opacity = trailOpacity * streak.opacity;
        });
      }
    }
  });

  const setStreakRef = (index: number) => (mesh: Mesh | null) => {
    streakRefs.current[index] = mesh;
  };

  return (
    <group ref={groupRef}>
      <group ref={trailGroupRef} position={[0, -radius + 0.13, 0]} visible={false}>
        {STREAKS.map((streak, index) => (
          <mesh key={index} ref={setStreakRef(index)}>
            <boxGeometry args={[0.035 * streak.width, 0.03, 1]} />
            <meshBasicMaterial color={TRAIL_COLORS.body} transparent opacity={0} />
          </mesh>
        ))}
      </group>
      <mesh ref={bodyRef} castShadow>
        <sphereGeometry args={[radius, 28, 18]} />
        <meshStandardMaterial color={BODY_COLORS.body} transparent opacity={1} />
      </mesh>
      <mesh ref={shieldRef} visible={false}>
        <sphereGeometry args={[radius + 0.1, 20, 12]} />
        <meshStandardMaterial color="#bfdbfe" transparent opacity={0.22} />
      </mesh>
    </group>
  );
}
