/**
 * La Tormenta (GDD §15.5, Fase B4) — constantes de la MÁQUINA DE ESTADOS del
 * integrador: ciclo idle→telegraph→ejecución→recarga, cadencias por fase y
 * deriva ambiental. Fichero SEPARADO de `./constants.ts` (que fija solo la
 * geometría/garantías de pasillo de los 3 generadores — ver el CONTRATO PARA
 * EL INTEGRADOR en la cabecera de `patterns.ts`) para no tocarlo: sus números
 * y demostraciones de honestidad no dependen de cómo el integrador orquesta
 * el ciclo alrededor de ellos.
 */

/** Vida máxima (GDD §15.6). */
export const STORM_MAX_HP = 40;
/** Techo de daño de un golpe de La Tormenta al héroe, por fase (GDD §15.1 punto 6; mismo criterio que el resto de jefes). */
export const STORM_HIT_DAMAGE_CAP_FRACTION: [number, number, number] = [0.6, 0.65, 0.7];
/**
 * Fracción del daño recibido fuera de la ventana de recarga. Subido de 0 a
 * 0.2 tras playtest 2026-07-15 (David: "haría que los ataques siempre hagan
 * daño, pero hagan más daño cuando esté con la luz verde"): igualado al
 * mismo valor que Guardián/Prisma (`GUARDIAN_DAMAGE_OUTSIDE_WINDOW`/
 * `PRISMA_DAMAGE_OUTSIDE_WINDOW`, 0.2) por el mismo motivo — "que se note si
 * mejoras el arma" incluso fuera de ventana, sin que 0 se lea como inmunidad
 * total. Antes de este tuning el criterio era binario a propósito (0 =
 * inmune fuera de patrón, la propia recarga ya era frecuente y suficiente
 * para golpear sin prisa); el playtest mostró que esa binariedad se sentía
 * mal en vez de "limpia": SIEMPRE entra algo de daño (recompensa perseverar/
 * arriesgarse a golpear a destiempo), y en ventana (recarga, "luz verde")
 * entra el daño COMPLETO (`bossVulnerable=true` no se ve afectado por este
 * factor, ver `applyDamageToEnemy`/`combat.ts`) — sigue siendo mucho más que
 * el 20% fuera de ventana, así que la ventana sigue siendo lo que de verdad
 * castiga.
 */
export const STORM_DAMAGE_OUTSIDE_WINDOW = 0.2;

// ── Ciclo: IDLE breve → telegraph → ejecución → recarga (ventana) ──────────

export const STORM_STAGE_IDLE = 0;
export const STORM_STAGE_TELEGRAPH = 1;
export const STORM_STAGE_EXECUTE = 2;
export const STORM_STAGE_RELOAD = 3;

/** Pausa breve antes de telegrafiar el próximo patrón, por fase (se acorta en fase 2/3, GDD §15.5 "la recarga se acorta" — el mismo criterio de urgencia se aplica al idle). */
export const STORM_IDLE_DURATION_BY_PHASE: readonly [number, number, number] = [0.35, 0.2, 0.2];
/**
 * Aviso antes de cualquier patrón, por fase (framework: mínimo 0.6s, GDD
 * §15.1 punto 2). Subido de un único 0.7s fijo a 1.0s en fase 1 tras
 * playtest 2026-07-15 (David: "telegrafía un poco más el siguiente ataque
 * por el movimiento del aro"): con el aro ahora insinuando YA el patrón
 * durante la segunda mitad de la recarga anterior (ver `stormEnterReload`
 * en `pattern.ts`), 1.0s de telegraph con lectura completa es el tramo
 * donde el jugador termina de confirmar qué viene y se coloca. Fases 2/3 se
 * quedan en 0.8s (por encima del suelo de 0.6s del framework): el ritmo más
 * denso de esas fases premia reaccionar más rápido, y el aro ya llevaba
 * insinuando el patrón desde la recarga anterior (más corta, pero con la
 * misma proporción de "segunda mitad" relativa) — no hace falta el mismo
 * margen que en fase 1 para que siga siendo legible.
 */
export const STORM_TELEGRAPH_DURATION_BY_PHASE: readonly [number, number, number] = [1.0, 0.8, 0.8];
/**
 * Recarga = ventana de vulnerabilidad (GDD §15.6: "~1.8s" en fase 1, subido
 * desde "~1.2s" tras playtest 2026-07-15: David la encontró "demasiado
 * difícil", pidiendo "un poco más de ventana de daño"). +50% sobre los
 * valores previos (1.2→1.8, 0.9→1.35) en las 3 fases por igual, así que
 * fase 2/3 siguen siendo más cortas que fase 1 (GDD §15.5 "la recarga se
 * acorta") con la misma proporción relativa de antes (0.75×).
 */
export const STORM_RELOAD_DURATION_BY_PHASE: readonly [number, number, number] = [1.8, 1.35, 1.35];

// ── Selección de patrón (world.rng, nunca se repite el mismo dos veces seguidas) ─

export const STORM_PATTERN_SPIRAL = 0;
export const STORM_PATTERN_RINGS = 1;
export const STORM_PATTERN_BURST = 2;
export const STORM_PATTERN_COUNT = 3;

/** Kind de `boss-telegraph`/`bossTelegraphKind` por patrón (render: aviso distinto por patrón, GDD §15.5). Índice = STORM_PATTERN_*. */
export const STORM_TELEGRAPH_KIND: readonly [string, string, string] = ['storm-spiral', 'storm-rings', 'storm-burst'];
/**
 * Kind que lee el render durante la recarga (pose inconfundible, GDD §15.5:
 * "aviso visual claro"). NO es un telegraph real (`bossTelegraphUntil` vale 0
 * en ese tramo, así que el anillo ámbar genérico no se dibuja): es solo la
 * etiqueta que EnemyViews usa para distinguir la pose de recarga de la de
 * telegrafiar/ejecutar un patrón.
 */
export const STORM_RELOAD_KIND = 'storm-reload';

// ── Deriva ambiental (GDD §15.5: "flota lentamente cerca del centro") ──────

/** Radio de la órbita de deriva alrededor del centro de la sala: pequeño, ambiental, nunca persigue al héroe. */
export const STORM_DRIFT_RADIUS = 1.1;
/** Velocidad angular de la deriva (rad/s): lenta a propósito. */
export const STORM_DRIFT_ANGULAR_SPEED = 0.18;
/** Velocidad de desplazamiento hacia el punto de deriva (u/s), mismo parámetro que `moveBossTowardWithAvoidance`. */
export const STORM_DRIFT_SPEED = 0.7;
