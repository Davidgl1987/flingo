/**
 * Tuning de mundo y run (salas, muros, puertas, estructura de la mazmorra)
 * — GDD, Apéndice. Valores validados por playtesting; no ajustar sin probar.
 */

// ── Mundo y run ───────────────────────────────────────────────────────────

export const ROOMS_PER_RUN = 6;
export const DOOR_WIDTH = 2.0;
export const WALL_THICKNESS = 0.42;
export const UPGRADE_CHOICES = 3;
export const ROOM_MIN_SIZE = 5;
export const ROOM_CLEAR_SCORE = 50;
/** Distancia al centro de una puerta (a lo largo de su eje) para considerar que el héroe la está tocando. */
export const DOOR_TOUCH_MARGIN = 1.1;
