/**
 * Estructura estática del escenario.
 *
 * Modo sala única (world.dungeon === null, playtest del editor): suelo, 4
 * paredes y rocas como en fases 1-2.
 *
 * Modo mazmorra (GDD §10): renderiza TODAS las salas colocadas en el plano —
 * un suelo por sala + parches de suelo bajo los huecos de puerta, muros y
 * rocas con InstancedMesh (presupuesto: nada de una mesh por tile), y los
 * portones de puerta cerrados como mallas visibles (azul = normal, dorado =
 * requiere llave). Los muros son estáticos; los portones se reconstruyen
 * solo cuando `world.wallVersion` cambia (abrir una puerta, evento raro).
 */

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { DOOR_WIDTH, QUEEN_COLUMN_ID_PREFIX, WALL_THICKNESS } from '../content/constants';
import { DOOR_GATE_ID_PREFIX } from '../sim/dungeon-world';
import type { Obstacle, World } from '../sim/world';
import {
  doorKeyMaterial,
  doorMaterial,
  floorMaterial,
  rockMaterial,
  unitBox,
  unitPlane,
  wallMaterial,
} from './assets';

const WALL_HEIGHT = 0.9;
const ROCK_HEIGHT = 0.8;
const GATE_HEIGHT = 0.8;

function isWallObstacle(o: Obstacle): boolean {
  return o.id.includes('-wall-');
}

function isGateObstacle(o: Obstacle): boolean {
  return o.id.startsWith(DOOR_GATE_ID_PREFIX);
}

/**
 * true si este `Obstacle` es una columna destructible de la Reina del
 * Enjambre (T2 render, GDD §15.3): su id LOCAL (tras el `roomId:` opcional)
 * empieza por `column` — mismo criterio que `bosses.ts::onInit` usa para
 * poblar `world.queenColumns`. Se excluyen del pintado genérico de rocas
 * para que NO se dibujen dos veces: `QueenColumnsView` (montado desde
 * GameRoot) es el único que las pinta, en sus 3 estados (intacta/agrietada/
 * escombros) leyendo directamente `world.queenColumns`, que sigue siendo la
 * fuente de verdad incluso tras romperse (cuando ya no queda `Obstacle`).
 */
function isQueenColumnObstacle(o: Obstacle): boolean {
  const local = o.id.includes(':') ? o.id.slice(o.id.lastIndexOf(':') + 1) : o.id;
  return local.startsWith(QUEEN_COLUMN_ID_PREFIX);
}

/** Malla instanciada de cajas estáticas a partir de una lista de AABBs (muros/rocas). */
function InstancedBoxes({
  obstacles,
  material,
  height,
}: {
  obstacles: Obstacle[];
  material: THREE.Material;
  height: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const scratch = new THREE.Object3D();
    for (let i = 0; i < obstacles.length; i++) {
      const { minX, minY, maxX, maxY } = obstacles[i].aabb;
      scratch.position.set((minX + maxX) / 2, height / 2, (minY + maxY) / 2);
      scratch.scale.set(maxX - minX, height, maxY - minY);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.count = obstacles.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [obstacles, height]);

  if (obstacles.length === 0) return null;
  return <instancedMesh ref={meshRef} args={[unitBox, material, obstacles.length]} />;
}

/** Portones de puerta cerrados: pocos (≤ nº de conexiones), mallas normales reconstruidas al abrir puertas. */
function DoorGates({ world }: { world: World }) {
  const [version, setVersion] = useState(world.wallVersion);

  // Sondeo barato por frame (una comparación de enteros); setState SOLO
  // cuando una puerta cambió de estado — evento raro, no por frame.
  useFrame(() => {
    if (world.wallVersion !== version) setVersion(world.wallVersion);
  });

  const gates = world.obstacles.filter(isGateObstacle);
  return (
    <>
      {gates.map((gate) => {
        const { minX, minY, maxX, maxY } = gate.aabb;
        return (
          <mesh
            key={gate.id}
            geometry={unitBox}
            material={gate.id.endsWith('-key') ? doorKeyMaterial : doorMaterial}
            position={[(minX + maxX) / 2, GATE_HEIGHT / 2, (minY + maxY) / 2]}
            scale={[maxX - minX, GATE_HEIGHT, maxY - minY]}
          />
        );
      })}
    </>
  );
}

/** Mazmorra completa: suelos, parches de puerta, muros/rocas instanciados y portones. */
function DungeonStructureView({ world }: { world: World }) {
  const dungeon = world.dungeon;
  // Muros y rocas son estáticos durante la run: se calculan una vez por mundo.
  const staticBoxes = useMemo(() => {
    return {
      walls: world.obstacles.filter(isWallObstacle),
      rocks: world.obstacles.filter((o) => !isWallObstacle(o) && !isGateObstacle(o) && !isQueenColumnObstacle(o)),
    };
  }, [world]);

  if (!dungeon) return null;
  const t = WALL_THICKNESS;

  return (
    <group>
      {dungeon.rooms.map((placed) => (
        <mesh
          key={placed.room.id}
          geometry={unitPlane}
          material={floorMaterial}
          rotation-x={-Math.PI / 2}
          position={[placed.origin.x, 0, placed.origin.y]}
          scale={[placed.room.width, placed.room.height, 1]}
        />
      ))}
      {/* Parche de suelo bajo cada hueco de puerta (el paso entre interiores). */}
      {dungeon.connections.map((conn, i) => {
        const horizontal = conn.sideOnA === 'east' || conn.sideOnA === 'west';
        const dirSign = conn.sideOnA === 'east' || conn.sideOnA === 'south' ? 1 : -1;
        const cx = conn.center.x + (horizontal ? (dirSign * t) / 2 : 0);
        const cy = conn.center.y + (horizontal ? 0 : (dirSign * t) / 2);
        return (
          <mesh
            key={`door-floor-${i}`}
            geometry={unitPlane}
            material={floorMaterial}
            rotation-x={-Math.PI / 2}
            position={[cx, 0, cy]}
            scale={horizontal ? [t, DOOR_WIDTH, 1] : [DOOR_WIDTH, t, 1]}
          />
        );
      })}
      <InstancedBoxes obstacles={staticBoxes.walls} material={wallMaterial} height={WALL_HEIGHT} />
      <InstancedBoxes obstacles={staticBoxes.rocks} material={rockMaterial} height={ROCK_HEIGHT} />
      <DoorGates world={world} />
    </group>
  );
}

/** Sala única (modo histórico / playtest del editor). */
function SingleRoomView({ world }: { world: World }) {
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
      {/* Rocas (obstáculos AABB). Las columnas de la Reina (`isQueenColumnObstacle`)
          se excluyen aquí: las pinta QueenColumnsView desde world.queenColumns,
          con estado intacta/agrietada/escombros — ver comentario de cabecera. */}
      {world.obstacles.filter((o) => !isQueenColumnObstacle(o)).map((obstacle) => {
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

export function RoomView({ world }: { world: World }) {
  if (world.dungeon) {
    return <DungeonStructureView world={world} />;
  }
  return <SingleRoomView world={world} />;
}
