// ── El Prisma (GDD §15.4, Fase B3) ─────────────────────────────────────────

/** Vida máxima (GDD §15.6). */
export const PRISMA_MAX_HP = 45;
/** Radio de colisión/visual: cuerpo mediano, entre la Reina (0.58) y el Guardián (0.62). */
export const PRISMA_RADIUS = 0.56;
/** Techo de daño de un golpe del Prisma al héroe, por fase (GDD §15.1 punto 6). */
export const PRISMA_HIT_DAMAGE_CAP_FRACTION: [number, number, number] = [0.6, 0.65, 0.7];
/**
 * Fracción del daño del ARMA que recibe el Prisma mientras NO está en su
 * ventana de vulnerabilidad (mismo criterio "apenas hace daño, pero se nota
 * si mejoras el arma" que el Guardián, GUARDIAN_DAMAGE_OUTSIDE_WINDOW). Nótese
 * que esto se aplica DESPUÉS de pasar el gate de color: un arma del color
 * equivocado ya se descarta entera antes de llegar aquí (ver combat.ts).
 */
export const PRISMA_DAMAGE_OUTSIDE_WINDOW = 0.2;

/** Daño de un golpe/impacto del Prisma al héroe, por fase (GDD §15.6: "1 → 2 según modo"). */
export const PRISMA_HIT_DAMAGE_PHASE1 = 1;
export const PRISMA_HIT_DAMAGE_PHASE3 = 2;

// ── Rotación de color (GDD §15.4: "en cada momento el Prisma tiene UN color
// activo — azul, amarillo o violeta") ──────────────────────────────────────

/** Índices del color/arma activa, en el orden de rotación azul→amarillo→violeta→azul. */
export const PRISMA_COLOR_RAM = 0;
export const PRISMA_COLOR_ARROW = 1;
export const PRISMA_COLOR_SPELL = 2;
/** Arma que gatea el daño (`Enemy.bossWeaponGateA/B`, combat.ts) para cada índice de color. */
export const PRISMA_COLOR_WEAPON: readonly ('ram' | 'arrow' | 'spell')[] = ['ram', 'arrow', 'spell'];

/** Duración de un modo de color, por fase (GDD §15.6: "cada ~6s → ~4s en fase 3"). */
export const PRISMA_MODE_DURATION_PHASE1 = 6;
export const PRISMA_MODE_DURATION_PHASE2 = 4.5;
export const PRISMA_MODE_DURATION_PHASE3 = 4;
/** Aviso de cambio de color antes de rotar (GDD §15.4: "~1.5s antes del cambio"). */
export const PRISMA_COLOR_TELEGRAPH_LEAD = 1.5;
/**
 * Fase 3 (GDD §15.4): tras cada cambio, el color ANTERIOR sigue dañando este
 * tiempo (solape de 2 colores válidos a la vez, golpe doble si aciertas
 * cualquiera de los dos). Misma duración que el aviso de cambio a propósito
 * (mismo "tramo final" de la rotación, ahora en el lado de después).
 */
export const PRISMA_PHASE3_OVERLAP_DURATION = 1.5;

/** Ventana de vulnerabilidad al final de cada ataque (GDD §15.6: "fin de cada ataque"). */
export const PRISMA_VULNERABLE_WINDOW = 1.0;
/** Fase 2+ (GDD §15.4: "los ataques se densifican ligeramente"): multiplica la cadencia de ataque. */
export const PRISMA_PHASE2_CADENCE_MULTIPLIER = 0.8;

// ── Piedra (azul/ram): embestidas cortas hacia el héroe ────────────────────

export const PRISMA_RAM_CADENCE = 2.5;
export const PRISMA_RAM_TELEGRAPH_DURATION = 0.6;
/** Notablemente más lenta y corta que la del Guardián (GDD: "no copies al Guardián entero, versión simple"). */
export const PRISMA_RAM_CHARGE_SPEED = 5.5;
export const PRISMA_RAM_CHARGE_DURATION = 0.45;
export const PRISMA_RAM_KNOCKBACK_SPEED = 5.5;

// ── Viento (amarillo/arrow): se mueve rápido y dispara ráfagas de dardos ───

export const PRISMA_ARROW_CADENCE = 2.0;
export const PRISMA_ARROW_TELEGRAPH_DURATION = 0.6;
export const PRISMA_ARROW_BURST_COUNT = 3;
/** Velocidad moderada (GDD §15.4: "≤ 5 u/s"). */
export const PRISMA_ARROW_SPEED = 5;
export const PRISMA_ARROW_RADIUS = 0.18;
/** Separación angular entre dardos del abanico (mismo valor que el abanico del héroe, PROJECTILE_FAN_ANGLE_STEP). */
export const PRISMA_ARROW_FAN_ANGLE_STEP = (12 * Math.PI) / 180;
/** Velocidad de reposicionamiento (strafe) mientras está en modo Viento (GDD §15.4: "se mueve rápido"). */
export const PRISMA_WIND_MOVE_SPEED = 2.2;
/** Distancia a la que el Prisma orbita al héroe mientras reposiciona en modo Viento. */
export const PRISMA_WIND_STANDOFF_DISTANCE = 3.5;
/** Velocidad angular (rad/s) de la órbita de reposicionamiento del modo Viento. */
export const PRISMA_WIND_STRAFE_ANGULAR_SPEED = 0.6;

// ── Sombra (violeta/spell): arcos lentos que rebotan en las paredes ────────

export const PRISMA_SPELL_CADENCE = 2.5;
export const PRISMA_SPELL_TELEGRAPH_DURATION = 0.6;
export const PRISMA_SPELL_ARC_COUNT = 2;
/** Lentos, GDD §15.4: "arcos LENTOS (~3 u/s)". */
export const PRISMA_SPELL_SPEED = 3;
export const PRISMA_SPELL_RADIUS = 0.2;
/** Rebotan en muros (GDD §15.4): mismo mecanismo que el hechizo del héroe (stepEnemyProjectileCollision, combat.ts). */
export const PRISMA_SPELL_BOUNCES = 2;
export const PRISMA_SPELL_FAN_ANGLE_STEP = (18 * Math.PI) / 180;
