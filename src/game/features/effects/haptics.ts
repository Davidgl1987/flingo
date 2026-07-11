/**
 * Vibración háptica (GDD §12/ARCHITECTURE "Móvil"): navigator.vibrate corto
 * en eventos fuertes, con guard de soporte (no todos los navegadores/OS lo
 * exponen; iOS Safari no lo soporta en absoluto, por eso el guard es
 * silencioso y nunca lanza).
 */

/** Duraciones (ms) por caso de uso, GDD §12: daño recibido, explosión, victoria. */
export const HAPTIC_PATTERN = {
  damage: 40,
  explosion: [30, 30, 60],
  victory: [20, 40, 20, 40, 60],
} as const;

function supportsVibration(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function vibrate(pattern: number | number[]): void {
  if (!supportsVibration()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Guard de soporte: algunos navegadores exponen la función pero lanzan
    // si se llama fuera de un gesto de usuario. Nunca debe romper el juego.
  }
}
