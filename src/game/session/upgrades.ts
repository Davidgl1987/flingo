/**
 * Mejoras (GDD §11, docs/plans/ECONOMY_PLAN.md): pool de 12 mejoras por
 * categorías (cuerpo/flecha/hechizo/consumible) con niveles y precio en
 * monedas. Dos vías de obtención: recompensa gratis de jefe no-final
 * (`rollBossReward`, una opción por categoría de ATAQUE) o compra en tienda
 * (`tryPurchaseUpgrade`, todas las categorías) — ambas UI llegan en F3/F4;
 * este módulo solo deja el modelo de datos y la economía testeados.
 */

import { HERO_MAX_HP } from '@/game/features/hero/constants';
import { pushEvent, type EventQueue } from '@/engine/events';
import type { Rng } from '@/engine/rng';
import type { Hero, World } from '@/game/world/types';

export type UpgradeCategory = 'cuerpo' | 'flecha' | 'hechizo' | 'consumible';

export type UpgradeId =
  | 'cuerpo-dano'
  | 'cuerpo-velocidad'
  | 'cuerpo-firmeza'
  | 'flecha-dano'
  | 'flecha-multi'
  | 'flecha-perfora'
  | 'hechizo-dano'
  | 'hechizo-multi'
  | 'hechizo-rebote'
  | 'escudo'
  | 'corazon'
  | 'iman';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  category: UpgradeCategory;
  /** Nivel máximo comprable/ofrecible; Infinity para stacks sin tope (escudo). */
  maxLevel: number;
  /** Id corto del badge visual (el SVG llega en fases F3/F5). */
  icon: string;
  /** Precio en monedas para comprar el nivel `level` (1-indexado). */
  price: (level: number) => number;
  /** Si se define, gating extra además de maxLevel (p.ej. corazón con vida llena al tope). */
  isAvailable?: (hero: Hero) => boolean;
  apply: (hero: Hero, level: number) => void;
}

/** Precio de las mejoras de cuerpo/flecha/hechizo: nivel × 10 (10/20/30). */
function tieredPrice(level: number): number {
  return level * 10;
}

/** Precio de Canto de Urraca (imán): 5 + nivel × 5 (10/15/20). */
function magnetPrice(level: number): number {
  return 5 + level * 5;
}

export const UPGRADE_POOL: UpgradeDef[] = [
  // ── Cuerpo ────────────────────────────────────────────────────────────
  {
    id: 'cuerpo-dano',
    name: 'Erizo de Acero',
    description: '+1 daño de embestida.',
    category: 'cuerpo',
    maxLevel: 3,
    icon: 'spikes',
    price: tieredPrice,
    apply: (hero) => {
      hero.modifiers.ramDamageBonus += 1;
    },
  },
  {
    id: 'cuerpo-velocidad',
    name: 'Estela de Cometa',
    description: '+1 u/s de velocidad de lanzamiento corporal.',
    category: 'cuerpo',
    maxLevel: 3,
    icon: 'comet',
    price: tieredPrice,
    apply: (hero) => {
      hero.modifiers.launchSpeedBonus += 1;
    },
  },
  {
    id: 'cuerpo-firmeza',
    name: 'Canto Rodado',
    description: 'Menos retroceso al recibir daño.',
    category: 'cuerpo',
    maxLevel: 3,
    icon: 'boulder',
    price: tieredPrice,
    apply: (hero) => {
      hero.modifiers.knockbackTakenMultiplier *= 0.8;
    },
  },
  // ── Flecha ────────────────────────────────────────────────────────────
  {
    id: 'flecha-dano',
    name: 'Colmillo de Hierro',
    description: '+1 daño de flecha.',
    category: 'flecha',
    maxLevel: 3,
    icon: 'fang',
    price: tieredPrice,
    apply: (hero) => {
      hero.modifiers.arrowDamageBonus += 1;
    },
  },
  {
    id: 'flecha-multi',
    name: 'Bandada',
    description: '+1 flecha en ángulo.',
    category: 'flecha',
    maxLevel: 3,
    icon: 'flock',
    price: tieredPrice,
    apply: (hero) => {
      hero.modifiers.arrowCountBonus += 1;
    },
  },
  {
    id: 'flecha-perfora',
    name: 'Aguja Fantasma',
    description: '+1 enemigo atravesado por la flecha.',
    category: 'flecha',
    maxLevel: 3,
    icon: 'needle',
    price: tieredPrice,
    apply: (hero) => {
      hero.modifiers.arrowPierceBonus += 1;
    },
  },
  // ── Hechizo ───────────────────────────────────────────────────────────
  {
    id: 'hechizo-dano',
    name: 'Orbe Voraz',
    description: '+1 daño de hechizo y proyectil más ancho.',
    category: 'hechizo',
    maxLevel: 3,
    icon: 'orb',
    price: tieredPrice,
    apply: (hero) => {
      hero.modifiers.spellDamageBonus += 1;
      hero.modifiers.spellRadiusBonus += 1;
    },
  },
  {
    id: 'hechizo-multi',
    name: 'Coro Arcano',
    description: '+1 hechizo en ángulo.',
    category: 'hechizo',
    maxLevel: 3,
    icon: 'choir',
    price: tieredPrice,
    apply: (hero) => {
      hero.modifiers.spellCountBonus += 1;
    },
  },
  {
    id: 'hechizo-rebote',
    name: 'Eco Errante',
    description: '+1 rebote del hechizo.',
    category: 'hechizo',
    maxLevel: 3,
    icon: 'echo',
    price: tieredPrice,
    apply: (hero) => {
      hero.modifiers.spellBounceBonus += 1;
    },
  },
  // ── Consumibles (solo tienda, GDD/plan decisión 2) ───────────────────
  {
    id: 'escudo',
    name: 'Burbuja de Cuarzo',
    description: '+1 carga de escudo: bloquea el próximo golpe.',
    category: 'consumible',
    maxLevel: Infinity,
    icon: 'bubble',
    price: () => 8,
    apply: (hero) => {
      hero.modifiers.shieldCharges += 1;
    },
  },
  {
    id: 'corazon',
    name: 'Ascua Vital',
    description: 'Cura 1 corazón; con la vida llena, +1 vida máxima (tope 9).',
    category: 'consumible',
    maxLevel: HERO_MAX_HP,
    icon: 'ember',
    price: () => 12,
    isAvailable: (hero) => hero.hp < hero.maxHp || hero.maxHp < HERO_MAX_HP,
    apply: (hero) => {
      if (hero.hp < hero.maxHp) {
        hero.hp += 1;
      } else {
        hero.maxHp = Math.min(HERO_MAX_HP, hero.maxHp + 1);
        hero.hp += 1;
      }
    },
  },
  {
    id: 'iman',
    name: 'Canto de Urraca',
    description: 'Atrae monedas desde más lejos.',
    category: 'consumible',
    maxLevel: 3,
    icon: 'magpie',
    price: magnetPrice,
    apply: (hero, level) => {
      hero.modifiers.coinMagnetLevel = level;
    },
  },
];

/** Nivel actual del héroe en una mejora (0 si nunca se aplicó). */
export function getUpgradeLevel(hero: Hero, id: UpgradeId): number {
  return hero.upgradeLevels[id] ?? 0;
}

/** true si la mejora puede ofrecerse/comprarse: nivel por debajo de `maxLevel` y `isAvailable` (si lo define) satisfecho. */
export function canOfferUpgrade(def: UpgradeDef, hero: Hero): boolean {
  if (getUpgradeLevel(hero, def.id) >= def.maxLevel) return false;
  if (def.isAvailable && !def.isAvailable(hero)) return false;
  return true;
}

/** Sube el nivel de la mejora en el héroe, aplica su efecto para ese nivel y emite el evento correspondiente. */
export function applyUpgrade(world: World, def: UpgradeDef, events: EventQueue): void {
  const hero = world.hero;
  const nextLevel = getUpgradeLevel(hero, def.id) + 1;
  hero.upgradeLevels[def.id] = nextLevel;
  def.apply(hero, nextLevel);
  pushEvent(events, 'upgrade-applied', hero.position.x, hero.position.y, 1);
}

/** Categorías de ATAQUE que participan en la recompensa gratis de jefe (GDD/plan decisión 2: consumibles solo en tienda). */
const BOSS_REWARD_CATEGORIES: UpgradeCategory[] = ['cuerpo', 'flecha', 'hechizo'];

/**
 * Recompensa gratis al derrotar un jefe no-final (GDD/plan): una mejora
 * aleatoria no maxeada por cada categoría de ataque. Si una categoría ya está
 * toda al máximo, se omite (el resultado puede tener menos de 3). Determinista:
 * consume `rng` una vez por categoría con opciones elegibles, en el orden fijo
 * cuerpo → flecha → hechizo.
 */
export function rollBossReward(hero: Hero, rng: Rng): UpgradeDef[] {
  const rewards: UpgradeDef[] = [];
  for (const category of BOSS_REWARD_CATEGORIES) {
    const eligible = UPGRADE_POOL.filter((def) => def.category === category && canOfferUpgrade(def, hero));
    if (eligible.length === 0) continue;
    const index = Math.floor(rng() * eligible.length);
    rewards.push(eligible[index]);
  }
  return rewards;
}

/**
 * Compra una mejora en la tienda (F4): precio = `def.price(nivelActual+1)`.
 * Sin efecto y devuelve false si la mejora no es ofrecible (maxLevel/isAvailable)
 * o si no hay saldo suficiente. Si compra: descuenta `hero.coins`, resta el
 * precio de `stats.score` (decisión 3 del plan: gastar RESTA puntuación,
 * clamp a 0), aplica el nivel y emite `'upgrade-purchased'` además del
 * `'upgrade-applied'` que ya emite `applyUpgrade`.
 */
export function tryPurchaseUpgrade(world: World, def: UpgradeDef, events: EventQueue): boolean {
  const hero = world.hero;
  if (!canOfferUpgrade(def, hero)) return false;

  const nextLevel = getUpgradeLevel(hero, def.id) + 1;
  const price = def.price(nextLevel);
  if (hero.coins < price) return false;

  hero.coins -= price;
  world.stats.score = Math.max(0, world.stats.score - price);
  applyUpgrade(world, def, events);
  pushEvent(events, 'upgrade-purchased', hero.position.x, hero.position.y, price);
  return true;
}
