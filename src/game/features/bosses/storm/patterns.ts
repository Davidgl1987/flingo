/**
 * La Tormenta (GDD §15.5, Fase B4) — generadores de patrones de balas con
 * PASILLO GARANTIZADO POR CONSTRUCCIÓN.
 *
 * Alcance de este módulo: SOLO los tres generadores de balas (espiral, anillos,
 * ráfaga radial) + su estado preasignado. La máquina de estados del jefe
 * (telegraphs, recarga = ventana de vulnerabilidad, encadenado espiral→anillos
 * de fase 3, umbrales de fase) la monta el AGENTE INTEGRADOR sobre el framework
 * de `bosses/` (types.ts/lifecycle.ts/registry.ts). Nada aquí importa React ni
 * three: es sim pura, testeable sin mundo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRATO PARA EL INTEGRADOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. ESTADO. Reserva UNA vez `const s = createStormState()` (en `BossDef.onInit`)
 *    y guárdalo. Aquí es un struct autónomo; para colgarlo de `world.bossState`
 *    (patrón de la Reina) añade `'storm'` a `BossId` (world/types.ts) y una
 *    entrada en `BOSS_DEFS`, y entonces puedes marcar `StormState extends
 *    BossState`. Mientras tanto guárdalo donde te sea cómodo (p.ej. junto al
 *    `emit`). Cero asignaciones nuevas por tick: todos los campos ya existen.
 *
 * 2. EMISIÓN (cero allocs). Crea UNA vez un `StormEmit` ligado a
 *    `fireEnemyProjectile` y reutilízalo cada tick:
 *      const emit: StormEmit = (x, y, dx, dy, sp, dmg, r) =>
 *        void fireEnemyProjectile(world, x, y, dx, dy, sp, dmg, r);
 *    (fireEnemyProjectile devuelve false si el pool está lleno; se ignora a
 *    propósito: degradación silenciosa, igual criterio que `acquirePuddle`.)
 *
 * 3. ARRANCAR un patrón: llama a `resetSpiral(s, cx, cy, rng)`,
 *    `resetRings(s, cx, cy, phase, rng)` o `resetBurst(s, cx, cy, rng)` con el
 *    centro del jefe (`boss.position`) y `world.rng` — los tres DECIDEN YA el
 *    ángulo (base de brazos / hueco / pasillos) y lo guardan en `StormState`
 *    (`spiralBaseAngle`/`ringGapAngle`/`burstBaseAngle` respectivamente),
 *    legible por el render ANTES de que se emita una sola bala (tuning
 *    post-playtest 2026-07-15, "anillo de Saturno segmentado": el integrador
 *    llama al reset correspondiente en cuanto decide el próximo patrón —
 *    `storm/pattern.ts::stormEnterReload` — no al arrancar su ejecución, para
 *    poder pintar los ángulos reales desde la insinuación). La ráfaga radial
 *    sigue sin reloj propio (una sola ola): `resetBurst` solo fija centro y
 *    ángulo base; `fireRadialBurst(s, phase, emit)` dispara con lo ya decidido.
 *
 * 4. AVANZAR: cada tick mientras el patrón esté activo llama a
 *    `stepSpiral(s, dt, phase, emit)` / `stepRings(s, dt, phase, emit, rng)`.
 *    DEVUELVE `true` mientras siga emitiendo y `false` el tick en que TERMINA
 *    (ya no quedan olas por lanzar). Cuando devuelve `false`, el patrón acabó:
 *    abre tu ventana de recarga, o —fase 3— llama a `resetRings` acto seguido
 *    para encadenar espiral→anillos sin pausa (GDD §15.5).
 *
 * 5. RESET/REINICIO limpio: volver a llamar a `resetSpiral`/`resetRings` deja el
 *    patrón como recién nacido (contadores/acumuladores a cero). No hace falta
 *    limpiar balas vivas: siguen su vuelo y mueren solas (ttl/muro).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EL PASILLO ES DEMOSTRABLE (regla de honestidad §15.5)
 * ─────────────────────────────────────────────────────────────────────────────
 * Las balas vuelan en línea RECTA RADIAL desde el centro, así que conservan su
 * ángulo polar. A un radio r dado, las balas que el héroe cruza son las de UNA
 * ola de emisión, y su pasillo lineal solo se ENSANCHA con r (mismo ángulo,
 * más radio). Por eso basta con garantizar, en el radio de emisión mínimo
 * (el más estrecho), que cada ola deja su hueco ≥ pasillo mínimo:
 *   - Espiral: cada ola = N brazos equiespaciados → hueco 2π/N (fijo, no
 *     depende de la fase). El hueco rota a ω; alcanzable si REACH·ω ≤ v_héroe.
 *   - Anillos: cada anillo abre un hueco de diseño ≥ pasillo mínimo; el resto se
 *     rellena tan tupido que no forma pasillos accidentales. El centro del hueco
 *     se desplaza entre anillos como mucho `stormRingGapShiftMax(phase)`, que es
 *     alcanzable a velocidad de héroe por construcción.
 *   - Ráfaga: K huecos equiespaciados, cada uno ≥ pasillo mínimo.
 * Ninguna bala nace por debajo de `STORM_MIN_EMISSION_RADIUS` (req. 2).
 */

import type { Rng } from '@/engine/rng';
import {
  STORM_BULLET_DAMAGE,
  STORM_BULLET_RADIUS,
  STORM_BULLET_SPEED,
  STORM_BURST_BULLET_SPACING,
  STORM_BURST_CORRIDORS,
  STORM_CORRIDOR_SAFETY,
  STORM_MIN_EMISSION_RADIUS,
  STORM_RING_BULLET_SPACING,
  STORM_RING_COUNT,
  STORM_RING_INTERVAL,
  STORM_SPIRAL_ANGULAR_SPEED,
  STORM_SPIRAL_ARMS,
  STORM_SPIRAL_DURATION,
  STORM_SPIRAL_EMIT_INTERVAL,
  stormCorridorMinAngle,
  stormRingGapShiftMax,
} from './constants';

/**
 * Callback de emisión de UNA bala. Misma forma que los 8 primeros argumentos de
 * `fireEnemyProjectile` (sin `world` ni `bouncesLeft`: las balas de La Tormenta
 * no rebotan, mueren al primer muro). El integrador lo liga una vez a
 * `fireEnemyProjectile`; los tests le pasan un recolector. Debe ser estable
 * (creado una sola vez) para no asignar por tick.
 */
export type StormEmit = (
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  speed: number,
  damage: number,
  radius: number,
) => void;

/**
 * Estado preasignado de los generadores de La Tormenta. Todos los campos son
 * escalares; se mutan in situ (cero allocs por tick). Solo un patrón está
 * activo a la vez, pero cada uno tiene sus propios campos para que arrancarse/
 * resetearse sea independiente y explícito (el integrador encadena
 * espiral→anillos reseteando el segundo). Aún NO `extends BossState` a
 * propósito: `BossId` todavía no incluye `'storm'` (lo añade el integrador).
 */
export interface StormState {
  readonly bossId: 'storm';
  /** Centro de emisión (posición del jefe congelada al arrancar el patrón). */
  centerX: number;
  centerY: number;
  // ── Espiral ──
  /** Tiempo emitiendo la espiral (s); al llegar a la duración de fase, termina. */
  spiralElapsed: number;
  /** Cuenta atrás hasta la próxima ola de la espiral (s). */
  spiralEmitTimer: number;
  /** Ángulo base del brazo 0 (rad); rota a STORM_SPIRAL_ANGULAR_SPEED. */
  spiralBaseAngle: number;
  // ── Anillos ──
  /** Cuenta atrás hasta el próximo anillo (s). */
  ringEmitTimer: number;
  /** Centro angular del hueco del próximo anillo (rad). Se desplaza por anillo. */
  ringGapAngle: number;
  /** Anillos ya emitidos en este patrón. */
  ringsEmitted: number;
  /** Desplazamiento máximo del hueco por anillo (rad), fijado según la fase al resetear. */
  ringGapShiftMax: number;
  // ── Ráfaga radial ──
  /** Ángulo base de los `STORM_BURST_CORRIDORS` pasillos (rad), decidido por `resetBurst`; legible por el render antes de disparar. */
  burstBaseAngle: number;
}

/** Crea el estado preasignado (una vez, en `onInit`). Único punto que asigna. */
export function createStormState(): StormState {
  return {
    bossId: 'storm',
    centerX: 0,
    centerY: 0,
    spiralElapsed: 0,
    spiralEmitTimer: 0,
    spiralBaseAngle: 0,
    ringEmitTimer: 0,
    ringGapAngle: 0,
    ringsEmitted: 0,
    ringGapShiftMax: 0,
    burstBaseAngle: 0,
  };
}

/** Emite una bala hacia el ángulo `angle` (rad), naciendo en el radio de emisión mínimo. */
function emitBulletAtAngle(emit: StormEmit, centerX: number, centerY: number, angle: number): void {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  emit(
    centerX + dirX * STORM_MIN_EMISSION_RADIUS,
    centerY + dirY * STORM_MIN_EMISSION_RADIUS,
    dirX,
    dirY,
    STORM_BULLET_SPEED,
    STORM_BULLET_DAMAGE,
    STORM_BULLET_RADIUS,
  );
}

// ── Espiral giratoria ───────────────────────────────────────────────────────

/**
 * Arranca (o reinicia) la espiral. La densidad la aplica `stepSpiral` según la
 * fase, así que aquí no hace falta la fase. El ángulo base inicial se aleatoriza
 * con `rng` (determinista del proyecto, `world.rng`) para que dos combates no
 * sean idénticos, sin afectar a la garantía de pasillo (el hueco 2π/N no depende
 * del ángulo base).
 */
export function resetSpiral(s: StormState, centerX: number, centerY: number, rng: Rng): void {
  s.centerX = centerX;
  s.centerY = centerY;
  s.spiralElapsed = 0;
  s.spiralEmitTimer = 0; // primera ola en el primer tick
  s.spiralBaseAngle = rng() * Math.PI * 2;
}

/**
 * Avanza la espiral un tick. Rota el ángulo base a `STORM_SPIRAL_ANGULAR_SPEED`
 * y, cada `STORM_SPIRAL_EMIT_INTERVAL[fase]`, dispara los N brazos a la vez
 * (equiespaciados → hueco 2π/N entre brazos contiguos). Devuelve `true`
 * mientras siga emitiendo; `false` el tick en que agota su duración.
 */
export function stepSpiral(s: StormState, dt: number, phase: 1 | 2 | 3, emit: StormEmit): boolean {
  s.spiralElapsed += dt;
  s.spiralBaseAngle += STORM_SPIRAL_ANGULAR_SPEED * dt;

  s.spiralEmitTimer -= dt;
  if (s.spiralEmitTimer <= 0) {
    s.spiralEmitTimer += STORM_SPIRAL_EMIT_INTERVAL[phase - 1];
    const step = (Math.PI * 2) / STORM_SPIRAL_ARMS;
    for (let k = 0; k < STORM_SPIRAL_ARMS; k++) {
      emitBulletAtAngle(emit, s.centerX, s.centerY, s.spiralBaseAngle + k * step);
    }
  }

  return s.spiralElapsed < STORM_SPIRAL_DURATION[phase - 1];
}

// ── Anillos concéntricos ────────────────────────────────────────────────────

/**
 * Arranca (o reinicia) los anillos. Fija el desplazamiento máximo del hueco por
 * anillo según la fase (alcanzable a velocidad de héroe por construcción) y
 * aleatoriza el hueco del primer anillo.
 */
export function resetRings(s: StormState, centerX: number, centerY: number, phase: 1 | 2 | 3, rng: Rng): void {
  s.centerX = centerX;
  s.centerY = centerY;
  s.ringEmitTimer = 0; // primer anillo en el primer tick
  s.ringsEmitted = 0;
  s.ringGapAngle = rng() * Math.PI * 2;
  s.ringGapShiftMax = stormRingGapShiftMax(phase);
}

/**
 * Emite un anillo: un hueco de diseño (≥ pasillo mínimo, con factor de
 * seguridad) centrado en `s.ringGapAngle`, y el resto de la circunferencia
 * relleno de balas tan tupido que no forma pasillos accidentales. Reparte con
 * `ceil` para que la separación efectiva sea ≤ la objetivo (nunca un hueco
 * grande de más).
 */
function emitRing(s: StormState, phase: 1 | 2 | 3, emit: StormEmit): void {
  const gap = stormCorridorMinAngle(STORM_MIN_EMISSION_RADIUS) * STORM_CORRIDOR_SAFETY; // hueco de diseño
  const filled = Math.PI * 2 - gap;
  const spacing = STORM_RING_BULLET_SPACING[phase - 1];
  const count = Math.max(1, Math.ceil(filled / spacing));
  const step = filled / count;
  // Reparte `count+1` balas desde el borde del hueco hasta el otro borde
  // (ambos bordes incluidos): así los dos extremos del hueco quedan flanqueados
  // por una bala y el único arco grande es el hueco.
  const start = s.ringGapAngle + gap / 2;
  for (let i = 0; i <= count; i++) {
    emitBulletAtAngle(emit, s.centerX, s.centerY, start + i * step);
  }
}

/**
 * Avanza los anillos un tick. Cada `STORM_RING_INTERVAL[fase]` emite un anillo y
 * desplaza el hueco del siguiente en un valor aleatorio acotado por
 * `s.ringGapShiftMax` (alcanzable). Devuelve `true` hasta emitir el último
 * anillo de la fase.
 */
export function stepRings(s: StormState, dt: number, phase: 1 | 2 | 3, emit: StormEmit, rng: Rng): boolean {
  s.ringEmitTimer -= dt;
  if (s.ringEmitTimer <= 0) {
    emitRing(s, phase, emit);
    s.ringsEmitted++;
    s.ringEmitTimer += STORM_RING_INTERVAL[phase - 1];
    // Desplaza el hueco del PRÓXIMO anillo dentro del rango alcanzable.
    s.ringGapAngle += (rng() * 2 - 1) * s.ringGapShiftMax;
  }
  return s.ringsEmitted < STORM_RING_COUNT[phase - 1];
}

// ── Ráfaga radial ───────────────────────────────────────────────────────────

/**
 * Arranca (o reinicia) la ráfaga radial: fija el centro de emisión y
 * aleatoriza CON `rng` el ángulo base de los `STORM_BURST_CORRIDORS` pasillos
 * — mismo criterio que `resetSpiral`/`resetRings` (decidir ANTES de emitir,
 * tuning post-playtest 2026-07-15: el render necesita el ángulo real desde la
 * insinuación, no solo al disparar). Sin más estado que fijar: la ráfaga no
 * tiene reloj propio (una sola ola).
 */
export function resetBurst(s: StormState, centerX: number, centerY: number, rng: Rng): void {
  s.centerX = centerX;
  s.centerY = centerY;
  s.burstBaseAngle = rng() * Math.PI * 2;
}

/**
 * Dispara una ráfaga radial de una vez: `STORM_BURST_CORRIDORS` huecos
 * equiespaciados (cada uno ≥ pasillo mínimo) y el resto relleno tupido. Sin
 * reloj propio (una sola ola); el ángulo base y el centro YA se decidieron en
 * `resetBurst` (llamado por el integrador al decidir este patrón, no aquí)
 * — este generador ya no consume `rng`.
 */
export function fireRadialBurst(s: StormState, phase: 1 | 2 | 3, emit: StormEmit): void {
  const gap = stormCorridorMinAngle(STORM_MIN_EMISSION_RADIUS) * STORM_CORRIDOR_SAFETY; // hueco de diseño
  const sector = (Math.PI * 2) / STORM_BURST_CORRIDORS; // arco por (hueco + muro)
  const filled = sector - gap; // muro entre dos huecos contiguos
  const spacing = STORM_BURST_BULLET_SPACING[phase - 1];
  const base = s.burstBaseAngle;
  const count = Math.max(1, Math.ceil(filled / spacing));
  const step = filled / count;
  for (let c = 0; c < STORM_BURST_CORRIDORS; c++) {
    // El muro c ocupa el arco (base + c·sector + gap/2 .. + sector - gap/2),
    // dejando un hueco de `gap` centrado en `base + c·sector`.
    const wallStart = base + c * sector + gap / 2;
    for (let i = 0; i <= count; i++) {
      emitBulletAtAngle(emit, s.centerX, s.centerY, wallStart + i * step);
    }
  }
}
