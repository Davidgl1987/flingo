// ── Guardián de Canto (GDD §15.2, Fase B1) ────────────────────────────────

/** Vida máxima (GDD §15.6). */
export const GUARDIAN_MAX_HP = 40;
/** Velocidad de patrulla perimetral, lenta (u/s). */
export const GUARDIAN_PATROL_SPEED = 1.1;
/** Distancia a la que detecta al héroe y empieza el telegraph de carga (u). */
export const GUARDIAN_DETECT_RANGE = 4.5;
/** Duración del aviso de carga: brillo/vibración (GDD §15.2, mínimo 0.6s del framework). */
export const GUARDIAN_TELEGRAPH_DURATION = 0.8;
/** Velocidad de la carga recta (u/s): notablemente más rápida que su patrulla. */
export const GUARDIAN_CHARGE_SPEED = 7.5;
/** Duración máxima de una carga antes de abortar por seguridad si no choca con nada (s). */
export const GUARDIAN_CHARGE_MAX_DURATION = 2.5;
/** Aturdimiento tras chocar contra roca/pared: su ventana de vulnerabilidad (GDD §15.6). */
export const GUARDIAN_STUN_DURATION = 1.4;
/**
 * Daño de la carga al golpear al héroe, fases 1-2 (GDD §15.6: bajado de 2→1
 * tras playtest 2026-07-06; fase 3 baja igualmente de 3→2). El techo de daño
 * de jefe (GUARDIAN_HIT_DAMAGE_CAP_FRACTION) sigue aplicando por encima.
 */
export const GUARDIAN_CHARGE_DAMAGE_PHASE1 = 1;
export const GUARDIAN_CHARGE_DAMAGE_PHASE3 = 2;
/** Fracción del daño del ARMA que recibe el Guardián mientras NO está aturdido (playtest 2026-07-10: "sin aturdir apenas hace daño, pero que se note si mejoras el arma"). Multiplica el daño real del arma/embestida/proyectil (así las mejoras de daño siguen escalando), a diferencia de un valor fijo. Aturdido = daño completo (factor 1, gestionado por la ventana de vulnerabilidad). El barril (GUARDIAN_BARREL_DAMAGE_FRACTION) sigue siendo el mayor. */
export const GUARDIAN_DAMAGE_OUTSIDE_WINDOW = 0.2;
/** Empujón fuerte al héroe si la carga le golpea (u/s). */
export const GUARDIAN_CHARGE_KNOCKBACK_SPEED = 6.5;
/** Cooldown de patrulla tras recuperarse del aturdimiento antes de poder detectar de nuevo (s). */
export const GUARDIAN_RECOVER_PAUSE = 0.4;
/**
 * Distancia mínima despejada (u) exigida en la dirección hacia el héroe antes
 * de telegrafiar una carga (GDD §15.2, playtest 2026-07-06 "sigue
 * atascándose"): si hay un sólido (roca/muro) a menos de esta distancia en
 * línea hacia el héroe, el Guardián NO carga — se estrellaría al instante,
 * a bocajarro del héroe, que le pegaría gratis mientras vuelve a cargar
 * contra la misma roca (camping). En su lugar reposiciona (ver
 * `guardianStepPatrolMove`) y reintenta cada tick. Algo mayor que
 * GUARDIAN_RADIUS (0.62) para dejar margen real de carga, no solo evitar
 * el contacto inmediato.
 */
export const GUARDIAN_MIN_CHARGE_CLEARANCE = 2.7;
/** Fase 2 (66%): pausa corta entre las dos cargas encadenadas (s). */
export const GUARDIAN_DOUBLE_CHARGE_PAUSE = 0.5;
/** Nº de cargas encadenadas en fase 2/3 (una pausa corta entre ambas). */
export const GUARDIAN_PHASE2_CHARGE_COUNT = 2;
/** Cadencia de partículas de polvo mientras carga (s entre spawns). */
export const GUARDIAN_DUST_INTERVAL = 0.05;
/**
 * Fase 3 (33%): campo de esquirlas al chocar una carga contra roca/pared.
 * Reutiliza el pool de charcos del Trail (sim/hazards.ts::stepPuddles), cuyo
 * daño de contacto al héroe está fijo en 1 (mismo valor pedido por el GDD
 * para las esquirlas) — no hay una constante de daño propia porque
 * `stepPuddles` no la parametriza (es genérica para cualquier `Puddle`,
 * Trail incluido); si el framework de charcos se ampliara a daño variable,
 * este sería el valor a pasar.
 */
export const GUARDIAN_SHARD_RADIUS = 1.1;
export const GUARDIAN_SHARD_LIFETIME = 2.0;
/** Techo de daño de un golpe del Guardián al héroe, por fase (GDD §15.1 punto 6). */
export const GUARDIAN_HIT_DAMAGE_CAP_FRACTION: [number, number, number] = [0.6, 0.65, 0.7];
/** Radio de colisión del Guardián: cuerpo grande y pesado (frente a ENEMY_RADIUS=0.4). */
export const GUARDIAN_RADIUS = 0.62;

/**
 * Barriles rodantes del Guardián (GDD §15.2, playtest 2026-07-06): cadencia
 * de aparición perimetral, aturdimiento largo si la carga arrolla uno, y cap
 * de barriles vivos simultáneos (evita saturar la arena).
 */
export const GUARDIAN_BARREL_SPAWN_INTERVAL = 8;
/** Aturdimiento si la carga arrolla un barril rodante (vs GUARDIAN_STUN_DURATION normal de 1.4s). */
export const GUARDIAN_BARREL_STUN_DURATION = 2.2;
/** Daño al Guardián por una explosión de barril en su radio, EN CUALQUIER MOMENTO (aturdido o no) y la detone quien la detone, como fracción de su vida máxima (playtest 2026-07-10). Bypassa la ventana de aturdimiento. El mayor de los tres modos. */
export const GUARDIAN_BARREL_DAMAGE_FRACTION = 0.15;
export const GUARDIAN_BARREL_MAX_ACTIVE = 3;
/** Radio del barril rodante: mismo tamaño que el barril estándar de sala (0.8×0.8 → radio 0.4). */
export const GUARDIAN_BARREL_RADIUS = 0.4;
/**
 * Caída del cielo del barril del Guardián (GDD §15.2, playtest 2026-07-06):
 * ventana total desde que aparece la sombra hasta que aterriza y pasa a
 * activo. El GDD pide ~0.8s de sombra creciente "legible desde toda la sala";
 * la caída visual del cuerpo se solapa con el último tramo de la sombra (el
 * cuerpo entra a plomo cuando la sombra ya está casi a tamaño final), así que
 * el total es un pelín mayor: 1.1s. Mientras dura, el barril NO es
 * arrollable/explotable. El render deriva de este valor (junto con
 * `barrel.landingAt`) en qué punto de la caída/sombra está.
 */
export const GUARDIAN_BARREL_FALL_DURATION = 1.1;
/** Fracción del tramo de caída dedicada solo a la sombra creciente antes de que el cuerpo empiece a bajar (el resto es la caída del cuerpo). */
export const GUARDIAN_BARREL_SHADOW_FRACTION = 0.55;
/** Altura (u) desde la que el barril entra a plomo al empezar la caída del cuerpo. */
export const GUARDIAN_BARREL_FALL_HEIGHT = 5;
