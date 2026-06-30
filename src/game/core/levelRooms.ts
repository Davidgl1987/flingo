import roomDraft from '../levels/room-draft.json';
import fosos1 from '../levels/fosos1.json';
import { ROOMS } from './rooms';
import type { RoomDefinition } from './types';

export const SAVED_LEVEL_ROOMS: RoomDefinition[] = [
  roomDraft as RoomDefinition,
  fosos1 as RoomDefinition,
];

export const RUN_ROOM_POOL: RoomDefinition[] = [...ROOMS, ...SAVED_LEVEL_ROOMS];
