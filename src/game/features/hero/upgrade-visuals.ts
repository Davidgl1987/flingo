/**
 * Funciones puras de "qué mostrar a qué nivel" para el feedback visual de
 * mejoras sobre el héroe (docs/plans/ECONOMY_PLAN.md F5): sin three.js ni
 * React, así se testean sin infraestructura de render 3D. `HeroView` las
 * llama en `useFrame`.
 */

/** Nº de pinchos visibles del Erizo de Acero (cuerpo-dano) por nivel: 0/4/8/12, repartidos en anillos ecuatoriales. */
export function spikeCountForLevel(level: number): number {
  const clamped = Math.max(0, Math.min(3, Math.floor(level)));
  return clamped * 4;
}

/**
 * Factor que amplifica el BONUS de estiramiento por velocidad de la Estela
 * de Cometa (cuerpo-velocidad): se aplica solo al término que ya depende de
 * la velocidad (nunca al "1" base del stretch), así a velocidad 0 el
 * estiramiento sigue siendo nulo sin importar el nivel. +15%/nivel.
 */
export function cometStretchFactor(level: number): number {
  return 1 + Math.max(0, level) * 0.15;
}

/**
 * Factor de escala visual extra del Canto Rodado (cuerpo-firmeza): +6%/nivel
 * sobre el mesh del héroe y sus adornos (pinchos/escudo). NUNCA se aplica a
 * `hero.radius` de la sim — esto es puramente cosmético.
 */
export function boulderScaleFactor(level: number): number {
  return 1 + Math.max(0, level) * 0.06;
}

/**
 * Opacidad de la Burbuja de Cuarzo según cargas de escudo activas: 0 sin
 * cargas (invisible), ligeramente más opaca cuantas más cargas, con tope en
 * 0.35 (GDD: opacidad ~0.25-0.35).
 */
export function shieldBubbleOpacity(charges: number): number {
  if (charges <= 0) return 0;
  return Math.min(0.35, 0.24 + charges * 0.03);
}
