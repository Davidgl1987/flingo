import type { HazardState } from '../core/types';

export type FloorTile = {
  key: string;
  x: number;
  z: number;
};

export type PitRect = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function buildFloorTiles(width: number, height: number, hazards: HazardState[]): FloorTile[] {
  const pits = buildPitRects(width, height, hazards);
  const tiles: FloorTile[] = [];

  for (const x of buildTileCenters(width)) {
    for (const z of buildTileCenters(height)) {
      if (pits.some((pit) => pointInsidePit(x, z, pit))) continue;
      tiles.push({ key: `${x},${z}`, x, z });
    }
  }

  return tiles;
}

export function isPointInsideAnyPit(x: number, z: number, hazards: HazardState[], width: number, height: number, margin = 0): boolean {
  return buildPitRects(width, height, hazards).some((pit) => pointInsidePit(x, z, pit, margin));
}

export function buildPitRects(width: number, height: number, hazards: HazardState[]): PitRect[] {
  return hazards
    .filter((hazard) => hazard.type === 'pit')
    .map((hazard) => {
      const pitWidth = hazard.width ?? 1;
      const pitHeight = hazard.height ?? 1;
      return {
        minX: Math.max(-width / 2, hazard.pos.x - pitWidth / 2),
        maxX: Math.min(width / 2, hazard.pos.x + pitWidth / 2),
        minZ: Math.max(-height / 2, hazard.pos.y - pitHeight / 2),
        maxZ: Math.min(height / 2, hazard.pos.y + pitHeight / 2),
      };
    });
}

export function buildTileCenters(size: number): number[] {
  const halfTiles = Math.floor(size / 2);
  const centers: number[] = [];
  for (let value = -halfTiles; value <= halfTiles; value += 1) centers.push(value);
  return centers;
}

function pointInsidePit(x: number, z: number, pit: PitRect, margin = 0): boolean {
  return x > pit.minX - margin && x < pit.maxX + margin && z > pit.minZ - margin && z < pit.maxZ + margin;
}
