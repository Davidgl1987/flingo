/**
 * La Tormenta (GDD §15.5, Fase B4) — el jefe de esquive puro (bullet hell).
 *
 * Este fichero fija TODOS los números de los tres generadores de patrones de
 * balas (espiral / anillos / ráfaga radial). El eje de diseño es la **regla de
 * honestidad** (GDD §15.5): las balas son lentas (≤ 4.5 u/s), los huecos
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
 * "balas ≤ 4.5 u/s"): lentas frente al héroe (lanzamiento 3.6–7.5 u/s, tope
 * 13.5 u/s, GDD apéndice) para que sean esquivables en todo momento con
 * movimiento normal.
 */
export const STORM_BULLET_SPEED = 4.5;
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
 * con margen: 0.95 + 0.38 = 1.33 → 1.6 deja 0.27 u de aire. TODAS las olas de
 * los tres patrones emiten exactamente a este radio, así que es el radio de
 * referencia (el más estrecho en unidades lineales) para el pasillo.
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

/** Diámetro del cuerpo del héroe (GDD apéndice: radio 0.38). El pasillo debe superarlo. */
export const STORM_HERO_DIAMETER = HERO_RADIUS * 2; // 0.76
/**
 * Margen generoso del pasillo por encima del diámetro del héroe (req. 1). Las
 * balas son lentas y "esquivables en todo momento con movimiento normal"
 * (GDD §15.5), así que el pasillo se dimensiona con holgura, no al filo del
 * cuerpo: 0.6 u de aire extra ≈ 0.8 radios de héroe a cada lado.
 */
export const STORM_CORRIDOR_MARGIN = 0.6;
/**
 * Ancho LINEAL mínimo de aire libre del pasillo (entre los BORDES de las balas
 * que lo flanquean), en unidades de mundo: diámetro del héroe + margen.
 * 0.76 + 0.6 = 1.36 u.
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
 * rad, muy por encima del ángulo de pasillo mínimo a r_min (~1.10 rad, ver
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
 * 0/1/2 = fase 1/2/3.
 */
export const STORM_SPIRAL_EMIT_INTERVAL: readonly [number, number, number] = [0.16, 0.12, 0.12];
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
 * del héroe): 0.42 → 0.67 u entre centros < 0.76 ✓. Fase 2/3 densifica a 0.30.
 * El reparto real usa `ceil`, así que la separación efectiva es ≤ ésta.
 */
export const STORM_RING_BULLET_SPACING: readonly [number, number, number] = [0.42, 0.3, 0.3];
/** Nº de anillos por patrón antes de darse por terminado, por fase. */
export const STORM_RING_COUNT: readonly [number, number, number] = [5, 6, 6];

// ── Ráfaga radial (GDD §15.5: "deja pasillos angulares completos") ──────────

/**
 * Nº de pasillos (huecos completos) que abre la ráfaga radial. Van igualmente
 * espaciados (2π/K entre centros); cada uno ≥ pasillo mínimo. Con K=3 y el
 * ángulo de pasillo a r_min (~1.10 rad) los huecos suman ~3.3 rad y queda ~3.0
 * rad de arco para el muro de balas repartido en 3 arcos densos.
 */
export const STORM_BURST_CORRIDORS = 3;
/**
 * Separación angular objetivo entre balas contiguas de la ráfaga (rad), por
 * fase. Más apretada que en los anillos (0.24/0.18): la ráfaga es una sola ola
 * densa y no tiene presión de pool (ver presupuesto), así que se permite un
 * muro más tupido entre pasillos.
 */
export const STORM_BURST_BULLET_SPACING: readonly [number, number, number] = [0.24, 0.18, 0.18];

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
 * A r_min = 1.6: 2·asin((0.68+0.16)/1.6) = 2·asin(0.525) ≈ 1.105 rad (~63°).
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
 * (8.6 − 1.6)/4.5 ≈ 1.56 s < 2.8 s, así que manda el muro. Se usa 1.56 s como
 * cota para razonar el presupuesto de pool (pico ≈ cadencia·vida).
 */
export function stormBulletLifetimeMax(): number {
  const wallTravel = (STORM_ARENA_CORNER_RADIUS - STORM_MIN_EMISSION_RADIUS) / STORM_BULLET_SPEED;
  return Math.min(PROJECTILE_LIFETIME, wallTravel);
}
