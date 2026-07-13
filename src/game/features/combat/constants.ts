/**
 * Tuning de combate: embestida, daño por contacto, i-frames, escudo, armas de
 * proyectil y knockback — GDD, Apéndice. Valores validados por playtesting;
 * no ajustar sin probar.
 */

// ── Embestida, contacto e i-frames ────────────────────────────────────────

/** Velocidad mínima de impacto para dañar a un enemigo por embestida (u/s). */
export const RAM_SPEED_THRESHOLD = 2.5;
export const RAM_DAMAGE_BASE = 1;
/** Bono de daño de embestida por cada u/s de velocidad de impacto. */
export const RAM_DAMAGE_PER_SPEED = 0.32;
/** Invulnerabilidad tras recibir daño (s). */
export const HERO_IFRAME_DURATION = 0.7;
/** Intervalo entre ticks de daño por contacto sostenido (s). */
export const CONTACT_DAMAGE_COOLDOWN = 0.42;
export const CONTACT_DAMAGE = 1;
/** Invulnerabilidad tras bloquear con el escudo (s). */
export const SHIELD_IFRAME_DURATION = 0.45;

// ── Armas ─────────────────────────────────────────────────────────────────

export const ARROW_SPEED = 10.8;
export const ARROW_DAMAGE = 1;
export const ARROW_COOLDOWN = 0.5;
/** La flecha atraviesa 1 enemigo (se detiene en el segundo). */
export const ARROW_PIERCE_COUNT = 1;
export const SPELL_SPEED = 8.3;
export const SPELL_DAMAGE = 2;
export const SPELL_COOLDOWN = 1.0;
export const SPELL_WALL_BOUNCES = 1;
/** Fracción de velocidad que conserva el hechizo al rebotar en pared. */
export const SPELL_BOUNCE_FACTOR = 0.65;
/** Vida máxima de un proyectil (s). */
export const PROJECTILE_LIFETIME = 2.8;
/** Retroceso que un disparo aplica al héroe (u/s). */
export const PROJECTILE_RECOIL = 1.15;
/** La fuerza del arrastre modula la velocidad del proyectil en este rango. */
export const PROJECTILE_FORCE_SPEED_MIN = 0.7;
export const PROJECTILE_FORCE_SPEED_MAX = 1.2;
/** Radio de colisión de flecha/hechizo; el hechizo crece con Hechizo Arcano. */
export const PROJECTILE_RADIUS = 0.18;
export const SPELL_RADIUS_UPGRADED = 0.25;
/**
 * Ángulo entre proyectiles adyacentes del multidisparo en abanico (Bandada /
 * Coro Arcano, docs/plans/ECONOMY_PLAN.md F2): 12° en radianes, simétrico
 * respecto a la dirección de apuntado (p.ej. 3 proyectiles → -12/0/+12).
 */
export const PROJECTILE_FAN_ANGLE_STEP = (12 * Math.PI) / 180;

// ── Pool preasignado de proyectiles ───────────────────────────────────────

/**
 * Capacidad del pool de proyectiles (héroe + enemigos). Ampliado de 32 a 96
 * (Fase B0, GDD §15) para dar margen a La Tormenta (B4, GDD §15.5: hasta
 * ~64-96 balas vivas en pantalla en fase 3). Instanciado una vez en
 * `createProjectilePool`; el resto del pipeline (acquireProjectile,
 * stepProjectiles, ProjectileView) ya recorre `world.projectiles` por
 * longitud, sin límites duros propios, así que escala sin más cambios.
 */
export const PROJECTILE_POOL_SIZE = 96;

// ── Knockback y contactos especiales ──────────────────────────────────────

/** Knockback al golpear a un enemigo: empuje en velocidad + desplazamiento. */
export const ENEMY_KNOCKBACK_SPEED = 2.4;
export const ENEMY_KNOCKBACK_OFFSET = 0.18;
/** Duración del flash blanco al ser golpeado (s). */
export const ENEMY_HIT_FLASH_DURATION = 0.15;
/** Spike: producto escalar mínimo entre la normal de contacto y su cara peligrosa para considerarlo frontal. */
export const SPIKE_DANGEROUS_DOT_THRESHOLD = 0.25;
