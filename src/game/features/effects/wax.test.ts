/**
 * Tests headless de la capa de cera persistente (WaxPool, rama
 * `estilo-oscuro`, playtest ronda 7): ring buffer SIN vida/decay — un punto
 * depositado permanece tal cual hasta que el buffer se llena y el más
 * antiguo se recicla. Sin three.js (mismo criterio que particles.test.ts).
 */

import { describe, expect, it } from 'vitest';
import { WaxPool, WAX_POOL_CAPACITY } from './wax';

describe('WaxPool', () => {
  it('el tamaño por defecto es el del presupuesto (~2000)', () => {
    const pool = new WaxPool();
    expect(pool.capacity).toBe(WAX_POOL_CAPACITY);
    expect(WAX_POOL_CAPACITY).toBe(2000);
  });

  it('el pool no crece: los arrays mantienen su capacidad aunque se depositen muchos más puntos', () => {
    const pool = new WaxPool(16);
    for (let i = 0; i < 100; i++) pool.emit(i, i, 0.5, 1, 1, 1);
    expect(pool.capacity).toBe(16);
    expect(pool.x.length).toBe(16);
    expect(pool.count).toBe(16); // saturado, nunca por encima de capacity
  });

  it('los puntos NO tienen vida: emitir uno y no volver a tocarlo deja sus datos intactos indefinidamente (no hay update() que los desvanezca)', () => {
    const pool = new WaxPool(8);
    pool.emit(3, 4, 0.7, 0.1, 0.2, 0.3);
    // No existe pool.update(...) — a propósito, ver cabecera del módulo.
    expect((pool as unknown as { update?: unknown }).update).toBeUndefined();
    expect(pool.x[0]).toBe(3);
    expect(pool.z[0]).toBe(4);
    expect(pool.size[0]).toBeCloseTo(0.7); // el tamaño depositado nunca se encoge (Float32Array: comparar con tolerancia)
  });

  it('reciclaje del más antiguo: al saturar el buffer, el siguiente emit() sobrescribe el slot 0 (el primero en depositarse)', () => {
    const pool = new WaxPool(4);
    pool.emit(10, 10, 1, 1, 0, 0); // idx 0
    pool.emit(11, 11, 1, 0, 1, 0); // idx 1
    pool.emit(12, 12, 1, 0, 0, 1); // idx 2
    pool.emit(13, 13, 1, 1, 1, 0); // idx 3 — buffer lleno
    expect(pool.count).toBe(4);

    pool.emit(99, 99, 1, 1, 1, 1); // da la vuelta: recicla idx 0 (el más antiguo)
    expect(pool.x[0]).toBe(99);
    expect(pool.z[0]).toBe(99);
    // Los demás slots (más recientes que el reciclado) no se tocan.
    expect(pool.x[1]).toBe(11);
    expect(pool.x[2]).toBe(12);
    expect(pool.x[3]).toBe(13);
    expect(pool.count).toBe(4); // sigue saturado, no crece por encima de capacity
  });

  it('cursor da la vuelta en ring: tras `capacity` emits, el próximo escribe otra vez en el índice 0', () => {
    const pool = new WaxPool(5);
    for (let i = 0; i < 5; i++) pool.emit(i, 0, 1, 1, 1, 1);
    expect(pool.cursor).toBe(0);
    const idx = pool.emit(42, 0, 1, 1, 1, 1);
    expect(idx).toBe(0);
    expect(pool.x[0]).toBe(42);
  });

  it('version se incrementa en cada emit (nunca en clear): permite a la vista detectar cuántos puntos nuevos hay sin comparar arrays', () => {
    const pool = new WaxPool(4);
    expect(pool.version).toBe(0);
    pool.emit(0, 0, 1, 1, 1, 1);
    pool.emit(0, 0, 1, 1, 1, 1);
    expect(pool.version).toBe(2);
    pool.clear();
    expect(pool.version).toBe(2); // clear() no toca version (es acumulado, no un contador de "activos")
  });

  it('clear() reinicia cursor/count a 0 e incrementa epoch (reinicio de run/mazmorra), pero preserva version', () => {
    const pool = new WaxPool(4);
    pool.emit(1, 1, 1, 1, 1, 1);
    pool.emit(2, 2, 1, 1, 1, 1);
    expect(pool.count).toBe(2);
    expect(pool.epoch).toBe(0);

    pool.clear();
    expect(pool.cursor).toBe(0);
    expect(pool.count).toBe(0);
    expect(pool.epoch).toBe(1);

    // Tras clear(), el ring buffer vuelve a escribir desde el índice 0 (como recién creado).
    const idx = pool.emit(9, 9, 1, 1, 1, 1);
    expect(idx).toBe(0);
    expect(pool.count).toBe(1);
  });
});
