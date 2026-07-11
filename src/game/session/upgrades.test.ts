/**
 * Tests de mejoras (GDD §11): efectos exactos de las 9, reglas de elección
 * (repetibles, una vez, corazón extra capado a 9) y determinismo del roll.
 */

import { describe, expect, it } from 'vitest';
import { HERO_MAX_HP } from '@/game/features/hero/constants';
import { STEADY_PULSE_RELOAD_MULTIPLIER } from '@/game/features/combat/constants';
import { createRng } from '@/engine/rng';
import { applyUpgrade, rollUpgradeChoices, UPGRADE_POOL, type UpgradeId } from './upgrades';
import { createEventQueue } from '@/engine/events';
import { createWorld } from '@/game/world/create';
import type { RoomData } from '@/game/world/types';

function makeWorld() {
  const room: RoomData = {
    version: 1,
    id: 'up-room',
    name: 'Upgrades',
    width: 10,
    height: 10,
    playerStart: { x: 0, y: 0 },
    tags: ['combate'],
    doorSlots: [],
    enemies: [],
    hazards: [],
    items: [],
  };
  return createWorld(room);
}

function upgradeById(id: UpgradeId) {
  const def = UPGRADE_POOL.find((u) => u.id === id);
  if (!def) throw new Error(`upgrade no encontrada: ${id}`);
  return def;
}

describe('efectos de las 9 mejoras', () => {
  it('Impacto Pesado: +1 daño de embestida, acumulable', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('heavy-impact'), events);
    applyUpgrade(world, upgradeById('heavy-impact'), events);
    expect(world.hero.modifiers.ramDamageBonus).toBe(2);
  });

  it('Corazón Extra: +1 vida máxima y cura 1 (tope 9)', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    world.hero.hp = 3;
    applyUpgrade(world, upgradeById('extra-heart'), events);
    expect(world.hero.maxHp).toBe(6);
    expect(world.hero.hp).toBe(4);
  });

  it('Más Deslizamiento: reduce el multiplicador de fricción', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('more-slide'), events);
    expect(world.hero.modifiers.frictionMultiplier).toBeLessThan(1);
  });

  it('Botas de Control: aumenta el multiplicador de fricción', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('control-boots'), events);
    expect(world.hero.modifiers.frictionMultiplier).toBeGreaterThan(1);
  });

  it('Choque Explosivo: activa el daño en área de la embestida', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('explosive-ram'), events);
    expect(world.hero.modifiers.explosiveRam).toBe(true);
  });

  it('Flechas Afiladas: +1 daño de flecha, acumulable', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('sharp-arrows'), events);
    applyUpgrade(world, upgradeById('sharp-arrows'), events);
    expect(world.hero.modifiers.arrowDamageBonus).toBe(2);
  });

  it('Hechizo Arcano: +1 daño de hechizo y proyectil más grande', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('arcane-spell'), events);
    expect(world.hero.modifiers.spellDamageBonus).toBe(1);
    expect(world.hero.modifiers.spellRadiusBonus).toBeGreaterThan(0);
  });

  it('Pulso Firme: recarga ×0.72', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('steady-pulse'), events);
    expect(world.hero.modifiers.reloadMultiplier).toBeCloseTo(STEADY_PULSE_RELOAD_MULTIPLIER, 9);
  });

  it('Escudo Frágil: +1 carga de escudo, acumulable', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('fragile-shield'), events);
    applyUpgrade(world, upgradeById('fragile-shield'), events);
    expect(world.hero.modifiers.shieldCharges).toBe(2);
  });
});

describe('rollUpgradeChoices', () => {
  it('ofrece 3 opciones distintas', () => {
    const world = makeWorld();
    const rng = createRng(7);
    const choices = rollUpgradeChoices(world.hero, rng, 3, new Set());
    expect(choices).toHaveLength(3);
    expect(new Set(choices.map((c) => c.id)).size).toBe(3);
  });

  it('es determinista con la misma semilla', () => {
    const world = makeWorld();
    const a = rollUpgradeChoices(world.hero, createRng(42), 3, new Set()).map((c) => c.id);
    const b = rollUpgradeChoices(world.hero, createRng(42), 3, new Set()).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('Corazón Extra deja de ofrecerse con maxHp = 9', () => {
    const world = makeWorld();
    world.hero.maxHp = HERO_MAX_HP;
    for (let seed = 1; seed <= 30; seed++) {
      const choices = rollUpgradeChoices(world.hero, createRng(seed), 3, new Set());
      expect(choices.some((c) => c.id === 'extra-heart')).toBe(false);
    }
  });

  it('las no-repetibles ya ofrecidas quedan excluidas; daño/escudo pueden repetirse', () => {
    const world = makeWorld();
    const offered = new Set<UpgradeId>([
      'extra-heart',
      'more-slide',
      'control-boots',
      'explosive-ram',
      'steady-pulse',
    ]);
    for (let seed = 1; seed <= 30; seed++) {
      const choices = rollUpgradeChoices(world.hero, createRng(seed), 3, offered);
      for (const c of choices) {
        expect(offered.has(c.id)).toBe(false);
      }
    }
    // Solo quedan las 4 repetibles (heavy-impact, sharp-arrows, arcane-spell, fragile-shield).
    const remaining = rollUpgradeChoices(world.hero, createRng(1), 3, offered);
    for (const c of remaining) {
      expect(c.repeatable).toBe(true);
    }
  });

  it('devuelve menos de 3 si no hay suficientes elegibles', () => {
    const world = makeWorld();
    const offered = new Set<UpgradeId>(UPGRADE_POOL.filter((u) => !u.repeatable).map((u) => u.id));
    // Elegibles: solo las 4 repetibles → pide 5, recibe 4.
    const choices = rollUpgradeChoices(world.hero, createRng(3), 5, offered);
    expect(choices.length).toBe(4);
  });
});
