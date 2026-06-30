import type { GameState, HazardState, Vec2, WorldRoomInstance } from './types';
import { add, clamp, dist, isInsideCircle, len, mul, normalize, overlapCircleRect, sub, v } from './vector';
import { getCurrentRoom, roomBounds } from './worldMap';

// Grid-based A* pathfinding + steering for enemy AI. Extracted from
// simulation.ts; see docs/instructions/ARCHITECTURE_INVARIANTS.md (the grid and
// per-enemy paths are cached at module scope and survive the per-frame clone).

const PATH_CELL_SIZE = 1;
const PATH_RECALC_INTERVAL = 0.12;

type PathCell = { x: number; y: number };
type GridBounds = { minX: number; maxX: number; minY: number; maxY: number };
export type PathGrid = {
  cols: number;
  rows: number;
  blocked: Set<string>;
  bounds: GridBounds;
  roomId: string | null;
};

// Pathfinding caches live at module scope so they survive across frames (the
// per-frame state is cloned, so storing them there would defeat the purpose).
// One grid is cached PER ROOM (keyed by room id). Per-enemy A* results expire
// after PATH_RECALC_INTERVAL without a global clear.
let pathClock = 0;
const pathGridCache = new Map<string, { grid: PathGrid; key: string }>();
type EnemyPathEntry = { path: Vec2[]; goalKey: string; expires: number };
const enemyPathCache = new Map<string, EnemyPathEntry>();

export function advancePathClock(dt: number): void {
  pathClock += dt;
}

export function getEnemyMoveDirection(state: GameState, pathGrid: PathGrid, from: Vec2, to: Vec2, radius: number, enemyId?: string): Vec2 {
  const desired = normalize(sub(to, from));
  if (len(desired) <= 0) return v(0, 0);
  if (hasClearPath(pathGrid, from, to)) return steerAwayFromNearbyHazards(state, from, desired, radius, pathGrid.roomId);

  const path = getEnemyPath(pathGrid, from, to, enemyId);
  if (path.length < 2) return steerAwayFromNearbyHazards(state, from, desired, radius, pathGrid.roomId);

  const waypoint = path[Math.min(2, path.length - 1)];
  const pathDirection = normalize(sub(waypoint, from));
  const chaseBiasedDirection = len(pathDirection) > 0 ? normalize(add(mul(pathDirection, 0.78), mul(desired, 0.38))) : desired;
  return steerAwayFromNearbyHazards(state, from, len(chaseBiasedDirection) > 0 ? chaseBiasedDirection : desired, radius, pathGrid.roomId);
}

function getEnemyPath(pathGrid: PathGrid, from: Vec2, to: Vec2, enemyId?: string): Vec2[] {
  if (!enemyId) return findPath(pathGrid, from, to);

  const goalKey = cellKey(worldToCell(pathGrid, to));
  const cached = enemyPathCache.get(enemyId);
  if (cached && cached.goalKey === goalKey && cached.expires > pathClock) return cached.path;

  const path = findPath(pathGrid, from, to);
  enemyPathCache.set(enemyId, { path, goalKey, expires: pathClock + PATH_RECALC_INTERVAL });
  return path;
}

function pathGridKey(state: GameState, pathRoom: WorldRoomInstance | null): string {
  let key = pathRoom
    ? `${pathRoom.id}:${pathRoom.width}x${pathRoom.height}:${pathRoom.offset.x},${pathRoom.offset.y}`
    : `${state.room.width}x${state.room.height}`;
  for (const hazard of state.hazards) {
    if (pathRoom && hazard.roomInstanceId !== pathRoom.id) continue;
    if (hazard.type === 'rock' || hazard.type === 'pit' || hazard.type === 'spikes' || hazard.type === 'barrel') {
      key += `|${hazard.id}:${hazard.exploded ? 1 : 0}`;
    }
  }
  return key;
}

export function buildPathGrid(state: GameState, room?: WorldRoomInstance | null): PathGrid {
  const pathRoom = room !== undefined ? room : getPathRoom(state);
  const cacheId = pathRoom ? pathRoom.id : 'single';
  const key = pathGridKey(state, pathRoom);
  const cached = pathGridCache.get(cacheId);
  if (cached && cached.key === key) return cached.grid;

  const bounds: GridBounds = pathRoom
    ? roomBounds(pathRoom)
    : {
        minX: -state.room.width / 2,
        maxX: state.room.width / 2,
        minY: -state.room.height / 2,
        maxY: state.room.height / 2,
      };
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / PATH_CELL_SIZE));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / PATH_CELL_SIZE));
  const blocked = new Set<string>();
  const grid: PathGrid = { cols, rows, blocked, bounds, roomId: pathRoom ? pathRoom.id : null };

  for (let x = 0; x < cols; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      const point = cellToWorld(grid, { x, y });
      if (state.hazards.some((hazard) => (!pathRoom || hazard.roomInstanceId === pathRoom.id) && hazardBlocksPathTile(hazard, point))) {
        blocked.add(cellKey({ x, y }));
      }
    }
  }

  pathGridCache.set(cacheId, { grid, key });
  return grid;
}

function hasClearPath(pathGrid: PathGrid, from: Vec2, to: Vec2): boolean {
  const distance = dist(from, to);
  const steps = Math.max(2, Math.ceil(distance / (PATH_CELL_SIZE * 0.5)));
  for (let index = 1; index < steps; index += 1) {
    const t = index / steps;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    if (isPathCellBlocked(pathGrid, worldToCell(pathGrid, point))) return false;
  }
  return true;
}

type HeapNode = { cell: PathCell; f: number };

function heapPush(heap: HeapNode[], node: HeapNode): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent].f <= heap[index].f) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function heapPop(heap: HeapNode[]): HeapNode {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let index = 0;
    const size = heap.length;
    for (;;) {
      const left = index * 2 + 1;
      const right = index * 2 + 2;
      let smallest = index;
      if (left < size && heap[left].f < heap[smallest].f) smallest = left;
      if (right < size && heap[right].f < heap[smallest].f) smallest = right;
      if (smallest === index) break;
      [heap[smallest], heap[index]] = [heap[index], heap[smallest]];
      index = smallest;
    }
  }
  return top;
}

function findPath(pathGrid: PathGrid, from: Vec2, to: Vec2): Vec2[] {
  const start = nearestFreeCell(pathGrid, worldToCell(pathGrid, from));
  const goal = nearestFreeCell(pathGrid, worldToCell(pathGrid, to));
  const startKey = cellKey(start);
  const goalKey = cellKey(goal);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const closed = new Set<string>();
  const open: HeapNode[] = [];
  heapPush(open, { cell: start, f: cellHeuristic(start, goal) });

  while (open.length > 0) {
    const current = heapPop(open).cell;
    const currentKey = cellKey(current);
    if (currentKey === goalKey) return reconstructPath(pathGrid, cameFrom, currentKey);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    for (const neighbor of getNeighbors(current, pathGrid.cols, pathGrid.rows)) {
      const neighborKey = cellKey(neighbor);
      if (closed.has(neighborKey)) continue;
      if (isPathCellBlocked(pathGrid, neighbor)) continue;
      if (neighbor.x !== current.x && neighbor.y !== current.y) {
        const horizontal = { x: neighbor.x, y: current.y };
        const vertical = { x: current.x, y: neighbor.y };
        if (
          isPathCellBlocked(pathGrid, horizontal) ||
          isPathCellBlocked(pathGrid, vertical)
        ) {
          continue;
        }
      }

      const diagonalCost = neighbor.x !== current.x && neighbor.y !== current.y ? 1.4 : 1;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + diagonalCost;
      if (tentativeG >= (gScore.get(neighborKey) ?? Infinity)) continue;

      cameFrom.set(neighborKey, currentKey);
      gScore.set(neighborKey, tentativeG);
      heapPush(open, { cell: neighbor, f: tentativeG + cellHeuristic(neighbor, goal) });
    }
  }

  return [];
}

function nearestFreeCell(pathGrid: PathGrid, start: PathCell): PathCell {
  const clamped = {
    x: clamp(Math.round(start.x), 0, pathGrid.cols - 1),
    y: clamp(Math.round(start.y), 0, pathGrid.rows - 1),
  };
  if (!isPathCellBlocked(pathGrid, clamped)) return clamped;

  for (let range = 1; range < Math.max(pathGrid.cols, pathGrid.rows); range += 1) {
    for (let dx = -range; dx <= range; dx += 1) {
      for (let dy = -range; dy <= range; dy += 1) {
        const cell = { x: clamped.x + dx, y: clamped.y + dy };
        if (!isPathCellBlocked(pathGrid, cell)) return cell;
      }
    }
  }

  return clamped;
}

function getNeighbors(cell: PathCell, cols: number, rows: number): PathCell[] {
  const neighbors: PathCell[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const next = { x: cell.x + dx, y: cell.y + dy };
      if (next.x < 0 || next.x >= cols || next.y < 0 || next.y >= rows) continue;
      neighbors.push(next);
    }
  }
  return neighbors;
}

function reconstructPath(pathGrid: PathGrid, cameFrom: Map<string, string>, currentKey: string): Vec2[] {
  const cells = [cellFromKey(currentKey)];
  let cursor = currentKey;
  while (cameFrom.has(cursor) && cells.length < 80) {
    cursor = cameFrom.get(cursor)!;
    cells.unshift(cellFromKey(cursor));
  }
  return cells.map((cell) => cellToWorld(pathGrid, cell));
}

function isPathCellBlocked(pathGrid: PathGrid, cell: PathCell): boolean {
  if (cell.x < 0 || cell.x >= pathGrid.cols || cell.y < 0 || cell.y >= pathGrid.rows) return true;
  return pathGrid.blocked.has(cellKey(cell));
}

function hazardBlocksPathTile(hazard: HazardState, point: Vec2): boolean {
  if (hazard.type === 'rock' || hazard.type === 'pit' || hazard.type === 'spikes') {
    return overlapCircleRect(point, 0.42, hazard.pos, hazard.width ?? 1, hazard.height ?? 1);
  }
  if (hazard.type === 'barrel' && !hazard.exploded) {
    return isInsideCircle(point, hazard.pos, (hazard.radius ?? 0.42) + 0.82);
  }
  return false;
}

export function steerAwayFromNearbyHazards(state: GameState, from: Vec2, direction: Vec2, radius: number, roomId?: string | null): Vec2 {
  let avoidance = v(0, 0);
  const filterRoomId = roomId !== undefined ? roomId : (getPathRoom(state)?.id ?? null);

  for (const hazard of state.hazards) {
    if (filterRoomId && hazard.roomInstanceId !== filterRoomId) continue;
    if (hazard.type === 'barrel' && !hazard.exploded) {
      const avoidRadius = radius + (hazard.radius ?? 0.42) + 1.25;
      const distance = dist(from, hazard.pos);
      if (distance < avoidRadius) {
        const strength = ((avoidRadius - distance) / avoidRadius) ** 2;
        avoidance = add(avoidance, mul(normalize(sub(from, hazard.pos)), strength * 2.4));
      }
    }

    if (hazard.type === 'pit' || hazard.type === 'spikes' || hazard.type === 'rock') {
      const halfWidth = (hazard.width ?? 1) / 2;
      const halfHeight = (hazard.height ?? 1) / 2;
      const closest = {
        x: clamp(from.x, hazard.pos.x - halfWidth, hazard.pos.x + halfWidth),
        y: clamp(from.y, hazard.pos.y - halfHeight, hazard.pos.y + halfHeight),
      };
      const avoidRadius = radius + 0.75;
      const distance = dist(from, closest);
      if (distance < avoidRadius) {
        const strength = ((avoidRadius - distance) / avoidRadius) ** 2;
        avoidance = add(avoidance, mul(normalize(sub(from, closest)), strength * 1.7));
      }
    }
  }

  if (len(avoidance) <= 0.001) return direction;
  const steered = normalize(add(direction, avoidance));
  return len(steered) > 0 ? steered : direction;
}

function getPathRoom(state: GameState) {
  return getCurrentRoom(state.worldMap, state.currentRoomInstanceId);
}

function worldToCell(pathGrid: PathGrid, point: Vec2): PathCell {
  return {
    x: Math.floor((point.x - pathGrid.bounds.minX) / PATH_CELL_SIZE),
    y: Math.floor((point.y - pathGrid.bounds.minY) / PATH_CELL_SIZE),
  };
}

function cellToWorld(pathGrid: PathGrid, cell: PathCell): Vec2 {
  return {
    x: pathGrid.bounds.minX + cell.x * PATH_CELL_SIZE + PATH_CELL_SIZE / 2,
    y: pathGrid.bounds.minY + cell.y * PATH_CELL_SIZE + PATH_CELL_SIZE / 2,
  };
}

function cellKey(cell: PathCell): string {
  return `${cell.x},${cell.y}`;
}

function cellFromKey(key: string): PathCell {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function cellHeuristic(a: PathCell, b: PathCell): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
