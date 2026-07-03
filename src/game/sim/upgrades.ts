/**
 * Mejoras (GDD §11): pool de 9, elección de 3 al azar (con RNG con semilla)
 * al limpiar una sala. Daño/escudo repetibles; el resto una vez; Corazón
 * Extra deja de ofrecerse al llegar a maxHp del héroe.
 */

import { HERO_MAX_HP, STEADY_PULSE_RELOAD_MULTIPLIER } from '../content/constants';
import { pushEvent, type EventQueue } from './events';
import type { Rng } from './rng';
import type { Hero, World } from './world';

export type UpgradeId =
  | 'heavy-impact'
  | 'extra-heart'
  | 'more-slide'
  | 'control-boots'
  | 'explosive-ram'
  | 'sharp-arrows'
  | 'arcane-spell'
  | 'steady-pulse'
  | 'fragile-shield';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  /** true = puede repetirse en elecciones sucesivas (daño/escudo); false = solo una vez por run. */
  repeatable: boolean;
  /** Si se define, la mejora solo se ofrece mientras esto devuelva true para el héroe dado. */
  isAvailable?: (hero: Hero) => boolean;
  apply: (hero: Hero) => void;
}

export const UPGRADE_POOL: UpgradeDef[] = [
  {
    id: 'heavy-impact',
    name: 'Impacto Pesado',
    description: '+1 daño de embestida.',
    repeatable: true,
    apply: (hero) => {
      hero.modifiers.ramDamageBonus += 1;
    },
  },
  {
    id: 'extra-heart',
    name: 'Corazón Extra',
    description: '+1 vida máxima y cura 1.',
    repeatable: false,
    isAvailable: (hero) => hero.maxHp < HERO_MAX_HP,
    apply: (hero) => {
      hero.maxHp = Math.min(HERO_MAX_HP, hero.maxHp + 1);
      hero.hp = Math.min(hero.maxHp, hero.hp + 1);
    },
  },
  {
    id: 'more-slide',
    name: 'Más Deslizamiento',
    description: 'Conservas más velocidad al deslizar.',
    repeatable: false,
    apply: (hero) => {
      hero.modifiers.frictionMultiplier *= 0.8;
    },
  },
  {
    id: 'control-boots',
    name: 'Botas de Control',
    description: 'Te frenas antes: más control, menos alcance.',
    repeatable: false,
    apply: (hero) => {
      hero.modifiers.frictionMultiplier *= 1.25;
    },
  },
  {
    id: 'explosive-ram',
    name: 'Choque Explosivo',
    description: 'Tus embestidas dañan también a enemigos cercanos.',
    repeatable: false,
    apply: (hero) => {
      hero.modifiers.explosiveRam = true;
    },
  },
  {
    id: 'sharp-arrows',
    name: 'Flechas Afiladas',
    description: '+1 daño de flecha.',
    repeatable: true,
    apply: (hero) => {
      hero.modifiers.arrowDamageBonus += 1;
    },
  },
  {
    id: 'arcane-spell',
    name: 'Hechizo Arcano',
    description: '+1 daño de hechizo y proyectil más grande.',
    repeatable: true,
    apply: (hero) => {
      hero.modifiers.spellDamageBonus += 1;
      hero.modifiers.spellRadiusBonus += 1;
    },
  },
  {
    id: 'steady-pulse',
    name: 'Pulso Firme',
    description: 'Recargas de flecha y hechizo un 28% más rápidas.',
    repeatable: false,
    apply: (hero) => {
      hero.modifiers.reloadMultiplier *= STEADY_PULSE_RELOAD_MULTIPLIER;
    },
  },
  {
    id: 'fragile-shield',
    name: 'Escudo Frágil',
    description: '+1 carga de escudo: bloquea el próximo golpe.',
    repeatable: true,
    apply: (hero) => {
      hero.modifiers.shieldCharges += 1;
    },
  },
];

/**
 * Elige `count` mejoras distintas para ofrecer, respetando `repeatable` y
 * `isAvailable`. Determinista: consume `rng` (world.rng) en orden.
 * `offeredOnce` es el conjunto de IDs no-repetibles ya ofrecidos/aplicados
 * en esta run (el llamador lo mantiene y actualiza tras aplicar).
 */
export function rollUpgradeChoices(
  hero: Hero,
  rng: Rng,
  count: number,
  offeredOnce: ReadonlySet<UpgradeId>,
): UpgradeDef[] {
  const eligible = UPGRADE_POOL.filter((def) => {
    if (!def.repeatable && offeredOnce.has(def.id)) return false;
    if (def.isAvailable && !def.isAvailable(hero)) return false;
    return true;
  });

  const choices: UpgradeDef[] = [];
  const pool = eligible.slice();
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const index = Math.floor(rng() * pool.length);
    choices.push(pool[index]);
    pool.splice(index, 1);
  }
  return choices;
}

/** Aplica una mejora elegida al héroe y emite el evento correspondiente. */
export function applyUpgrade(world: World, def: UpgradeDef, events: EventQueue): void {
  def.apply(world.hero);
  pushEvent(events, 'upgrade-applied', world.hero.position.x, world.hero.position.y, 1);
}
