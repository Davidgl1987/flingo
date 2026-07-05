/**
 * Tabla de burst por tipo de evento (GDD §12): color/tamaño/cantidad/duración
 * de partículas y trauma de cámara asociado. Única fuente de estos valores
 * para que particles.ts y CameraRig no dupliquen tuning.
 *
 * Colores alineados con la paleta de render/assets.ts (mismo lenguaje visual
 * entidad↔efecto): dorado = objetos/monedas, rosa = curación/muerte, azul =
 * lanzamiento/escudo, naranja = explosión, blanco = impacto, rojo = daño.
 */

import type { GameEventType } from '../sim/events';

export interface BurstSpec {
  /** Color hex de las partículas. */
  color: string;
  /** Radio base de cada partícula (mundo). */
  size: number;
  /** Nº de partículas del burst (antes de escalar por intensidad). */
  count: number;
  /** Vida de cada partícula (s). */
  life: number;
  /** Velocidad base de expansión (u/s). */
  speed: number;
  /** Trauma de cámara añadido [0,1] (antes de escalar por intensidad). */
  trauma: number;
}

const NONE: BurstSpec = { color: '#ffffff', size: 0, count: 0, life: 0, speed: 0, trauma: 0 };

/** Burst por defecto para cada tipo de evento; los que no generan feedback visual propio quedan en NONE (count 0). */
export const BURST_BY_EVENT: Record<GameEventType, BurstSpec> = {
  launch: { color: '#54c7ff', size: 0.09, count: 10, life: 0.3, speed: 2.2, trauma: 0.06 },
  'wall-bounce': { color: '#c7ccdf', size: 0.06, count: 5, life: 0.22, speed: 1.6, trauma: 0.08 },
  'enemy-hit': { color: '#ffffff', size: 0.08, count: 8, life: 0.25, speed: 2.6, trauma: 0.14 },
  'enemy-died': { color: '#ff6bcb', size: 0.12, count: 22, life: 0.5, speed: 3.4, trauma: 0.22 },
  'player-damaged': { color: '#ff3b3b', size: 0.1, count: 14, life: 0.35, speed: 2.8, trauma: 0.32 },
  'player-died': { color: '#ff3b3b', size: 0.14, count: 26, life: 0.6, speed: 3.2, trauma: 0.5 },
  'shield-block': { color: '#8fe3ff', size: 0.09, count: 12, life: 0.3, speed: 2.4, trauma: 0.12 },
  'pit-fall': NONE,
  'pit-respawn': NONE,
  'spikes-hit': { color: '#ff3b3b', size: 0.08, count: 10, life: 0.3, speed: 2.4, trauma: 0.2 },
  // speed×life ≈ alcance visual de las partículas: mantenerlo ≈ BARREL_BLAST_RADIUS
  // (2.4) para que la explosión visual no prometa daño donde no lo hay.
  'barrel-explosion': { color: '#ff9f45', size: 0.2, count: 48, life: 0.65, speed: 3.7, trauma: 1 },
  'item-pickup': { color: '#ffd166', size: 0.07, count: 9, life: 0.28, speed: 1.8, trauma: 0 },
  'room-cleared': NONE,
  'upgrade-applied': { color: '#54c7ff', size: 0.09, count: 14, life: 0.4, speed: 2.0, trauma: 0 },
  'room-entered': NONE,
  'doors-open': NONE,
  'door-locked': NONE,
  victory: { color: '#ffd166', size: 0.15, count: 40, life: 0.8, speed: 3.0, trauma: 0.3 },
};

/** Color de burst específico por tipo de objeto recogido (label del evento 'item-pickup'), GDD §12: dorado/rosa/azul. */
export const ITEM_PICKUP_COLOR: Record<string, string> = {
  coin: '#ffd166',
  potion: '#ff6bcb',
  key: '#8fe3ff',
};
