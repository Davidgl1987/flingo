import { ROOMS } from './rooms';
import type { DoorSide, DoorSlot, HazardState, RoomDefinition, RoomTag, Vec2, WorldDoorConnection, WorldMapState, WorldRoomInstance } from './types';
import { dist, overlapCircleRect } from './vector';

export type WallObstacle = {
  id: string;
  pos: Vec2;
  width: number;
  height: number;
  connectionId?: string;
  requiresKey?: boolean;
};

const WALL_THICKNESS = 0.42;
export const DOOR_WIDTH = 2;
// Rooms are separated by exactly the wall thickness so the walls live in the gap
// between rooms (and just outside the perimeter) instead of overlapping the
// edge floor tiles. Adjacent rooms' shared-edge walls then coincide on the same
// line and merge into a single uniform wall. See ARCHITECTURE_INVARIANTS.md.
export const ROOM_GAP = WALL_THICKNESS;

type Rng = () => number;

type GridCell = { col: number; row: number };

// ---------------------------------------------------------------------------
// Public entry point — always attempts the variable layout first.
// Tries up to N derived seeds with the variable packer; if none validate,
// falls back to the uniform grid as a safe fallback.
// ---------------------------------------------------------------------------
export function generateProceduralWorldMap(roomPool: RoomDefinition[] = ROOMS, seed = Date.now()): WorldMapState {
  const MAX_SEEDS = 12;
  for (let attempt = 0; attempt < MAX_SEEDS; attempt += 1) {
    const derivedSeed = seed + attempt;
    const candidate = generateVariableWorldMap(roomPool, derivedSeed);
    if (candidate && validateWorldMap(candidate)) return candidate;
  }
  // Safe fallback — always produces a valid map.
  return generateUniformWorldMap(roomPool, seed);
}

// ---------------------------------------------------------------------------
// Original uniform-grid layout (unchanged logic).
// ---------------------------------------------------------------------------
// World layout: every selected room is placed, centred, inside a same-size cell
// on a regular grid. Uniform cells guarantee rooms never overlap and that
// shared-edge walls coincide exactly (so they merge into one clean wall). Doors
// sit at the centre of each shared edge (one per adjacency). The cell graph has
// at least one cycle (a 2x2 core) and the boss is a leaf behind a key-locked door.
function generateUniformWorldMap(roomPool: RoomDefinition[] = ROOMS, seed = Date.now()): WorldMapState {
  const rng = seededRng(seed);
  const selectedRooms = selectRoomsForMap(roomPool, rng); // [start, combat, key, combat, combat, boss]
  const cellWidth = Math.max(...selectedRooms.map((room) => room.width));
  const cellHeight = Math.max(...selectedRooms.map((room) => room.height));
  const strideX = cellWidth + ROOM_GAP;
  const strideY = cellHeight + ROOM_GAP;
  const cells = placeCells(rng); // cells[5] (boss) is appended last as a leaf

  const instances: WorldRoomInstance[] = selectedRooms.map((room, index) => ({
    id: `map-room-${index}`,
    roomId: room.id,
    name: room.name,
    width: cellWidth,
    height: cellHeight,
    offset: { x: cells[index].col * strideX, y: cells[index].row * strideY },
    tags: room.tags?.length ? [...room.tags] : [index === 0 ? 'start' : index === 2 ? 'key' : index === 5 ? 'boss' : 'combat'],
    doorSlots: [],
    cleared: false,
  }));

  const connections: WorldDoorConnection[] = [];
  for (let a = 0; a < instances.length; a += 1) {
    for (let b = a + 1; b < instances.length; b += 1) {
      const side = adjacentSide(cells[a], cells[b]);
      if (!side) continue;
      const aSlot: DoorSlot = { side, offset: 0 };
      const bSlot: DoorSlot = { side: oppositeSide(side), offset: 0 };
      instances[a].doorSlots.push(aSlot);
      instances[b].doorSlots.push(bSlot);
      connections.push({
        id: `${instances[a].id}:${side}->${instances[b].id}`,
        aRoomId: instances[a].id,
        aSlot,
        bRoomId: instances[b].id,
        bSlot,
        open: false,
        requiresKey: instances[a].tags.includes('boss') || instances[b].tags.includes('boss'),
      });
    }
  }

  return {
    rooms: instances,
    connections,
    startRoomId: instances[0].id,
    keyRoomId: instances[2].id,
    bossRoomId: instances[5].id,
  };
}

// ---------------------------------------------------------------------------
// Variable-size layout (Fase 2 — default path in dispatcher).
//
// Algorithm: anchor-based packing.
//   - Each room is assigned a random rotation (0/90/180/270).
//   - Room 0 (start) anchored at (0,0).
//   - Rooms 1-4 placed by picking a random already-placed room + side,
//     sliding the new room along the perpendicular axis so the shared border
//     overlap ≥ DOOR_WIDTH + 2*DOOR_MARGIN (= 2 + 1.2 = 3.2 units).
//   - Room 5 (boss) placed last as a leaf connected to exactly one room.
//   - Returns null if any placement fails after K attempts.
// ---------------------------------------------------------------------------

const DOOR_MARGIN = 0.6;   // minimum margin on each side of door opening
const MAX_ANCHOR_ATTEMPTS = 24; // K: placement attempts per room

// Tags array for a room by role index [start, combat, key, combat, combat, boss].
function tagsForRole(index: number, sourceDef: RoomDefinition): RoomTag[] {
  if (sourceDef.tags?.length) return [...sourceDef.tags];
  if (index === 0) return ['start'];
  if (index === 2) return ['key'];
  if (index === 5) return ['boss'];
  return ['combat'];
}

type PlacedRoom = {
  index: number;
  width: number;
  height: number;
  offset: Vec2;
  deg: 0 | 90 | 180 | 270;
  minX: number; maxX: number;
  minY: number; maxY: number;
};

// Check whether the candidate AABB overlaps any already-placed room AABB
// (considering the ROOM_GAP). Two AABBs are invalid if they overlap in both
// axes by more than 1e-6 on the touching axis (gap < ROOM_GAP - tol).
function collidesWithPlaced(
  placed: PlacedRoom[],
  minX: number, maxX: number,
  minY: number, maxY: number,
): boolean {
  const TOL = 1e-6;
  for (const p of placed) {
    // Overlap in each axis (positive = overlap, negative = gap).
    const overlapX = Math.min(maxX, p.maxX) - Math.max(minX, p.minX);
    const overlapY = Math.min(maxY, p.maxY) - Math.max(minY, p.minY);
    // If both axes overlap by more than TOL → actual spatial overlap → reject.
    if (overlapX > TOL && overlapY > TOL) return true;
    // If the rooms are touching on one axis (gap < ROOM_GAP - TOL) while
    // overlapping on the other → they are too close → reject.
    if (overlapX > -ROOM_GAP + TOL && overlapY > -ROOM_GAP + TOL &&
        (overlapX > TOL || overlapY > TOL)) return true;
  }
  return false;
}

// Returns true if the AABB (nMinX..nMaxX, nMinY..nMaxY) is adjacent to `p`
// (exactly ROOM_GAP apart on one axis, overlap ≥ DOOR_WIDTH on the other).
function checkAdjacent(
  nMinX: number, nMaxX: number, nMinY: number, nMaxY: number,
  p: PlacedRoom,
): boolean {
  const ADJTOL = 1e-3;
  if (Math.abs((nMaxX + ROOM_GAP) - p.minX) < ADJTOL) {
    return Math.min(nMaxY, p.maxY) - Math.max(nMinY, p.minY) >= DOOR_WIDTH;
  }
  if (Math.abs((p.maxX + ROOM_GAP) - nMinX) < ADJTOL) {
    return Math.min(nMaxY, p.maxY) - Math.max(nMinY, p.minY) >= DOOR_WIDTH;
  }
  if (Math.abs((nMaxY + ROOM_GAP) - p.minY) < ADJTOL) {
    return Math.min(nMaxX, p.maxX) - Math.max(nMinX, p.minX) >= DOOR_WIDTH;
  }
  if (Math.abs((p.maxY + ROOM_GAP) - nMinY) < ADJTOL) {
    return Math.min(nMaxX, p.maxX) - Math.max(nMinX, p.minX) >= DOOR_WIDTH;
  }
  return false;
}

export function generateVariableWorldMap(roomPool: RoomDefinition[] = ROOMS, seed = Date.now()): WorldMapState | null {
  const rng = seededRng(seed);
  const selectedRooms = selectRoomsForMap(roomPool, rng);

  // Compute each room's placed width/height for a chosen rotation.
  // Start room always at rotation 0 to avoid unnecessary complexity.
  const degrees: Array<0 | 90 | 180 | 270> = selectedRooms.map((_, i) => {
    if (i === 0) return 0;
    // Skew heavily toward 0/90 (practical orientations).
    const r = rng();
    if (r < 0.4) return 0;
    if (r < 0.7) return 90;
    if (r < 0.85) return 180;
    return 270;
  });

  // Placed width/height after rotation (90/270 swap dims).
  function rotatedDims(defIndex: number): { w: number; h: number } {
    const def = selectedRooms[defIndex];
    const deg = degrees[defIndex];
    const swap = deg === 90 || deg === 270;
    return { w: swap ? def.height : def.width, h: swap ? def.width : def.height };
  }

  const placed: PlacedRoom[] = [];

  // Place room 0 at origin.
  const d0 = rotatedDims(0);
  placed.push({
    index: 0,
    width: d0.w, height: d0.h,
    offset: { x: 0, y: 0 },
    deg: degrees[0],
    minX: -d0.w / 2, maxX: d0.w / 2,
    minY: -d0.h / 2, maxY: d0.h / 2,
  });

  const ALL_SIDES: DoorSide[] = ['north', 'south', 'east', 'west'];

  // Attempt to anchor room `newIdx` to any already-placed room.
  // If `forcedParent` is provided, only anchor to that specific index (for boss).
  //
  // Key invariant: the perpendicular axis (the one that determines distance) is
  // computed EXACTLY from parent border + ROOM_GAP. Only the PARALLEL axis
  // (the slide) is snapped, so the wall-to-wall gap stays exactly ROOM_GAP
  // and the adjacency detector can find it.
  function tryPlaceRoom(newIdx: number, forcedParent?: number): PlacedRoom | null {
    const { w, h } = rotatedDims(newIdx);
    const deg = degrees[newIdx];

    for (let attempt = 0; attempt < MAX_ANCHOR_ATTEMPTS; attempt += 1) {
      // Pick a parent room from placed (or forcedParent).
      const parentIdx = forcedParent !== undefined
        ? forcedParent
        : Math.floor(rng() * placed.length);
      const parent = placed[parentIdx];

      // Pick a side.
      const side = ALL_SIDES[Math.floor(rng() * 4)];

      // The new room's border on the side facing the parent,
      // offset by ROOM_GAP from the parent's border.
      let cx: number;
      let cy: number;
      const minOverlap = DOOR_WIDTH + 2 * DOOR_MARGIN;

      if (side === 'east') {
        // Perpendicular axis (X) is EXACT — not snapped so wall lines coincide.
        cx = parent.maxX + ROOM_GAP + w / 2;
        // Parallel axis (Y): pick random within overlap range, no snapping.
        const lo = parent.minY - h / 2 + minOverlap;
        const hi = parent.maxY + h / 2 - minOverlap;
        if (lo > hi) continue; // room too small for overlap
        cy = lo + rng() * (hi - lo);
      } else if (side === 'west') {
        // Perpendicular axis (X) is EXACT.
        cx = parent.minX - ROOM_GAP - w / 2;
        const lo = parent.minY - h / 2 + minOverlap;
        const hi = parent.maxY + h / 2 - minOverlap;
        if (lo > hi) continue;
        cy = lo + rng() * (hi - lo);
      } else if (side === 'south') {
        // Perpendicular axis (Y) is EXACT.
        cy = parent.maxY + ROOM_GAP + h / 2;
        const lo = parent.minX - w / 2 + minOverlap;
        const hi = parent.maxX + w / 2 - minOverlap;
        if (lo > hi) continue;
        cx = lo + rng() * (hi - lo);
      } else { // north
        // Perpendicular axis (Y) is EXACT.
        cy = parent.minY - ROOM_GAP - h / 2;
        const lo = parent.minX - w / 2 + minOverlap;
        const hi = parent.maxX + w / 2 - minOverlap;
        if (lo > hi) continue;
        cx = lo + rng() * (hi - lo);
      }

      const nMinX = cx - w / 2;
      const nMaxX = cx + w / 2;
      const nMinY = cy - h / 2;
      const nMaxY = cy + h / 2;

      if (collidesWithPlaced(placed, nMinX, nMaxX, nMinY, nMaxY)) continue;

      return {
        index: newIdx,
        width: w, height: h,
        offset: { x: cx, y: cy },
        deg,
        minX: nMinX, maxX: nMaxX,
        minY: nMinY, maxY: nMaxY,
      };
    }
    return null;
  }

  // Place rooms 1..3 as a spanning tree.
  for (let i = 1; i <= 3; i += 1) {
    const p = tryPlaceRoom(i);
    if (!p) return null;
    placed.push(p);
  }

  // Place room 4 such that it creates a CYCLE: it must be adjacent to at least
  // TWO already-placed rooms. Strategy: pick two already-placed rooms (P1, P2)
  // and place room 4 adjacent to P1 on side s, then check if the resulting
  // position is also adjacent to P2 (within tolerance). Try all ordered pairs.
  //
  // Specifically: for each pair (p1, p2) and each side s of p1:
  //   - Compute the EXACT perpendicular position for room 4 adjacent to p1.
  //   - Compute the slide (parallel axis) that maximises overlap with p2.
  //   - Accept if both overlaps ≥ DOOR_WIDTH, no spatial overlap with existing rooms.
  const minOverlapCycle = DOOR_WIDTH + 2 * DOOR_MARGIN;
  let cycleRoomPlaced: PlacedRoom | null = null;

  // Try to place room 4 forming a cycle between p1 and p2.
  outer:
  for (let p1Idx = 0; p1Idx < placed.length; p1Idx += 1) {
    for (let p2Idx = 0; p2Idx < placed.length; p2Idx += 1) {
      if (p1Idx === p2Idx) continue;
      const p1 = placed[p1Idx];
      const p2 = placed[p2Idx];
      const { w: w4, h: h4 } = rotatedDims(4);
      const deg4 = degrees[4];

      for (const side of ALL_SIDES) {
        // Compute cx4, cy4 exactly adjacent to p1 on `side`.
        let cx4: number;
        let cy4: number;

        if (side === 'east') {
          cx4 = p1.maxX + ROOM_GAP + w4 / 2;
          // Is p2 also adjacent (west of room 4)?
          // p2.maxX + ROOM_GAP ≈ cx4 - w4/2 → p2.maxX ≈ p1.maxX → p2 is east-aligned with p1
          // More likely: p2 is south/north, so we check if room 4 ends up adjacent to p2 on north/south.
          // Try the slide (cy4) that gives best overlap with p2's Y span.
          const overlapYWithP2Lo = Math.max(p2.minY, -h4 / 2 - 9999); // we'll check after
          // For p2 adjacency on south: cy4 = p2.maxY + ROOM_GAP + h4/2 → room 4 is south of p2
          // For p2 adjacency on north: cy4 = p2.minY - ROOM_GAP - h4/2 → room 4 is north of p2
          const candidates4: number[] = [];
          if (Math.abs(cx4 - w4 / 2 - p2.maxX - ROOM_GAP) < 1e-3) {
            // p2 is to the west of room 4 — check Y overlap
            const overlapY1Lo = p1.minY - h4 / 2 + minOverlapCycle;
            const overlapY1Hi = p1.maxY + h4 / 2 - minOverlapCycle;
            const overlapY2Lo = p2.minY - h4 / 2 + minOverlapCycle;
            const overlapY2Hi = p2.maxY + h4 / 2 - minOverlapCycle;
            const lo = Math.max(overlapY1Lo, overlapY2Lo);
            const hi = Math.min(overlapY1Hi, overlapY2Hi);
            if (lo <= hi) candidates4.push((lo + hi) / 2);
          }
          // p2 is north of room 4: room4.minY - ROOM_GAP ≈ p2.maxY → cy4 ≈ p2.maxY + ROOM_GAP + h4/2
          {
            const trialCY = p2.maxY + ROOM_GAP + h4 / 2;
            candidates4.push(trialCY);
          }
          // p2 is south of room 4: cy4 ≈ p2.minY - ROOM_GAP - h4/2
          {
            const trialCY = p2.minY - ROOM_GAP - h4 / 2;
            candidates4.push(trialCY);
          }

          for (const trialCY of candidates4) {
            cy4 = trialCY;
            const n4 = { minX: cx4 - w4 / 2, maxX: cx4 + w4 / 2, minY: cy4 - h4 / 2, maxY: cy4 + h4 / 2 };
            if (collidesWithPlaced(placed, n4.minX, n4.maxX, n4.minY, n4.maxY)) continue;
            // Verify p1 adjacency overlap ≥ DOOR_WIDTH.
            const ov1Y = Math.min(p1.maxY, n4.maxY) - Math.max(p1.minY, n4.minY);
            if (ov1Y < DOOR_WIDTH) continue;
            // Verify p2 adjacency (check all sides of p2 adjacent to room 4).
            const adjP2 = checkAdjacent(n4.minX, n4.maxX, n4.minY, n4.maxY, p2);
            if (!adjP2) continue;
            // Success!
            cycleRoomPlaced = { index: 4, width: w4, height: h4, offset: { x: cx4, y: cy4 }, deg: deg4, ...n4 };
            break outer;
          }
        } else if (side === 'west') {
          cx4 = p1.minX - ROOM_GAP - w4 / 2;
          const candidates4: number[] = [];
          if (Math.abs(cx4 + w4 / 2 + ROOM_GAP - p2.minX) < 1e-3) {
            const lo = Math.max(p1.minY - h4 / 2 + minOverlapCycle, p2.minY - h4 / 2 + minOverlapCycle);
            const hi = Math.min(p1.maxY + h4 / 2 - minOverlapCycle, p2.maxY + h4 / 2 - minOverlapCycle);
            if (lo <= hi) candidates4.push((lo + hi) / 2);
          }
          candidates4.push(p2.maxY + ROOM_GAP + h4 / 2);
          candidates4.push(p2.minY - ROOM_GAP - h4 / 2);
          for (const trialCY of candidates4) {
            cy4 = trialCY;
            const n4 = { minX: cx4 - w4 / 2, maxX: cx4 + w4 / 2, minY: cy4 - h4 / 2, maxY: cy4 + h4 / 2 };
            if (collidesWithPlaced(placed, n4.minX, n4.maxX, n4.minY, n4.maxY)) continue;
            const ov1Y = Math.min(p1.maxY, n4.maxY) - Math.max(p1.minY, n4.minY);
            if (ov1Y < DOOR_WIDTH) continue;
            const adjP2 = checkAdjacent(n4.minX, n4.maxX, n4.minY, n4.maxY, p2);
            if (!adjP2) continue;
            cycleRoomPlaced = { index: 4, width: w4, height: h4, offset: { x: cx4, y: cy4 }, deg: deg4, ...n4 };
            break outer;
          }
        } else if (side === 'south') {
          cy4 = p1.maxY + ROOM_GAP + h4 / 2;
          const candidates4: number[] = [];
          if (Math.abs(cy4 - h4 / 2 - p2.maxY - ROOM_GAP) < 1e-3) {
            const lo = Math.max(p1.minX - w4 / 2 + minOverlapCycle, p2.minX - w4 / 2 + minOverlapCycle);
            const hi = Math.min(p1.maxX + w4 / 2 - minOverlapCycle, p2.maxX + w4 / 2 - minOverlapCycle);
            if (lo <= hi) candidates4.push((lo + hi) / 2);
          }
          candidates4.push(p2.maxX + ROOM_GAP + w4 / 2);
          candidates4.push(p2.minX - ROOM_GAP - w4 / 2);
          for (const trialCX of candidates4) {
            cx4 = trialCX;
            const n4 = { minX: cx4 - w4 / 2, maxX: cx4 + w4 / 2, minY: cy4 - h4 / 2, maxY: cy4 + h4 / 2 };
            if (collidesWithPlaced(placed, n4.minX, n4.maxX, n4.minY, n4.maxY)) continue;
            const ov1X = Math.min(p1.maxX, n4.maxX) - Math.max(p1.minX, n4.minX);
            if (ov1X < DOOR_WIDTH) continue;
            const adjP2 = checkAdjacent(n4.minX, n4.maxX, n4.minY, n4.maxY, p2);
            if (!adjP2) continue;
            cycleRoomPlaced = { index: 4, width: w4, height: h4, offset: { x: cx4, y: cy4 }, deg: deg4, ...n4 };
            break outer;
          }
        } else { // north
          cy4 = p1.minY - ROOM_GAP - h4 / 2;
          const candidates4: number[] = [];
          if (Math.abs(cy4 + h4 / 2 + ROOM_GAP - p2.minY) < 1e-3) {
            const lo = Math.max(p1.minX - w4 / 2 + minOverlapCycle, p2.minX - w4 / 2 + minOverlapCycle);
            const hi = Math.min(p1.maxX + w4 / 2 - minOverlapCycle, p2.maxX + w4 / 2 - minOverlapCycle);
            if (lo <= hi) candidates4.push((lo + hi) / 2);
          }
          candidates4.push(p2.maxX + ROOM_GAP + w4 / 2);
          candidates4.push(p2.minX - ROOM_GAP - w4 / 2);
          for (const trialCX of candidates4) {
            cx4 = trialCX;
            const n4 = { minX: cx4 - w4 / 2, maxX: cx4 + w4 / 2, minY: cy4 - h4 / 2, maxY: cy4 + h4 / 2 };
            if (collidesWithPlaced(placed, n4.minX, n4.maxX, n4.minY, n4.maxY)) continue;
            const ov1X = Math.min(p1.maxX, n4.maxX) - Math.max(p1.minX, n4.minX);
            if (ov1X < DOOR_WIDTH) continue;
            const adjP2 = checkAdjacent(n4.minX, n4.maxX, n4.minY, n4.maxY, p2);
            if (!adjP2) continue;
            cycleRoomPlaced = { index: 4, width: w4, height: h4, offset: { x: cx4, y: cy4 }, deg: deg4, ...n4 };
            break outer;
          }
        }
      }
    }
  }

  // Fallback: place room 4 as a normal tree node (may produce a chain map → validator rejects).
  if (!cycleRoomPlaced) {
    cycleRoomPlaced = tryPlaceRoom(4);
    if (!cycleRoomPlaced) return null;
  }
  placed.push(cycleRoomPlaced);

  // Place room 5 (boss) as a leaf: adjacent to EXACTLY ONE room.
  // Use a dedicated placement loop that also rejects positions touching > 1 room.
  let bossPlaced: PlacedRoom | null = null;
  {
    const { w: wb, h: hb } = rotatedDims(5);
    const degB = degrees[5];
    const minOvB = DOOR_WIDTH + 2 * DOOR_MARGIN;

    outer_boss:
    for (const parentIdx of placed.map((_, i) => i).sort(() => rng() - 0.5)) {
      const parent = placed[parentIdx];
      for (let attempt = 0; attempt < MAX_ANCHOR_ATTEMPTS * 2; attempt += 1) {
        const side = ALL_SIDES[Math.floor(rng() * 4)];
        let cxB: number;
        let cyB: number;

        if (side === 'east') {
          cxB = parent.maxX + ROOM_GAP + wb / 2;
          const lo = parent.minY - hb / 2 + minOvB;
          const hi = parent.maxY + hb / 2 - minOvB;
          if (lo > hi) continue;
          cyB = lo + rng() * (hi - lo);
        } else if (side === 'west') {
          cxB = parent.minX - ROOM_GAP - wb / 2;
          const lo = parent.minY - hb / 2 + minOvB;
          const hi = parent.maxY + hb / 2 - minOvB;
          if (lo > hi) continue;
          cyB = lo + rng() * (hi - lo);
        } else if (side === 'south') {
          cyB = parent.maxY + ROOM_GAP + hb / 2;
          const lo = parent.minX - wb / 2 + minOvB;
          const hi = parent.maxX + wb / 2 - minOvB;
          if (lo > hi) continue;
          cxB = lo + rng() * (hi - lo);
        } else {
          cyB = parent.minY - ROOM_GAP - hb / 2;
          const lo = parent.minX - wb / 2 + minOvB;
          const hi = parent.maxX + wb / 2 - minOvB;
          if (lo > hi) continue;
          cxB = lo + rng() * (hi - lo);
        }

        const nMinX = cxB - wb / 2;
        const nMaxX = cxB + wb / 2;
        const nMinY = cyB - hb / 2;
        const nMaxY = cyB + hb / 2;

        if (collidesWithPlaced(placed, nMinX, nMaxX, nMinY, nMaxY)) continue;

        // Count adjacencies — boss must touch EXACTLY ONE room.
        let adjCount = 0;
        for (const p of placed) {
          if (checkAdjacent(nMinX, nMaxX, nMinY, nMaxY, p)) adjCount += 1;
        }
        if (adjCount !== 1) continue;

        bossPlaced = { index: 5, width: wb, height: hb, offset: { x: cxB, y: cyB }, deg: degB,
          minX: nMinX, maxX: nMaxX, minY: nMinY, maxY: nMaxY };
        break outer_boss;
      }
    }
  }
  if (!bossPlaced) return null;
  placed.push(bossPlaced);

  // Build WorldRoomInstance[] from placed rooms.
  const instances: WorldRoomInstance[] = placed.map((p, i) => ({
    id: `map-room-${i}`,
    roomId: selectedRooms[i].id,
    name: selectedRooms[i].name,
    width: p.width,
    height: p.height,
    offset: p.offset,
    rotation: p.deg,
    tags: tagsForRole(i, selectedRooms[i]),
    doorSlots: [],
    cleared: false,
  }));

  // Detect adjacencies between all pairs. Two rooms share a border if:
  //   - their facing borders are on the same line (round to 3dp = same as round()),
  //   - separated by exactly ROOM_GAP,
  //   - their perpendicular spans overlap by ≥ DOOR_WIDTH.
  const connections: WorldDoorConnection[] = [];
  const ADJTOL = 1e-3;

  for (let a = 0; a < instances.length; a += 1) {
    for (let b = a + 1; b < instances.length; b += 1) {
      const pa = placed[a];
      const pb = placed[b];
      let aSide: DoorSide | null = null;

      // East of a / West of b.
      if (Math.abs((pa.maxX + ROOM_GAP) - pb.minX) < ADJTOL) {
        // Overlap in Y.
        const overlapY = Math.min(pa.maxY, pb.maxY) - Math.max(pa.minY, pb.minY);
        if (overlapY >= DOOR_WIDTH) aSide = 'east';
      } else if (Math.abs((pb.maxX + ROOM_GAP) - pa.minX) < ADJTOL) {
        const overlapY = Math.min(pa.maxY, pb.maxY) - Math.max(pa.minY, pb.minY);
        if (overlapY >= DOOR_WIDTH) aSide = 'west';
      } else if (Math.abs((pa.maxY + ROOM_GAP) - pb.minY) < ADJTOL) {
        const overlapX = Math.min(pa.maxX, pb.maxX) - Math.max(pa.minX, pb.minX);
        if (overlapX >= DOOR_WIDTH) aSide = 'south';
      } else if (Math.abs((pb.maxY + ROOM_GAP) - pa.minY) < ADJTOL) {
        const overlapX = Math.min(pa.maxX, pb.maxX) - Math.max(pa.minX, pb.minX);
        if (overlapX >= DOOR_WIDTH) aSide = 'north';
      }

      if (!aSide) continue;

      const bSide = oppositeSide(aSide);

      // Door world position = centre of the shared border overlap.
      let doorX: number;
      let doorY: number;
      if (aSide === 'east' || aSide === 'west') {
        // Door is on a vertical border (east/west) → x is the border x, y is overlap centre.
        doorX = aSide === 'east' ? pa.maxX + ROOM_GAP / 2 : pa.minX - ROOM_GAP / 2;
        const overlapLo = Math.max(pa.minY, pb.minY);
        const overlapHi = Math.min(pa.maxY, pb.maxY);
        doorY = (overlapLo + overlapHi) / 2;
      } else {
        // Door is on a horizontal border (north/south) → y is the border y, x is overlap centre.
        doorY = aSide === 'south' ? pa.maxY + ROOM_GAP / 2 : pa.minY - ROOM_GAP / 2;
        const overlapLo = Math.max(pa.minX, pb.minX);
        const overlapHi = Math.min(pa.maxX, pb.maxX);
        doorX = (overlapLo + overlapHi) / 2;
      }

      // DoorSlot offset = door world coord on the wall axis minus room centre on that axis.
      // For east/west walls: the wall is vertical, the varying axis is Y.
      // doorWorldPosition: east → x = offset.x + w/2, y = offset.y + slot.offset  → slot.offset = doorY - offset.y
      // For north/south walls: x = offset.x + slot.offset, y = offset.y ± h/2    → slot.offset = doorX - offset.x
      let aOffset: number;
      let bOffset: number;
      if (aSide === 'east' || aSide === 'west') {
        aOffset = doorY - instances[a].offset.y;
        bOffset = doorY - instances[b].offset.y;
      } else {
        aOffset = doorX - instances[a].offset.x;
        bOffset = doorX - instances[b].offset.x;
      }

      const aSlot: DoorSlot = { side: aSide, offset: round(aOffset) };
      const bSlot: DoorSlot = { side: bSide, offset: round(bOffset) };
      instances[a].doorSlots.push(aSlot);
      instances[b].doorSlots.push(bSlot);

      connections.push({
        id: `${instances[a].id}:${aSide}->${instances[b].id}`,
        aRoomId: instances[a].id,
        aSlot,
        bRoomId: instances[b].id,
        bSlot,
        open: false,
        requiresKey: instances[a].tags.includes('boss') || instances[b].tags.includes('boss'),
      });
    }
  }

  const map: WorldMapState = {
    rooms: instances,
    connections,
    startRoomId: instances[0].id,
    keyRoomId: instances[2].id,
    bossRoomId: instances[5].id,
  };

  // Validate own result: never return a map with doubled walls or any broken
  // invariant. If invalid → null so the dispatcher retries the seed / falls back.
  if (!validateWorldMap(map)) return null;
  return map;
}

// ---------------------------------------------------------------------------
// validateWorldMap — safety net for generateVariableWorldMap output.
// Returns false if any structural or geometric invariant is violated.
// ---------------------------------------------------------------------------
export function validateWorldMap(map: WorldMapState): boolean {
  const { rooms, connections, startRoomId, keyRoomId, bossRoomId } = map;

  // 1. Connectivity: BFS from start reaches all rooms.
  const reachable = new Set<string>([startRoomId]);
  const queue = [startRoomId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const conn of connections) {
      let next: string | null = null;
      if (conn.aRoomId === id) next = conn.bRoomId;
      else if (conn.bRoomId === id) next = conn.aRoomId;
      if (next && !reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  if (reachable.size !== rooms.length) return false;

  // 2. Boss is accessible only via key-locked connections: every connection to/from
  //    boss must have requiresKey. The boss may have >1 connection (the uniform
  //    layout allows it) but all must require the key so the boss room is always
  //    gated. Also there must be at least 1 connection.
  const bossConnections = connections.filter((c) => c.aRoomId === bossRoomId || c.bRoomId === bossRoomId);
  if (bossConnections.length === 0) return false;
  if (!bossConnections.every((c) => c.requiresKey)) return false;

  // 3. Key reachable without crossing boss door.
  const keyReachable = new Set<string>([startRoomId]);
  const kq = [startRoomId];
  while (kq.length > 0) {
    const id = kq.shift()!;
    for (const conn of connections) {
      if (conn.requiresKey) continue;
      let next: string | null = null;
      if (conn.aRoomId === id) next = conn.bRoomId;
      else if (conn.bRoomId === id) next = conn.aRoomId;
      if (next && !keyReachable.has(next)) {
        keyReachable.add(next);
        kq.push(next);
      }
    }
  }
  if (!keyReachable.has(keyRoomId)) return false;

  // 4. Cycle check: non-boss subgraph has at least as many edges as nodes (cycle exists).
  const nonBossRooms = rooms.filter((r) => r.id !== bossRoomId);
  const nonBossEdges = connections.filter((c) => c.aRoomId !== bossRoomId && c.bRoomId !== bossRoomId);
  if (nonBossEdges.length < nonBossRooms.length) return false;

  // 5. No room AABB overlap (separation ≥ ROOM_GAP - 1e-6 on touching axis).
  const TOL = 1e-6;
  for (let ai = 0; ai < rooms.length; ai += 1) {
    const a = roomBounds(rooms[ai]);
    for (let bi = ai + 1; bi < rooms.length; bi += 1) {
      const b = roomBounds(rooms[bi]);
      const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      if (overlapX > TOL && overlapY > TOL) return false;
    }
  }

  // 6. No doubled walls: for every pair of line walls (no connectionId):
  //    - DIFFERENT orientation (one horizontal width>height, one vertical) → ignore.
  //      These are corner/T-junction crossings — unavoidable and correct when rooms
  //      have different sizes.
  //    - SAME orientation (two horizontal or two vertical) → their thick AABBs must NOT
  //      overlap with positive area. Two parallel walls < WALL_THICKNESS apart whose
  //      AABBs overlap is exactly the irregular-thickness defect invariant #4 forbids.
  const wallTol = 1e-3;
  const lineWalls = computeWorldWallObstacles(map, false).filter((w) => w.connectionId === undefined);
  for (let wi = 0; wi < lineWalls.length; wi += 1) {
    const wa = lineWalls[wi];
    const waHorizontal = wa.width > wa.height;
    for (let wj = wi + 1; wj < lineWalls.length; wj += 1) {
      const wb = lineWalls[wj];
      const wbHorizontal = wb.width > wb.height;
      // Different orientation → corner crossing, allowed.
      if (waHorizontal !== wbHorizontal) continue;
      // Same orientation → check AABB area overlap.
      const ox = Math.min(wa.pos.x + wa.width / 2, wb.pos.x + wb.width / 2)
               - Math.max(wa.pos.x - wa.width / 2, wb.pos.x - wb.width / 2);
      const oy = Math.min(wa.pos.y + wa.height / 2, wb.pos.y + wb.height / 2)
               - Math.max(wa.pos.y - wa.height / 2, wb.pos.y - wb.height / 2);
      if (ox > wallTol && oy > wallTol) return false;
    }
  }

  // 7. Every connection has enough border overlap for a door (≥ DOOR_WIDTH).
  for (const conn of connections) {
    const aRoom = rooms.find((r) => r.id === conn.aRoomId);
    const bRoom = rooms.find((r) => r.id === conn.bRoomId);
    if (!aRoom || !bRoom) return false;
    const ab = roomBounds(aRoom);
    const bb = roomBounds(bRoom);
    const horizontal = conn.aSlot.side === 'east' || conn.aSlot.side === 'west';
    const overlap = horizontal
      ? Math.min(ab.maxY, bb.maxY) - Math.max(ab.minY, bb.minY)
      : Math.min(ab.maxX, bb.maxX) - Math.max(ab.minX, bb.minX);
    if (overlap < DOOR_WIDTH) return false;
  }

  return true;
}

// Side of cell `a` that touches `b`, or null if they are not edge-adjacent.
function adjacentSide(a: GridCell, b: GridCell): DoorSide | null {
  if (a.row === b.row && b.col === a.col + 1) return 'east';
  if (a.row === b.row && b.col === a.col - 1) return 'west';
  if (a.col === b.col && b.row === a.row + 1) return 'south';
  if (a.col === b.col && b.row === a.row - 1) return 'north';
  return null;
}

// 2x2 core (guarantees a cycle) + a 5th cell attached to it + the boss (6th) as
// a leaf attached last. Because the first five are already connected, removing
// the boss never disconnects the key room → the key is always reachable first.
function placeCells(rng: Rng): GridCell[] {
  const cells: GridCell[] = [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
  ];
  appendCell(cells, rng);
  appendCell(cells, rng);
  return cells;
}

function appendCell(cells: GridCell[], rng: Rng): void {
  const occupied = new Set(cells.map((cell) => `${cell.col},${cell.row}`));
  const directions: GridCell[] = [{ col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 }];
  const candidates: GridCell[] = [];
  for (const base of cells) {
    for (const direction of directions) {
      const cell = { col: base.col + direction.col, row: base.row + direction.row };
      if (!occupied.has(`${cell.col},${cell.row}`)) candidates.push(cell);
    }
  }
  cells.push(candidates[Math.floor(rng() * candidates.length)] ?? { col: cells.length, row: 0 });
}

export function getRoomAtPosition(worldMap: WorldMapState | null, pos: Vec2): WorldRoomInstance | null {
  if (!worldMap) return null;
  return worldMap.rooms.find((room) => pointInsideRoom(room, pos, -0.02)) ?? null;
}

export function getCurrentRoom(worldMap: WorldMapState | null, currentRoomInstanceId: string | null): WorldRoomInstance | null {
  if (!worldMap || !currentRoomInstanceId) return null;
  return worldMap.rooms.find((room) => room.id === currentRoomInstanceId) ?? null;
}

export function localToWorld(room: WorldRoomInstance, pos: Vec2): Vec2 {
  return { x: pos.x + room.offset.x, y: pos.y + room.offset.y };
}

export function worldToLocal(room: WorldRoomInstance, pos: Vec2): Vec2 {
  return { x: pos.x - room.offset.x, y: pos.y - room.offset.y };
}

export function doorWorldPosition(room: WorldRoomInstance, slot: DoorSlot): Vec2 {
  if (slot.side === 'north') return { x: room.offset.x + slot.offset, y: room.offset.y - room.height / 2 };
  if (slot.side === 'south') return { x: room.offset.x + slot.offset, y: room.offset.y + room.height / 2 };
  if (slot.side === 'west') return { x: room.offset.x - room.width / 2, y: room.offset.y + slot.offset };
  return { x: room.offset.x + room.width / 2, y: room.offset.y + slot.offset };
}

export function getConnectionsForRoom(worldMap: WorldMapState, roomId: string): Array<{ connection: WorldDoorConnection; slot: DoorSlot }> {
  return worldMap.connections.flatMap((connection) => {
    if (connection.aRoomId === roomId) return [{ connection, slot: connection.aSlot }];
    if (connection.bRoomId === roomId) return [{ connection, slot: connection.bSlot }];
    return [];
  });
}

export function isConnectionPassable(connection: WorldDoorConnection): boolean {
  return connection.open && (!connection.requiresKey || !!connection.unlocked);
}

// Walls are rebuilt only when the open-state of any connection or hasKey
// changes. They are queried per-entity per-frame for collisions, so rebuilding
// every call would be a hot-path bottleneck (see ARCHITECTURE_INVARIANTS.md).
let cachedWalls: WallObstacle[] | null = null;
let cachedWallsKey = '';

export function buildWorldWallObstacles(worldMap: WorldMapState | null, hasKey: boolean): WallObstacle[] {
  if (!worldMap) return [];
  const key = wallCacheKey(worldMap, hasKey);
  if (cachedWalls && cachedWallsKey === key) return cachedWalls;
  cachedWalls = computeWorldWallObstacles(worldMap, hasKey);
  cachedWallsKey = key;
  return cachedWalls;
}

function wallCacheKey(worldMap: WorldMapState, hasKey: boolean): string {
  let key = `${hasKey ? 1 : 0}|${worldMap.startRoomId}`;
  // Include room geometry: two maps can share the same connection ids but place
  // the cells at different offsets (e.g. after resetRun), so the key must change
  // when the layout does, or the cache returns the wrong (previous) walls.
  for (const room of worldMap.rooms) key += `|${room.id}@${room.offset.x},${room.offset.y}:${room.width}x${room.height}`;
  for (const connection of worldMap.connections) key += `|${connection.id}:${connection.open ? 1 : 0}${connection.unlocked ? 'U' : ''}`;
  return key;
}

// Build the whole map's walls at once: collect the solid span of every room edge
// per grid line, subtract every doorway gap, then emit uniform-thickness
// segments. Shared edges between adjacent rooms merge into a single wall, so
// thickness is constant everywhere (no doubled walls). Closed doors get a
// separate barrier mesh tagged with connectionId.
function computeWorldWallObstacles(worldMap: WorldMapState, _hasKey: boolean): WallObstacle[] {
  const verticalSolid = new Map<number, Interval[]>();   // x line -> y spans
  const verticalDoors = new Map<number, Interval[]>();
  const horizontalSolid = new Map<number, Interval[]>(); // y line -> x spans
  const horizontalDoors = new Map<number, Interval[]>();

  for (const room of worldMap.rooms) {
    const bounds = roomBounds(room);
    for (const side of ['north', 'south', 'east', 'west'] as DoorSide[]) {
      const geometry = sideGeometry(bounds, side);
      const solid = geometry.axis === 'v' ? verticalSolid : horizontalSolid;
      pushInterval(solid, round(geometry.line), [geometry.spanMin, geometry.spanMax]);
    }

    for (const { slot } of getConnectionsForRoom(worldMap, room.id)) {
      const geometry = sideGeometry(bounds, slot.side);
      const door = doorWorldPosition(room, slot);
      const along = geometry.axis === 'v' ? door.y : door.x;
      const doors = geometry.axis === 'v' ? verticalDoors : horizontalDoors;
      pushInterval(doors, round(geometry.line), [along - DOOR_WIDTH / 2, along + DOOR_WIDTH / 2]);
    }
  }

  const obstacles: WallObstacle[] = [];
  emitLineWalls(obstacles, verticalSolid, verticalDoors, 'v');
  emitLineWalls(obstacles, horizontalSolid, horizontalDoors, 'h');

  for (const connection of worldMap.connections) {
    if (isConnectionPassable(connection)) continue;
    const aRoom = worldMap.rooms.find((room) => room.id === connection.aRoomId);
    if (!aRoom) continue;
    const geometry = sideGeometry(roomBounds(aRoom), connection.aSlot.side);
    const door = doorWorldPosition(aRoom, connection.aSlot);
    const horizontal = geometry.axis === 'h';
    obstacles.push({
      id: `door-${connection.id}`,
      pos: horizontal ? { x: door.x, y: geometry.line } : { x: geometry.line, y: door.y },
      width: horizontal ? DOOR_WIDTH : WALL_THICKNESS,
      height: horizontal ? WALL_THICKNESS : DOOR_WIDTH,
      connectionId: connection.id,
      requiresKey: !!connection.requiresKey,
    });
  }

  return obstacles;
}

// Wall line for one side: offset OUTWARD from the room edge by half the wall
// thickness so the wall sits in the gap/perimeter, flush with the edge tiles
// (never overlapping them). Horizontal walls are extended by half a thickness at
// each end so they meet the vertical walls cleanly at the corners.
export type FloorRect = { id: string; pos: Vec2; width: number; height: number };

// Floor patches that bridge the inter-room gap at each doorway, so the player
// never crosses a visible hole between rooms (there is no pit there, but the
// per-room floor tiles stop at the room edge).
export function getDoorBridges(worldMap: WorldMapState | null): FloorRect[] {
  if (!worldMap) return [];
  const bridges: FloorRect[] = [];
  const half = ROOM_GAP / 2;
  for (const connection of worldMap.connections) {
    const aRoom = worldMap.rooms.find((room) => room.id === connection.aRoomId);
    if (!aRoom) continue;
    const bounds = roomBounds(aRoom);
    const door = doorWorldPosition(aRoom, connection.aSlot);
    const side = connection.aSlot.side;
    const id = `bridge-${connection.id}`;
    if (side === 'east') bridges.push({ id, pos: { x: bounds.maxX + half, y: door.y }, width: ROOM_GAP + 0.02, height: DOOR_WIDTH });
    else if (side === 'west') bridges.push({ id, pos: { x: bounds.minX - half, y: door.y }, width: ROOM_GAP + 0.02, height: DOOR_WIDTH });
    else if (side === 'north') bridges.push({ id, pos: { x: door.x, y: bounds.minY - half }, width: DOOR_WIDTH, height: ROOM_GAP + 0.02 });
    else bridges.push({ id, pos: { x: door.x, y: bounds.maxY + half }, width: DOOR_WIDTH, height: ROOM_GAP + 0.02 });
  }
  return bridges;
}

function sideGeometry(bounds: { minX: number; maxX: number; minY: number; maxY: number }, side: DoorSide): { axis: 'v' | 'h'; line: number; spanMin: number; spanMax: number } {
  const half = WALL_THICKNESS / 2;
  if (side === 'north') return { axis: 'h', line: bounds.minY - half, spanMin: bounds.minX - half, spanMax: bounds.maxX + half };
  if (side === 'south') return { axis: 'h', line: bounds.maxY + half, spanMin: bounds.minX - half, spanMax: bounds.maxX + half };
  if (side === 'west') return { axis: 'v', line: bounds.minX - half, spanMin: bounds.minY, spanMax: bounds.maxY };
  return { axis: 'v', line: bounds.maxX + half, spanMin: bounds.minY, spanMax: bounds.maxY };
}

type Interval = [number, number];

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pushInterval(map: Map<number, Interval[]>, line: number, interval: Interval): void {
  const list = map.get(line);
  if (list) list.push(interval);
  else map.set(line, [interval]);
}

function emitLineWalls(out: WallObstacle[], solidByLine: Map<number, Interval[]>, doorsByLine: Map<number, Interval[]>, axis: 'v' | 'h'): void {
  for (const [line, solids] of solidByLine) {
    const segments = subtractIntervals(unionIntervals(solids), unionIntervals(doorsByLine.get(line) ?? []));
    segments.forEach(([from, to], index) => {
      const center = (from + to) / 2;
      const length = to - from;
      out.push({
        id: `wall-${axis}-${line}-${index}`,
        pos: axis === 'v' ? { x: line, y: center } : { x: center, y: line },
        width: axis === 'v' ? WALL_THICKNESS : length,
        height: axis === 'v' ? length : WALL_THICKNESS,
      });
    });
  }
}

function unionIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = intervals.map((interval) => [...interval] as Interval).sort((a, b) => a[0] - b[0]);
  const result: Interval[] = [sorted[0]];
  for (let index = 1; index < sorted.length; index += 1) {
    const last = result[result.length - 1];
    const [start, end] = sorted[index];
    if (start <= last[1] + 1e-6) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}

function subtractIntervals(solids: Interval[], gaps: Interval[]): Interval[] {
  if (gaps.length === 0) return solids;
  const result: Interval[] = [];
  for (const solid of solids) {
    let pieces: Interval[] = [solid];
    for (const [gapStart, gapEnd] of gaps) {
      const nextPieces: Interval[] = [];
      for (const [start, end] of pieces) {
        if (gapEnd <= start || gapStart >= end) {
          nextPieces.push([start, end]);
          continue;
        }
        if (gapStart > start) nextPieces.push([start, gapStart]);
        if (gapEnd < end) nextPieces.push([gapEnd, end]);
      }
      pieces = nextPieces;
    }
    result.push(...pieces);
  }
  return result.filter(([start, end]) => end - start > 0.05);
}

export function openRoomConnections(worldMap: WorldMapState, roomId: string): WorldMapState {
  return {
    ...worldMap,
    rooms: worldMap.rooms.map((room) => (room.id === roomId ? { ...room, cleared: true } : room)),
    connections: worldMap.connections.map((connection) => (
      connection.aRoomId === roomId || connection.bRoomId === roomId ? { ...connection, open: true } : connection
    )),
  };
}

export function openConnectionBetween(worldMap: WorldMapState, fromRoomId: string, toRoomId: string): WorldMapState {
  return {
    ...worldMap,
    connections: worldMap.connections.map((connection) => (
      connectsRooms(connection, fromRoomId, toRoomId) ? { ...connection, open: true } : connection
    )),
  };
}

export function oppositeSide(side: DoorSide): DoorSide {
  if (side === 'north') return 'south';
  if (side === 'south') return 'north';
  if (side === 'east') return 'west';
  return 'east';
}

export function roomBounds(room: WorldRoomInstance) {
  return {
    minX: room.offset.x - room.width / 2,
    maxX: room.offset.x + room.width / 2,
    minY: room.offset.y - room.height / 2,
    maxY: room.offset.y + room.height / 2,
  };
}

export function pointInsideRoom(room: WorldRoomInstance, pos: Vec2, inset = 0): boolean {
  const bounds = roomBounds(room);
  return pos.x >= bounds.minX + inset && pos.x <= bounds.maxX - inset && pos.y >= bounds.minY + inset && pos.y <= bounds.maxY - inset;
}

export function getWorldBounds(worldMap: WorldMapState | null) {
  if (!worldMap || worldMap.rooms.length === 0) return { width: 1, height: 1, center: { x: 0, y: 0 } };
  const bounds = worldMap.rooms.map(roomBounds);
  const minX = Math.min(...bounds.map((bound) => bound.minX));
  const maxX = Math.max(...bounds.map((bound) => bound.maxX));
  const minY = Math.min(...bounds.map((bound) => bound.minY));
  const maxY = Math.max(...bounds.map((bound) => bound.maxY));
  return {
    width: maxX - minX,
    height: maxY - minY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

// ---------------------------------------------------------------------------
// rotateRoomDefinition — pure rotation of a RoomDefinition around its centre.
//
// Rotation in the X/Z plane (note `y` is the Z/"south" axis, so north = -y).
// Side mappings below are the SOURCE OF TRUTH and match the door tests; they are
// derived geometrically (rotate the slot's edge point, re-detect the new face).
//   deg=0:   (x,  y) →  (x,  y)
//   deg=90:  (x,  y) → (-y,  x)   north→east, east→south, south→west, west→north
//   deg=180: (x,  y) → (-x, -y)   north↔south, east↔west
//   deg=270: (x,  y) → ( y, -x)   north→west, west→south, south→east, east→north
//
// (Because y points "south", +90 here reads as clockwise on screen.)
// ---------------------------------------------------------------------------

/** Rotate a point around the origin (CCW, see convention above). */
function rotatePoint(p: Vec2, deg: 0 | 90 | 180 | 270): Vec2 {
  if (deg === 90)  return { x: -p.y, y:  p.x };
  if (deg === 180) return { x: -p.x, y: -p.y };
  if (deg === 270) return { x:  p.y, y: -p.x };
  return { x: p.x, y: p.y };
}

function roundCoord(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

function rotateVec(v: Vec2, deg: 0 | 90 | 180 | 270): Vec2 {
  const r = rotatePoint(v, deg);
  return { x: roundCoord(r.x), y: roundCoord(r.y) };
}

function rotatePt(p: Vec2, deg: 0 | 90 | 180 | 270): Vec2 {
  const r = rotatePoint(p, deg);
  return { x: roundCoord(r.x), y: roundCoord(r.y) };
}

/**
 * Returns a new RoomDefinition with all geometry rotated by `deg` degrees CCW.
 * Does NOT mutate the input.
 */
export function rotateRoomDefinition(room: RoomDefinition, deg: 0 | 90 | 180 | 270): RoomDefinition {
  const swapDims = deg === 90 || deg === 270;
  const newWidth  = swapDims ? room.height : room.width;
  const newHeight = swapDims ? room.width  : room.height;
  const hw = newWidth  / 2;
  const hh = newHeight / 2;
  const TOL = 1e-6;

  // Re-derive DoorSlot {side, offset} from a rotated local point against new dims.
  function rederiveSlot(rotated: Vec2): DoorSlot {
    if (Math.abs(rotated.y - (-hh)) < TOL) return { side: 'north', offset: roundCoord(rotated.x) };
    if (Math.abs(rotated.y -   hh)  < TOL) return { side: 'south', offset: roundCoord(rotated.x) };
    if (Math.abs(rotated.x - (-hw)) < TOL) return { side: 'west',  offset: roundCoord(rotated.y) };
    return { side: 'east', offset: roundCoord(rotated.y) };
  }

  // Local position of a door slot using the ORIGINAL room dimensions.
  function slotLocalPoint(slot: DoorSlot): Vec2 {
    const hw0 = room.width  / 2;
    const hh0 = room.height / 2;
    if (slot.side === 'north') return { x: slot.offset, y: -hh0 };
    if (slot.side === 'south') return { x: slot.offset, y:  hh0 };
    if (slot.side === 'west')  return { x: -hw0, y: slot.offset };
    return { x: hw0, y: slot.offset };
  }

  return {
    ...room,
    width:  newWidth,
    height: newHeight,
    playerStart: rotatePt(room.playerStart, deg),
    doorSlots: room.doorSlots?.map((slot) => rederiveSlot(rotatePoint(slotLocalPoint(slot), deg))),
    enemies: room.enemies.map((enemy) => ({
      ...enemy,
      pos:          rotatePt(enemy.pos, deg),
      patrolTarget: enemy.patrolTarget  ? rotatePt(enemy.patrolTarget, deg)  : undefined,
      patrolAnchor: enemy.patrolAnchor  ? rotatePt(enemy.patrolAnchor, deg)  : undefined,
      homePos:      enemy.homePos       ? rotatePt(enemy.homePos, deg)       : undefined,
      spikeDir:     enemy.spikeDir      ? rotateVec(enemy.spikeDir, deg)     : undefined,
      patrolAxis:   enemy.patrolAxis    ? rotateVec(enemy.patrolAxis, deg)   : undefined,
    })),
    hazards: room.hazards.map((hazard) => ({
      ...hazard,
      pos:    rotatePt(hazard.pos, deg),
      dir:    hazard.dir ? rotateVec(hazard.dir, deg) : undefined,
      // Swap width/height for rectangular hazards on 90°/270° rotations.
      width:  swapDims && hazard.width !== undefined && hazard.height !== undefined ? hazard.height : hazard.width,
      height: swapDims && hazard.width !== undefined && hazard.height !== undefined ? hazard.width  : hazard.height,
    })),
    items: room.items.map((item) => ({
      ...item,
      pos: rotatePt(item.pos, deg),
    })),
  };
}

export function offsetRoomDefinition(room: RoomDefinition, instance: WorldRoomInstance): RoomDefinition {
  return {
    ...room,
    playerStart: localToWorld(instance, room.playerStart),
    enemies: room.enemies.map((enemy) => ({
      ...enemy,
      id: `${instance.id}-${enemy.id}`,
      pos: localToWorld(instance, enemy.pos),
      patrolTarget: enemy.patrolTarget ? localToWorld(instance, enemy.patrolTarget) : undefined,
      roomInstanceId: instance.id,
    })),
    hazards: room.hazards.map((hazard) => ({
      ...hazard,
      id: `${instance.id}-${hazard.id}`,
      pos: localToWorld(instance, hazard.pos),
      roomInstanceId: instance.id,
    })),
    items: room.items.map((item) => ({
      ...item,
      id: `${instance.id}-${item.id}`,
      pos: localToWorld(instance, item.pos),
      roomInstanceId: instance.id,
    })),
  };
}

export function ensureKeyItem(room: RoomDefinition, instance: WorldRoomInstance) {
  if (!instance.tags.includes('key')) return [];
  if (room.items.some((item) => item.type === 'key')) return [];
  const pos = findKeyPosition(room, instance);
  return [{
    id: `${instance.id}-key`,
    type: 'key' as const,
    pos,
    radius: 0.34,
    collected: false,
    roomInstanceId: instance.id,
  }];
}

function findKeyPosition(room: RoomDefinition, instance: WorldRoomInstance): Vec2 {
  const radius = 0.34;
  const candidateLocals: Vec2[] = [
    { x: 0, y: 0 },
    { x: 0, y: -2 },
    { x: 0, y: 2 },
    { x: -2, y: 0 },
    { x: 2, y: 0 },
    { x: -2, y: -2 },
    { x: 2, y: 2 },
    { x: -3, y: 2 },
    { x: 3, y: -2 },
  ];

  const halfW = Math.floor(instance.width / 2) - 1;
  const halfH = Math.floor(instance.height / 2) - 1;
  for (let y = -halfH; y <= halfH; y += 1) {
    for (let x = -halfW; x <= halfW; x += 1) {
      candidateLocals.push({ x, y });
    }
  }

  for (const local of candidateLocals) {
    const pos = localToWorld(instance, local);
    if (isKeyPositionClear(pos, radius, room, instance)) return pos;
  }
  return localToWorld(instance, { x: 0, y: 0 });
}

function isKeyPositionClear(pos: Vec2, radius: number, room: RoomDefinition, instance: WorldRoomInstance): boolean {
  const bounds = roomBounds(instance);
  if (pos.x < bounds.minX + 1 || pos.x > bounds.maxX - 1 || pos.y < bounds.minY + 1 || pos.y > bounds.maxY - 1) return false;

  for (const hazard of room.hazards) {
    if (hazard.radius !== undefined && dist(pos, hazard.pos) <= radius + hazard.radius + 0.45) return false;
    if (hazard.radius === undefined && overlapCircleRect(pos, radius + 0.15, hazard.pos, hazard.width ?? 1, hazard.height ?? 1)) return false;
  }
  for (const enemy of room.enemies) {
    if (dist(pos, enemy.pos) <= radius + enemy.radius + 0.65) return false;
  }
  for (const item of room.items) {
    if (dist(pos, item.pos) <= radius + item.radius + 0.45) return false;
  }
  return true;
}

function selectRoomsForMap(roomPool: RoomDefinition[], rng: Rng): RoomDefinition[] {
  const pool = roomPool.length >= 1 ? roomPool : ROOMS;
  const start = pool.find((room) => room.tags?.includes('start')) ?? pool[0];
  const key = pool.find((room) => room.tags?.includes('key') && room.id !== start.id) ?? pool.find((room) => room.id !== start.id) ?? start;
  const boss = pool.find((room) => room.tags?.includes('boss') && room.id !== start.id && room.id !== key.id)
    ?? [...pool].reverse().find((room) => room.id !== start.id && room.id !== key.id)
    ?? start;
  const pinned = new Set([start.id, key.id, boss.id]);
  const combatPool = [...pool.filter((room) => !pinned.has(room.id))].sort(() => rng() - 0.5);

  const takeCombat = (index: number) => combatPool[index % Math.max(1, combatPool.length)] ?? start;
  return [
    start,
    takeCombat(0),
    key,
    takeCombat(1),
    takeCombat(2),
    boss,
  ];
}

function connectsRooms(connection: WorldDoorConnection, a: string, b: string): boolean {
  return (connection.aRoomId === a && connection.bRoomId === b) || (connection.aRoomId === b && connection.bRoomId === a);
}

function seededRng(seed: number): Rng {
  let value = Math.max(1, Math.floor(seed) % 2147483647);
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
