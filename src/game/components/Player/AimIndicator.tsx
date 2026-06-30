import { useMemo } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three';
import { MAX_AIM_DISTANCE } from '../../core/constants';
import type { DoorSide, HazardState, Vec2, WeaponMode } from '../../core/types';
import { add, len, mul, normalize, reflect, sub, v } from '../../core/vector';
import { useGameStore } from '../../stores/useGameStore';
import { DOOR_WIDTH, doorWorldPosition, getConnectionsForRoom, getCurrentRoom, isConnectionPassable, roomBounds } from '../../core/worldMap';

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
type OpenDoor = { side: DoorSide; along: number };

const DASH_LENGTH = 0.34;
const DASH_GAP = 0.2;
const PREVIEW_BOUNCES = 2;
const PREVIEW_RAY_RADIUS = 0.2;
const HIT_EPSILON = 0.04;
const TRAJECTORY_TIP_LENGTH = 0.42;
const TRAJECTORY_TIP_WIDTH = 0.17;
const INPUT_START_WIDTH = 0.34;
const INPUT_END_WIDTH = 0.03;

type PreviewSegment = {
  start: Vec2;
  end: Vec2;
  direction: Vec2;
  length: number;
};

type PreviewHit = {
  distance: number;
  normal: Vec2;
};

function createFlatGeometry(points: Vec2[], height: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = points.flatMap((point) => [point.x, height, point.y]);
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (points.length === 4) geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function hitInsideOpenDoor(point: Vec2, normal: Vec2, openDoors: OpenDoor[]): boolean {
  for (const door of openDoors) {
    const sideMatches =
      (door.side === 'east' && normal.x < -0.5) ||
      (door.side === 'west' && normal.x > 0.5) ||
      (door.side === 'south' && normal.y < -0.5) ||
      (door.side === 'north' && normal.y > 0.5);
    if (!sideMatches) continue;
    const along = door.side === 'east' || door.side === 'west' ? point.y : point.x;
    if (Math.abs(along - door.along) <= DOOR_WIDTH / 2) return true;
  }
  return false;
}

function raycastRoomBounds(origin: Vec2, direction: Vec2, bounds: Bounds, openDoors: OpenDoor[]): PreviewHit | null {
  let closest: PreviewHit | null = null;

  const pushHit = (distance: number, normal: Vec2) => {
    if (distance <= HIT_EPSILON) return;
    const point = add(origin, mul(direction, distance));
    if (point.x < bounds.minX - HIT_EPSILON || point.x > bounds.maxX + HIT_EPSILON || point.y < bounds.minY - HIT_EPSILON || point.y > bounds.maxY + HIT_EPSILON) return;
    // An open doorway is not a wall: let the trajectory pass straight through it.
    if (hitInsideOpenDoor(point, normal, openDoors)) return;
    if (!closest || distance < closest.distance) closest = { distance, normal };
  };

  if (Math.abs(direction.x) > 0.0001) {
    pushHit((bounds.maxX - origin.x) / direction.x, v(-1, 0));
    pushHit((bounds.minX - origin.x) / direction.x, v(1, 0));
  }
  if (Math.abs(direction.y) > 0.0001) {
    pushHit((bounds.maxY - origin.y) / direction.y, v(0, -1));
    pushHit((bounds.minY - origin.y) / direction.y, v(0, 1));
  }

  return closest;
}

function raycastRect(origin: Vec2, direction: Vec2, center: Vec2, width: number, height: number): PreviewHit | null {
  const minX = center.x - width / 2 - PREVIEW_RAY_RADIUS;
  const maxX = center.x + width / 2 + PREVIEW_RAY_RADIUS;
  const minY = center.y - height / 2 - PREVIEW_RAY_RADIUS;
  const maxY = center.y + height / 2 + PREVIEW_RAY_RADIUS;
  let tMin = -Infinity;
  let tMax = Infinity;
  let normal = v(0, 0);

  if (Math.abs(direction.x) < 0.0001) {
    if (origin.x < minX || origin.x > maxX) return null;
  } else {
    const nearX = direction.x > 0 ? (minX - origin.x) / direction.x : (maxX - origin.x) / direction.x;
    const farX = direction.x > 0 ? (maxX - origin.x) / direction.x : (minX - origin.x) / direction.x;
    if (nearX > tMin) normal = direction.x > 0 ? v(-1, 0) : v(1, 0);
    tMin = Math.max(tMin, nearX);
    tMax = Math.min(tMax, farX);
  }

  if (Math.abs(direction.y) < 0.0001) {
    if (origin.y < minY || origin.y > maxY) return null;
  } else {
    const nearY = direction.y > 0 ? (minY - origin.y) / direction.y : (maxY - origin.y) / direction.y;
    const farY = direction.y > 0 ? (maxY - origin.y) / direction.y : (minY - origin.y) / direction.y;
    if (nearY > tMin) normal = direction.y > 0 ? v(0, -1) : v(0, 1);
    tMin = Math.max(tMin, nearY);
    tMax = Math.min(tMax, farY);
  }

  if (tMin > tMax || tMax <= HIT_EPSILON || tMin <= HIT_EPSILON) return null;
  return { distance: tMin, normal };
}

function findPreviewHit(origin: Vec2, direction: Vec2, bounds: Bounds, hazards: HazardState[], openDoors: OpenDoor[]): PreviewHit | null {
  let closest = raycastRoomBounds(origin, direction, bounds, openDoors);

  for (const hazard of hazards) {
    if (hazard.type !== 'rock') continue;
    const hit = raycastRect(origin, direction, hazard.pos, hazard.width ?? 1, hazard.height ?? 1);
    if (hit && (!closest || hit.distance < closest.distance)) closest = hit;
  }

  return closest;
}

function createPreviewSegments(start: Vec2, direction: Vec2, length: number, bounds: Bounds, hazards: HazardState[], weaponMode: WeaponMode, openDoors: OpenDoor[]): PreviewSegment[] {
  const segments: PreviewSegment[] = [];
  let current = start;
  let remaining = length;
  let currentDirection = direction;
  const canBounce = weaponMode !== 'arrow';

  for (let bounce = 0; bounce <= PREVIEW_BOUNCES && remaining > 0.001; bounce += 1) {
    const hit = findPreviewHit(current, currentDirection, bounds, hazards, openDoors);
    if (!hit || hit.distance >= remaining) {
      const end = add(current, mul(currentDirection, remaining));
      segments.push({ start: current, end, direction: currentDirection, length: remaining });
      break;
    }

    const end = add(current, mul(currentDirection, hit.distance));
    segments.push({ start: current, end, direction: currentDirection, length: hit.distance });
    if (!canBounce) break;

    currentDirection = normalize(reflect(currentDirection, hit.normal, 1));
    current = add(end, mul(currentDirection, HIT_EPSILON));
    remaining -= hit.distance;
  }

  return segments;
}

function createDashes(segments: PreviewSegment[]) {
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  const dashedLength = Math.max(0, totalLength - TRAJECTORY_TIP_LENGTH * 0.85);
  const dashes = [];
  let distanceOnPath = 0.42;
  let segmentStartDistance = 0;
  let segmentIndex = 0;

  while (distanceOnPath <= dashedLength - DASH_LENGTH / 2 && dashes.length < 32) {
    while (segmentIndex < segments.length - 1 && distanceOnPath > segmentStartDistance + segments[segmentIndex].length) {
      segmentStartDistance += segments[segmentIndex].length;
      segmentIndex += 1;
    }

    const segment = segments[segmentIndex];
    const localDistance = distanceOnPath - segmentStartDistance;
    dashes.push({
      position: [
        segment.start.x + segment.direction.x * localDistance,
        0.08,
        segment.start.y + segment.direction.y * localDistance,
      ] as [number, number, number],
      rotation: [0, Math.atan2(segment.direction.x, segment.direction.y), 0] as [number, number, number],
    });
    distanceOnPath += DASH_LENGTH + DASH_GAP;
  }

  return dashes;
}

export function AimIndicator() {
  const player = useGameStore((state) => state.player);
  const room = useGameStore((state) => state.room);
  const hazards = useGameStore((state) => state.hazards);
  const worldMap = useGameStore((state) => state.worldMap);
  const currentRoomInstanceId = useGameStore((state) => state.currentRoomInstanceId);
  const indicator = useMemo(() => {
    if (!player.isAiming || !player.aimStart || !player.aimCurrent) return null;

    // Bounce against the current room's world bounds (offset-aware). state.room
    // can hold the whole-world bounds until a room is cleared, so deriving the
    // preview from the actual room instance keeps bounces correct from the start.
    const instance = getCurrentRoom(worldMap, currentRoomInstanceId);
    const bounds: Bounds = instance
      ? roomBounds(instance)
      : { minX: -room.width / 2, maxX: room.width / 2, minY: -room.height / 2, maxY: room.height / 2 };

    // Open doorways aren't walls: the preview should pass through them, not bounce.
    const openDoors: OpenDoor[] = instance && worldMap
      ? getConnectionsForRoom(worldMap, instance.id)
          .filter(({ connection }) => isConnectionPassable(connection))
          .map(({ slot }) => {
            const door = doorWorldPosition(instance, slot);
            return { side: slot.side, along: slot.side === 'east' || slot.side === 'west' ? door.y : door.x };
          })
      : [];

    const dragVector = sub(player.aimCurrent, player.aimStart);
    const dragDirection = normalize(dragVector);
    const launchVector = sub(player.aimStart, player.aimCurrent);
    const direction = normalize(launchVector);
    const strength = Math.min(len(dragVector), MAX_AIM_DISTANCE);
    const showTrajectory = strength / MAX_AIM_DISTANCE >= 0.08;
    const length = Math.max(0.001, 1.4 + strength * 2.1);
    const segments = createPreviewSegments(player.pos, direction, length, bounds, hazards, player.weaponMode, openDoors);
    const dashes = showTrajectory ? createDashes(segments) : [];
    const lastSegment = segments[segments.length - 1] ?? {
      end: player.pos,
      direction,
    };
    const tipBaseCenter = mul(lastSegment.direction, -TRAJECTORY_TIP_LENGTH);
    const tipPerp = v(-lastSegment.direction.y, lastSegment.direction.x);
    const trajectoryTipGeometry = createFlatGeometry([
      lastSegment.end,
      {
        x: lastSegment.end.x + tipBaseCenter.x + tipPerp.x * TRAJECTORY_TIP_WIDTH,
        y: lastSegment.end.y + tipBaseCenter.y + tipPerp.y * TRAJECTORY_TIP_WIDTH,
      },
      {
        x: lastSegment.end.x + tipBaseCenter.x - tipPerp.x * TRAJECTORY_TIP_WIDTH,
        y: lastSegment.end.y + tipBaseCenter.y - tipPerp.y * TRAJECTORY_TIP_WIDTH,
      },
    ], 0.14);
    const inputPerp = v(-dragDirection.y, dragDirection.x);
    const inputEnd = add(player.aimStart, mul(dragDirection, strength));
    const inputGeometry = createFlatGeometry([
      {
        x: player.aimStart.x + inputPerp.x * (INPUT_START_WIDTH / 2),
        y: player.aimStart.y + inputPerp.y * (INPUT_START_WIDTH / 2),
      },
      {
        x: player.aimStart.x - inputPerp.x * (INPUT_START_WIDTH / 2),
        y: player.aimStart.y - inputPerp.y * (INPUT_START_WIDTH / 2),
      },
      {
        x: inputEnd.x - inputPerp.x * (INPUT_END_WIDTH / 2),
        y: inputEnd.y - inputPerp.y * (INPUT_END_WIDTH / 2),
      },
      {
        x: inputEnd.x + inputPerp.x * (INPUT_END_WIDTH / 2),
        y: inputEnd.y + inputPerp.y * (INPUT_END_WIDTH / 2),
      },
    ], 0.14);
    const tipPosition = [
      lastSegment.end.x,
      0.14,
      lastSegment.end.y,
    ] as [number, number, number];

    return {
      dashes,
      tipPosition: showTrajectory ? tipPosition : null,
      trajectoryTipGeometry,
      inputGeometry,
    };
  }, [hazards, player.aimCurrent, player.aimStart, player.isAiming, player.pos, player.weaponMode, room, worldMap, currentRoomInstanceId]);

  if (!indicator) return null;

  const lineColor = player.weaponMode === 'body' ? '#e0f2fe' : player.weaponMode === 'arrow' ? '#fef08a' : '#e9d5ff';

  return (
    <group>
      {indicator.dashes.map((dash, index) => (
        <mesh key={index} position={dash.position} rotation={dash.rotation} renderOrder={10}>
          <boxGeometry args={[0.08, 0.05, DASH_LENGTH]} />
          <meshBasicMaterial color={lineColor} transparent opacity={0.86} depthTest={false} depthWrite={false} />
        </mesh>
      ))}
      {indicator.tipPosition && (
        <mesh geometry={indicator.trajectoryTipGeometry} renderOrder={11}>
          <meshBasicMaterial color={lineColor} transparent opacity={0.94} side={DoubleSide} depthTest={false} depthWrite={false} />
        </mesh>
      )}
      <mesh geometry={indicator.inputGeometry} renderOrder={12}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.62} side={DoubleSide} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
