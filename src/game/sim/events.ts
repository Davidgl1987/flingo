/**
 * Cola de eventos de gameplay: ring buffer preasignado.
 *
 * La sim publica eventos y juice/ui los drenan cada frame. Cero asignaciones
 * en el hot path: los slots se crean una vez y se reutilizan mutándolos.
 *
 * Diseño del slot: en lugar de una unión discriminada con objetos distintos
 * por variante (que obligaría a asignar en cada push), cada slot es una
 * estructura plana con el superconjunto de campos y un discriminante `type`.
 * Fase 2: añadir variantes ('impact', 'enemy-died', 'barrel-explosion',
 * 'player-damaged'...) ampliando `GameEventType` y, si hace falta, añadiendo
 * campos numéricos/string al slot (siempre reutilizables, nunca objetos nuevos).
 */

export type GameEventType =
  | 'launch'
  | 'wall-bounce'
  | 'enemy-hit'
  | 'enemy-died'
  | 'player-damaged'
  | 'player-died'
  | 'shield-block'
  | 'pit-fall'
  | 'pit-respawn'
  | 'spikes-hit'
  | 'barrel-explosion'
  | 'item-pickup'
  | 'room-cleared'
  | 'upgrade-applied'
  | 'room-entered'
  | 'doors-open'
  | 'door-locked'
  | 'victory';

export interface GameEvent {
  type: GameEventType;
  /** Posición del evento en el plano del suelo. */
  x: number;
  y: number;
  /**
   * Magnitud del evento: fuerza [0,1] en 'launch',
   * velocidad normal de impacto (u/s) en 'wall-bounce'.
   */
  intensity: number;
  /** Etiqueta textual opcional (ej. nombre de sala en 'room-entered'); '' si no aplica. */
  label: string;
}

export interface EventQueue {
  readonly slots: GameEvent[];
  readonly capacity: number;
  /** Índice del evento más antiguo. */
  head: number;
  /** Número de eventos pendientes. */
  count: number;
}

export function createEventQueue(capacity = 64): EventQueue {
  const slots: GameEvent[] = [];
  for (let i = 0; i < capacity; i++) {
    slots.push({ type: 'launch', x: 0, y: 0, intensity: 0, label: '' });
  }
  return { slots, capacity, head: 0, count: 0 };
}

/**
 * Publica un evento mutando el siguiente slot libre.
 * Si la cola está llena, sobrescribe el más antiguo (los eventos de juice
 * son descartables; nunca debe bloquear la sim).
 */
export function pushEvent(
  queue: EventQueue,
  type: GameEventType,
  x: number,
  y: number,
  intensity: number,
  label = '',
): void {
  let index: number;
  if (queue.count === queue.capacity) {
    index = queue.head;
    queue.head = (queue.head + 1) % queue.capacity;
  } else {
    index = (queue.head + queue.count) % queue.capacity;
    queue.count++;
  }
  const slot = queue.slots[index];
  slot.type = type;
  slot.x = x;
  slot.y = y;
  slot.intensity = intensity;
  slot.label = label;
}

/**
 * Visita todos los eventos pendientes en orden y vacía la cola.
 * No crea arrays: el consumidor recibe cada slot por callback y NO debe
 * retener la referencia (el slot se reutilizará).
 */
export function drainEvents(queue: EventQueue, visit: (event: GameEvent) => void): void {
  for (let i = 0; i < queue.count; i++) {
    visit(queue.slots[(queue.head + i) % queue.capacity]);
  }
  queue.head = 0;
  queue.count = 0;
}
