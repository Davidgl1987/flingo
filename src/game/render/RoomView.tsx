/**
 * Sala estática: suelo, 4 paredes y rocas. Se construye una vez a partir de
 * los datos del mundo; no se actualiza por frame.
 */

import { WALL_THICKNESS } from '../content/constants';
import type { World } from '../sim/world';
import { floorMaterial, rockMaterial, unitBox, unitPlane, wallMaterial } from './assets';

const WALL_HEIGHT = 0.9;
const ROCK_HEIGHT = 0.8;

export function RoomView({ world }: { world: World }) {
  const { width, height } = world.room;
  const halfW = width / 2;
  const halfH = height / 2;
  const t = WALL_THICKNESS;

  return (
    <group>
      {/* Suelo (PlaneGeometry es XY; rotado -90° queda en el plano XZ). */}
      <mesh
        geometry={unitPlane}
        material={floorMaterial}
        rotation-x={-Math.PI / 2}
        scale={[width, height, 1]}
      />
      {/* Paredes: cajas apoyadas fuera del interior jugable. */}
      <mesh
        geometry={unitBox}
        material={wallMaterial}
        position={[0, WALL_HEIGHT / 2, -(halfH + t / 2)]}
        scale={[width + 2 * t, WALL_HEIGHT, t]}
      />
      <mesh
        geometry={unitBox}
        material={wallMaterial}
        position={[0, WALL_HEIGHT / 2, halfH + t / 2]}
        scale={[width + 2 * t, WALL_HEIGHT, t]}
      />
      <mesh
        geometry={unitBox}
        material={wallMaterial}
        position={[-(halfW + t / 2), WALL_HEIGHT / 2, 0]}
        scale={[t, WALL_HEIGHT, height]}
      />
      <mesh
        geometry={unitBox}
        material={wallMaterial}
        position={[halfW + t / 2, WALL_HEIGHT / 2, 0]}
        scale={[t, WALL_HEIGHT, height]}
      />
      {/* Rocas (obstáculos AABB). */}
      {world.obstacles.map((obstacle) => {
        const { minX, minY, maxX, maxY } = obstacle.aabb;
        return (
          <mesh
            key={obstacle.id}
            geometry={unitBox}
            material={rockMaterial}
            position={[(minX + maxX) / 2, ROCK_HEIGHT / 2, (minY + maxY) / 2]}
            scale={[maxX - minX, ROCK_HEIGHT, maxY - minY]}
          />
        );
      })}
    </group>
  );
}
