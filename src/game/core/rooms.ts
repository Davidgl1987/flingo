import type { HazardState, RoomDefinition } from './types';

const BASE_ROOMS: RoomDefinition[] = [
  {
    id: 'room-01',
    name: 'Sala 1: aprende a rebotar',
    width: 12,
    height: 8,
    playerStart: { x: -4.6, y: 0 },
    enemies: [
      { id: 'r1-dummy-a', type: 'dummy', pos: { x: 1.8, y: -1.6 }, radius: 0.42, hp: 2, maxHp: 2 },
      { id: 'r1-dummy-b', type: 'dummy', pos: { x: 3.6, y: 1.8 }, radius: 0.42, hp: 2, maxHp: 2 },
    ],
    hazards: [
      { id: 'r1-rock-a', type: 'rock', pos: { x: 0.2, y: 1.5 }, width: 1.2, height: 1.0 },
      { id: 'r1-barrel-a', type: 'barrel', pos: { x: 0.2, y: -1.6 }, radius: 0.42 },
    ],
    items: [
      { id: 'r1-coin-a', type: 'coin', pos: { x: -1.0, y: 2.6 }, radius: 0.32, collected: false },
    ],
  },
  {
    id: 'room-02',
    name: 'Sala 2: cuidado con el foso',
    width: 12,
    height: 8,
    playerStart: { x: -4.8, y: 0 },
    enemies: [
      { id: 'r2-chaser-a', type: 'chaser', pos: { x: 3.8, y: 2.0 }, radius: 0.45, hp: 3, maxHp: 3 },
      { id: 'r2-dummy-a', type: 'dummy', pos: { x: 2.2, y: -2.0 }, radius: 0.42, hp: 2, maxHp: 2 },
    ],
    hazards: [
      { id: 'r2-pit-a', type: 'pit', pos: { x: 0.7, y: 0 }, width: 2.4, height: 2.1 },
      { id: 'r2-spikes-a', type: 'spikes', pos: { x: -1.9, y: -2.7 }, width: 1.8, height: 0.6 },
      { id: 'r2-barrel-a', type: 'barrel', pos: { x: 3.9, y: -0.3 }, radius: 0.42 },
    ],
    items: [
      { id: 'r2-potion-a', type: 'potion', pos: { x: -1.6, y: 2.6 }, radius: 0.34, collected: false },
    ],
  },
  {
    id: 'room-03',
    name: 'Sala 3: pinchos direccionales',
    width: 13,
    height: 8.5,
    playerStart: { x: -5.0, y: 0 },
    enemies: [
      { id: 'r3-spike-a', type: 'spike', pos: { x: 1.4, y: 2.1 }, radius: 0.52, hp: 3, maxHp: 3, spikeDir: { x: -1, y: 0 } },
      { id: 'r3-spike-b', type: 'spike', pos: { x: 3.9, y: -1.8 }, radius: 0.52, hp: 3, maxHp: 3, spikeDir: { x: 0, y: 1 } },
      { id: 'r3-chaser-a', type: 'chaser', pos: { x: 4.7, y: 2.1 }, radius: 0.45, hp: 3, maxHp: 3 },
    ],
    hazards: [
      { id: 'r3-rock-a', type: 'rock', pos: { x: -0.7, y: -0.4 }, width: 1.0, height: 2.7 },
      { id: 'r3-boost-a', type: 'boost', pos: { x: -2.0, y: 2.2 }, width: 1.4, height: 0.8, dir: { x: 1, y: -0.15 } },
      { id: 'r3-slow-a', type: 'slow', pos: { x: 2.4, y: 0.3 }, width: 1.8, height: 1.4 },
    ],
    items: [
      { id: 'r3-coin-a', type: 'coin', pos: { x: -3.3, y: -2.9 }, radius: 0.32, collected: false },
    ],
  },
  {
    id: 'room-04',
    name: 'Sala 4: rastro peligroso',
    width: 13,
    height: 8.5,
    playerStart: { x: -5.0, y: -2.8 },
    enemies: [
      { id: 'r4-trail-a', type: 'trail', pos: { x: 0.5, y: 0.4 }, radius: 0.46, hp: 3, maxHp: 3 },
      { id: 'r4-trail-b', type: 'trail', pos: { x: 4.3, y: 2.5 }, radius: 0.46, hp: 3, maxHp: 3 },
      { id: 'r4-dummy-a', type: 'dummy', pos: { x: 3.7, y: -2.5 }, radius: 0.42, hp: 2, maxHp: 2 },
      { id: 'r4-shooter-a', type: 'shooter', pos: { x: -0.3, y: 2.8 }, radius: 0.46, hp: 3, maxHp: 3 },
    ],
    hazards: [
      { id: 'r4-pit-a', type: 'pit', pos: { x: -1.6, y: 0.2 }, width: 1.8, height: 3.0 },
      { id: 'r4-barrel-a', type: 'barrel', pos: { x: 1.8, y: -1.9 }, radius: 0.42 },
      { id: 'r4-spikes-a', type: 'spikes', pos: { x: 5.2, y: -0.1 }, width: 0.7, height: 2.0 },
    ],
    items: [
      { id: 'r4-potion-a', type: 'potion', pos: { x: -3.7, y: 2.8 }, radius: 0.34, collected: false },
      { id: 'r4-coin-a', type: 'coin', pos: { x: 2.4, y: 2.8 }, radius: 0.32, collected: false },
    ],
  },
  {
    id: 'room-05',
    name: 'Sala 5: mini prueba final',
    width: 14,
    height: 9,
    playerStart: { x: -5.6, y: 0 },
    enemies: [
      { id: 'r5-chaser-a', type: 'chaser', pos: { x: 3.8, y: 3.0 }, radius: 0.46, hp: 3, maxHp: 3 },
      { id: 'r5-chaser-b', type: 'chaser', pos: { x: 4.8, y: -3.0 }, radius: 0.46, hp: 3, maxHp: 3 },
      { id: 'r5-trail-a', type: 'trail', pos: { x: 0.0, y: 0.0 }, radius: 0.48, hp: 4, maxHp: 4 },
      { id: 'r5-spike-a', type: 'spike', pos: { x: 5.5, y: 0.0 }, radius: 0.55, hp: 4, maxHp: 4, spikeDir: { x: -1, y: 0 } },
      { id: 'r5-shooter-a', type: 'shooter', pos: { x: 2.2, y: 2.5 }, radius: 0.48, hp: 4, maxHp: 4 },
    ],
    hazards: [
      { id: 'r5-pit-a', type: 'pit', pos: { x: -1.6, y: 2.5 }, width: 2.1, height: 1.6 },
      { id: 'r5-pit-b', type: 'pit', pos: { x: 1.0, y: -2.3 }, width: 2.2, height: 1.6 },
      { id: 'r5-rock-a', type: 'rock', pos: { x: 1.4, y: 1.0 }, width: 1.0, height: 1.8 },
      { id: 'r5-barrel-a', type: 'barrel', pos: { x: 2.9, y: -0.9 }, radius: 0.42 },
      { id: 'r5-slow-a', type: 'slow', pos: { x: -3.6, y: -2.3 }, width: 1.5, height: 1.5 },
      { id: 'r5-boost-a', type: 'boost', pos: { x: -3.5, y: 2.5 }, width: 1.4, height: 0.7, dir: { x: 1, y: -0.3 } },
    ],
    items: [
      { id: 'r5-coin-a', type: 'coin', pos: { x: 0.1, y: 3.3 }, radius: 0.32, collected: false },
      { id: 'r5-potion-a', type: 'potion', pos: { x: -0.4, y: -3.3 }, radius: 0.34, collected: false },
    ],
  },
];

const rotateToPortrait = ({ x, y }: { x: number; y: number }) => ({ x: y, y: -x });
const snapToTile = ({ x, y }: { x: number; y: number }) => ({ x: Math.round(x), y: Math.round(y) });

function nextOddInteger(value: number): number {
  const integer = Math.ceil(value);
  return integer % 2 === 0 ? integer + 1 : integer;
}

function tileSpan(value: number | undefined): number {
  return Math.max(1, Math.round(value ?? 1));
}

function splitRectHazardToTiles(hazard: HazardState): HazardState[] {
  if (hazard.radius !== undefined) return [{ ...hazard, pos: snapToTile(hazard.pos) }];

  const width = tileSpan(hazard.width);
  const height = tileSpan(hazard.height);
  const center = snapToTile(hazard.pos);
  const startX = Math.round(center.x - (width - 1) / 2);
  const startY = Math.round(center.y - (height - 1) / 2);
  const tiles: HazardState[] = [];

  for (let xIndex = 0; xIndex < width; xIndex += 1) {
    for (let yIndex = 0; yIndex < height; yIndex += 1) {
      const suffix = width === 1 && height === 1 ? '' : `-${xIndex}-${yIndex}`;
      tiles.push({
        ...hazard,
        id: `${hazard.id}${suffix}`,
        pos: { x: startX + xIndex, y: startY + yIndex },
        width: 1,
        height: 1,
      });
    }
  }

  return tiles;
}

function makePortraitRoom(room: RoomDefinition): RoomDefinition {
  const rotatedHazards = room.hazards.map((hazard) => ({
    ...hazard,
    pos: rotateToPortrait(hazard.pos),
    width: hazard.height,
    height: hazard.width,
    dir: hazard.dir ? rotateToPortrait(hazard.dir) : undefined,
  }));

  return {
    ...room,
    width: nextOddInteger(room.height),
    height: nextOddInteger(room.width),
    playerStart: snapToTile(rotateToPortrait(room.playerStart)),
    enemies: room.enemies.map((enemy) => ({
      ...enemy,
      pos: snapToTile(rotateToPortrait(enemy.pos)),
      spikeDir: enemy.spikeDir ? rotateToPortrait(enemy.spikeDir) : undefined,
    })),
    hazards: rotatedHazards.flatMap(splitRectHazardToTiles),
    items: room.items.map((item) => ({
      ...item,
      pos: snapToTile(rotateToPortrait(item.pos)),
    })),
  };
}

export const ROOMS: RoomDefinition[] = BASE_ROOMS.map(makePortraitRoom);
