/**
 * Salas de serie. En fases posteriores el pool crecerá con salas exportadas
 * desde el editor (mismo formato RoomData, GDD §13).
 *
 * Coordenadas: origen en el centro de la sala (ver world.ts).
 */

import type { RoomData } from '../sim/world';

/**
 * Sala de prueba 9×13 con tres rocas colocadas para practicar carambolas:
 * dos laterales a media altura que estrechan el paso central y una superior
 * que protege el fondo (obliga a tiros con rebote).
 */
export const testRoom: RoomData = {
  version: 1,
  id: 'test-billar',
  name: 'Sala de Billar',
  width: 9,
  height: 13,
  playerStart: { x: 0, y: 4.6 },
  tags: ['inicio'],
  doorSlots: [],
  enemies: [],
  hazards: [
    { id: 'rock-oeste', kind: 'rock', position: { x: -2.4, y: 0.6 }, width: 1.6, height: 1.1 },
    { id: 'rock-este', kind: 'rock', position: { x: 2.5, y: -1.4 }, width: 1.1, height: 1.8 },
    { id: 'rock-norte', kind: 'rock', position: { x: -0.6, y: -4.2 }, width: 2.2, height: 1.0 },
  ],
  items: [],
};
