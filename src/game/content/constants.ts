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

// ── Reina del Enjambre (GDD §15.3, Fase B2) ───────────────────────────────

/** Vida máxima (GDD §15.6): mucha vida, sin ataque directo fuerte. */
export const QUEEN_MAX_HP = 55;
/** Radio de colisión: grande, distinta del Guardián (GDD §15.3 "cuerpo grande y distinto"). */
export const QUEEN_RADIUS = 0.58;
/** Techo de daño de un golpe de la Reina al héroe, por fase (GDD §15.1 punto 6): no tiene ataque directo, solo contacto de cuerpo si se le encima el jugador. */
export const QUEEN_HIT_DAMAGE_CAP_FRACTION: [number, number, number] = [0.6, 0.65, 0.7];
/**
 * Rediseño 2026-07-10 (GDD §15.3, docs/plans/QUEEN_REDESIGN_PLAN.md): la vida
 * de la Reina está en sus 8 columnas, pero al CUERPO SIEMPRE le puedes hacer
 * daño con cualquier ataque (playtest: "aunque muy poco si no está aturdido").
 * Fuera de aturdimiento el daño del arma/embestida se escala por este factor
 * pequeño; al romperse una columna la Reina queda ATURDIDA (`bossVulnerable`)
 * unos segundos y ahí recibe el daño COMPLETO; con TODAS las columnas rotas
 * pasa a estar vulnerable de forma permanente (remate del último 1/3 a golpes).
 */
export const QUEEN_DAMAGE_OUTSIDE_WINDOW = 0.15;

/** Golpes de embestida que aguanta una columna de la Reina (rediseño 2026-07-10): 2 → el 1.º la agrieta, el 2.º la rompe. */
export const QUEEN_COLUMN_HP = 2;
/**
 * Vida que pierde la Reina al romperse UNA columna, como fracción de su vida
 * máxima (playtest 2026-07-10): las 8 columnas suman 2/3 de su vida; el 1/3
 * restante se remata a golpes normales, ya con la Reina siempre vulnerable.
 */
export const QUEEN_COLUMN_DAMAGE_FRACTION = 2 / 3 / 8;
/** Cooldown (s) por columna entre golpes de embestida contados, para que un mismo choque (varios ticks solapado) reste 1 hp y no varios. */
export const QUEEN_COLUMN_HIT_COOLDOWN = 0.4;
/** Aturdimiento de la Reina al romperse una columna (s): ventana en la que recibe daño COMPLETO (playtest 2026-07-10: "si le atacas justo al romper una columna, ahí sí le haces más daño"). */
export const QUEEN_COLUMN_STUN_DURATION = 1.4;
/**
 * Margen extra (u) sumado al radio del héroe al comprobar si toca una
 * columna (rediseño 2026-07-10): `stepHeroPhysics` ya resuelve la colisión
 * física héroe↔columna (es un Obstacle sólido) ANTES de `stepQueenColumns`
 * en el mismo tick — al llegar aquí el héroe queda exactamente tangente al
 * borde de la columna (push-out), no solapado. Sin este margen, el test de
 * solapamiento fallaría por el margen de error de punto flotante justo en el
 * tick del impacto, que es el único tick en que puede detectarse.
 */
export const QUEEN_COLUMN_TOUCH_SKIN = 0.05;

/** Velocidad de desplazamiento fase 1: lenta, gestión de terreno, no persecución agresiva (GDD §15.3). */
export const QUEEN_MOVE_SPEED_PHASE1 = 0.65;
/** Fase 2 (66%): rastro más rápido → la propia Reina se mueve algo más rápido para tejerlo (GDD §15.3). */
export const QUEEN_MOVE_SPEED_PHASE2 = 0.95;
/** Fase 3 (33%): pánico, más movimiento (GDD §15.3). */
export const QUEEN_MOVE_SPEED_PHASE3 = 1.3;
/** Cada cuánto la Reina elige un nuevo punto de deambulación dentro de su sala (s). */
export const QUEEN_WANDER_INTERVAL = 2.6;

/**
 * Rastro de la Reina (GDD §15.3 "como el Trail, pero más grande y duradero"):
 * reutiliza el pool de charcos del Trail (world.puddles, sim/hazards.ts::
 * stepPuddles) con parámetros PROPIOS —radio mayor, vida más larga— en vez de
 * los de TRAIL_PUDDLE_RADIUS/TRAIL_PUDDLE_LIFETIME (que son del enemigo Trail
 * normal). Cadencia fase 1; fase 2 la acelera (QUEEN_TRAIL_DROP_INTERVAL_PHASE2).
 */
export const QUEEN_TRAIL_DROP_INTERVAL = 0.8;
export const QUEEN_TRAIL_DROP_INTERVAL_PHASE2 = 0.45;
export const QUEEN_TRAIL_PUDDLE_RADIUS = 0.85;
export const QUEEN_TRAIL_PUDDLE_LIFETIME = 6.5;

/**
 * Larvas (GDD §15.3/§15.6): oleada cada ~3s, Dummy débil de 1 HP, avanzan
 * hacia el héroe (línea recta en fase 1, persiguen de verdad en fase 2/3).
 * Cap de larvas vivas simultáneas por rendimiento (QUEEN_LARVA_MAX): la Reina
 * reserva ese nº de slots en `world.enemies` (pool preasignado, mismo espíritu
 * que `createProjectilePool`/`createPuddlePool`) en vez de hacer `.push` en
 * caliente — evita el bug de renderers que hacen `.map` sobre un array que
 * crece a mitad de partida sin trigger de re-render (ver AGENTS.md, nota de
 * `BarrelViews`/`ItemViews`): los slots ya existen desde el spawn de la sala,
 * inactivos (hp=0) hasta que una oleada los active.
 */
export const QUEEN_WAVE_INTERVAL = 3;
/**
 * Cap de larvas vivas simultáneas, ESCALADO POR FASE (GDD §15.3, playtest
 * 2026-07-06 "escalada de larvas por fase"): 2 en fase 1, 4 en fase 2, 6 en
 * fase 3 — la presión del enjambre crece con el combate en vez de ser un
 * techo fijo desde el principio. El pool preasignado en `world.enemies`
 * sigue reservando el MÁXIMO de los tres (índice 2 = fase 3 = 6 slots), igual
 * que antes de escalar el cap (`queenOnInit` no cambia).
 */
export const QUEEN_LARVA_MAX_BY_PHASE: [number, number, number] = [2, 4, 6];
/** Tamaño del pool preasignado de slots de larva: el máximo de QUEEN_LARVA_MAX_BY_PHASE (fase 3). */
export const QUEEN_LARVA_MAX = QUEEN_LARVA_MAX_BY_PHASE[2];
/** Nº de larvas invocadas por oleada (dentro del cap de vivas de la fase actual). */
export const QUEEN_LARVA_PER_WAVE = 2;
export const QUEEN_LARVA_HP = 1;
export const QUEEN_LARVA_RADIUS = 0.26;
/**
 * Velocidad de avance de una larva hacia el héroe. Persiguen desde la FASE 1
 * (GDD §15.3, playtest 2026-07-06: "en línea recta no amenazaban; el reto
 * llegaba tarde") — ya no hay modo "línea recta fija"; solo cambia la
 * velocidad por fase.
 */
export const QUEEN_LARVA_SPEED = 1.1;
/** Fase 2/3 (GDD §15.3): las larvas persiguen más rápido y son más agresivas. */
export const QUEEN_LARVA_CHASE_SPEED_PHASE2 = 1.35;
export const QUEEN_LARVA_CHASE_SPEED_PHASE3 = 1.7;
/** Prefijo de id de los slots de larva de la Reina (para distinguirlos del resto de `world.enemies`, ver `isQueenLarva`). */
export const QUEEN_LARVA_ID_PREFIX = 'queen-larva-';

/**
 * Persecución hacia el héroe (GDD §15.3, playtest 2026-07-06 "la Reina te
 * acecha"): plantarse en un punto fijo a disparar deja de ser seguro. NO es
 * un dash agresivo (eso es el Chaser) — solo un sesgo hacia el héroe
 * superpuesto a la deambulación normal (`queenStepMove` sigue fijando
 * `patrolTo` y dejando rastro igual que antes; el acecho es un empuje extra
 * hacia el héroe aplicado sobre ese movimiento). Sin correa: la Reina persigue
 * libremente por toda la arena (playtest 2026-07-10 "quitar la correa").
 */
/** Velocidad de acecho de la Reina hacia el héroe, ESCALADA POR FASE (playtest 2026-07-10: "que me persiga más rápido conforme pasan las fases" + "que llegue a tocar al jugador"). Índice 0/1/2 = fase 1/2/3. Se superpone a la deambulación normal (queenStepMove). */
export const QUEEN_STALK_SPEED_BY_PHASE: [number, number, number] = [1.0, 1.6, 2.3];

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
