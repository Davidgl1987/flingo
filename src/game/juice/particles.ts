/**
 * Pool de partículas: arrays tipados preasignados (SoA), cero asignaciones
 * por frame. Un único InstancedMesh (ParticleView.tsx) lee este pool en
 * useFrame y muta sus matrices/color de instancia; este módulo solo posee
 * los datos y la lógica de spawn/update, sin three.js ni React.
 *
 * Cada partícula: posición + velocidad (plano XZ, "arriba" en Y para el
 * pequeño salto inicial), color (RGB [0,1]), tamaño base, vida restante y
 * vida total (para desvanecer). `active` marca los slots libres; spawn
 * recicla el slot más antiguo si el pool está lleno (nunca crece).
 */

export const PARTICLE_POOL_SIZE = 256;

export class ParticlePool {
  readonly capacity: number;
  readonly active: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly size: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  /** Puntero circular al próximo slot candidato a reciclar (evita escanear todo el pool en cada spawn). */
  private cursor = 0;
  /** Nº de slots activos ahora mismo (para tests/telemetría; no se usa en el hot path de three.js). */
  aliveCount = 0;

  constructor(capacity = PARTICLE_POOL_SIZE) {
    this.capacity = capacity;
    this.active = new Uint8Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.r = new Float32Array(capacity);
    this.g = new Float32Array(capacity);
    this.b = new Float32Array(capacity);
  }

  /** Busca un slot libre desde el cursor; si no hay ninguno, recicla el propio cursor (descarta la partícula más antigua en ese punto). */
  private nextSlot(): number {
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.cursor + i) % this.capacity;
      if (!this.active[idx]) {
        this.cursor = (idx + 1) % this.capacity;
        return idx;
      }
    }
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    return idx;
  }

  /**
   * Activa una partícula en el slot elegido. `angle`/`speed` fijan la
   * velocidad horizontal (plano XZ); `upSpeed` da el impulso vertical
   * inicial (pequeño salto/estallido).
   */
  spawn(
    x: number,
    z: number,
    angle: number,
    speed: number,
    upSpeed: number,
    size: number,
    life: number,
    r: number,
    g: number,
    b: number,
  ): void {
    const idx = this.nextSlot();
    if (!this.active[idx]) this.aliveCount++;
    this.active[idx] = 1;
    this.x[idx] = x;
    this.y[idx] = 0;
    this.z[idx] = z;
    this.vx[idx] = Math.cos(angle) * speed;
    this.vy[idx] = upSpeed;
    this.vz[idx] = Math.sin(angle) * speed;
    this.size[idx] = size;
    this.life[idx] = life;
    this.maxLife[idx] = life;
    this.r[idx] = r;
    this.g[idx] = g;
    this.b[idx] = b;
  }

  /** Lanza un burst de `count` partículas en abanico 360° alrededor de (x,z), con jitter de velocidad/tamaño. */
  burst(
    x: number,
    z: number,
    count: number,
    baseSpeed: number,
    baseSize: number,
    life: number,
    r: number,
    g: number,
    b: number,
    rng: () => number,
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const speed = baseSpeed * (0.5 + rng());
      const upSpeed = baseSpeed * (0.3 + rng() * 0.9);
      const size = baseSize * (0.7 + rng() * 0.6);
      this.spawn(x, z, angle, speed, upSpeed, size, life, r, g, b);
    }
  }

  /** Integra física simple (gravedad ligera + fricción del aire) y expira partículas agotadas. Cero asignaciones. */
  update(dt: number): void {
    const GRAVITY = 4.2;
    const DRAG = 0.9;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.active[i]) continue;
      const life = this.life[i] - dt;
      if (life <= 0) {
        this.active[i] = 0;
        this.aliveCount--;
        continue;
      }
      this.life[i] = life;
      this.vy[i] -= GRAVITY * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      const drag = Math.exp(-DRAG * dt);
      this.vx[i] *= drag;
      this.vz[i] *= drag;
      if (this.y[i] < 0) {
        this.y[i] = 0;
        this.vy[i] = 0;
      }
    }
  }
}
