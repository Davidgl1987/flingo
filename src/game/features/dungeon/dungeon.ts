/**
 * Mazmorra procedural (GDD §10.2): función pura y testeable que combina salas
 * de un pool en un mapa conectado por huecos de puerta alineados.
 *
 * SIN imports de React ni three.js. Determinista: toda aleatoriedad viene del
 * `Rng` creado a partir de la semilla (mulberry32, ver rng.ts).
 *
 * Estrategia de layout: en vez de "packing" espacial libre (que puede fallar
 * por solape entre salas de tamaños arbitrarios), el generador construye
 * primero una TOPOLOGÍA de grafo sobre una rejilla de celdas (una sala por
 * celda, aristas = puertas), garantizando por construcción:
 *   - conectividad total,
 *   - al menos un ciclo (bucle de 4 celdas),
 *   - el jefe como hoja terminal colgada del bucle,
 *   - la llave en una celda del bucle (nunca en la rama del jefe).
 * Después, cada sala se posiciona en el mundo alineando su hueco de puerta
 * exactamente con el de la sala vecina (se traduce la sala para que ambos
 * centros de puerta coincidan), lo que evita el solape sin necesidad de
 * "packing" iterativo. Si por alguna razón el pool no tiene salas suficientes
 * o compatibles, se cae a un `FALLBACK_LAYOUT` fijo y siempre válido.
 */

import { DOOR_WIDTH, ROOMS_PER_RUN, WALL_THICKNESS } from '@/game/world/constants';
import { type Rng, createRng } from '@/engine/rng';
import type { AABB, Vec2 } from '@/engine/geometry';
import type { DoorSide, DoorSlot, RoomData, RoomTag } from '@/game/world/types';

/** Hueco entre salas contiguas (además del grosor de muro de cada una). */
export const ROOM_GAP = WALL_THICKNESS;

/** Sala ya posicionada en coordenadas continuas de mundo. */
export interface PlacedRoom {
  /** Sala original (coordenadas locales, sin modificar). */
  room: RoomData;
  /** Desplazamiento sumado a toda coordenada local de la sala para obtener mundo. */
  origin: Vec2;
  /** AABB del interior jugable en coordenadas de MUNDO. */
  bounds: AABB;
  /** Índice de celda de la rejilla topológica (depuración/tests). */
  cell: { cx: number; cy: number };
}

/** Puerta entre dos salas contiguas: hueco físico + si requiere llave. */
export interface DoorConnection {
  roomAId: string;
  roomBId: string;
  /** Lado de A por el que se sale hacia B (el lado de B es el opuesto). */
  sideOnA: DoorSide;
  /** Centro del hueco de puerta en coordenadas de MUNDO. */
  center: Vec2;
  /** true si esta puerta es la de la sala del jefe (requiere llave para abrir). */
  requiresKey: boolean;
}

export interface DungeonMap {
  seed: number;
  rooms: PlacedRoom[];
  connections: DoorConnection[];
  startRoomId: string;
  bossRoomId: string;
  keyRoomId: string;
}

const OPPOSITE: Record<DoorSide, DoorSide> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

const DIR_OFFSET: Record<DoorSide, { dx: number; dy: number }> = {
  // +y en la sim = "sur" (ver world.ts); north = -y, south = +y.
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

// ── Topología de grafo sobre rejilla ──────────────────────────────────────

/** Nodo de la topología: celda de rejilla + papel narrativo (inicio/llave/jefe/combate). */
interface TopologyNode {
  cx: number;
  cy: number;
  role: RoomTag;
}

interface TopologyEdge {
  a: number; // índice en nodes
  b: number;
  side: DoorSide; // lado de `a` por el que sale hacia `b`
}

interface Topology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  startIndex: number;
  bossIndex: number;
  keyIndex: number;
}

/**
 * Construye una topología fija: un bucle de 4 celdas (garantiza el ciclo
 * exigido por el GDD) con el resto de salas de combate colgando del bucle, y
 * el jefe como hoja terminal en la última celda de la cadena. La llave se
 * coloca siempre en una celda del bucle distinta del inicio, nunca en el
 * camino hacia el jefe, así que es alcanzable sin pasar por él.
 *
 * Bucle (vista desde arriba, +y = sur):
 *   (0,0) -- (1,0)
 *     |        |
 *   (0,1) -- (1,1)
 *
 * Inicio en (0,0). Llave en (1,1) (diagonalmente opuesta, hay que rodear el
 * bucle para llegar). El jefe cuelga de (1,0) hacia el este, a través de
 * tantas salas de combate intermedias como haga falta para completar
 * ROOMS_PER_RUN.
 */
function buildTopology(roomCount: number): Topology {
  const nodes: TopologyNode[] = [
    { cx: 0, cy: 0, role: 'inicio' },
    { cx: 1, cy: 0, role: 'combate' },
    { cx: 1, cy: 1, role: 'llave' },
    { cx: 0, cy: 1, role: 'combate' },
  ];
  const edges: TopologyEdge[] = [
    { a: 0, b: 1, side: 'east' },
    { a: 1, b: 2, side: 'south' },
    { a: 2, b: 3, side: 'west' },
    { a: 3, b: 0, side: 'north' },
  ];

  // Cadena de combate + jefe colgando al este de (1,0).
  const tailLength = Math.max(1, roomCount - nodes.length);
  let prevIndex = 1; // (1,0), nodo del bucle del que cuelga la cola
  let cx = 2;
  for (let i = 0; i < tailLength; i++) {
    const isLast = i === tailLength - 1;
    const nodeIndex = nodes.length;
    nodes.push({ cx, cy: 0, role: isLast ? 'jefe' : 'combate' });
    edges.push({ a: prevIndex, b: nodeIndex, side: 'east' });
    prevIndex = nodeIndex;
    cx += 1;
  }

  const bossIndex = nodes.findIndex((n) => n.role === 'jefe');
  const keyIndex = nodes.findIndex((n) => n.role === 'llave');
  return { nodes, edges, startIndex: 0, bossIndex, keyIndex };
}

// ── Selección de salas del pool ────────────────────────────────────────────

function pickRoomForRole(
  pool: readonly RoomData[],
  role: RoomTag,
  used: Set<string>,
  rng: Rng,
): RoomData | null {
  let candidates = pool.filter((r) => r.tags.includes(role) && !used.has(r.id));
  if (role === 'jefe') {
    // GDD §15.1 punto 9: un pool de jefes, uno por partida — solo salas con
    // `boss` (framework de Fase B0) cuentan como sala de jefe "de verdad".
    // Si el pool aún no tiene ninguna (solo B0 implementado, sin B1-B4), cae
    // a cualquier sala 'jefe' sin `boss` (boss-den.json, sala de combate
    // duro heredada) para no romper la generación de mazmorras existente.
    const withBoss = candidates.filter((r) => r.boss !== undefined);
    candidates = withBoss.length > 0 ? withBoss : candidates;
  }
  if (candidates.length === 0) return null;
  const index = Math.floor(rng() * candidates.length);
  return candidates[index];
}

/** Sala de emergencia 9×9 sin hazards, con doorSlots en los 4 lados centrados: siempre válida. */
function makeFallbackRoom(id: string, name: string, tags: RoomTag[]): RoomData {
  return {
    version: 1,
    id,
    name,
    width: 9,
    height: 9,
    playerStart: { x: 0, y: 0 },
    tags,
    doorSlots: [
      { side: 'north', offset: 0 },
      { side: 'south', offset: 0 },
      { side: 'east', offset: 0 },
      { side: 'west', offset: 0 },
    ],
    enemies: [],
    hazards: [],
    items: [],
  };
}

function findDoorSlot(room: RoomData, side: DoorSide): DoorSlot | null {
  const slots = room.doorSlots.filter((s) => s.side === side);
  if (slots.length === 0) return null;
  return slots[0];
}

/** Centro (en el eje del lado) de un hueco de puerta en coordenadas LOCALES de la sala. */
function doorSlotLocalCenter(room: RoomData, slot: DoorSlot): Vec2 {
  const halfW = room.width / 2;
  const halfH = room.height / 2;
  switch (slot.side) {
    case 'north':
      return { x: slot.offset, y: -halfH };
    case 'south':
      return { x: slot.offset, y: halfH };
    case 'east':
      return { x: halfW, y: slot.offset };
    case 'west':
      return { x: -halfW, y: slot.offset };
  }
}

function roomAabbAt(room: RoomData, origin: Vec2): AABB {
  const halfW = room.width / 2;
  const halfH = room.height / 2;
  return {
    minX: origin.x - halfW,
    maxX: origin.x + halfW,
    minY: origin.y - halfH,
    maxY: origin.y + halfH,
  };
}

function aabbOverlaps(a: AABB, b: AABB, margin: number): boolean {
  return (
    a.minX - margin < b.maxX &&
    a.maxX + margin > b.minX &&
    a.minY - margin < b.maxY &&
    a.maxY + margin > b.minY
  );
}

/**
 * Intenta materializar la topología con salas reales del pool. Devuelve null
 * si no se pudo (pool insuficiente o solape irresoluble): el llamador
 * reintenta con otra selección o cae al fallback.
 */
function tryMaterialize(
  pool: readonly RoomData[],
  topology: Topology,
  rng: Rng,
): DungeonMap | null {
  const used = new Set<string>();
  const chosen: (RoomData | null)[] = topology.nodes.map((node) => {
    const picked = pickRoomForRole(pool, node.role, used, rng) ?? pickRoomForRole(pool, 'combate', used, rng);
    if (picked) used.add(picked.id);
    return picked;
  });

  if (chosen.some((r) => r === null)) return null;
  const rooms = chosen as RoomData[];

  // Todas las salas deben tener al menos un doorSlot en cada lado que la
  // topología va a usar; si falta, esta combinación no es materializable.
  const usesSide = new Map<number, Set<DoorSide>>();
  for (const edge of topology.edges) {
    if (!usesSide.has(edge.a)) usesSide.set(edge.a, new Set());
    if (!usesSide.has(edge.b)) usesSide.set(edge.b, new Set());
    usesSide.get(edge.a)!.add(edge.side);
    usesSide.get(edge.b)!.add(OPPOSITE[edge.side]);
  }
  for (const [nodeIndex, sides] of usesSide) {
    const room = rooms[nodeIndex];
    for (const side of sides) {
      if (!findDoorSlot(room, side)) return null;
    }
  }

  // BFS de colocación: parte del nodo de inicio en origen (0,0) y coloca cada
  // vecino traduciéndolo para que su hueco de puerta coincida exactamente con
  // el de la sala ya colocada (evita solape sistemáticamente).
  const origins: (Vec2 | null)[] = new Array(topology.nodes.length).fill(null);
  const adjacency = new Map<number, { neighbor: number; side: DoorSide }[]>();
  for (const edge of topology.edges) {
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, []);
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, []);
    adjacency.get(edge.a)!.push({ neighbor: edge.b, side: edge.side });
    adjacency.get(edge.b)!.push({ neighbor: edge.a, side: OPPOSITE[edge.side] });
  }

  origins[topology.startIndex] = { x: 0, y: 0 };
  const queue: number[] = [topology.startIndex];
  const visited = new Set<number>([topology.startIndex]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentOrigin = origins[current]!;
    const currentRoom = rooms[current];
    for (const { neighbor, side } of adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);

      const neighborRoom = rooms[neighbor];
      const slotOnCurrent = findDoorSlot(currentRoom, side)!;
      const slotOnNeighbor = findDoorSlot(neighborRoom, OPPOSITE[side])!;

      const doorWorldOnCurrent = {
        x: currentOrigin.x + doorSlotLocalCenter(currentRoom, slotOnCurrent).x,
        y: currentOrigin.y + doorSlotLocalCenter(currentRoom, slotOnCurrent).y,
      };
      const localDoorOnNeighbor = doorSlotLocalCenter(neighborRoom, slotOnNeighbor);

      // Traduce el vecino: su hueco de puerta debe caer exactamente en
      // doorWorldOnCurrent, además del hueco de separación entre salas a lo
      // largo del eje perpendicular al lado compartido.
      const dir = DIR_OFFSET[side];
      const gapAlongAxis = ROOM_GAP;
      const neighborOrigin: Vec2 = {
        x: doorWorldOnCurrent.x - localDoorOnNeighbor.x + dir.dx * gapAlongAxis,
        y: doorWorldOnCurrent.y - localDoorOnNeighbor.y + dir.dy * gapAlongAxis,
      };

      origins[neighbor] = neighborOrigin;
      queue.push(neighbor);
    }
  }

  if (origins.some((o) => o === null)) return null;

  const placedRooms: PlacedRoom[] = rooms.map((room, i) => {
    const origin = origins[i]!;
    return {
      room,
      origin,
      bounds: roomAabbAt(room, origin),
      cell: { cx: topology.nodes[i].cx, cy: topology.nodes[i].cy },
    };
  });

  // Validación de solape: ninguna sala (excepto vecinas directas, que se
  // tocan por diseño en el hueco de puerta) debe solaparse con otra.
  const neighborPairs = new Set<string>();
  for (const edge of topology.edges) {
    neighborPairs.add(`${edge.a}-${edge.b}`);
    neighborPairs.add(`${edge.b}-${edge.a}`);
  }
  for (let i = 0; i < placedRooms.length; i++) {
    for (let j = i + 1; j < placedRooms.length; j++) {
      if (neighborPairs.has(`${i}-${j}`)) continue;
      // Salas no vecinas: no deben solaparse (margen pequeño de tolerancia numérica).
      if (aabbOverlaps(placedRooms[i].bounds, placedRooms[j].bounds, -1e-6)) {
        return null;
      }
    }
  }
  // Salas vecinas: deben estar separadas exactamente por el hueco (sin solape del interior).
  for (const edge of topology.edges) {
    if (aabbOverlaps(placedRooms[edge.a].bounds, placedRooms[edge.b].bounds, -1e-6)) {
      return null;
    }
  }

  const connections: DoorConnection[] = topology.edges.map((edge) => {
    const currentRoom = rooms[edge.a];
    const slotOnCurrent = findDoorSlot(currentRoom, edge.side)!;
    const origin = origins[edge.a]!;
    const local = doorSlotLocalCenter(currentRoom, slotOnCurrent);
    return {
      roomAId: currentRoom.id,
      roomBId: rooms[edge.b].id,
      sideOnA: edge.side,
      center: { x: origin.x + local.x, y: origin.y + local.y },
      requiresKey: rooms[edge.b].tags.includes('jefe') || rooms[edge.a].tags.includes('jefe'),
    };
  });

  return {
    seed: 0, // el llamador rellena la semilla real
    rooms: placedRooms,
    connections,
    startRoomId: rooms[topology.startIndex].id,
    bossRoomId: rooms[topology.bossIndex].id,
    keyRoomId: rooms[topology.keyIndex].id,
  };
}

// ── Validaciones (GDD §10.2) ──────────────────────────────────────────────

function buildAdjacencyById(map: DungeonMap): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const room of map.rooms) adjacency.set(room.room.id, []);
  for (const conn of map.connections) {
    adjacency.get(conn.roomAId)!.push(conn.roomBId);
    adjacency.get(conn.roomBId)!.push(conn.roomAId);
  }
  return adjacency;
}

function bfsReachable(map: DungeonMap, startId: string, blockedId?: string): Set<string> {
  const adjacency = buildAdjacencyById(map);
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (next === blockedId) continue;
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

export interface DungeonValidation {
  valid: boolean;
  errors: string[];
}

/** Aplica las validaciones del GDD §10.2 sobre un mapa ya construido. */
export function validateDungeon(map: DungeonMap): DungeonValidation {
  const errors: string[] = [];

  // Todo alcanzable desde el inicio (sin restricción de llave: puertas
  // cerradas por "sala sin limpiar" se abren jugando; solo la del jefe exige
  // llave, y aun así cuenta como alcanzable topológicamente).
  const reachableAll = bfsReachable(map, map.startRoomId);
  for (const room of map.rooms) {
    if (!reachableAll.has(room.room.id)) {
      errors.push(`Sala inalcanzable: ${room.room.id}`);
    }
  }

  // El jefe solo debe ser alcanzable a través de la conexión marcada
  // requiresKey (no debe haber una ruta alternativa sin llave).
  const reachableWithoutBossDoor = bfsReachableExcludingKeyDoors(map, map.startRoomId);
  if (reachableWithoutBossDoor.has(map.bossRoomId)) {
    errors.push('El jefe es alcanzable sin cruzar la puerta que requiere llave.');
  }

  // La llave debe ser alcanzable sin pasar por el jefe.
  const reachableWithoutBoss = bfsReachable(map, map.startRoomId, map.bossRoomId);
  if (!reachableWithoutBoss.has(map.keyRoomId)) {
    errors.push('La llave no es alcanzable sin pasar por el jefe.');
  }

  // Sin solapes de salas no vecinas.
  const neighborPairs = new Set<string>();
  for (const conn of map.connections) {
    neighborPairs.add(`${conn.roomAId}-${conn.roomBId}`);
    neighborPairs.add(`${conn.roomBId}-${conn.roomAId}`);
  }
  for (let i = 0; i < map.rooms.length; i++) {
    for (let j = i + 1; j < map.rooms.length; j++) {
      const a = map.rooms[i];
      const b = map.rooms[j];
      const key = `${a.room.id}-${b.room.id}`;
      if (neighborPairs.has(key)) continue;
      if (aabbOverlaps(a.bounds, b.bounds, -1e-6)) {
        errors.push(`Solape entre salas: ${a.room.id} y ${b.room.id}`);
      }
    }
  }

  // Al menos un ciclo: aristas >= nodos (grafo conexo con ciclo).
  if (map.connections.length < map.rooms.length) {
    errors.push('El mapa no contiene ningún ciclo.');
  }

  return { valid: errors.length === 0, errors };
}

function bfsReachableExcludingKeyDoors(map: DungeonMap, startId: string): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const room of map.rooms) adjacency.set(room.room.id, []);
  for (const conn of map.connections) {
    if (conn.requiresKey) continue;
    adjacency.get(conn.roomAId)!.push(conn.roomBId);
    adjacency.get(conn.roomBId)!.push(conn.roomAId);
  }
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

// ── Fallback seguro ────────────────────────────────────────────────────────

/** Layout de emergencia: mismo bucle+cola pero con salas fabricadas al vuelo, siempre válido. */
function buildFallbackDungeon(seed: number, roomCount: number): DungeonMap {
  const topology = buildTopology(roomCount);
  const fallbackRooms = topology.nodes.map((node, i) =>
    makeFallbackRoom(`fallback-${i}`, `Sala ${i + 1}`, [node.role]),
  );
  const rng = createRng(seed);
  const map = tryMaterialize(fallbackRooms, topology, rng);
  if (!map) {
    // No debería ocurrir nunca (el fallback siempre es compatible): si pasa,
    // es un error de programación, no un caso de runtime a silenciar.
    throw new Error('El layout de emergencia de la mazmorra no es materializable (bug de generateDungeon).');
  }
  map.seed = seed;
  return map;
}

// ── Punto de entrada público ───────────────────────────────────────────────

const MAX_GENERATION_ATTEMPTS = 24;

/**
 * Genera una mazmorra determinista de `roomCount` salas (por defecto
 * ROOMS_PER_RUN) a partir de un `seed` y un `pool` de salas candidatas.
 * Garantiza las validaciones del GDD §10.2; si el pool no permite
 * materializar la topología tras varios intentos, cae al layout de
 * emergencia (siempre válido).
 */
export function generateDungeon(
  seed: number,
  pool: readonly RoomData[],
  roomCount: number = ROOMS_PER_RUN,
): DungeonMap {
  const rng = createRng(seed);
  const topology = buildTopology(roomCount);

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const map = tryMaterialize(pool, topology, rng);
    if (map) {
      map.seed = seed;
      const validation = validateDungeon(map);
      if (validation.valid) return map;
    }
  }

  return buildFallbackDungeon(seed, roomCount);
}

/** Ancho de puerta usado al construir los huecos de muro (GDD §10.2). */
export { DOOR_WIDTH };

// ── Muros con huecos de puerta (obstáculos de colisión) ───────────────────

/** Segmento de muro sólido (obstáculo de colisión) con un identificador estable. */
export interface WallSegment {
  id: string;
  aabb: AABB;
}

/**
 * Construye los segmentos de muro sólidos de una sala colocada, dejando un
 * hueco de `DOOR_WIDTH` centrado en cada posición de `openGapCenters` (huecos
 * de puerta abiertos: ni siquiera colisionan mientras estén abiertos) y
 * huecos de puerta CERRADOS representados como muro sólido normal (se tratan
 * como el resto del lado, sin hueco) — el llamador decide qué huecos pasar
 * como abiertos según el estado de juego (sala limpiada / llave).
 *
 * Un lado con un hueco abierto se parte en hasta 2 segmentos (izquierda y
 * derecha del hueco); con dos huecos abiertos, hasta 3 segmentos.
 */
export function buildRoomWallSegments(
  room: RoomData,
  origin: Vec2,
  openGapCenters: { side: DoorSide; offset: number }[],
): WallSegment[] {
  const halfW = room.width / 2;
  const halfH = room.height / 2;
  const t = WALL_THICKNESS;
  const halfDoor = DOOR_WIDTH / 2;
  const segments: WallSegment[] = [];

  const sides: { side: DoorSide; axisLen: number; center: Vec2; horizontal: boolean }[] = [
    { side: 'north', axisLen: room.width, center: { x: 0, y: -(halfH + t / 2) }, horizontal: true },
    { side: 'south', axisLen: room.width, center: { x: 0, y: halfH + t / 2 }, horizontal: true },
    { side: 'west', axisLen: room.height, center: { x: -(halfW + t / 2), y: 0 }, horizontal: false },
    { side: 'east', axisLen: room.height, center: { x: halfW + t / 2, y: 0 }, horizontal: false },
  ];

  for (const sideDef of sides) {
    const gaps = openGapCenters
      .filter((g) => g.side === sideDef.side)
      .map((g) => g.offset)
      .sort((a, b) => a - b);

    // Sin huecos abiertos en este lado: un único segmento sólido de punta a punta.
    if (gaps.length === 0) {
      segments.push(makeWallSegment(room.id, sideDef.side, 0, sideDef, halfW, halfH, t, origin));
      continue;
    }

    // Con huecos: recorre el eje del lado partiendo en segmentos sólidos
    // entre el borde/huecos anteriores, saltando el ancho de puerta en cada hueco.
    const axisHalf = sideDef.axisLen / 2;
    let cursor = -axisHalf;
    let segIndex = 0;
    for (const gapOffset of gaps) {
      const gapStart = gapOffset - halfDoor;
      const gapEnd = gapOffset + halfDoor;
      if (gapStart > cursor + 1e-9) {
        segments.push(
          makeWallSegmentRange(room.id, sideDef.side, segIndex++, sideDef, cursor, gapStart, t, origin),
        );
      }
      cursor = Math.max(cursor, gapEnd);
    }
    if (cursor < axisHalf - 1e-9) {
      segments.push(
        makeWallSegmentRange(room.id, sideDef.side, segIndex++, sideDef, cursor, axisHalf, t, origin),
      );
    }
  }

  return segments;
}

function makeWallSegment(
  roomId: string,
  side: DoorSide,
  index: number,
  sideDef: { center: Vec2; horizontal: boolean },
  halfW: number,
  halfH: number,
  t: number,
  origin: Vec2,
): WallSegment {
  const width = sideDef.horizontal ? halfW * 2 + 2 * t : t;
  const height = sideDef.horizontal ? t : halfH * 2 + 2 * t;
  return {
    id: `${roomId}-wall-${side}-${index}`,
    aabb: {
      minX: origin.x + sideDef.center.x - width / 2,
      maxX: origin.x + sideDef.center.x + width / 2,
      minY: origin.y + sideDef.center.y - height / 2,
      maxY: origin.y + sideDef.center.y + height / 2,
    },
  };
}

/** Segmento de muro entre dos posiciones a lo largo del eje del lado (para lados partidos por un hueco). */
function makeWallSegmentRange(
  roomId: string,
  side: DoorSide,
  index: number,
  sideDef: { center: Vec2; horizontal: boolean },
  axisStart: number,
  axisEnd: number,
  t: number,
  origin: Vec2,
): WallSegment {
  if (sideDef.horizontal) {
    return {
      id: `${roomId}-wall-${side}-${index}`,
      aabb: {
        minX: origin.x + sideDef.center.x + axisStart,
        maxX: origin.x + sideDef.center.x + axisEnd,
        minY: origin.y + sideDef.center.y - t / 2,
        maxY: origin.y + sideDef.center.y + t / 2,
      },
    };
  }
  return {
    id: `${roomId}-wall-${side}-${index}`,
    aabb: {
      minX: origin.x + sideDef.center.x - t / 2,
      maxX: origin.x + sideDef.center.x + t / 2,
      minY: origin.y + sideDef.center.y + axisStart,
      maxY: origin.y + sideDef.center.y + axisEnd,
    },
  };
}
