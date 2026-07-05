/**
 * Salas de serie. En fases posteriores el pool crecerá con salas exportadas
 * desde el editor (mismo formato RoomData, GDD §13).
 *
 * Coordenadas: origen en el centro de la sala (ver world.ts). +y = sur
 * (hacia la cámara). El jugador empieza al sur y los peligros crecen hacia
 * el norte.
 */

import boossDenJson from '../../levels/boss-den.json';
import bossTestJson from '../../levels/boss-test.json';
import combatArenaJson from '../../levels/combat-arena.json';
import combatCrossroadsJson from '../../levels/combat-crossroads.json';
import combatSpikefieldJson from '../../levels/combat-spikefield.json';
import keyVaultJson from '../../levels/key-vault.json';
import startHallJson from '../../levels/start-hall.json';
import { parseRoomData } from '../sim/room-format';
import type { RoomData } from '../sim/world';

/**
 * Sala de pruebas de fase 2 (11×15): contiene los 5 arquetipos de enemigo,
 * 1 foso, pinchos, 2 barriles (a distancia de cadena), barro, un acelerador
 * apuntando al norte, 2 monedas, 1 poción y 1 llave.
 *
 * Distribución (de sur a norte):
 * - Sur: inicio del jugador, flanqueado por monedas y una zona de barro.
 * - Centro: acelerador que lanza hacia el norte, Dummy y Trail patrullando,
 *   rocas para carambolas, y el Spike custodiando el paso central.
 * - Norte: foso central, pareja de barriles, Chaser y Shooter al fondo,
 *   pinchos en el flanco oeste, poción y llave en las esquinas.
 */
export const testRoom: RoomData = {
  version: 1,
  id: 'test-fase-2',
  name: 'Sala de Pruebas',
  width: 11,
  height: 15,
  playerStart: { x: 0, y: 6 },
  tags: ['inicio', 'combate'],
  doorSlots: [],
  enemies: [
    { id: 'dummy-1', kind: 'dummy', position: { x: -3, y: 2 }, patrolTarget: { x: -3, y: 4 } },
    { id: 'chaser-1', kind: 'chaser', position: { x: 3, y: -5 } },
    {
      id: 'spike-1',
      kind: 'spike',
      position: { x: 0, y: -1 },
      patrolTarget: { x: -2, y: -1 },
      facing: { x: 0, y: 1 },
    },
    { id: 'trail-1', kind: 'trail', position: { x: 3.5, y: 1.5 }, patrolTarget: { x: 3.5, y: 4 } },
    { id: 'shooter-1', kind: 'shooter', position: { x: -3.5, y: -5.5 } },
  ],
  hazards: [
    { id: 'rock-1', kind: 'rock', position: { x: -2, y: -3 }, width: 1.2, height: 1.2 },
    { id: 'rock-2', kind: 'rock', position: { x: 2.2, y: 2.2 }, width: 1.4, height: 1.0 },
    { id: 'pit-1', kind: 'pit', position: { x: 0, y: -4 }, width: 1.6, height: 1.6 },
    { id: 'spikes-1', kind: 'spikes', position: { x: -4, y: 0 }, width: 1.4, height: 1.4 },
    { id: 'barrel-1', kind: 'barrel', position: { x: 2, y: -2 }, width: 0.8, height: 0.8 },
    { id: 'barrel-2', kind: 'barrel', position: { x: 3.2, y: -2.4 }, width: 0.8, height: 0.8 },
    { id: 'mud-1', kind: 'slow', position: { x: -2, y: 5 }, width: 2, height: 1.6 },
    {
      id: 'boost-1',
      kind: 'boost',
      position: { x: 0, y: 3 },
      width: 1.2,
      height: 2,
      direction: { x: 0, y: -1 },
    },
  ],
  items: [
    { id: 'coin-1', kind: 'coin', position: { x: -4.5, y: 6 } },
    { id: 'coin-2', kind: 'coin', position: { x: 4.5, y: 6 } },
    { id: 'potion-1', kind: 'potion', position: { x: 4.5, y: -6.5 } },
    { id: 'key-1', kind: 'key', position: { x: -4.5, y: -6.5 } },
  ],
};

// ── Pool de salas de serie (GDD §10.2/§13) ────────────────────────────────
//
// Cargadas desde src/levels/*.json y validadas con el mismo parser que usa
// el editor para importar/exportar (room-format.ts): si un JSON de serie
// estuviera mal formado, falla aquí en tiempo de carga del módulo (arranque
// del juego), no en mitad de una run.

const SERIES_LEVEL_JSON: readonly unknown[] = [
  startHallJson,
  combatCrossroadsJson,
  combatSpikefieldJson,
  combatArenaJson,
  keyVaultJson,
  boossDenJson,
];

/**
 * `boss-test.json` (jefe de pruebas trivial, Fase B0 de docs/plans/BOSSES_PLAN.md
 * y GDD §15): valida el framework de jefes end-to-end, pero NO es un jefe de
 * diseño (B1-B4 lo son). Solo entra al pool en dev/tests (`import.meta.env.DEV`,
 * true también bajo vitest); en una build de producción con al menos un jefe
 * de diseño ya en el pool, este nunca se sortea porque `pickRoomForRole`
 * (sim/dungeon.ts) prefiere salas 'jefe' con `boss` — y de haber varias,
 * elige entre TODAS con la misma probabilidad, así que hay que excluirlo
 * explícitamente aquí en vez de confiar en esa preferencia.
 */
const DEV_ONLY_LEVEL_JSON: readonly unknown[] = [bossTestJson];

function loadSeriesRooms(): RoomData[] {
  const jsons = import.meta.env.DEV ? [...SERIES_LEVEL_JSON, ...DEV_ONLY_LEVEL_JSON] : SERIES_LEVEL_JSON;
  const rooms: RoomData[] = [];
  for (const json of jsons) {
    const result = parseRoomData(json);
    if (!result.valid || !result.room) {
      throw new Error(`Sala de serie inválida en src/levels: ${result.errors.join('; ')}`);
    }
    rooms.push(result.room);
  }
  return rooms;
}

/** Salas de serie ya validadas (base del pool del generador procedural). */
export const seriesRooms: RoomData[] = loadSeriesRooms();

/**
 * Pool completo para `generateDungeon`: salas de serie + salas exportadas
 * desde el editor (localStorage, ver src/editor/). Función (no constante)
 * porque el pool del editor puede crecer en tiempo de ejecución sin recargar
 * la página.
 */
export function getRoomPool(): RoomData[] {
  return [...seriesRooms, ...loadEditorExportedRooms()];
}

const EDITOR_ROOMS_STORAGE_KEY = 'flingo-editor-exported-rooms';

/** Salas que el editor ha exportado a localStorage (además de descargar el .json). */
function loadEditorExportedRooms(): RoomData[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(EDITOR_ROOMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const rooms: RoomData[] = [];
    for (const entry of parsed) {
      const result = parseRoomData(entry);
      if (result.valid && result.room) rooms.push(result.room);
    }
    return rooms;
  } catch {
    return [];
  }
}
