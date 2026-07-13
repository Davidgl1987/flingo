/**
 * Tests de objetos (GDD §9): recogida de moneda/poción/llave y drop de
 * monedas al morir un enemigo (docs/plans/ECONOMY_PLAN.md: N monedas por
 * dureza, esparcidas). También la puntuación al limpiar la sala (modo sala
 * única): ya NO cambia de fase (la mejora-por-sala desaparece).
 */

import { describe, expect, it } from 'vitest';
import { applyDamageToEnemy } from '@/game/features/combat/combat';
import { createEventQueue, drainEvents, type GameEvent } from '@/engine/events';
import { COIN_MAGNET_RADIUS_BY_LEVEL } from './constants';
import { stepItems } from './items';
import { stepWorld } from '@/game/world/step';
import { createWorld } from '@/game/world/create';
import type { EnemySpawn, ItemSpawn, RoomData, World } from '@/game/world/types';

const FIXED_DT = 1 / 60;

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
  it('se recoge al contacto: +1 monedero, +1 total recogido, +1 punto, item desactivado', () => {
    const world = makeWorld([{ id: 'c1', kind: 'coin', position: { x: 0.3, y: 0 } }]);
    const events = createEventQueue(16);
    stepItems(world, FIXED_DT, events);
    expect(world.hero.coins).toBe(1);
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
    stepItems(world, FIXED_DT, events);
    expect(world.stats.coinsCollected).toBe(0);
    expect(world.items[0].active).toBe(true);
  });
});

describe('poción', () => {
  it('cura 1 corazón', () => {
    const world = makeWorld([{ id: 'p1', kind: 'potion', position: { x: 0.3, y: 0 } }]);
    const events = createEventQueue(16);
    world.hero.hp = 3;
    stepItems(world, FIXED_DT, events);
    expect(world.hero.hp).toBe(4);
  });

  it('no supera la vida máxima', () => {
    const world = makeWorld([{ id: 'p1', kind: 'potion', position: { x: 0.3, y: 0 } }]);
    const events = createEventQueue(16);
    stepItems(world, FIXED_DT, events);
    expect(world.hero.hp).toBe(world.hero.maxHp);
  });
});

describe('llave', () => {
  it('marca hasKey en el héroe', () => {
    const world = makeWorld([{ id: 'k1', kind: 'key', position: { x: 0.3, y: 0 } }]);
    const events = createEventQueue(16);
    expect(world.hero.hasKey).toBe(false);
    stepItems(world, FIXED_DT, events);
    expect(world.hero.hasKey).toBe(true);
  });
});

describe('drop de moneda al morir un enemigo', () => {
  it('un dummy (dureza 1) suelta 1 moneda esparcida cerca de su posición (una sola vez)', () => {
    const world = makeWorld([], [{ id: 'e1', kind: 'dummy', position: { x: 5, y: 5 } }]);
    const events = createEventQueue(64);
    applyDamageToEnemy(world, world.enemies[0], 99, 1, 0, events);

    stepWorld(world, events);
    const coins = world.items.filter((i) => i.kind === 'coin' && i.active);
    expect(coins).toHaveLength(1);
    // Esparcida en un anillo de radio ~0.25-0.6 u alrededor del cadáver (ver COIN_DROP_MIN/MAX_RADIUS).
    const dist = Math.hypot(
      coins[0].position.x - world.enemies[0].position.x,
      coins[0].position.y - world.enemies[0].position.y,
    );
    expect(dist).toBeGreaterThanOrEqual(0.25 - 1e-6);
    expect(dist).toBeLessThanOrEqual(0.6 + 1e-6);

    // Ticks posteriores no duplican el drop.
    stepWorld(world, events);
    stepWorld(world, events);
    expect(world.items.filter((i) => i.kind === 'coin' && i.active)).toHaveLength(1);
  });

  it('un shooter (dureza 3) suelta 3 monedas', () => {
    const world = makeWorld([], [{ id: 'e1', kind: 'shooter', position: { x: 5, y: 5 } }]);
    const events = createEventQueue(64);
    applyDamageToEnemy(world, world.enemies[0], 99, 1, 0, events);

    stepWorld(world, events);
    expect(world.items.filter((i) => i.kind === 'coin' && i.active)).toHaveLength(3);
  });

  it('un jefe (dureza 10) suelta 10 monedas', () => {
    const world = makeWorld([], [{ id: 'b1', kind: 'boss', position: { x: 5, y: 5 } }]);
    const events = createEventQueue(64);
    applyDamageToEnemy(world, world.enemies[0], 999, 1, 0, events, true);

    stepWorld(world, events);
    expect(world.items.filter((i) => i.kind === 'coin' && i.active)).toHaveLength(10);
  });

  it('matar al último enemigo puntúa +50 sin cambiar de fase (docs/plans/ECONOMY_PLAN.md)', () => {
    const world = makeWorld([], [{ id: 'e1', kind: 'dummy', position: { x: 5, y: 5 } }]);
    const events = createEventQueue(64);
    applyDamageToEnemy(world, world.enemies[0], 99, 1, 0, events);
    drainEvents(events, () => {});

    stepWorld(world, events);
    expect(world.phase).toBe('playing');
    expect(world.stats.roomsCleared).toBe(1);
    expect(world.stats.score).toBeGreaterThanOrEqual(50);

    const types: string[] = [];
    drainEvents(events, (e: GameEvent) => types.push(e.type));
    expect(types).toContain('room-cleared');
  });

  it('la sim NO se pausa al limpiar la sala: sigue avanzando en el mismo tick de después', () => {
    const world = makeWorld([], [{ id: 'e1', kind: 'dummy', position: { x: 5, y: 5 } }]);
    const events = createEventQueue(64);
    applyDamageToEnemy(world, world.enemies[0], 99, 1, 0, events);
    stepWorld(world, events);
    expect(world.phase).toBe('playing');

    world.hero.velocity.x = 5;
    const xBefore = world.hero.position.x;
    stepWorld(world, events);
    expect(world.hero.position.x).toBeGreaterThan(xBefore);
  });
});

describe('imán de monedas (Canto de Urraca, docs/plans/ECONOMY_PLAN.md F2)', () => {
  it('sin nivel de imán, una moneda fuera de alcance de recogida no se mueve', () => {
    const world = makeWorld([{ id: 'c1', kind: 'coin', position: { x: 2, y: 0 } }]);
    const events = createEventQueue(16);
    for (let i = 0; i < 30; i++) stepItems(world, FIXED_DT, events);
    expect(world.items[0].position.x).toBeCloseTo(2, 9);
    expect(world.items[0].position.y).toBeCloseTo(0, 9);
  });

  it('con nivel 1, una moneda dentro del radio (2.5 u) se acerca al héroe tras un tick y acaba recogida tras varios', () => {
    const world = makeWorld([{ id: 'c1', kind: 'coin', position: { x: 2, y: 0 } }]);
    const events = createEventQueue(16);
    world.hero.modifiers.coinMagnetLevel = 1;
    expect(COIN_MAGNET_RADIUS_BY_LEVEL[1]).toBe(2.5);

    stepItems(world, FIXED_DT, events);
    // Un tick a COIN_MAGNET_SPEED=7 u/s: 2 - 7/60 ≈ 1.883, se acercó pero no llegó.
    expect(world.items[0].position.x).toBeLessThan(2);
    expect(world.items[0].position.x).toBeGreaterThan(1.8);
    expect(world.items[0].active).toBe(true);

    for (let i = 0; i < 30; i++) stepItems(world, FIXED_DT, events);
    expect(world.items[0].active).toBe(false); // ya la recogió por contacto al acercarse
  });

  it('con nivel 1, una moneda fuera del radio (2.5 u) no se mueve', () => {
    const world = makeWorld([{ id: 'c1', kind: 'coin', position: { x: 10, y: 0 } }]);
    const events = createEventQueue(16);
    world.hero.modifiers.coinMagnetLevel = 1;

    for (let i = 0; i < 30; i++) stepItems(world, FIXED_DT, events);
    expect(world.items[0].position.x).toBeCloseTo(10, 9);
    expect(world.items[0].active).toBe(true);
  });

  it('subir de nivel amplía el radio: una moneda a 4 u solo se atrae con nivel 2+', () => {
    const world = makeWorld([{ id: 'c1', kind: 'coin', position: { x: 4, y: 0 } }]);
    const events = createEventQueue(16);
    world.hero.modifiers.coinMagnetLevel = 1;

    stepItems(world, FIXED_DT, events);
    expect(world.items[0].position.x).toBeCloseTo(4, 9); // fuera del radio de nivel 1 (2.5 u)

    world.hero.modifiers.coinMagnetLevel = 2;
    expect(COIN_MAGNET_RADIUS_BY_LEVEL[2]).toBe(4);
    stepItems(world, FIXED_DT, events);
    expect(world.items[0].position.x).toBeLessThan(4); // dentro del radio de nivel 2, ya se acerca
  });
});
