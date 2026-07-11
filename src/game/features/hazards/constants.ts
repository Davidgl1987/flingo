/**
 * Tuning de hazards (fosos, pinchos, barriles, barro, aceleradores, charcos)
 * — GDD, Apéndice. Valores validados por playtesting; no ajustar sin probar.
 */

// ── Hazards (fase 2; definidos ya por contrato) ───────────────────────────

export const PIT_DAMAGE = 1;
/** Margen de perdón respecto al borde visual del foso (u). Intencionado: no ajustar al borde exacto. */
export const PIT_FORGIVENESS_MARGIN = 0.18;
export const PIT_FALL_DURATION = 1.05;
export const SPIKES_DAMAGE = 1;
export const SPIKES_PUSH_SPEED = 5.2;
export const BARREL_DAMAGE = 3;
// 2.0→2.4 (playtest 2026-07-05): la explosión visual hacía esperar daño a
// enemigos "cerca" que quedaban fuera del radio; sube el área letal y las
// partículas se acortan (burstTable) para que visual y mecánica coincidan.
export const BARREL_BLAST_RADIUS = 2.4;
/** Barro: factor multiplicativo de frenado aplicado por tick. */
export const MUD_SLOW_FACTOR_PER_TICK = 0.92;
/** Acelerador: impulso en la dirección de movimiento (u/s²). */
export const BOOST_ACCELERATION = 8;
/** Velocidad mínima para que el acelerador empuje (evita acelerar desde parado sin intención). */
export const BOOST_MIN_SPEED = 0.05;
/** Daño periódico de pinchos a enemigos y cadencia entre ticks (s). */
export const SPIKES_ENEMY_DAMAGE_INTERVAL = 0.5;

// ── Pool preasignado de charcos (Trail/Reina/esquirlas del Guardián) ───────

export const PUDDLE_POOL_SIZE = 32;
