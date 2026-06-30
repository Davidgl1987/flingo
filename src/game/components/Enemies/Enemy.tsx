import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { useGameStore } from '../../stores/useGameStore';
import type { EnemyState } from '../../core/types';

const COLORS: Record<EnemyState['type'], string> = {
  dummy: '#ef4444',
  chaser: '#f97316',
  spike: '#94a3b8',
  trail: '#22c55e',
  shooter: '#020617',
};

// Reused scratch objects so the per-frame update allocates nothing.
const UP = new Vector3(0, 1, 0);
const forwardVec = new Vector3();
const orientation = new Quaternion();

type EnemyProps = { id: string };

// Imperative entity: the mesh structure (which depends only on the static enemy
// type) renders once; position, orientation, hit-flash and hp bar are updated
// each frame via refs in useFrame, so the component never re-renders. The id is
// the only prop, so memo keeps it stable even though Scene re-renders per frame.
export const Enemy = memo(function Enemy({ id }: EnemyProps) {
  const groupRef = useRef<Group>(null);
  const bodyRef = useRef<Mesh>(null);
  const hpBarRef = useRef<Mesh>(null);
  const noseRefs = useRef<(Mesh | null)[]>([]);

  const { type, radius } = useMemo(() => {
    const enemy = useGameStore.getState().enemies.find((candidate) => candidate.id === id);
    return { type: (enemy?.type ?? 'dummy') as EnemyState['type'], radius: enemy?.radius ?? 0.45 };
  }, [id]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const enemy = useGameStore.getState().enemies.find((candidate) => candidate.id === id);
    if (!enemy || !enemy.alive) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.position.set(enemy.pos.x, enemy.radius, enemy.pos.y);

    const forward = Math.hypot(enemy.vel.x, enemy.vel.y) > 0.05 ? enemy.vel : enemy.spikeDir ?? { x: 0, y: 1 };
    forwardVec.set(forward.x, 0, forward.y).normalize();
    orientation.setFromUnitVectors(UP, forwardVec);

    const hitFlash = Math.min(1, (enemy.hitFlashTimer ?? 0) / 0.18);
    const emissive = hitFlash * 1.7;
    if (bodyRef.current) {
      (bodyRef.current.material as MeshStandardMaterial).emissiveIntensity = type === 'shooter' ? emissive * 0.7 : emissive;
    }
    if (hpBarRef.current) hpBarRef.current.scale.x = Math.max(0.0001, enemy.hp / enemy.maxHp);

    if (type === 'spike') {
      const sideX = -forwardVec.z;
      const sideZ = forwardVec.x;
      [-0.42, 0, 0.42].forEach((offset, index) => {
        const mesh = noseRefs.current[index];
        if (!mesh) return;
        mesh.position.set(forwardVec.x * radius * 0.78 + sideX * radius * offset, 0.02, forwardVec.z * radius * 0.78 + sideZ * radius * offset);
        mesh.quaternion.copy(orientation);
        (mesh.material as MeshStandardMaterial).emissiveIntensity = emissive * 0.45;
      });
    } else {
      const mesh = noseRefs.current[0];
      if (mesh) {
        const reach = type === 'shooter' ? 0.78 : 0.82;
        mesh.position.set(forwardVec.x * radius * reach, 0.02, forwardVec.z * radius * reach);
        mesh.quaternion.copy(orientation);
        (mesh.material as MeshStandardMaterial).emissiveIntensity = type === 'shooter'
          ? enemy.shooterState === 'charging' ? 0.9 : 0.15
          : 0.25 + emissive * 0.2;
      }
    }
  });

  const setNoseRef = (index: number) => (mesh: Mesh | null) => {
    noseRefs.current[index] = mesh;
  };

  return (
    <group ref={groupRef}>
      <mesh ref={bodyRef} castShadow receiveShadow>
        <sphereGeometry args={[type === 'spike' ? radius * 0.86 : radius, 22, 14]} />
        <meshStandardMaterial color={COLORS[type]} emissive="#ffffff" emissiveIntensity={0} roughness={type === 'spike' ? 0.6 : type === 'shooter' ? 0.72 : 0.6} />
      </mesh>

      {type === 'spike' ? (
        [0, 1, 2].map((index) => (
          <mesh key={index} ref={setNoseRef(index)} castShadow receiveShadow>
            <coneGeometry args={[radius * 0.22, radius * 0.76, 16]} />
            <meshStandardMaterial color="#cbd5e1" emissive="#ffffff" emissiveIntensity={0} roughness={0.42} />
          </mesh>
        ))
      ) : type === 'shooter' ? (
        <mesh ref={setNoseRef(0)} castShadow receiveShadow>
          <coneGeometry args={[radius * 0.28, radius * 0.82, 18]} />
          <meshStandardMaterial color="#f8fafc" emissive="#ffffff" emissiveIntensity={0.15} roughness={0.36} />
        </mesh>
      ) : (
        <mesh ref={setNoseRef(0)} castShadow receiveShadow>
          <coneGeometry args={[radius * 0.14, radius * 0.34, 14]} />
          <meshStandardMaterial color={COLORS[type]} emissive={COLORS[type]} emissiveIntensity={0.25} roughness={0.42} />
        </mesh>
      )}

      <mesh ref={hpBarRef} position={[0, radius + 0.12, 0]}>
        <boxGeometry args={[radius * 1.5, 0.05, 0.07]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
    </group>
  );
});
