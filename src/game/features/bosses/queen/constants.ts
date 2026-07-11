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

/** Golpes de embestida que aguanta una columna de la Reina (playtest 2026-07-10: subido a 3 para que romperla sea un forcejeo bajo el fuego de su guardiana). */
export const QUEEN_COLUMN_HP = 3;
/**
 * Prefijo del id LOCAL (tras el `roomId:` opcional) de las rocas que son
 * columnas de la Reina (T2 render, GDD §15.3): boss-queen.json las nombra
 * `column-nw-1..4`/`column-ne-1..4`. Mismo criterio que ya usa
 * `queen/pattern.ts::queenOnInit` (ahí inline, sin importar este fichero para
 * no tocar la sim) para poblar `world.queenColumns`; el render lo reutiliza
 * para excluir esas rocas del pintado genérico de `RoomView` (las pinta
 * `QueenColumnsView` con su propio estado intacta/agrietada/escombros).
 */
export const QUEEN_COLUMN_ID_PREFIX = 'column';
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

/** Factor de frenado por tick del héroe LENTO sobre el rastro de la Reina (rediseño 2026-07-10): más agresivo que el barro para que quedarse en el rastro sea un error real. */
export const QUEEN_TRAIL_SLOW_FACTOR = 0.8;
/** Velocidad (u/s) por encima de la cual una EMBESTIDA cruza el rastro sin penalización (válvula: el rastro castiga pararte, no pasar lanzado). */
export const QUEEN_TRAIL_CROSS_SPEED = 4.5;
/** Gracia (s) sobre el rastro antes de que empiece el DoT (válvula: cruzar es gratis; quedarse, no). */
export const QUEEN_TRAIL_DOT_GRACE = 0.4;

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
 * Cap TOTAL de larvas vivas de la Reina (pool preasignado en `queenOnInit`).
 * Rediseño 2026-07-10 (GDD §15.3): conviven dos roles — PERSEGUIDORAS (nacen
 * del boss, persiguen al héroe) y GUARDIANAS (nacen de una columna, la
 * orbitan). El pool reserva este máximo para ambas.
 */
export const QUEEN_LARVA_MAX = 10;
/** Perseguidoras invocadas por oleada según la fase (rediseño 2026-07-10: 1/2/3): nacen del boss y persiguen al héroe. */
export const QUEEN_CHASER_PER_WAVE_BY_PHASE: [number, number, number] = [1, 2, 3];
/** Cap de guardianas vivas simultáneas (rediseño 2026-07-10): defienden columnas sin ahogar el cupo de perseguidoras. */
export const QUEEN_GUARDIAN_MAX = 5;
/** Cadencia (s) con la que aparece una guardiana nueva en una columna intacta sin defensora (de 1 en 1). */
export const QUEEN_GUARDIAN_SPAWN_INTERVAL = 2;
/** Velocidad de órbita de una guardiana alrededor de su columna (lenta: ronda, no persigue al héroe). */
export const QUEEN_GUARDIAN_SPEED = 0.8;
/** Radio de órbita de la guardiana respecto al centro de su columna. */
export const QUEEN_GUARDIAN_ORBIT_RADIUS = 1.0;
/** Distancia (u) del héroe a la que una guardiana decide EMBESTIRLE (playtest 2026-07-10: dejan de ser pasivas). */
export const QUEEN_GUARDIAN_CHARGE_RANGE = 2.4;
/** Aviso (s) antes de que la guardiana cargue (telegrafía: se hincha/retrocede; la carga es esquivable). */
export const QUEEN_GUARDIAN_TELEGRAPH = 0.45;
/** Duración (s) de la carga de la guardiana. */
export const QUEEN_GUARDIAN_CHARGE_DURATION = 0.4;
/** Velocidad (u/s) de la carga de la guardiana. */
export const QUEEN_GUARDIAN_CHARGE_SPEED = 4.5;
/** Descanso (s) entre cargas de una guardiana (vuelve a orbitar mientras tanto). */
export const QUEEN_GUARDIAN_CHARGE_COOLDOWN = 2.5;
export const QUEEN_LARVA_HP = 1;
export const QUEEN_LARVA_RADIUS = 0.26;
/** Velocidad de una PERSEGUIDORA hacia el héroe (fase 1). */
export const QUEEN_LARVA_SPEED = 1.1;
/** Perseguidoras más rápidas y agresivas en fase 2/3 (GDD §15.3). */
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
/**
 * Velocidad de persecución de la Reina ESCALADA POR COLUMNAS ROTAS (playtest
 * 2026-07-10: "cada columna rota la enfurece y te persigue más rápido"). Con 8
 * columnas: 1.2 (0 rotas) → ~4.2 (8 rotas), así el remate deja de ser un tiro
 * tranquilo — al final casi te alcanza aunque te muevas. Sustituye el escalado
 * por fase anterior.
 */
export const QUEEN_STALK_SPEED_BASE = 1.2;
export const QUEEN_STALK_SPEED_PER_COLUMN = 0.38;
