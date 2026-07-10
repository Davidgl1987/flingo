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
  'enemy-hit': { color: '#ffffff', size: 0.08, count: 8, life: 0.25, speed: 2.6, trauma: 0.06 },
  // Golpe a un JEFE (playtest 2026-07-10): shake grande, escalado por daño en
  // reactToEvent.ts — mucho más notorio que un enemigo pequeño (enemy-hit).
  'boss-hit': { color: '#ffffff', size: 0.1, count: 10, life: 0.28, speed: 2.8, trauma: 0.35 },
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
  // ── Jefes (GDD §15) ──────────────────────────────────────────────────────
  'boss-door-sealed': NONE,
  'boss-phase-changed': { color: '#fff2c9', size: 0.12, count: 18, life: 0.4, speed: 2.6, trauma: 0.25 },
  'boss-telegraph': NONE,
  // Clímax de la run (GDD §15.1 punto 8): la mayor combinación de partículas
  // + sacudida de cámara + pausa de impacto del juego (reactToEvent.ts añade
  // el hit-stop más largo, ver STRONG_HIT_DAMAGE_THRESHOLD / triggerHitStop).
  'boss-defeated': { color: '#ffd166', size: 0.22, count: 64, life: 0.9, speed: 4.2, trauma: 1 },
  // Guardián de Canto (GDD §15.2): rastro de polvo pétreo tenue mientras
  // carga (burst pequeño y frecuente, no debe saturar el pool a 60Hz) y
  // estallido de esquirlas más grande/anguloso en el punto de impacto.
  'boss-charge-dust': { color: '#8d8367', size: 0.07, count: 3, life: 0.35, speed: 0.6, trauma: 0 },
  'boss-shard-burst': { color: '#c9c2a8', size: 0.1, count: 16, life: 0.4, speed: 2.8, trauma: 0.18 },
  // Barriles rodantes (playtest 2026-07-06): la APARICIÓN es el inicio de la
  // caída del cielo (surge la sombra creciente, el barril aún está arriba), así
  // que sin burst propio (NONE) — el polvo va en el ATERRIZAJE ('boss-barrel-land').
  'boss-barrel-spawn': NONE,
  // Aterrizaje del barril caído (playtest 2026-07-06): burst de polvo pétreo a
  // ras de suelo + un pelín de trauma de cámara, para que el impacto contra el
  // suelo se sienta (el rebote visual del cuerpo lo hace el render).
  'boss-barrel-land': { color: '#a89a76', size: 0.11, count: 14, life: 0.4, speed: 2.2, trauma: 0.14 },
  // Arrollar un barril con la carga ya dispara 'barrel-explosion' (su propio
  // burst grande); este evento es puramente informativo para juice/HUD sobre
  // el aturdimiento largo, sin burst propio (NONE) para no duplicar partículas.
  'boss-barrel-charge-stun': NONE,
  // Reina del Enjambre (GDD §15.3): burst pequeño y verdoso (mismo lenguaje
  // que el Trail, trailMaterial) en el punto de invocación, sin trauma de
  // cámara (no es un golpe, es un aviso ambiental de "ruido nuevo en la sala").
  'boss-wave-spawn': { color: '#4dd68a', size: 0.09, count: 10, life: 0.35, speed: 2.0, trauma: 0 },
  // Reina del Enjambre, rediseño 2026-07-10 (GDD §15.3): columnas de piedra
  // (mismo lenguaje visual pétreo que los eventos del Guardián, 'boss-shard-burst'/
  // 'boss-barrel-land'). Agrietarse: astillas pequeñas, trauma leve (aviso, aún
  // no rompe nada). Romperse: burst mayor + trauma notorio (−12% de vida del jefe).
  'boss-column-cracked': { color: '#c9c2a8', size: 0.08, count: 10, life: 0.35, speed: 2.0, trauma: 0.12 },
  'boss-column-broken': { color: '#c9c2a8', size: 0.14, count: 26, life: 0.5, speed: 3.2, trauma: 0.3 },
  'boss-columns-cleared': { color: '#ff6bcb', size: 0.16, count: 34, life: 0.7, speed: 3.6, trauma: 0.5 },
};

/** Color de burst específico por tipo de objeto recogido (label del evento 'item-pickup'), GDD §12: dorado/rosa/azul. */
export const ITEM_PICKUP_COLOR: Record<string, string> = {
  coin: '#ffd166',
  potion: '#ff6bcb',
  key: '#8fe3ff',
};
