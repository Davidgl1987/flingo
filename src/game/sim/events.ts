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
  /** Golpe del jugador que daña a un JEFE (vs 'enemy-hit' de enemigos normales): shake grande, escalado por daño (playtest 2026-07-10: "más shake al dañar al jefe, menos a enemigos pequeños"). intensity = daño. */
  | 'boss-hit'
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
  | 'victory'
  // ── Jefes (GDD §15) ──────────────────────────────────────────────────────
  /** Se sella la puerta de la sala de jefe al entrar (GDD §15.1 punto 7). */
  | 'boss-door-sealed'
  /** Cambio de fase por umbral de vida (66%/33%, GDD §15.1 punto 3). label = fase alcanzada ('2'|'3'). */
  | 'boss-phase-changed'
  /** Aviso de ataque telegrafiado (GDD §15.1 punto 2). label = `bossTelegraphKind`. */
  | 'boss-telegraph'
  /** El jefe muere: dispara el clímax audiovisual (GDD §15.1 punto 8). */
  | 'boss-defeated'
  /**
   * Guardián de Canto (GDD §15.2): rastro de polvo emitido periódicamente
   * mientras carga. Genérico (cualquier jefe futuro con un ataque de
   * embestida puede reutilizarlo); intensity = velocidad de carga (u/s).
   */
  | 'boss-charge-dust'
  /**
   * Guardián de Canto fase 3 (GDD §15.2): campo de esquirlas temporal en el
   * punto donde una carga choca contra roca/pared. intensity = radio del
   * campo (u).
   */
  | 'boss-shard-burst'
  /**
   * Guardián de Canto (GDD §15.2, playtest 2026-07-06): aparece un barril
   * rodante en el perímetro de la arena — INICIO de la caída del cielo (surge
   * la sombra creciente en el suelo como aviso legible desde toda la sala).
   */
  | 'boss-barrel-spawn'
  /**
   * Guardián de Canto (GDD §15.2, playtest 2026-07-06): el barril que caía del
   * cielo ATERRIZA (rebote + burst de polvo). Lo emite el render al detectar el
   * cruce de `barrel.landingAt`, no la sim: el aterrizaje visual cae entre
   * ticks de dt fijo, así el polvo se sincroniza con el frame en que el cuerpo
   * toca suelo. A partir de aquí el barril es arrollable/explotable normal.
   */
  | 'boss-barrel-land'
  /**
   * Guardián de Canto (GDD §15.2): su carga arrolla un barril rodante — el
   * barril explota (daño normal + shockwave, ya cubierto por
   * 'barrel-explosion') y el Guardián queda aturdido más tiempo de lo normal.
   * Evento propio para diferenciar el aturdimiento largo del choque normal
   * contra roca/pared (mismo `boss-telegraph`-style feedback, intensity =
   * duración del aturdimiento).
   */
  | 'boss-barrel-charge-stun'
  /**
   * Reina del Enjambre (GDD §15.3): invoca una oleada de larvas. intensity =
   * nº de larvas invocadas en esta oleada (puede ser menor que
   * QUEEN_LARVA_PER_WAVE si el cap de vivas ya estaba casi lleno).
   */
  | 'boss-wave-spawn'
  /**
   * Reina del Enjambre (rediseño 2026-07-10, GDD §15.3): una columna de su
   * sala recibe el 1.º golpe de embestida y se AGRIETA (le queda 1 golpe más
   * antes de romperse). Telegrafía la rotura inminente.
   */
  | 'boss-column-cracked'
  /**
   * Reina del Enjambre (rediseño 2026-07-10, GDD §15.3): una columna recibe
   * el 2.º golpe de embestida y se ROMPE — se retira su Obstacle sólido y el
   * jefe pierde QUEEN_COLUMN_DAMAGE_FRACTION de su vida máxima.
   */
  | 'boss-column-broken'
  /**
   * Reina del Enjambre (rediseño 2026-07-10, GDD §15.3): cae la ÚLTIMA columna
   * — el jefe queda "desconectado" y pasa a vulnerable PERMANENTE (daño
   * completo) para rematar el último 1/3 de su vida a golpes normales.
   */
  | 'boss-columns-cleared'
  /**
   * Reina del Enjambre (playtest 2026-07-10): una larva GUARDIANA telegrafía una
   * embestida contra el héroe (aviso ~0.45 s antes de cargar). El render lo usa
   * para el destello/hinchazón de aviso.
   */
  | 'boss-guardian-charge';

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
