/**
 * Estado mutable de juice (ARCHITECTURE.md, "Juice (implementación)"): trauma
 * de cámara y hit-stop. Objeto plano preasignado, cero asignaciones por
 * frame; funciones puras de actualización para poder testear headless (sin
 * three.js ni R3F).
 *
 * - Trauma: valor [0,1] que decae con el tiempo; CameraRig lo consume como
 *   offset = trauma² × ruido (GDD §12: sacudida breve, amortiguada, nunca
 *   mareante).
 * - Hit-stop: mientras `hitStopRemaining > 0`, useGameLoop escala el dt del
 *   acumulador (ralentiza la sim sin congelar el render).
 */

/** Decaimiento del trauma por segundo (fracción restante ≈ e^(-DECAY·dt)). */
const TRAUMA_DECAY_PER_SECOND = 2.6;

/** Fracción de dt aplicada a la sim mientras dura el hit-stop (no la congela del todo). */
export const HIT_STOP_TIME_SCALE = 0.12;

export interface JuiceState {
  /** [0,1]; decae hacia 0. */
  trauma: number;
  /** Segundos restantes de hit-stop activo (0 = sin hit-stop). */
  hitStopRemaining: number;
}

export function createJuiceState(): JuiceState {
  return { trauma: 0, hitStopRemaining: 0 };
}

/** Añade trauma (clamp a [0,1]); los eventos más fuertes suman más. */
export function addTrauma(state: JuiceState, amount: number): void {
  const next = state.trauma + amount;
  state.trauma = next > 1 ? 1 : next < 0 ? 0 : next;
}

/** Decae el trauma exponencialmente con el tiempo real transcurrido (s). */
export function decayTrauma(state: JuiceState, dt: number): void {
  if (state.trauma <= 0) {
    state.trauma = 0;
    return;
  }
  const next = state.trauma * Math.exp(-TRAUMA_DECAY_PER_SECOND * dt);
  state.trauma = next < 0.001 ? 0 : next;
}

/** Arma (o extiende) el hit-stop a al menos `seconds` (no lo acorta si ya hay uno más largo en curso). */
export function triggerHitStop(state: JuiceState, seconds: number): void {
  if (seconds > state.hitStopRemaining) {
    state.hitStopRemaining = seconds;
  }
}

/**
 * Consume `dt` de reloj real contra el hit-stop restante y devuelve el factor
 * de escala a aplicar al dt de la sim para este frame: HIT_STOP_TIME_SCALE
 * mientras dure, 1 (sin efecto) en cuanto se agota.
 */
export function consumeHitStop(state: JuiceState, dt: number): number {
  if (state.hitStopRemaining <= 0) return 1;
  state.hitStopRemaining -= dt;
  if (state.hitStopRemaining < 0) state.hitStopRemaining = 0;
  return HIT_STOP_TIME_SCALE;
}
