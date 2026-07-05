/**
 * Traduce un GameEvent de la sim en reacciones de juice: burst de partículas,
 * trauma de cámara, hit-stop y háptica. Se llama una vez por evento drenado
 * desde el mismo `drainEvents` de useGameLoop.ts (la cola solo se puede
 * drenar una vez por frame; centralizar aquí evita un segundo consumidor).
 *
 * Función pura respecto a sus argumentos explícitos (solo muta los pools y
 * el JuiceState recibidos); no importa React ni three.js.
 */

import type { GameEvent } from '../sim/events';
import { BURST_BY_EVENT, ITEM_PICKUP_COLOR } from './burstTable';
import { vibrate, HAPTIC_PATTERN } from './haptics';
import { addTrauma, triggerHitStop, type JuiceState } from './juiceState';
import type { ParticlePool } from './particles';
import type { ShockwavePool } from './shockwave';

/** Duración de hit-stop (s) en golpes fuertes: embestida con daño ≥2, explosión, muerte de enemigo. */
const HIT_STOP_DURATION = 0.08;
/**
 * Duración de hit-stop del clímax de derrota de jefe (GDD §15.1 punto 8: "la
 * mayor... pausa de impacto de todo el juego"): más larga que cualquier otro
 * hit-stop del juego a propósito.
 */
const BOSS_DEFEATED_HIT_STOP_DURATION = 0.22;
/** Umbral de daño de embestida/impacto para considerar "golpe fuerte" (GDD/consigna de la tarea). */
const STRONG_HIT_DAMAGE_THRESHOLD = 2;

function hexToRgb01(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

export function reactToEvent(
  event: GameEvent,
  particles: ParticlePool,
  juice: JuiceState,
  shockwaves: ShockwavePool | null = null,
  rng: () => number = Math.random,
): void {
  const spec = BURST_BY_EVENT[event.type];

  // Onda expansiva de la explosión de barril (GDD §12: "gran onda"): el
  // evento trae el radio de la explosión como intensidad.
  if (event.type === 'barrel-explosion' && shockwaves !== null) {
    shockwaves.spawn(event.x, event.y, Math.max(1, event.intensity));
  }

  // Color especial de recogida (dorado/rosa/azul) según el tipo de objeto.
  let color = spec.color;
  if (event.type === 'item-pickup' && event.label in ITEM_PICKUP_COLOR) {
    color = ITEM_PICKUP_COLOR[event.label];
  }

  if (spec.count > 0) {
    const [r, g, b] = hexToRgb01(color);
    // La intensidad del evento (fuerza de lanzamiento, velocidad de impacto,
    // daño...) escala moderadamente el tamaño del burst sin descontrolar el pool.
    const scale = event.type === 'launch' || event.type === 'wall-bounce' ? Math.max(0.4, event.intensity) : 1;
    particles.burst(
      event.x,
      event.y,
      Math.round(spec.count * (event.type === 'barrel-explosion' ? 1 : Math.min(1.6, 0.6 + scale * 0.5))),
      spec.speed,
      spec.size,
      spec.life,
      r,
      g,
      b,
      rng,
    );
  }

  if (spec.trauma > 0) {
    const intensityScale =
      event.type === 'wall-bounce' ? Math.min(1.5, Math.max(0.3, event.intensity / 4)) : 1;
    addTrauma(juice, spec.trauma * intensityScale);
  }

  // Hit-stop: golpes fuertes (embestida/impacto con daño ≥2), explosión de barril, muerte de enemigo.
  const isStrongHit =
    (event.type === 'enemy-hit' || event.type === 'player-damaged') && event.intensity >= STRONG_HIT_DAMAGE_THRESHOLD;
  if (isStrongHit || event.type === 'barrel-explosion' || event.type === 'enemy-died') {
    triggerHitStop(juice, HIT_STOP_DURATION);
  }
  // Clímax de derrota de jefe (GDD §15.1 punto 8): hit-stop propio, más largo
  // que el resto del juego a propósito (ver BOSS_DEFEATED_HIT_STOP_DURATION).
  if (event.type === 'boss-defeated') {
    triggerHitStop(juice, BOSS_DEFEATED_HIT_STOP_DURATION);
  }

  // Háptica (GDD §12/ARCHITECTURE "Móvil"): daño recibido, explosión, victoria.
  if (event.type === 'player-damaged') {
    vibrate(HAPTIC_PATTERN.damage);
  } else if (event.type === 'barrel-explosion') {
    vibrate([...HAPTIC_PATTERN.explosion]);
  } else if (event.type === 'victory' || event.type === 'boss-defeated') {
    vibrate([...HAPTIC_PATTERN.victory]);
  }
}
