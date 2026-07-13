/**
 * Tuning de items (moneda/poción/llave) — GDD, Apéndice.
 * Valores validados por playtesting; no ajustar sin probar.
 */

import type { EnemyKind } from '@/game/world/types';

/** Radio de recogida de items (moneda/poción/llave). */
export const ITEM_PICKUP_RADIUS = 0.5;
/** Curación de la poción (corazones). */
export const POTION_HEAL = 1;

/**
 * Monedas soltadas al morir un enemigo, por dureza del arquetipo
 * (docs/plans/ECONOMY_PLAN.md, economía base): consumido por
 * `collectDeadDrops` (world/step.ts).
 */
export const COIN_DROPS_BY_KIND: Record<EnemyKind, number> = {
  dummy: 1,
  chaser: 2,
  trail: 2,
  spike: 3,
  shooter: 3,
  boss: 10,
};

/** Radio mínimo/máximo del esparcido de monedas alrededor del cadáver (u). */
export const COIN_DROP_MIN_RADIUS = 0.25;
export const COIN_DROP_MAX_RADIUS = 0.6;
