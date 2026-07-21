/**
 * Capa de cera PERSISTENTE (rama `estilo-oscuro`, playtest ronda 7, David:
 * "la cera que deja de rastro se va haciendo pequeña... la cera no se hace
 * pequeña, como mucho que desaparezca poco a poco, pero tampoco debería...
 * hay que dejar un rastro de todos los movimientos que ha hecho"):
 * a diferencia de `TrailPool` (estela de vida corta, cadencia por TIEMPO,
 * solo mientras el héroe va rápido), este pool es un ring buffer GRANDE de
 * puntos SIN vida/decay — un punto depositado permanece para siempre, tal
 * cual se depositó (mismo tamaño, mismo color), hasta que el buffer se llena
 * y el más antiguo se recicla para dejar sitio al nuevo. Emisión por
 * DISTANCIA recorrida (no por tiempo, ver HeroView.tsx/ProjectileView.tsx):
 * el rastro queda uniforme sea cual sea la velocidad del héroe, en vez de
 * "solo cuando corre" como la estela clásica.
 *
 * Cero three.js aquí (mismo criterio que TrailPool/ParticlePool): datos +
 * lógica de depósito/reciclaje puros, testeables sin infraestructura de
 * render 3D. `WaxView.tsx` es el único consumidor.
 *
 * Diseño para render barato (visto en WaxView.tsx): en vez de que la vista
 * recorra las `capacity` instancias cada frame (como hace TrailView, que sí
 * necesita recalcular todas porque la vida cambia sin parar), esta clase
 * expone `version` (incrementado en cada `emit`) y `epoch` (incrementado
 * SOLO en `clear`) — la vista puede así actualizar ÚNICAMENTE las instancias
 * de InstancedMesh que cambiaron desde el último frame (los últimos `version
 * - lastVersion` índices que terminan en `cursor - 1`), sin tocar el resto,
 * y solo hace un barrido completo (ocultar todo) el frame en que detecta un
 * `clear()`.
 */

export const WAX_POOL_CAPACITY = 2000;

/** Cadencia de depósito del héroe: un punto cada ~0.3-0.4 u recorridas (rastro uniforme de TODOS sus movimientos, sin umbral de velocidad). */
export const HERO_WAX_EMIT_DISTANCE = 0.35;
/** Cadencia de depósito de los proyectiles del héroe: algo más espaciada (van más rápido, un punto cada ~0.5 u ya deja un rastro denso). */
export const PROJECTILE_WAX_EMIT_DISTANCE = 0.5;

export class WaxPool {
  readonly capacity: number;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly size: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  /** Próximo índice a escribir (ring buffer: da la vuelta y recicla el más antiguo). */
  cursor = 0;
  /** Nº de slots usados alguna vez, saturado en `capacity` (dice a la vista cuántas instancias hay que mostrar antes de que el buffer haya dado una vuelta completa). */
  count = 0;
  /** Nº total de depósitos desde que existe el pool (nunca se resetea, ni en `clear`): la vista lo usa para detectar cuántos puntos nuevos hay que subir a la GPU. */
  version = 0;
  /** Incrementado SOLO en `clear()`: la vista lo usa para distinguir "se depositaron puntos nuevos" de "el pool se vació" (que exige ocultar TODAS las instancias, no solo actualizar las nuevas). */
  epoch = 0;

  constructor(capacity = WAX_POOL_CAPACITY) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.r = new Float32Array(capacity);
    this.g = new Float32Array(capacity);
    this.b = new Float32Array(capacity);
  }

  /** Deposita un punto de cera fijo (sin vida): recicla el más antiguo si el buffer está lleno. Devuelve el índice escrito. */
  emit(x: number, z: number, size: number, r: number, g: number, b: number): number {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.x[idx] = x;
    this.z[idx] = z;
    this.size[idx] = size;
    this.r[idx] = r;
    this.g[idx] = g;
    this.b[idx] = b;
    if (this.count < this.capacity) this.count++;
    this.version++;
    return idx;
  }

  /** Vacía la capa (reinicio de run / cambio de mazmorra — NUNCA al cambiar de sala dentro de la misma mazmorra, ver session.ts). */
  clear(): void {
    this.cursor = 0;
    this.count = 0;
    this.epoch++;
  }
}
