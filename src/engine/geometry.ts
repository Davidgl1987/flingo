/**
 * Primitivas geométricas del plano del suelo. Genéricas, sin dominio de juego.
 *
 * Sistema de coordenadas: la sim vive en 2D sobre el plano del suelo.
 * `Vec2.x` ≡ X del mundo 3D y `Vec2.y` ≡ Z del mundo 3D (plano XZ).
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** Caja alineada a ejes en el plano del suelo. */
export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
