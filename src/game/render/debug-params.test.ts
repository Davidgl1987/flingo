/**
 * Tests de las herramientas de playtest por parámetro de URL relacionadas
 * con mejoras (F5, docs/plans/ECONOMY_PLAN.md): parseo puro de `?upgrades=`
 * y aplicación del mapa resultante a un mundo recién creado.
 */

import { describe, expect, it } from 'vitest';
import { createWorld } from '@/game/world/create';
import type { RoomData } from '@/game/world/types';
import { createEventQueue } from '@/engine/events';
import { getUpgradeLevel } from '@/game/session/upgrades';
import { applyForcedUpgrades, parseForcedUpgrades } from './debug-params';

function makeWorld() {
  const room: RoomData = {
    version: 1,
    id: 'debug-params-room',
    name: 'Debug params',
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

describe('parseForcedUpgrades', () => {
  it('devuelve {} sin parámetro', () => {
    expect(parseForcedUpgrades(null)).toEqual({});
    expect(parseForcedUpgrades('')).toEqual({});
  });

  it('parsea pares id:nivel válidos', () => {
    expect(parseForcedUpgrades('cuerpo-dano:3,escudo:2,flecha-dano:1')).toEqual({
      'cuerpo-dano': 3,
      escudo: 2,
      'flecha-dano': 1,
    });
  });

  it('ignora ids desconocidos del pool', () => {
    expect(parseForcedUpgrades('no-existe:2,cuerpo-dano:1')).toEqual({ 'cuerpo-dano': 1 });
  });

  it('clampa el nivel al maxLevel de la mejora', () => {
    // cuerpo-dano tiene maxLevel 3.
    expect(parseForcedUpgrades('cuerpo-dano:99')).toEqual({ 'cuerpo-dano': 3 });
  });

  it('ignora niveles no positivos o no numéricos', () => {
    expect(parseForcedUpgrades('cuerpo-dano:0,flecha-dano:-1,hechizo-dano:abc')).toEqual({});
  });

  it('clampa el escudo (maxLevel Infinity) a un tope defensivo en vez de aceptar cualquier valor', () => {
    const parsed = parseForcedUpgrades('escudo:999999999');
    expect(parsed.escudo).toBeLessThan(1000);
    expect(parsed.escudo).toBeGreaterThan(0);
  });
});

describe('applyForcedUpgrades', () => {
  it('no-op con un mapa vacío', () => {
    const world = makeWorld();
    const events = createEventQueue(8);
    applyForcedUpgrades(world, events, {});
    expect(world.hero.upgradeLevels).toEqual({});
  });

  it('sube niveles Y modificadores coherentes para cada mejora del mapa', () => {
    const world = makeWorld();
    const events = createEventQueue(16);
    applyForcedUpgrades(world, events, { 'cuerpo-dano': 3, escudo: 2, 'flecha-dano': 1 });

    expect(getUpgradeLevel(world.hero, 'cuerpo-dano')).toBe(3);
    expect(world.hero.modifiers.ramDamageBonus).toBe(3);
    expect(getUpgradeLevel(world.hero, 'escudo')).toBe(2);
    expect(world.hero.modifiers.shieldCharges).toBe(2);
    expect(getUpgradeLevel(world.hero, 'flecha-dano')).toBe(1);
    expect(world.hero.modifiers.arrowDamageBonus).toBe(1);
  });
});
