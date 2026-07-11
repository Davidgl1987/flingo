import { DOOR_WIDTH } from '@/game/content/constants';
import { parseRoomData } from '@/game/sim/room-format';
import type { RoomData, Vec2 } from '@/game/sim/world';
import { SIDE_LABEL } from './constants';

// ── Validaciones en vivo (GDD §13): parser común + reglas propias del editor ──

export function validateLive(room: RoomData): string[] {
  const result = parseRoomData(room);
  const errors = [...result.errors];
  const halfW = room.width / 2;
  const halfH = room.height / 2;

  const inside = (p: Vec2) => p.x >= -halfW && p.x <= halfW && p.y >= -halfH && p.y <= halfH;
  if (!inside(room.playerStart)) errors.push('El inicio del jugador está fuera de la sala.');
  for (const e of room.enemies) {
    if (!inside(e.position)) errors.push(`El enemigo "${e.id}" está fuera de la sala.`);
    if (e.patrolTarget && !inside(e.patrolTarget)) {
      errors.push(`El destino de patrulla de "${e.id}" está fuera de la sala.`);
    }
  }
  for (const h of room.hazards) {
    if (!inside(h.position)) errors.push(`El hazard "${h.id}" está fuera de la sala.`);
  }
  for (const i of room.items) {
    if (!inside(i.position)) errors.push(`El objeto "${i.id}" está fuera de la sala.`);
  }
  for (const slot of room.doorSlots) {
    const axisHalf = (slot.side === 'north' || slot.side === 'south' ? room.width : room.height) / 2;
    if (Math.abs(slot.offset) + DOOR_WIDTH / 2 > axisHalf) {
      errors.push(`El hueco de puerta ${SIDE_LABEL[slot.side]} (${slot.offset}) se sale del muro.`);
    }
  }
  return errors;
}
