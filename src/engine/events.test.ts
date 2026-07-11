/**
 * Tests del ring buffer de eventos.
 */

import { describe, expect, it } from 'vitest';
import { createEventQueue, drainEvents, pushEvent, type GameEvent } from './events';

describe('cola de eventos (ring buffer)', () => {
  it('entrega los eventos en orden y vacía la cola al drenar', () => {
    const queue = createEventQueue(8);
    pushEvent(queue, 'launch', 1, 2, 0.5);
    pushEvent(queue, 'wall-bounce', 3, 4, 6);

    const collected: GameEvent[] = [];
    drainEvents(queue, (e) => collected.push({ ...e }));
    expect(collected.map((e) => e.type)).toEqual(['launch', 'wall-bounce']);
    expect(collected[1].x).toBe(3);
    expect(collected[1].intensity).toBe(6);

    const second: GameEvent[] = [];
    drainEvents(queue, (e) => second.push({ ...e }));
    expect(second).toHaveLength(0);
  });

  it('al desbordar sobrescribe los eventos más antiguos sin crecer', () => {
    const queue = createEventQueue(4);
    for (let i = 0; i < 6; i++) {
      pushEvent(queue, 'wall-bounce', i, 0, i);
    }
    expect(queue.slots.length).toBe(4); // no ha crecido
    const collected: GameEvent[] = [];
    drainEvents(queue, (e) => collected.push({ ...e }));
    // Quedan los 4 últimos (2..5), en orden.
    expect(collected.map((e) => e.x)).toEqual([2, 3, 4, 5]);
  });

  it('reutiliza los mismos slots entre ciclos (cero asignaciones)', () => {
    const queue = createEventQueue(4);
    pushEvent(queue, 'launch', 0, 0, 1);
    let firstSlot: GameEvent | null = null;
    drainEvents(queue, (e) => {
      firstSlot = e;
    });
    pushEvent(queue, 'wall-bounce', 9, 9, 9);
    let secondSlot: GameEvent | null = null;
    drainEvents(queue, (e) => {
      secondSlot = e;
    });
    expect(secondSlot).toBe(firstSlot); // misma referencia: slot reutilizado
  });
});
