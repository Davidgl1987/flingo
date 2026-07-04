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

export class TrailPool {
  readonly capacity: number;
  readonly active: Uint8Array;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly size: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  private cursor = 0;

  constructor(capacity = TRAIL_POOL_SIZE) {
    this.capacity = capacity;
    this.active = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
  }

  emit(x: number, z: number, size: number, life = TRAIL_LIFE): void {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.active[idx] = 1;
    this.x[idx] = x;
    this.z[idx] = z;
    this.size[idx] = size;
    this.life[idx] = life;
    this.maxLife[idx] = life;
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
