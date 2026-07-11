import type { RoomData } from '@/game/sim/world';

export function defaultRoom(): RoomData {
  return {
    version: 1,
    id: 'mi-sala',
    name: 'Mi Sala',
    width: 9,
    height: 9,
    playerStart: { x: 0, y: 3 },
    tags: ['combate'],
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

export function snap(v: number): number {
  return Math.round(v * 2) / 2;
}

export function nextId(prefix: string, existing: { id: string }[]): string {
  let n = 1;
  const ids = new Set(existing.map((e) => e.id));
  while (ids.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
