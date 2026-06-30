import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, Matrix4 } from 'three';
import { buildFloorTiles } from '../../physics/tilePhysics';
import { useGameStore } from '../../stores/useGameStore';
import { Walls } from './Walls';
import { buildWorldWallObstacles, getDoorBridges, worldToLocal } from '../../core/worldMap';
import type { HazardState, WorldMapState } from '../../core/types';

type FloorTilesProps = {
  worldMap: WorldMapState;
  hazards: HazardState[];
};

const FloorTiles = memo(function FloorTiles({ worldMap, hazards }: FloorTilesProps) {
  const ref = useRef<InstancedMesh>(null);

  const tiles = useMemo(() => {
    const result: { x: number; z: number }[] = [];
    for (const instance of worldMap.rooms) {
      const roomHazards = hazards
        .filter((hazard) => hazard.roomInstanceId === instance.id)
        .map((hazard) => ({ ...hazard, pos: worldToLocal(instance, hazard.pos) }));
      for (const tile of buildFloorTiles(instance.width, instance.height, roomHazards)) {
        result.push({ x: tile.x + instance.offset.x, z: tile.z + instance.offset.y });
      }
    }
    return result;
  }, [worldMap, hazards]);

  useLayoutEffect(() => {
    if (!ref.current || tiles.length === 0) return;
    const m = new Matrix4();
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      m.setPosition(t.x, -0.055, t.z);
      ref.current.setMatrixAt(i, m);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [tiles]);

  if (tiles.length === 0) return null;

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, tiles.length]} receiveShadow frustumCulled={false}>
      <boxGeometry args={[0.98, 0.11, 0.98]} />
      <meshStandardMaterial color="#1e293b" roughness={0.92} />
    </instancedMesh>
  );
});

export const Room = memo(function Room() {
  const room = useGameStore((state) => state.room);
  const worldMap = useGameStore((state) => state.worldMap);
  const hasKey = useGameStore((state) => state.hasKey);
  const hazards = useGameStore((state) => state.hazards);
  if (worldMap) {
    const walls = buildWorldWallObstacles(worldMap, hasKey);
    const bridges = getDoorBridges(worldMap);
    return (
      <group>
        {bridges.map((bridge) => (
          <mesh key={bridge.id} position={[bridge.pos.x, -0.055, bridge.pos.y]} receiveShadow>
            <boxGeometry args={[bridge.width, 0.11, bridge.height]} />
            <meshStandardMaterial color="#1e293b" roughness={0.92} />
          </mesh>
        ))}
        <FloorTiles worldMap={worldMap} hazards={hazards} />
        {walls.map((wall) => (
          <mesh key={wall.id} position={[wall.pos.x, 0.38, wall.pos.y]} castShadow receiveShadow>
            <boxGeometry args={[wall.width, 0.76, wall.height]} />
            <meshStandardMaterial color={wall.connectionId ? (wall.requiresKey ? '#ca8a04' : '#7f1d1d') : '#475569'} />
          </mesh>
        ))}
      </group>
    );
  }

  const floorTiles = buildFloorTiles(room.width, room.height, hazards);

  return (
    <group>
      {floorTiles.map((tile) => (
        <mesh
          key={`floor-${tile.key}`}
          position={[tile.x, -0.055, tile.z]}
          receiveShadow
        >
          <boxGeometry args={[0.98, 0.11, 0.98]} />
          <meshStandardMaterial color="#1e293b" roughness={0.92} />
        </mesh>
      ))}
      <Walls width={room.width} height={room.height} />
    </group>
  );
});
