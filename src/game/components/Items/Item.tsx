import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { ItemState } from '../../core/types';

type ItemProps = {
  item: ItemState;
};

export const Item = memo(function Item({ item }: ItemProps) {
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current || item.collected) return;
    if (item.type === 'coin' || item.type === 'key') {
      groupRef.current.rotation.y = clock.elapsedTime * 4.4;
      groupRef.current.position.y = 0.42 + Math.sin(clock.elapsedTime * 5 + item.pos.x) * 0.06;
    }
  });

  if (item.collected) return null;
  const color = item.type === 'coin' ? '#facc15' : item.type === 'key' ? '#ca8a04' : '#f472b6';
  const baseY = item.type === 'coin' || item.type === 'key' ? 0.42 : 0.22;
  return (
    <group ref={groupRef} position={[item.pos.x, baseY, item.pos.y]}>
      <mesh castShadow rotation={item.type === 'coin' || item.type === 'key' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}>
        {item.type === 'coin' ? (
          <cylinderGeometry args={[item.radius, item.radius, 0.08, 24]} />
        ) : item.type === 'key' ? (
          <boxGeometry args={[item.radius * 1.45, 0.08, item.radius * 0.72]} />
        ) : (
          <cylinderGeometry args={[item.radius * 0.62, item.radius * 0.72, 0.34, 16]} />
        )}
        <meshStandardMaterial color={color} metalness={item.type === 'coin' || item.type === 'key' ? 0.45 : 0} roughness={0.35} />
      </mesh>
      {item.type === 'potion' && (
        <mesh position={[0, 0.23, 0]} castShadow>
          <cylinderGeometry args={[item.radius * 0.28, item.radius * 0.24, 0.14, 12]} />
          <meshStandardMaterial color="#fdf2f8" roughness={0.25} />
        </mesh>
      )}
    </group>
  );
});
