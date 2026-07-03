/**
 * Tests de objetos (GDD §9): recogida de moneda/poción/llave y drop de
 * moneda al morir un enemigo. También la transición a room-cleared.
 */

import { describe, expect, it } from 'vitest';
import { applyDamageToEnemy } from './combat';
import { createEventQueue, drainEvents, type GameEvent } from './events';
import { stepItems } from './items';
import { stepWorld } from './step';
import { createWorld, type EnemySpawn, type ItemSpawn, type RoomData, type World } from './world';

function makeRoom(partial: Partial<RoomData> = {}): RoomData {
  return {
    version: 1,
    id: 'item-room',
    name: 'Items',
    width: 30,
    height: 30,
    playerStart: { x: 0, y: 0 },
    tags: ['combate'],
    doorSlots: [],
    enemies: [],
    hazards: [],
    items: [],
    ...partial,
  };
}

function makeWorld(items: ItemSpawn[] = [], enemies: EnemySpawn[] = []): World {
  return createWorld(makeRoom({ items, enemies }));
}

describe('moneda', () => {
  it('se recoge al contacto: +1 moneda, +1 punto, item desactivado', () => {
    const world = makeWorld([{ id: 'c1', kind: 'coin', position: { x: 0.3, y: 0 } }]);
    const events = createEventQueue(16);
    stepItems(world, events);
    expect(world.stats.coinsCollected).toBe(1);
    expect(world.stats.score).toBe(1);
    expect(world.items[0].active).toBe(false);

    const types: string[] = [];
    drainEvents(events, (e: GameEvent) => types.push(e.type));
    expect(types).toContain('item-pickup');
  });

  it('fuera de alcance no se recoge', () => {
    const world = makeWorld([{ id: 'c1', kind: 'coin', position: { x: 5, y: 5 } }]);
    const events = createEventQueue(16);
    stepItems(world, events);
    expect(world.stats.coinsCollected).toBe(0);
    expect(world.items[0].active).toBe(true);
  });
});

describe('poción', () => {
  it('cura 1 corazón', () => {
    const world = makeWorld([{ id: 'p1', kind: 'potion', position: { x: 0.3, y: 0 } }]);
    const events = createEventQueue(16);
    world.hero.hp = 3;
    stepItems(world, events);
    expect(world.hero.hp).toBe(4);
  });

  it('no supera la vida máxima', () => {
    const world = makeWorld([{ id: 'p1', kind: 'potion', position: { x: 0.3, y: 0 } }]);
    const events = createEventQueue(16);
    stepItems(world, events);
    expect(world.hero.hp).toBe(world.hero.maxHp);
  });
});

describe('llave', () => {
  it('marca hasKey en el héroe', () => {
    const world = makeWorld([{ id: 'k1', kind: 'key', position: { x: 0.3, y: 0 } }]);
    const events = createEventQueue(16);
    expect(world.hero.hasKey).toBe(false);
    stepItems(world, events);
    expect(world.hero.hasKey).toBe(true);
  });
});

describe('drop de moneda al morir un enemigo', () => {
  it('el enemigo muerto suelta una moneda en su posición (una sola vez)', () => {
    const world = makeWorld([], [{ id: 'e1', kind: 'dummy', position: { x: 5, y: 5 } }]);
    const events = createEventQueue(64);
    applyDamageToEnemy(world, world.enemies[0], 99, 1, 0, events);

    stepWorld(world, events);
    const coins = world.items.filter((i) => i.kind === 'coin' && i.active);
    expect(coins).toHaveLength(1);
    // La posición de la moneda incluye el desplazamiento del knockback (0.18).
    expect(coins[0].position.x).toBeCloseTo(world.enemies[0].position.x, 6);

    // Ticks posteriores no duplican el drop.
    stepWorld(world, events);
    stepWorld(world, events);
    expect(world.items.filter((i) => i.kind === 'coin' && i.active)).toHaveLength(1);
  });

  it('matar al último enemigo pasa a room-cleared con +50 de puntuación', () => {
    const world = makeWorld([], [{ id: 'e1', kind: 'dummy', position: { x: 5, y: 5 } }]);
    const events = createEventQueue(64);
    applyDamageToEnemy(world, world.enemies[0], 99, 1, 0, events);
    drainEvents(events, () => {});

    stepWorld(world, events);
    expect(world.phase).toBe('room-cleared');
    expect(world.stats.roomsCleared).toBe(1);
    expect(world.stats.score).toBeGreaterThanOrEqual(50);

    const types: string[] = [];
    drainEvents(events, (e: GameEvent) => types.push(e.type));
    expect(types).toContain('room-cleared');
  });

  it('la sim se pausa en room-cleared (el mundo no avanza hasta reanudar)', () => {
    const world = makeWorld([], [{ id: 'e1', kind: 'dummy', position: { x: 5, y: 5 } }]);
    const events = createEventQueue(64);
    applyDamageToEnemy(world, world.enemies[0], 99, 1, 0, events);
    stepWorld(world, events);
    expect(world.phase).toBe('room-cleared');

    world.hero.velocity.x = 5;
    const xBefore = world.hero.position.x;
    stepWorld(world, events);
    expect(world.hero.position.x).toBe(xBefore); // pausada

    world.phase = 'playing'; // (equivale a elegir mejora)
    stepWorld(world, events);
    expect(world.hero.position.x).toBeGreaterThan(xBefore);
  });
});
