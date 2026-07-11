// ── Navegación de IA (steering local con evitación) ───────────────────────

/** Distancia de sondeo (raycast corto) por delante del enemigo para detectar obstáculos/hazards. */
export const AI_AVOID_LOOKAHEAD = 0.9;
/** Ángulo (rad) de desvío aplicado cuando el sondeo frontal detecta bloqueo. */
export const AI_AVOID_STEER_ANGLE = Math.PI / 3;
/** Margen extra sobre el radio del enemigo al comprobar bloqueo contra AABBs. */
export const AI_AVOID_SKIN = 0.12;
