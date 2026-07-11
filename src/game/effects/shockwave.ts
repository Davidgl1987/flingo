/**
 * Ondas expansivas (explosión de barril, GDD §12: "el evento más gordo del
 * juego — gran onda"): pool minúsculo de anillos que crecen y se desvanecen.
 * Datos puros (sin three.js); ShockwaveView.tsx los renderiza con meshes de
 * anillo preasignados.
 */

export const SHOCKWAVE_POOL_SIZE = 4;
/** Vida de la onda (s): crece de radio ~0 al radio objetivo mientras se desvanece. */
export const SHOCKWAVE_LIFE = 0.45;

export class ShockwavePool {
  readonly capacity: number;
  readonly active: Uint8Array;
  readonly x: Float32Array;
  readonly z: Float32Array;
  /** Radio final que alcanza el anillo al morir (el radio de la explosión). */
  readonly maxRadius: Float32Array;
  readonly life: Float32Array;
  private cursor = 0;

  constructor(capacity = SHOCKWAVE_POOL_SIZE) {
    this.capacity = capacity;
    this.active = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.maxRadius = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
  }

  spawn(x: number, z: number, maxRadius: number): void {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.active[idx] = 1;
    this.x[idx] = x;
    this.z[idx] = z;
    this.maxRadius[idx] = maxRadius;
    this.life[idx] = SHOCKWAVE_LIFE;
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
