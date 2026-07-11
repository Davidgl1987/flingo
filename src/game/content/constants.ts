/**
 * Tabla maestra de tuning — GDD, Apéndice.
 *
 * Única fuente de números del juego. Todos los valores provienen del GDD
 * (validados por playtesting de la versión original); no ajustar sin probar.
 * Se definen TODOS desde fase 1 aunque algunos (armas de proyectil, enemigos,
 * hazards) no se usen hasta fases posteriores.
 */

// ── Física global ─────────────────────────────────────────────────────────

/** Timestep fijo de la simulación: 60 Hz. */
export const FIXED_DT = 1 / 60;
/** Tope de velocidad global (~1.7× la velocidad máxima de lanzamiento), u/s. */
export const MAX_SPEED = 13.5;
/**
 * Fricción por decaimiento exponencial: v(t) = v0 · e^(−k·t) con k = 1.42.
 * Por tick fijo: v *= e^(−1.42·dt).
 */
export const FRICTION_FACTOR = 1.42;
/** Umbral de parada total: por debajo, la velocidad pasa a 0 exacto (u/s). */
export const STOP_THRESHOLD = 0.35;
/** Restitución de rebote héroe/paredes/rocas (fracción de velocidad conservada). */
export const RESTITUTION = 0.86;

/**
 * Fricción extra a baja velocidad (feedback de playtest, punto 8: "con poco
 * recorrido la pelota se queda resbalando demasiado"). Por debajo de este
 * umbral (u/s) se añade un decaimiento adicional que crece progresivamente
 * hasta el umbral de parada, para que los tiros flojos frenen antes SIN tocar
 * el feel de los tiros fuertes (que pasan la mayor parte de su deslizamiento
 * muy por encima de este umbral, y solo lo cruzan en su último tramo).
 */
export const LOW_SPEED_FRICTION_THRESHOLD = 1.5;
/** Fuerza del decaimiento extra a baja velocidad (mayor = frena más brusco cerca de 0). */
export const LOW_SPEED_EXTRA_FRICTION = 3.6;

// ── Héroe ─────────────────────────────────────────────────────────────────

export const HERO_RADIUS = 0.38;
export const HERO_START_HP = 5;
export const HERO_MAX_HP = 9;
/** Velocidad de salida del lanzamiento corporal a fuerza 0 (u/s). */
export const LAUNCH_SPEED_MIN = 3.6;
/** Velocidad de salida del lanzamiento corporal a fuerza 1 (u/s). */
export const LAUNCH_SPEED_MAX = 7.5;
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

export const BODY_LAUNCH_COOLDOWN = 0.2;
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
/** Multiplicador de recarga flecha/hechizo con la mejora Pulso Firme. */
export const STEADY_PULSE_RELOAD_MULTIPLIER = 0.72;

// ── Enemigo hostil: proyectil del Shooter ─────────────────────────────────

export const SHOOTER_PROJECTILE_DAMAGE = 1;
export const SHOOTER_PROJECTILE_RADIUS = 0.16;

// ── Pools preasignados ─────────────────────────────────────────────────────

/**
 * Capacidad del pool de proyectiles (héroe + enemigos). Ampliado de 32 a 96
 * (Fase B0, GDD §15) para dar margen a La Tormenta (B4, GDD §15.5: hasta
 * ~64-96 balas vivas en pantalla en fase 3). Instanciado una vez en
 * `createProjectilePool`; el resto del pipeline (acquireProjectile,
 * stepProjectiles, ProjectileView) ya recorre `world.projectiles` por
 * longitud, sin límites duros propios, así que escala sin más cambios.
 */
export const PROJECTILE_POOL_SIZE = 96;
export const PUDDLE_POOL_SIZE = 32;

// ── Enemigos (fase 2; definidos ya por contrato) ──────────────────────────

export const DUMMY_HP = 2;
export const DUMMY_PATROL_SPEED = 0.8;
export const DUMMY_CHASE_SPEED = 1.7;
/** Distancia a la que el Dummy detecta al héroe y empieza a perseguir (u). */
export const DUMMY_DETECT_RANGE = 2.35;
/** Correa: distancia máxima de su zona antes de volver a patrullar (u). */
export const DUMMY_LEASH_RANGE = 2.2;

export const CHASER_HP = 3;
export const CHASER_SPEED = 2.35;
/** Velocidad del Chaser cuando detecta que el jugador está apuntando. */
export const CHASER_SPEED_WHILE_AIMING = 3.0;

export const SPIKE_HP = 3;
export const SPIKE_PATROL_SPEED = 0.95;

export const TRAIL_HP_MIN = 3;
export const TRAIL_HP_MAX = 4;
export const TRAIL_SPEED = 0.86;
/** Cada cuánto suelta un charco el Trail (s). */
export const TRAIL_DROP_INTERVAL = 0.55;
export const TRAIL_PUDDLE_RADIUS = 0.45;
export const TRAIL_PUDDLE_LIFETIME = 3.2;

export const SHOOTER_HP_MIN = 3;
export const SHOOTER_HP_MAX = 4;
export const SHOOTER_CHASE_SPEED = 1.45;
/** Ciclo del Shooter: persigue 1 s → carga 1 s → dispara. */
export const SHOOTER_CHASE_DURATION = 1.0;
export const SHOOTER_CHARGE_DURATION = 1.0;
export const SHOOTER_PROJECTILE_SPEED = 6.6;

// ── Navegación de IA (steering local con evitación) ───────────────────────

/** Distancia de sondeo (raycast corto) por delante del enemigo para detectar obstáculos/hazards. */
export const AI_AVOID_LOOKAHEAD = 0.9;
/** Ángulo (rad) de desvío aplicado cuando el sondeo frontal detecta bloqueo. */
export const AI_AVOID_STEER_ANGLE = Math.PI / 3;
/** Margen extra sobre el radio del enemigo al comprobar bloqueo contra AABBs. */
export const AI_AVOID_SKIN = 0.12;

/** Knockback al golpear a un enemigo: empuje en velocidad + desplazamiento. */
export const ENEMY_KNOCKBACK_SPEED = 2.4;
export const ENEMY_KNOCKBACK_OFFSET = 0.18;
/** Radio de colisión por defecto de un enemigo. */
export const ENEMY_RADIUS = 0.4;
/** Duración del flash blanco al ser golpeado (s). */
export const ENEMY_HIT_FLASH_DURATION = 0.15;
/** Spike: producto escalar mínimo entre la normal de contacto y su cara peligrosa para considerarlo frontal. */
export const SPIKE_DANGEROUS_DOT_THRESHOLD = 0.25;
/** Radio de la explosión de Choque Explosivo (embestida con daño en área). */
export const EXPLOSIVE_RAM_RADIUS = 1.6;

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
/** Radio de recogida de items (moneda/poción/llave). */
export const ITEM_PICKUP_RADIUS = 0.5;
/** Curación de la poción (corazones). */
export const POTION_HEAL = 1;

// ── Mundo y run ───────────────────────────────────────────────────────────

export const ROOMS_PER_RUN = 6;
export const DOOR_WIDTH = 2.0;
export const WALL_THICKNESS = 0.42;
export const UPGRADE_CHOICES = 3;
export const ROOM_MIN_SIZE = 5;
export const ROOM_CLEAR_SCORE = 50;
/** Distancia al centro de una puerta (a lo largo de su eje) para considerar que el héroe la está tocando. */
export const DOOR_TOUCH_MARGIN = 1.1;

// ── Input / puntería ──────────────────────────────────────────────────────

/** Longitud de arrastre que equivale a fuerza 100% (u de mundo). */
export const MAX_DRAG_DISTANCE = 2.8;
/** Fuerza mínima: por debajo el tiro se cancela con aviso. */
export const MIN_LAUNCH_FORCE = 0.08;
