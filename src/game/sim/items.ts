/**
 * Objetos recogibles (GDD §9): moneda, poción, llave. Recogida por contacto
 * simple círculo-círculo contra el héroe; los enemigos también sueltan
 * monedas al morir (ver `dropCoinAt`, invocado desde step.ts al detectar
 * enemy.hp <= 0 recién cruzado a través del evento 'enemy-died').
 */

import { ITEM_PICKUP_RADIUS, POTION_HEAL } from '../content/constants';
import { pushEvent, type EventQueue } from './events';
import type { Item, World } from './world';

/** Activa una moneda suelta en la posición dada (drop de enemigo). Reutiliza el pool de items si hay slots inactivos, si no, añade uno nuevo (los drops son eventos raros, no hot path de 60Hz). */
export function dropCoinAt(world: World, x: number, y: number): void {
  for (let i = 0; i < world.items.length; i++) {
    const item = world.items[i];
    if (!item.active && item.kind === 'coin') {
      item.active = true;
      item.position.x = x;
      item.position.y = y;
      return;
    }
  }
  world.items.push({
    id: `coin-drop-${world.items.length}-${Math.floor(world.time * 1000)}`,
    kind: 'coin',
    position: { x, y },
    active: true,
  });
}

/**
 * Activa una poción suelta en la posición dada (GDD §15.2: el Guardián suelta
 * una al cruzar a fase 2 y a fase 3). Mismo patrón que `dropCoinAt`: reutiliza
 * un slot inactivo del pool de items si lo hay, si no añade uno nuevo (evento
 * raro, no hot path).
 */
export function dropPotionAt(world: World, x: number, y: number): void {
  for (let i = 0; i < world.items.length; i++) {
    const item = world.items[i];
    if (!item.active && item.kind === 'potion') {
      item.active = true;
      item.position.x = x;
      item.position.y = y;
      return;
    }
  }
  world.items.push({
    id: `potion-drop-${world.items.length}-${Math.floor(world.time * 1000)}`,
    kind: 'potion',
    position: { x, y },
    active: true,
  });
}

function tryPickup(world: World, item: Item, events: EventQueue): void {
  const hero = world.hero;
  const dx = hero.position.x - item.position.x;
  const dy = hero.position.y - item.position.y;
  const rr = hero.radius + ITEM_PICKUP_RADIUS;
  if (dx * dx + dy * dy > rr * rr) return;

  item.active = false;
  switch (item.kind) {
    case 'coin':
      world.stats.coinsCollected += 1;
      world.stats.score += 1;
      break;
    case 'potion':
      hero.hp = Math.min(hero.maxHp, hero.hp + POTION_HEAL);
      break;
    case 'key':
      hero.hasKey = true;
      break;
  }
  // label = tipo de objeto ('coin'/'potion'/'key'): permite a juice/HUD dar
  // feedback de color propio (dorado/rosa/azul) sin tener que re-derivarlo.
  pushEvent(events, 'item-pickup', item.position.x, item.position.y, 1, item.kind);
}

/** Recorre los items activos de la sala y resuelve recogida por contacto con el héroe. */
export function stepItems(world: World, events: EventQueue): void {
  const items = world.items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.active) continue;
    tryPickup(world, item, events);
  }
}
