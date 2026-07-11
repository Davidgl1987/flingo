/**
 * Tuning del héroe: cuerpo, lanzamiento corporal e input de puntería — GDD, Apéndice.
 * Valores validados por playtesting; no ajustar sin probar.
 */

// ── Héroe ─────────────────────────────────────────────────────────────────

export const HERO_RADIUS = 0.38;
export const HERO_START_HP = 5;
export const HERO_MAX_HP = 9;
/** Velocidad de salida del lanzamiento corporal a fuerza 0 (u/s). */
export const LAUNCH_SPEED_MIN = 3.6;
/** Velocidad de salida del lanzamiento corporal a fuerza 1 (u/s). */
export const LAUNCH_SPEED_MAX = 7.5;

export const BODY_LAUNCH_COOLDOWN = 0.2;

// ── Input / puntería ──────────────────────────────────────────────────────

/** Longitud de arrastre que equivale a fuerza 100% (u de mundo). */
export const MAX_DRAG_DISTANCE = 2.8;
/** Fuerza mínima: por debajo el tiro se cancela con aviso. */
export const MIN_LAUNCH_FORCE = 0.08;
