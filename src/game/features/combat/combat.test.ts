/**
 * Tests de combate (GDD §5-6): fórmula de embestida, i-frames, cooldown de
 * contacto, escudo, pierce de flecha, rebote de hechizo y muerte del héroe.
 */

import { describe, expect, it } from 'vitest';
import { ARROW_PIERCE_COUNT, CONTACT_DAMAGE_COOLDOWN, ENEMY_KNOCKBACK_SPEED, HERO_IFRAME_DURATION, RAM_SPEED_THRESHOLD, SHIELD_IFRAME_DURATION, SPELL_WALL_BOUNCES } from './constants';
import { MAX_SPEED } from '@/engine/physics';
import { applyDamageToEnemy, applyDamageToHero, fireProjectile, isSpikeContactDangerous, ramDamage, stepHeroEnemyContacts, stepProjectiles } from './combat';
import { createEventQueue, drainEvents, type GameEvent } from '@/engine/events';
import { createWorld } from '@/game/world/create';
import type { EnemySpawn, RoomData, World } from '@/game/world/types';

function makeRoom(partial: Partial<RoomData> = {}): RoomData {
  return {
    version: 1,
    id: 'combat-room',
    name: 'Combat',
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

function makeWorld(enemies: EnemySpawn[] = []): World {
  return createWorld(makeRoom({ enemies }));
}

const FIXED_DT = 1 / 60;

describe('ramDamage (fórmula de embestida)', () => {
  it('no daña por debajo del umbral de 2.5 u/s', () => {
    expect(ramDamage(0, 0)).toBe(0);
    expect(ramDamage(2.49, 0)).toBe(0);
  });

  it('daño = 1 + floor(vel × 0.32) a partir del umbral', () => {
    expect(ramDamage(RAM_SPEED_THRESHOLD, 0)).toBe(1); // 1 + floor(0.8) = 1
    expect(ramDamage(7.5, 0)).toBe(3); // 1 + floor(2.4) = 3
    expect(ramDamage(MAX_SPEED, 0)).toBe(5); // 1 + floor(4.32) = 5
  });

  it('escala con el bono de Impacto Pesado y nunca baja de 1', () => {
    expect(ramDamage(2.5, 2)).toBe(3);
    expect(ramDamage(2.5, -5)).toBe(1); // clamp mínimo
  });
});

describe('i-frames del héroe', () => {
  it('bloquea daño durante 0.7 s tras un golpe', () => {
    const world = makeWorld();
    const events = createEventQueue(16);
    expect(applyDamageToHero(world, 1, events)).toBe(false);
    expect(world.hero.hp).toBe(4);
    expect(world.hero.invulnerableUntil).toBeCloseTo(world.time + HERO_IFRAME_DURATION, 9);

    // Segundo golpe inmediato: sin efecto.
    applyDamageToHero(world, 1, events);
    expect(world.hero.hp).toBe(4);

    // Tras expirar los i-frames vuelve a recibir daño.
    world.time += HERO_IFRAME_DURATION + 0.01;
    applyDamageToHero(world, 1, events);
    expect(world.hero.hp).toBe(3);
  });

  it('a 0 HP pasa a fase game-over y emite player-died', () => {
    const world = makeWorld();
    const events = createEventQueue(16);
    world.hero.hp = 1;
    expect(applyDamageToHero(world, 1, events)).toBe(true);
    expect(world.hero.hp).toBe(0);
    expect(world.phase).toBe('game-over');

    const types: string[] = [];
    drainEvents(events, (e: GameEvent) => types.push(e.type));
    expect(types).toContain('player-died');
  });
});

describe('escudo (cargas)', () => {
  it('bloquea el golpe por completo, consume una carga y da i-frames cortos', () => {
    const world = makeWorld();
    const events = createEventQueue(16);
    world.hero.modifiers.shieldCharges = 1;

    applyDamageToHero(world, 3, events);
    expect(world.hero.hp).toBe(5); // sin daño
    expect(world.hero.modifiers.shieldCharges).toBe(0);
    expect(world.hero.invulnerableUntil).toBeCloseTo(world.time + SHIELD_IFRAME_DURATION, 9);

    const types: string[] = [];
    drainEvents(events, (e: GameEvent) => types.push(e.type));
    expect(types).toContain('shield-block');
  });
});

describe('contacto héroe↔enemigo', () => {
  it('embestida por encima del umbral daña al enemigo con knockback y flash', () => {
    const world = makeWorld([{ id: 'e1', kind: 'chaser', position: { x: 0.5, y: 0 } }]);
    const events = createEventQueue(16);
    const enemy = world.enemies[0];
    const hpBefore = enemy.hp;
    world.hero.velocity.x = 7.5;

    stepHeroEnemyContacts(world, world.contactDamageCooldowns, events);

    expect(enemy.hp).toBe(hpBefore - 3); // ramDamage(7.5) = 3
    expect(enemy.velocity.x).toBeCloseTo(ENEMY_KNOCKBACK_SPEED, 6); // empujado en +x
    expect(enemy.hitFlashUntil).toBeGreaterThan(world.time);
    expect(world.hero.hp).toBe(5); // el héroe no recibe daño al embestir
  });

  it('contacto lento daña al héroe con cooldown de 0.42 s por enemigo', () => {
    const world = makeWorld([{ id: 'e1', kind: 'dummy', position: { x: 0.5, y: 0 } }]);
    const events = createEventQueue(16);
    // Quieto: velocidad 0 < umbral de embestida.
    stepHeroEnemyContacts(world, world.contactDamageCooldowns, events);
    expect(world.hero.hp).toBe(4);

    // Anulamos los i-frames para aislar el cooldown por enemigo.
    world.hero.invulnerableUntil = 0;
    world.time += CONTACT_DAMAGE_COOLDOWN / 2;
    stepHeroEnemyContacts(world, world.contactDamageCooldowns, events);
    expect(world.hero.hp).toBe(4); // dentro del cooldown: sin tick de daño

    world.time += CONTACT_DAMAGE_COOLDOWN;
    stepHeroEnemyContacts(world, world.contactDamageCooldowns, events);
    expect(world.hero.hp).toBe(3);
  });
});

describe('Spike: púa direccional en contacto', () => {
  it('isSpikeContactDangerous distingue frente (dot > 0.25) de flancos/espalda', () => {
    // Púa apuntando a +y; héroe al sur del spike (lado de la púa) → peligroso.
    expect(isSpikeContactDangerous(0, 1, 0, 0, 0, 1)).toBe(true);
    // Héroe detrás (lado opuesto) → no peligroso.
    expect(isSpikeContactDangerous(0, -1, 0, 0, 0, 1)).toBe(false);
    // Flanco exacto (dot = 0) → no peligroso.
    expect(isSpikeContactDangerous(1, 0, 0, 0, 0, 1)).toBe(false);
  });

  it('embestir de frente contra la púa daña al héroe y no al Spike', () => {
    const world = makeWorld([
      { id: 's1', kind: 'spike', position: { x: 0, y: -0.5 }, facing: { x: 0, y: 1 } },
    ]);
    const events = createEventQueue(16);
    const spike = world.enemies[0];
    const hpBefore = spike.hp;
    world.hero.velocity.y = -7.5; // embiste hacia el norte, contra la cara de la púa

    stepHeroEnemyContacts(world, world.contactDamageCooldowns, events);

    expect(world.hero.hp).toBe(4); // el héroe recibe 1
    expect(spike.hp).toBe(hpBefore); // el spike no recibe nada
  });

  it('embestir por la espalda daña al Spike con normalidad', () => {
    const world = makeWorld([
      { id: 's1', kind: 'spike', position: { x: 0, y: 0.5 }, facing: { x: 0, y: 1 } },
    ]);
    const events = createEventQueue(16);
    const spike = world.enemies[0];
    const hpBefore = spike.hp;
    world.hero.velocity.y = 7.5; // llega desde el norte (espalda de la púa)

    stepHeroEnemyContacts(world, world.contactDamageCooldowns, events);

    expect(spike.hp).toBe(hpBefore - 3);
    expect(world.hero.hp).toBe(5);
  });
});

describe('flecha: pierce', () => {
  it('atraviesa 1 enemigo y se detiene en el segundo; el tercero queda intacto', () => {
    const world = makeWorld([
      { id: 'e1', kind: 'chaser', position: { x: 2, y: 0 } },
      { id: 'e2', kind: 'chaser', position: { x: 4, y: 0 } },
      { id: 'e3', kind: 'chaser', position: { x: 6, y: 0 } },
    ]);
    const events = createEventQueue(64);
    expect(ARROW_PIERCE_COUNT).toBe(1);

    expect(fireProjectile(world, 'arrow', 1, 0, 1, events)).toBe(true);
    const arrow = world.projectiles.find((p) => p.active);
    expect(arrow).toBeDefined();

    for (let i = 0; i < 120 && arrow!.active; i++) {
      stepProjectiles(world, FIXED_DT, events);
    }

    expect(world.enemies[0].hp).toBe(2); // 3 − 1
    expect(world.enemies[1].hp).toBe(2); // 3 − 1 (se detiene aquí)
    expect(world.enemies[2].hp).toBe(3); // intacto
    expect(arrow!.active).toBe(false);
  });
});

describe('hechizo: rebote en pared', () => {
  it('rebota una vez perdiendo fuerza y acortando vida; el segundo choque lo apaga', () => {
    const world = createWorld(makeRoom({ width: 10, height: 10 }));
    const events = createEventQueue(64);
    expect(SPELL_WALL_BOUNCES).toBe(1);

    expect(fireProjectile(world, 'spell', 1, 0, 1, events)).toBe(true);
    const spell = world.projectiles.find((p) => p.active);
    expect(spell).toBeDefined();
    const speedBefore = Math.abs(spell!.velocity.x);
    const ttlBefore = spell!.ttl;

    // Avanza hasta el primer rebote contra la pared este.
    let bounced = false;
    for (let i = 0; i < 300 && !bounced; i++) {
      stepProjectiles(world, FIXED_DT, events);
      if (spell!.active && spell!.velocity.x < 0) bounced = true;
    }

    expect(bounced).toBe(true);
    expect(spell!.active).toBe(true);
    expect(spell!.bouncesLeft).toBe(0);
    expect(Math.abs(spell!.velocity.x)).toBeLessThan(speedBefore); // pierde fuerza
    expect(spell!.ttl).toBeLessThan(ttlBefore - 0.3); // vida acortada por el rebote

    // Segundo choque contra la pared oeste: desaparece.
    for (let i = 0; i < 600 && spell!.active; i++) {
      stepProjectiles(world, FIXED_DT, events);
    }
    expect(spell!.active).toBe(false);
  });
});

describe('retroceso de proyectil', () => {
  it('disparar empuja al héroe hacia atrás', () => {
    const world = makeWorld();
    const events = createEventQueue(16);
    fireProjectile(world, 'arrow', 1, 0, 1, events);
    expect(world.hero.velocity.x).toBeLessThan(0); // dispara a +x, retrocede a −x
  });
});

describe('cooldowns de armas', () => {
  it('respeta el cooldown de la flecha (0.5 s)', () => {
    const world = makeWorld();
    const events = createEventQueue(16);
    expect(fireProjectile(world, 'arrow', 1, 0, 1, events)).toBe(true);
    expect(fireProjectile(world, 'arrow', 1, 0, 1, events)).toBe(false);

    world.time += 0.51;
    expect(fireProjectile(world, 'arrow', 1, 0, 1, events)).toBe(true);
  });

  it('respeta el cooldown del hechizo (1.0 s)', () => {
    const world = makeWorld();
    const events = createEventQueue(16);
    expect(fireProjectile(world, 'spell', 1, 0, 1, events)).toBe(true);
    expect(fireProjectile(world, 'spell', 1, 0, 1, events)).toBe(false);

    world.time += 1.01;
    expect(fireProjectile(world, 'spell', 1, 0, 1, events)).toBe(true);
  });
});

describe('applyDamageToEnemy', () => {
  it('emite enemy-died al llegar a 0 HP', () => {
    const world = makeWorld([{ id: 'e1', kind: 'dummy', position: { x: 1, y: 0 } }]);
    const events = createEventQueue(16);
    const enemy = world.enemies[0];
    applyDamageToEnemy(world, enemy, 99, 1, 0, events);
    expect(enemy.hp).toBeLessThanOrEqual(0);

    const types: string[] = [];
    drainEvents(events, (e: GameEvent) => types.push(e.type));
    expect(types).toContain('enemy-died');
  });
});
