/**
 * Estela del héroe (GDD §12: "estela sutil mientras va rápido, que comunica
 * su velocidad"). Pool pequeño e independiente del de partículas: cada slot
 * es un punto fijo que solo se desvanece (sin física), depositado desde
 * TrailView en useFrame cuando la velocidad del héroe supera el umbral.
 */

export const TRAIL_POOL_SIZE = 24;
/** Velocidad del héroe (u/s) a partir de la cual empieza a depositar estela. */
export const TRAIL_SPEED_THRESHOLD = 4.5;
/** Cadencia de emisión de puntos de estela (s) mientras se cumple el umbral. */
export const TRAIL_EMIT_INTERVAL = 0.03;
export const TRAIL_LIFE = 0.35;

/** Color por defecto de la estela (cuerpo/azul), usado si `emit` no recibe uno explícito. */
export const TRAIL_DEFAULT_COLOR: readonly [number, number, number] = [0.75, 0.91, 1];

export class TrailPool {
  readonly capacity: number;
  readonly active: Uint8Array;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly size: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  /** Color por punto (punto 1 de playtest ronda 3: la estela sigue el color del arma activa). */
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  private cursor = 0;

  constructor(capacity = TRAIL_POOL_SIZE) {
    this.capacity = capacity;
    this.active = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.r = new Float32Array(capacity).fill(TRAIL_DEFAULT_COLOR[0]);
    this.g = new Float32Array(capacity).fill(TRAIL_DEFAULT_COLOR[1]);
    this.b = new Float32Array(capacity).fill(TRAIL_DEFAULT_COLOR[2]);
  }

  emit(
    x: number,
    z: number,
    size: number,
    life = TRAIL_LIFE,
    r = TRAIL_DEFAULT_COLOR[0],
    g = TRAIL_DEFAULT_COLOR[1],
    b = TRAIL_DEFAULT_COLOR[2],
  ): void {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.active[idx] = 1;
    this.x[idx] = x;
    this.z[idx] = z;
    this.size[idx] = size;
    this.life[idx] = life;
    this.maxLife[idx] = life;
    this.r[idx] = r;
    this.g[idx] = g;
    this.b[idx] = b;
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      const life = this.life[i] - dt;
      if (life <= 0) {
        this.active[i] = 0;
        continue;
      }
      this.life[i] = life;
    }
  }
}
