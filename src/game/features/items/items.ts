/**
 * Objetos recogibles (GDD §9): moneda, poción, llave. Recogida por contacto
 * simple círculo-círculo contra el héroe; los enemigos también sueltan
 * monedas al morir (ver `dropCoinAt`, invocado desde step.ts al detectar
 * enemy.hp <= 0 recién cruzado a través del evento 'enemy-died').
 */

import { COIN_MAGNET_RADIUS_BY_LEVEL, COIN_MAGNET_SPEED, ITEM_PICKUP_RADIUS, POTION_HEAL } from './constants';
import { pushEvent, type EventQueue } from '@/engine/events';
import type { Item, World } from '@/game/world/types';

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
      hero.coins += 1;
      break;
    case 'potion':
      hero.hp = Math.min(hero.maxHp, hero.hp + POTION_HEAL);
      break;
    case 'key':
      hero.hasKey = true;
      break;
  }
  // label = tipo de objeto ('coin'/'potion'/'key'): permite a effects/HUD dar
  // feedback de color propio (dorado/rosa/azul) sin tener que re-derivarlo.
  pushEvent(events, 'item-pickup', item.position.x, item.position.y, 1, item.kind);
}

/**
 * Imán de monedas (Canto de Urraca, docs/plans/ECONOMY_PLAN.md F2): si el
 * héroe tiene `coinMagnetLevel > 0`, acerca la moneda a velocidad constante
 * `COIN_MAGNET_SPEED` cuando está dentro del radio de su nivel
 * (`COIN_MAGNET_RADIUS_BY_LEVEL`). Clampa el paso para no pasarse de largo
 * del héroe; la recogida real sigue ocurriendo en `tryPickup` por contacto
 * normal cuando la moneda llega.
 */
function stepCoinMagnet(world: World, item: Item, dt: number): void {
  const hero = world.hero;
  const level = Math.min(hero.modifiers.coinMagnetLevel, COIN_MAGNET_RADIUS_BY_LEVEL.length - 1);
  if (level <= 0) return;
  const radius = COIN_MAGNET_RADIUS_BY_LEVEL[level];

  const dx = hero.position.x - item.position.x;
  const dy = hero.position.y - item.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 1e-6 || dist > radius) return;

  const step = Math.min(dist, COIN_MAGNET_SPEED * dt);
  item.position.x += (dx / dist) * step;
  item.position.y += (dy / dist) * step;
}

/** Recorre los items activos de la sala y resuelve recogida por contacto con el héroe (con imán de monedas, si el héroe lo tiene). */
export function stepItems(world: World, dt: number, events: EventQueue): void {
  const items = world.items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.active) continue;
    if (item.kind === 'coin') stepCoinMagnet(world, item, dt);
    tryPickup(world, item, events);
  }
}
