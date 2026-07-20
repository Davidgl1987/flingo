/**
 * La Tormenta (GDD §15.5, Fase B4) — el jefe de esquive puro (bullet hell).
 *
 * Este fichero fija TODOS los números de los tres generadores de patrones de
 * balas (espiral / anillos / ráfaga radial). El eje de diseño es la **regla de
 * honestidad** (GDD §15.5): las balas son lentas (≤ 3.9 u/s, bajado desde
 * 4.5 tras playtest 2026-07-15: "sigue siendo demasiado difícil quizá"), los huecos
 * SIEMPRE existen (pasillo garantizado por construcción, no por azar) y ninguna
 * bala nace a bocajarro. Cada constante lleva su porqué; los que se derivan de
 * otras (ángulo de pasillo, tope de balas vivas) se calculan con las funciones
 * puras del final para que el número real y su justificación no se
 * desincronicen nunca.
 *
 * Geometría clave que hace todo esto demostrable: **las balas se mueven en
 * línea recta radial desde el centro del jefe** (velocity = dirección·rapidez,
 * sin gravedad). El movimiento radial CONSERVA el ángulo polar de cada bala,
 * así que el conjunto de ángulos ocupados a un radio dado es exactamente el de
 * una "ola" de emisión, y basta con garantizar el pasillo en el radio de
 * emisión mínimo (el más estrecho en unidades lineales; el pasillo solo se
 * ensancha hacia fuera). Ver la cabecera de `patterns.ts` para el contrato.
 */

import { HERO_RADIUS } from '@/game/features/hero/constants';
import { PROJECTILE_LIFETIME } from '@/game/features/combat/constants';

// ── Bala ──────────────────────────────────────────────────────────────────

/**
 * Rapidez de cada bala (u/s). Tope duro de la regla de honestidad (GDD §15.6:
 * "balas ≤ 3.9 u/s"): lentas frente al héroe (lanzamiento 3.6–7.5 u/s, tope
 * 13.5 u/s, GDD apéndice) para que sean esquivables en todo momento con
 * movimiento normal. Bajado de 4.5 a 3.9 tras playtest 2026-07-15 (David:
 * "sigue siendo demasiado difícil quizá"): el héroe ya esquivaba de sobra a
 * 4.5, así que hay margen para aflojar sin que el patrón deje de leerse como
 * "bullet hell" — sigue muy por encima del suelo de legibilidad (sensiblemente
 * más lenta que el lanzamiento MÍNIMO del héroe, 3.6 u/s, así que el hueco
 * nunca "adelanta" al jugador que se aparta).
 */
export const STORM_BULLET_SPEED = 3.9;
/** Daño por bala (GDD §15.6: "1 por bala"). */
export const STORM_BULLET_DAMAGE = 1;
/**
 * Radio de colisión de una bala de La Tormenta. Algo menor que la flecha
 * (0.18) para que un muro de balas denso siga dejando ver el hueco de pasillo
 * con nitidez. Entra en el cálculo del ancho de pasillo (una bala ocupa su
 * radio a cada lado del hueco).
 */
export const STORM_BULLET_RADIUS = 0.16;

// ── Jefe / origen de emisión ────────────────────────────────────────────────

/**
 * Radio de colisión/cuerpo del jefe (referencia para el integrador; el cuerpo
 * de La Tormenta flota cerca del centro, GDD §15.5). Grande como el resto de
 * jefes. Solo se usa aquí para justificar `STORM_MIN_EMISSION_RADIUS`.
 */
export const STORM_RADIUS = 0.95;
/**
 * Radio mínimo desde el centro del jefe al que puede nacer una bala (req. 2:
 * "ninguna bala a bocajarro"). Debe superar cuerpo del jefe + cuerpo del héroe
 * con margen: 0.95 + HERO_RADIUS (0.24 desde ronda 7 de playtest de la vela)
 * = 1.19 → 1.6 deja 0.41 u de aire (más holgado aún que antes de reducir
 * HERO_RADIUS). TODAS las olas de los tres patrones emiten exactamente a este
 * radio, así que es el radio de referencia (el más estrecho en unidades
 * lineales) para el pasillo.
 */
export const STORM_MIN_EMISSION_RADIUS = 1.6;

// ── Arena (GDD §15.5: circular/octogonal despejada; salas de jefe ~13×13) ───

/**
 * Radio de trabajo del héroe: distancia máxima al centro a la que el héroe
 * teje entre balas. La sala de jefe mide ~13×13 (ver boss-prisma.json), muro
 * 0.42 → media-arista útil ~6. Se usa como radio conservador para el criterio
 * de ALCANZABILIDAD de los huecos (arco = radio·Δángulo): más allá de este
 * radio el pasillo lineal es tan ancho (crece con el radio) que la
 * alcanzabilidad es trivial; el caso que ata es el anillo de trabajo r ≤ 6.
 */
export const STORM_REACH_RADIUS = 6.0;
/**
 * Media-diagonal interior de la sala (~13×13, muro 0.42): la mayor distancia
 * que una bala puede recorrer antes de morir contra un muro. Cota superior de
 * la VIDA efectiva de una bala (muere al tocar muro; la arena está despejada,
 * GDD §15.5) para el presupuesto de pool.
 */
export const STORM_ARENA_CORNER_RADIUS = 8.6;

// ── Pasillo garantizado (regla de honestidad §15.5) ─────────────────────────

/** Diámetro del cuerpo del héroe (`HERO_RADIUS`, `hero/constants.ts` — 0.24 desde ronda 7 de playtest). El pasillo debe superarlo. */
export const STORM_HERO_DIAMETER = HERO_RADIUS * 2; // 0.48
/**
 * Margen generoso del pasillo por encima del diámetro del héroe (req. 1). Las
 * balas son lentas y "esquivables en todo momento con movimiento normal"
 * (GDD §15.5), así que el pasillo se dimensiona con holgura, no al filo del
 * cuerpo. Subido de 0.6 a 0.85 u tras playtest 2026-07-15 (David: "sigue
 * siendo demasiado difícil quizá"): esta es la palanca que ensancha el hueco
 * de diseño de TODOS los patrones que lo usan (anillos y ráfaga —
 * `emitRing`/`fireRadialBurst` leen `stormCorridorMinAngle`, que depende de
 * este margen; la espiral no, su hueco es geométrico 2π/N), así que aflojarlo
 * aquí se nota en el juego entero sin tener que tocar cada generador aparte.
 */
export const STORM_CORRIDOR_MARGIN = 0.85;
/**
 * Ancho LINEAL mínimo de aire libre del pasillo (entre los BORDES de las balas
 * que lo flanquean), en unidades de mundo: diámetro del héroe + margen.
 * 0.48 + 0.85 = 1.33 u.
 */
export const STORM_CORRIDOR_MIN_WIDTH = STORM_HERO_DIAMETER + STORM_CORRIDOR_MARGIN;
/**
 * Factor de seguridad con el que los generadores dimensionan el hueco que
 * ABREN, por encima del mínimo exigido: el hueco real de diseño es un 15% más
 * ancho que el mínimo, para que la comprobación de propiedad (hueco medido ≥
 * mínimo) pase con holgura y absorba el redondeo del reparto de balas.
 */
export const STORM_CORRIDOR_SAFETY = 1.15;

// ── Velocidad de esquive del héroe (para ALCANZABILIDAD) ────────────────────

/**
 * Rapidez sostenida conservadora del héroe para el criterio de alcanzabilidad
 * de huecos. El héroe se reposiciona a base de lanzamientos (mín 3.6 u/s, GDD
 * apéndice); se toma 3.0 u/s —POR DEBAJO del lanzamiento mínimo— a propósito:
 * usar una velocidad baja hace el criterio MÁS estricto (los huecos se
 * desplazan más despacio), del lado seguro para el jugador.
 */
export const STORM_HERO_DODGE_SPEED = 3.0;

// ── Espiral giratoria (GDD §15.5) ───────────────────────────────────────────

/**
 * Nº de brazos de la espiral. Los brazos van igualmente espaciados, así que el
 * hueco entre dos brazos contiguos es 2π/N. Con N=4 el hueco es π/2 ≈ 1.571
 * rad, muy por encima del ángulo de pasillo mínimo a r_min (~1.29 rad tras
 * subir `STORM_CORRIDOR_MARGIN` en el playtest 2026-07-15, ver
 * `stormCorridorMinAngle`): 4 brazos dejan siempre pasillo de sobra.
 */
export const STORM_SPIRAL_ARMS = 4;
/**
 * Velocidad angular de giro de la espiral (rad/s). A radio fijo, el hueco entre
 * brazos rota a esta velocidad, así que el héroe lo sigue a radio·ω u/s. Cota
 * de alcanzabilidad: STORM_REACH_RADIUS·ω ≤ STORM_HERO_DODGE_SPEED →
 * ω ≤ 3.0/6.0 = 0.5 rad/s. Se toma 0.45 (10% de holgura).
 */
export const STORM_SPIRAL_ANGULAR_SPEED = 0.45;
/**
 * Intervalo entre olas de la espiral por fase (s). Cada ola dispara los N
 * brazos a la vez; densificar (fase 2/3, GDD §15.5) = olas más juntas en el
 * tiempo, SIN tocar el nº de brazos (así el pasillo 2π/N no cambia). Índice
 * 0/1/2 = fase 1/2/3. Fase 1 subida de 0.16 a 0.18 (+12.5%) tras playtest
 * 2026-07-15 (David: "sigue siendo demasiado difícil quizá"): densidad de
 * fase 1 más floja, dentro del ~10-15% pedido — solo fase 1 (índice 0), fase
 * 2/3 se quedan igual de densas a propósito (ahí el jugador ya domina el
 * patrón y la presión extra es la que distingue esas fases). Subido de nuevo
 * un 33% (÷0.75) en LAS 3 FASES tras playtest 2026-07-17 (David: "si tienes
 * que lanzar menos proyectiles puedes hacerlo" — cada bala ahora lleva luz y
 * color propios, así que menos balas se leen mejor sin perder intensidad
 * percibida): ~25% menos olas en la misma `STORM_SPIRAL_DURATION`, sin tocar
 * `STORM_SPIRAL_ARMS` ni la velocidad angular (el pasillo 2π/N y su
 * alcanzabilidad no dependen del intervalo, solo de cuántos brazos hay).
 */
export const STORM_SPIRAL_EMIT_INTERVAL: readonly [number, number, number] = [0.24, 0.16, 0.16];
/** Duración de emisión de la espiral antes de darse por terminada (s), por fase. */
export const STORM_SPIRAL_DURATION: readonly [number, number, number] = [2.4, 2.4, 2.4];

// ── Anillos concéntricos (GDD §15.5) ────────────────────────────────────────

/**
 * Intervalo entre anillos por fase (s). Densificar en fase 2/3 = anillos más
 * juntos. Este intervalo entra en la cota de alcanzabilidad del desplazamiento
 * del hueco entre anillos consecutivos (ver `stormRingGapShiftMax`). Índice
 * 0/1/2 = fase 1/2/3.
 */
export const STORM_RING_INTERVAL: readonly [number, number, number] = [0.6, 0.45, 0.45];
/**
 * Separación angular objetivo entre balas CONTIGUAS del cuerpo del anillo (rad),
 * por fase. Debe ser suficientemente pequeña para que la parte llena del anillo
 * sea un "muro" que el héroe NO pueda cruzar (a r_min: 2·r·sin(Δ/2) < diámetro
 * del héroe). Fase 1 subida de 0.42 a 0.46 (+9.5%, dentro de lo pedido tras
 * playtest 2026-07-15 "sigue siendo demasiado difícil quizá") — techo real
 * ~0.479 (2·1.6·sin(Δ/2) < 0.76 → Δ < 0.479): 0.46 se queda con margen (0.46 →
 * 0.73 u entre centros < 0.76 ✓) sin arriesgar que el héroe se cuele por el
 * muro. Fase 2/3 se quedan en 0.30 (más densas a propósito, mismo criterio
 * que el intervalo de la espiral). El reparto real usa `ceil`, así que la
 * separación efectiva es ≤ ésta.
 */
export const STORM_RING_BULLET_SPACING: readonly [number, number, number] = [0.46, 0.3, 0.3];
/**
 * Nº de anillos por patrón antes de darse por terminado, por fase. Bajado de
 * [5,6,6] tras playtest 2026-07-17 (David: "si tienes que lanzar menos
 * proyectiles puedes hacerlo" — ~20-25% menos anillos con la luz+color por
 * bala ya puestos, cada anillo se lee mejor con menos balas): la ANCHURA del
 * hueco (`emitRing`) no depende de este número, solo cuántos anillos
 * completos se disparan antes de recargar.
 */
export const STORM_RING_COUNT: readonly [number, number, number] = [4, 5, 5];

// ── Ráfaga radial (GDD §15.5: "deja pasillos angulares completos") ──────────

/**
 * Nº de pasillos (huecos completos) que abre la ráfaga radial. Van igualmente
 * espaciados (2π/K entre centros); cada uno ≥ pasillo mínimo. Con K=3 y el
 * hueco de diseño real a r_min (`stormCorridorMinAngle`·`STORM_CORRIDOR_
 * SAFETY` ≈ 1.29·1.15 ≈ 1.49 rad tras subir el margen en el playtest
 * 2026-07-15) los huecos suman ~4.47 rad y queda ~1.82 rad de arco para el
 * muro de balas repartido en 3 arcos densos.
 */
export const STORM_BURST_CORRIDORS = 3;
/**
 * Separación angular objetivo entre balas contiguas de la ráfaga (rad), por
 * fase. Más apretada que en los anillos (antes de este tuning): la ráfaga es
 * una sola ola densa y no tiene presión de pool (ver presupuesto), así que se
 * permite un muro más tupido entre pasillos. Subida un 33% (÷0.75) tras
 * playtest 2026-07-17 (David: "si tienes que lanzar menos proyectiles puedes
 * hacerlo"): ~25% menos balas por muro sin tocar `STORM_BURST_CORRIDORS` ni
 * el ancho de los huecos (`stormCorridorMinAngle`), que son los que
 * garantizan el pasillo.
 */
export const STORM_BURST_BULLET_SPACING: readonly [number, number, number] = [0.32, 0.24, 0.24];

// ── Presupuesto de pool ─────────────────────────────────────────────────────

/**
 * Tope de balas de La Tormenta vivas a la vez. El pool global es 96
 * (PROJECTILE_POOL_SIZE) y lo comparten las balas del héroe; se reserva un
 * techo de 80 para el jefe (deja ~16 para el héroe). Es un presupuesto de
 * DISEÑO verificado por test de propiedad (se simula el patrón más denso —
 * incluida la cadena espiral→anillos de fase 3— y se comprueba que el pico de
 * balas vivas no lo supera). Justificación numérica: ver `stormBulletLifetimeMax`.
 */
export const STORM_MAX_LIVE_BULLETS_BUDGET = 80;

// ── Derivados puros (mantienen número y justificación sincronizados) ────────

/**
 * Ángulo (rad) que debe abarcar el pasillo, medido entre los CENTROS de las
 * dos balas que lo flanquean, a un radio dado, para dejar `STORM_CORRIDOR_MIN_
 * WIDTH` de aire libre entre sus BORDES. Geometría: la cuerda entre centros a
 * radio r es 2·r·sin(θ/2); restándole un radio de bala a cada lado queda el
 * aire libre. Despejando: θ = 2·asin((ancho/2 + radioBala)/r).
 * A r_min = 1.6: 2·asin((0.805+0.16)/1.6) = 2·asin(0.603) ≈ 1.295 rad (~74°)
 * (subido desde ~1.105 rad/~63° tras subir `STORM_CORRIDOR_MARGIN` de 0.6 a
 * 0.85 en el playtest 2026-07-15: "sigue siendo demasiado difícil quizá").
 */
export function stormCorridorMinAngle(radius: number): number {
  return 2 * Math.asin((STORM_CORRIDOR_MIN_WIDTH / 2 + STORM_BULLET_RADIUS) / radius);
}

/**
 * Desplazamiento angular MÁXIMO (rad) del hueco entre dos anillos consecutivos
 * de una fase dada, para que sea alcanzable a velocidad de héroe: el héroe debe
 * cubrir el arco `STORM_REACH_RADIUS·Δφ` en el intervalo entre anillos, a
 * `STORM_HERO_DODGE_SPEED`. Despejando: Δφ ≤ v·T / R.
 * Fase 1: 3.0·0.6/6.0 = 0.30 rad. Fase 2/3: 3.0·0.45/6.0 = 0.225 rad.
 */
export function stormRingGapShiftMax(phase: 1 | 2 | 3): number {
  return (STORM_HERO_DODGE_SPEED * STORM_RING_INTERVAL[phase - 1]) / STORM_REACH_RADIUS;
}

/**
 * Cota superior de la vida (s) de una bala: muere al tocar muro (arena
 * despejada) y como muy tarde al agotar `PROJECTILE_LIFETIME` (2.8 s). La
 * distancia máxima que recorre es del radio de emisión a la esquina interior:
 * (8.6 − 1.6)/3.9 ≈ 1.79 s < 2.8 s, así que manda el muro (subido desde
 * ~1.56 s al bajar `STORM_BULLET_SPEED` de 4.5 a 3.9 en el playtest
 * 2026-07-15: balas más lentas viven más, el presupuesto de pool de abajo
 * verifica que el pico sigue bajo el techo con esta vida más larga). Se usa
 * como cota para razonar el presupuesto de pool (pico ≈ cadencia·vida).
 */
export function stormBulletLifetimeMax(): number {
  const wallTravel = (STORM_ARENA_CORNER_RADIUS - STORM_MIN_EMISSION_RADIUS) / STORM_BULLET_SPEED;
  return Math.min(PROJECTILE_LIFETIME, wallTravel);
}
