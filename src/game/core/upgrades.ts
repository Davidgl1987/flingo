import { cloneState } from './clone';
import type { GameState, UpgradeId } from './types';
import { randFromSeed } from './vector';

export type UpgradeDefinition = {
  id: UpgradeId;
  name: string;
  description: string;
};

export const UPGRADE_DEFINITIONS: Record<UpgradeId, UpgradeDefinition> = {
  impact_damage: {
    id: 'impact_damage',
    name: 'Impacto pesado',
    description: '+1 de daño cuando lanzas al héroe contra enemigos.',
  },
  max_hp: {
    id: 'max_hp',
    name: 'Corazón extra',
    description: '+1 vida máxima y cura 1 punto.',
  },
  slippery: {
    id: 'slippery',
    name: 'Más deslizamiento',
    description: 'Pierdes menos velocidad. Más combos, más riesgo.',
  },
  sticky_boots: {
    id: 'sticky_boots',
    name: 'Botas de control',
    description: 'Te frenas antes. Mejor para no caer en fosos.',
  },
  explosive_body: {
    id: 'explosive_body',
    name: 'Choque explosivo',
    description: 'Los impactos fuertes dañan ligeramente a enemigos cercanos.',
  },
  sharper_arrows: {
    id: 'sharper_arrows',
    name: 'Flechas afiladas',
    description: '+1 de daño con flechas.',
  },
  arcane_spell: {
    id: 'arcane_spell',
    name: 'Hechizo arcano',
    description: '+1 de daño con hechizos y radio algo mayor.',
  },
  quick_aim: {
    id: 'quick_aim',
    name: 'Pulso firme',
    description: 'Menor enfriamiento tras disparar proyectiles.',
  },
  shield_start: {
    id: 'shield_start',
    name: 'Escudo frágil',
    description: 'Bloquea el próximo daño recibido.',
  },
};

export const allUpgradeIds = Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[];

export function chooseUpgradeOptions(state: GameState, count = 3): UpgradeId[] {
  const already = new Set(state.player.upgrades);
  const candidates = allUpgradeIds.filter((id) => id !== 'max_hp' || state.player.maxHp < 9);
  const weighted = candidates.filter((id) => !already.has(id) || ['impact_damage', 'sharper_arrows', 'arcane_spell', 'shield_start'].includes(id));
  const pool = weighted.length >= count ? weighted : candidates;
  const picked: UpgradeId[] = [];
  let guard = 0;

  while (picked.length < count && guard < 100) {
    const seed = state.score + state.coins * 17 + state.roomsCleared * 31 + guard * 7 + state.nextId;
    const index = Math.floor(randFromSeed(seed) * pool.length);
    const id = pool[index];
    if (!picked.includes(id)) picked.push(id);
    guard += 1;
  }

  return picked;
}

export function applyUpgrade(state: GameState, id: UpgradeId): GameState {
  const next: GameState = cloneState(state);
  next.player.upgrades.push(id);

  switch (id) {
    case 'impact_damage':
      next.player.bodyDamage += 1;
      break;
    case 'max_hp':
      next.player.maxHp += 1;
      next.player.hp = Math.min(next.player.maxHp, next.player.hp + 1);
      break;
    case 'sharper_arrows':
      next.player.arrowDamage += 1;
      break;
    case 'arcane_spell':
      next.player.spellDamage += 1;
      break;
    case 'shield_start':
      next.player.shieldCharges += 1;
      break;
    case 'slippery':
    case 'sticky_boots':
    case 'explosive_body':
    case 'quick_aim':
      break;
  }

  return next;
}
