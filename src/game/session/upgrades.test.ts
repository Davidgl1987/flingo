/**
 * Tests de mejoras (GDD §11, docs/plans/ECONOMY_PLAN.md): efectos de las 12,
 * gating por nivel/isAvailable, recompensa de jefe por categoría de ataque y
 * economía de compra (descuenta monedas, resta puntuación con clamp a 0).
 */

import { describe, expect, it } from 'vitest';
import { HERO_MAX_HP } from '@/game/features/hero/constants';
import { createRng } from '@/engine/rng';
import {
  applyUpgrade,
  canOfferUpgrade,
  getUpgradeLevel,
  rollBossReward,
  tryPurchaseUpgrade,
  UPGRADE_POOL,
  type UpgradeId,
} from './upgrades';
import { createEventQueue, drainEvents, type GameEvent } from '@/engine/events';
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

describe('efectos de las 12 mejoras', () => {
  it('Erizo de Acero (cuerpo-dano): +1 daño de embestida, acumulable', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('cuerpo-dano'), events);
    applyUpgrade(world, upgradeById('cuerpo-dano'), events);
    expect(world.hero.modifiers.ramDamageBonus).toBe(2);
    expect(getUpgradeLevel(world.hero, 'cuerpo-dano')).toBe(2);
  });

  it('Estela de Cometa (cuerpo-velocidad): +1 u/s de velocidad de lanzamiento', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('cuerpo-velocidad'), events);
    expect(world.hero.modifiers.launchSpeedBonus).toBe(1);
  });

  it('Canto Rodado (cuerpo-firmeza): reduce el multiplicador de retroceso recibido', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('cuerpo-firmeza'), events);
    expect(world.hero.modifiers.knockbackTakenMultiplier).toBeLessThan(1);
  });

  it('Colmillo de Hierro (flecha-dano): +1 daño de flecha, acumulable', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('flecha-dano'), events);
    applyUpgrade(world, upgradeById('flecha-dano'), events);
    expect(world.hero.modifiers.arrowDamageBonus).toBe(2);
  });

  it('Bandada (flecha-multi): +1 flecha en ángulo', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('flecha-multi'), events);
    expect(world.hero.modifiers.arrowCountBonus).toBe(1);
  });

  it('Aguja Fantasma (flecha-perfora): +1 enemigo atravesado', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('flecha-perfora'), events);
    expect(world.hero.modifiers.arrowPierceBonus).toBe(1);
  });

  it('Orbe Voraz (hechizo-dano): +1 daño de hechizo y proyectil más ancho', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('hechizo-dano'), events);
    expect(world.hero.modifiers.spellDamageBonus).toBe(1);
    expect(world.hero.modifiers.spellRadiusBonus).toBeGreaterThan(0);
  });

  it('Coro Arcano (hechizo-multi): +1 hechizo en ángulo', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('hechizo-multi'), events);
    expect(world.hero.modifiers.spellCountBonus).toBe(1);
  });

  it('Eco Errante (hechizo-rebote): +1 rebote de hechizo', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('hechizo-rebote'), events);
    expect(world.hero.modifiers.spellBounceBonus).toBe(1);
  });

  it('Burbuja de Cuarzo (escudo): +1 carga de escudo, stack sin tope', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('escudo'), events);
    applyUpgrade(world, upgradeById('escudo'), events);
    expect(world.hero.modifiers.shieldCharges).toBe(2);
    expect(canOfferUpgrade(upgradeById('escudo'), world.hero)).toBe(true);
  });

  it('Canto de Urraca (iman): fija coinMagnetLevel al nivel alcanzado', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('iman'), events);
    expect(world.hero.modifiers.coinMagnetLevel).toBe(1);
    applyUpgrade(world, upgradeById('iman'), events);
    expect(world.hero.modifiers.coinMagnetLevel).toBe(2);
  });

  describe('Ascua Vital (corazon)', () => {
    it('cura 1 si falta vida, sin subir maxHp', () => {
      const world = makeWorld();
      const events = createEventQueue(8);
      world.hero.maxHp = 6;
      world.hero.hp = 3;
      applyUpgrade(world, upgradeById('corazon'), events);
      expect(world.hero.hp).toBe(4);
      expect(world.hero.maxHp).toBe(6);
    });

    it('con vida llena: +1 vida máxima y cura hasta el nuevo máximo', () => {
      const world = makeWorld();
      const events = createEventQueue(8);
      world.hero.maxHp = 6;
      world.hero.hp = 6;
      applyUpgrade(world, upgradeById('corazon'), events);
      expect(world.hero.maxHp).toBe(7);
      expect(world.hero.hp).toBe(7);
    });

    it('vida máxima topa en HERO_MAX_HP (9)', () => {
      const world = makeWorld();
      const events = createEventQueue(8);
      world.hero.maxHp = HERO_MAX_HP;
      world.hero.hp = HERO_MAX_HP - 1;
      applyUpgrade(world, upgradeById('corazon'), events);
      expect(world.hero.maxHp).toBe(HERO_MAX_HP);
      expect(world.hero.hp).toBe(HERO_MAX_HP);
    });

    it('isAvailable es false con hp y maxHp ambos a tope (9/9)', () => {
      const world = makeWorld();
      world.hero.maxHp = HERO_MAX_HP;
      world.hero.hp = HERO_MAX_HP;
      expect(canOfferUpgrade(upgradeById('corazon'), world.hero)).toBe(false);
    });

    it('isAvailable es true si falta vida, aunque maxHp ya esté a tope', () => {
      const world = makeWorld();
      world.hero.maxHp = HERO_MAX_HP;
      world.hero.hp = HERO_MAX_HP - 2;
      expect(canOfferUpgrade(upgradeById('corazon'), world.hero)).toBe(true);
    });
  });

  it('emite upgrade-applied al centro de posición del héroe', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyUpgrade(world, upgradeById('cuerpo-dano'), events);
    const types: string[] = [];
    drainEvents(events, (e: GameEvent) => types.push(e.type));
    expect(types).toContain('upgrade-applied');
  });
});

describe('gating de niveles (canOfferUpgrade)', () => {
  it('no se ofrece por encima de maxLevel', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    const def = upgradeById('cuerpo-dano'); // maxLevel 3
    for (let i = 0; i < 3; i++) {
      expect(canOfferUpgrade(def, world.hero)).toBe(true);
      applyUpgrade(world, def, events);
    }
    expect(getUpgradeLevel(world.hero, 'cuerpo-dano')).toBe(3);
    expect(canOfferUpgrade(def, world.hero)).toBe(false);
  });

  it('nivel 0 antes de aplicarse nunca', () => {
    const world = makeWorld();
    expect(getUpgradeLevel(world.hero, 'flecha-dano')).toBe(0);
  });
});

describe('tryPurchaseUpgrade', () => {
  it('descuenta monedas, resta puntuación y sube nivel al comprar', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    world.hero.coins = 100;
    world.stats.score = 500;
    const def = upgradeById('cuerpo-dano'); // nivel 1 = 10 monedas

    const bought = tryPurchaseUpgrade(world, def, events);

    expect(bought).toBe(true);
    expect(world.hero.coins).toBe(90);
    expect(world.stats.score).toBe(490);
    expect(getUpgradeLevel(world.hero, 'cuerpo-dano')).toBe(1);
    expect(world.hero.modifiers.ramDamageBonus).toBe(1);
  });

  it('el precio escala por nivel (10/20/30)', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    world.hero.coins = 1000;
    world.stats.score = 1000;
    const def = upgradeById('cuerpo-dano');

    tryPurchaseUpgrade(world, def, events);
    expect(world.hero.coins).toBe(990); // 1000 - 10

    tryPurchaseUpgrade(world, def, events);
    expect(world.hero.coins).toBe(970); // 990 - 20

    tryPurchaseUpgrade(world, def, events);
    expect(world.hero.coins).toBe(940); // 970 - 30
  });

  it('resta puntuación con clamp a 0 (no baja de 0)', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    world.hero.coins = 100;
    world.stats.score = 5;
    const def = upgradeById('cuerpo-dano'); // precio 10 > score 5

    const bought = tryPurchaseUpgrade(world, def, events);

    expect(bought).toBe(true);
    expect(world.stats.score).toBe(0);
  });

  it('sin saldo suficiente: false, sin descontar monedas ni aplicar el nivel', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    world.hero.coins = 5;
    const def = upgradeById('cuerpo-dano'); // precio 10

    const bought = tryPurchaseUpgrade(world, def, events);

    expect(bought).toBe(false);
    expect(world.hero.coins).toBe(5);
    expect(getUpgradeLevel(world.hero, 'cuerpo-dano')).toBe(0);
    expect(world.hero.modifiers.ramDamageBonus).toBe(0);
  });

  it('sin ofrecible (maxLevel alcanzado): false, sin efectos', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    world.hero.coins = 1000;
    const capped = upgradeById('flecha-perfora'); // maxLevel 3
    for (let i = 0; i < 3; i++) applyUpgrade(world, capped, events);
    const coinsBefore = world.hero.coins;

    const bought = tryPurchaseUpgrade(world, capped, events);

    expect(bought).toBe(false);
    expect(world.hero.coins).toBe(coinsBefore);
  });

  it('emite upgrade-purchased con el precio pagado', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    world.hero.coins = 100;
    tryPurchaseUpgrade(world, upgradeById('cuerpo-dano'), events);

    const purchased: GameEvent[] = [];
    drainEvents(events, (e) => {
      if (e.type === 'upgrade-purchased') purchased.push({ ...e });
    });
    expect(purchased).toHaveLength(1);
    expect(purchased[0].intensity).toBe(10);
  });
});

describe('rollBossReward', () => {
  it('devuelve como mucho una mejora por cada categoría de ataque (cuerpo/flecha/hechizo)', () => {
    const world = makeWorld();
    const rewards = rollBossReward(world.hero, createRng(7));
    expect(rewards.length).toBeLessThanOrEqual(3);
    const categories = rewards.map((r) => r.category);
    expect(new Set(categories).size).toBe(categories.length); // sin categorías repetidas
    for (const r of rewards) {
      expect(r.category).not.toBe('consumible');
    }
  });

  it('es determinista con la misma semilla', () => {
    const world = makeWorld();
    const a = rollBossReward(world.hero, createRng(42)).map((r) => r.id);
    const b = rollBossReward(world.hero, createRng(42)).map((r) => r.id);
    expect(a).toEqual(b);
  });

  it('omite una categoría totalmente maxeada (puede devolver menos de 3)', () => {
    const world = makeWorld();
    const events = createEventQueue(64);
    // Maxea las 3 mejoras de cuerpo.
    for (const id of ['cuerpo-dano', 'cuerpo-velocidad', 'cuerpo-firmeza'] as UpgradeId[]) {
      const def = upgradeById(id);
      for (let i = 0; i < def.maxLevel; i++) applyUpgrade(world, def, events);
    }
    for (let seed = 1; seed <= 20; seed++) {
      const rewards = rollBossReward(world.hero, createRng(seed));
      expect(rewards.some((r) => r.category === 'cuerpo')).toBe(false);
      expect(rewards.length).toBeLessThanOrEqual(2);
    }
  });

  it('nunca incluye consumibles aunque no estén maxeados', () => {
    const world = makeWorld();
    for (let seed = 1; seed <= 20; seed++) {
      const rewards = rollBossReward(world.hero, createRng(seed));
      expect(rewards.every((r) => r.category !== 'consumible')).toBe(true);
    }
  });
});
