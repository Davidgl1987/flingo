/**
 * Tests del framework de jefes (GDD §15.1, Fase B0 de docs/plans/BOSSES_PLAN.md):
 * fases por umbral de vida, telegraph→ataque→ventana de vulnerabilidad del
 * jefe de pruebas, regla de daño fuera de ventana, techo de daño de un golpe
 * de jefe, sellado/apertura de la puerta de la sala de jefe y generador con
 * exactamente 1 jefe por run (este último ya cubierto en dungeon.test.ts).
 */

import { describe, expect, it } from 'vitest';
import { applyDamageToEnemy } from '@/game/sim/combat';
import { generateDungeon } from '@/game/sim/dungeon';
import { createDungeonWorld } from '@/game/sim/dungeon-world';
import { createEventQueue, drainEvents } from '@/game/sim/events';
import { stepWorld } from '@/game/sim/step';
import type { EnemySpawn, RoomData, RoomTag, World } from '@/game/sim/world';
import { createWorld } from '@/game/sim/world';
import { capBossHitDamage, initBossEnemies, isBoss, stepBossDoorSeal, stepBosses } from './lifecycle';
import { getBossDef } from './registry';
import { collectTypes } from './test-helpers';

const FIXED_DT = 1 / 60;

function makeRoom(partial: Partial<RoomData> = {}): RoomData {
  return {
    version: 1,
    id: 'boss-room',
    name: 'Sala de Jefe',
    width: 13,
    height: 13,
    playerStart: { x: 0, y: 5 },
    tags: ['jefe'],
    doorSlots: [],
    enemies: [],
    hazards: [],
    items: [],
    ...partial,
  };
}

function makeBossWorld(bossSpawn: Partial<EnemySpawn> = {}): World {
  const spawn: EnemySpawn = {
    id: 'boss-1',
    kind: 'boss',
    bossId: 'test-boss',
    position: { x: 0, y: -1 },
    ...bossSpawn,
  };
  const world = createWorld(makeRoom({ enemies: [spawn] }));
  initBossEnemies(world);
  return world;
}

describe('initBossEnemies', () => {
  it('sobrescribe hp/maxHp del placeholder con el valor real de BossDef.maxHp', () => {
    const world = makeBossWorld();
    const def = getBossDef('test-boss');
    const boss = world.enemies[0];
    expect(boss.hp).toBe(def.maxHp);
    expect(boss.maxHp).toBe(def.maxHp);
    expect(boss.bossDamageOutsideWindowFactor).toBe(def.damageOutsideWindow);
  });

  it('no toca enemigos que no son jefes', () => {
    const world = createWorld(
      makeRoom({ enemies: [{ id: 'd1', kind: 'dummy', position: { x: 0, y: 0 } }] }),
    );
    initBossEnemies(world);
    expect(world.enemies[0].hp).toBe(2); // hp normal del Dummy, sin tocar
  });
});

describe('isBoss', () => {
  it('true solo para kind boss con bossId definido', () => {
    const world = makeBossWorld();
    expect(isBoss(world.enemies[0])).toBe(true);
  });
});

describe('fases por umbral de vida (GDD §15.1 punto 3)', () => {
  it('empieza en fase 1 y pasa a fase 2 al cruzar 66%, a fase 3 al cruzar 33%', () => {
    const world = makeBossWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    const maxHp = boss.maxHp;

    expect(boss.bossPhase).toBe(1);
    boss.bossVulnerable = true; // el daño de test no depende de la ventana aquí (ver combat.ts para eso)

    // Justo por debajo del 66%: fase 2.
    applyDamageToEnemy(world, boss, Math.ceil(maxHp * 0.35), 0, 0, events);
    stepBosses(world, FIXED_DT, events);
    expect(boss.bossPhase).toBe(2);
    expect(collectTypes(events)).toContain('boss-phase-changed');

    // Justo por debajo del 33%: fase 3.
    applyDamageToEnemy(world, boss, Math.ceil(maxHp * 0.4), 0, 0, events);
    stepBosses(world, FIXED_DT, events);
    expect(boss.bossPhase).toBe(3);
    expect(collectTypes(events)).toContain('boss-phase-changed');
  });

  it('no reemite boss-phase-changed en ticks sucesivos sin cruzar otro umbral', () => {
    const world = makeBossWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    applyDamageToEnemy(world, boss, Math.ceil(boss.maxHp * 0.35), 0, 0, events);
    stepBosses(world, FIXED_DT, events);
    drainEvents(events, () => {});
    stepBosses(world, FIXED_DT, events);
    expect(collectTypes(events)).not.toContain('boss-phase-changed');
  });
});

describe('daño fuera de ventana de vulnerabilidad (GDD §15.1 punto 4)', () => {
  it('applyDamageToEnemy no reduce hp de un jefe con damageOutsideWindow=0 mientras no es vulnerable', () => {
    const world = makeBossWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    expect(boss.bossVulnerable).toBe(false);
    const hpBefore = boss.hp;
    applyDamageToEnemy(world, boss, 5, 1, 0, events);
    expect(boss.hp).toBe(hpBefore);
  });

  it('applyDamageToEnemy sí resta hp mientras bossVulnerable es true', () => {
    const world = makeBossWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.bossVulnerable = true;
    const hpBefore = boss.hp;
    applyDamageToEnemy(world, boss, 5, 1, 0, events);
    expect(boss.hp).toBe(hpBefore - 5);
  });
});

describe('ciclo telegraph → ataque → ventana de vulnerabilidad (jefe de pruebas)', () => {
  it('telegrafía con ≥0.6s de aviso, dispara, abre ventana y la vuelve a cerrar en bucle', () => {
    const world = makeBossWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];

    // Tick inicial: entra en telegraph.
    stepBosses(world, FIXED_DT, events);
    expect(boss.bossTelegraphUntil).toBeGreaterThan(world.time);
    expect(boss.bossTelegraphUntil - world.time).toBeGreaterThanOrEqual(0.6);
    expect(collectTypes(events)).toContain('boss-telegraph');
    expect(boss.bossVulnerable).toBe(false);

    // Avanza hasta que el telegraph resuelve (dispara) y se abre la ventana.
    let vulnerableSeen = false;
    for (let i = 0; i < 300; i++) {
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;
      if (boss.bossVulnerable) {
        vulnerableSeen = true;
        break;
      }
    }
    expect(vulnerableSeen).toBe(true);

    // La ventana se cierra de nuevo tras su duración (vuelve a telegrafiar).
    let closedAgain = false;
    for (let i = 0; i < 300; i++) {
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;
      if (!boss.bossVulnerable) {
        closedAgain = true;
        break;
      }
    }
    expect(closedAgain).toBe(true);
  });

  it('el disparo del telegraph activa un proyectil hostil del pool', () => {
    const world = makeBossWorld();
    const events = createEventQueue(64);
    // Tick 1: entra en telegraph con timer TEST_BOSS_TELEGRAPH_DURATION (0.8s).
    stepBosses(world, FIXED_DT, events);
    // Avanza el tiempo simulado y sigue llamando a stepBosses hasta que
    // dispare (bossTimer llega a 0 tras ~0.8s de ticks).
    for (let i = 0; i < 60; i++) {
      world.time += FIXED_DT;
      stepBosses(world, FIXED_DT, events);
    }
    const activeEnemyProjectiles = world.projectiles.filter((p) => p.active && p.owner === 'enemy');
    expect(activeEnemyProjectiles.length).toBeGreaterThan(0);
  });
});

describe('capBossHitDamage (techo de daño de un golpe de jefe, GDD §15.1 punto 6)', () => {
  it('limita el daño bruto a la fracción de vida máxima del héroe según la fase', () => {
    const world = makeBossWorld();
    const boss = world.enemies[0];
    const heroMaxHp = 5;
    const def = getBossDef('test-boss');

    boss.bossPhase = 1;
    const capped = capBossHitDamage(heroMaxHp, boss, 999);
    expect(capped).toBeLessThanOrEqual(Math.ceil(def.hitDamageCapFraction[0] * heroMaxHp));
    expect(capped).toBeGreaterThanOrEqual(1);
  });

  it('nunca deja pasar un golpe letal a vida llena (cap < heroMaxHp en fase 1)', () => {
    const world = makeBossWorld();
    const boss = world.enemies[0];
    const heroMaxHp = 9;
    const capped = capBossHitDamage(heroMaxHp, boss, 999);
    expect(capped).toBeLessThan(heroMaxHp);
  });

  it('no reduce el daño si ya es menor que el techo', () => {
    const world = makeBossWorld();
    const boss = world.enemies[0];
    expect(capBossHitDamage(9, boss, 1)).toBe(1);
  });
});

describe('sellado de puerta de la sala de jefe (GDD §15.1 punto 7)', () => {
  function makeDungeonPool(): RoomData[] {
    const combat = (id: string): RoomData => ({
      version: 1,
      id,
      name: id,
      width: 9,
      height: 9,
      playerStart: { x: 0, y: 0 },
      tags: ['combate'] as RoomTag[],
      doorSlots: [
        { side: 'north', offset: 0 },
        { side: 'south', offset: 0 },
        { side: 'east', offset: 0 },
        { side: 'west', offset: 0 },
      ],
      enemies: [],
      hazards: [],
      items: [],
    });
    const bossRoom: RoomData = {
      ...combat('boss-room'),
      tags: ['jefe'],
      boss: 'test-boss',
      enemies: [{ id: 'boss-1', kind: 'boss', bossId: 'test-boss', position: { x: 0, y: 0 } }],
    };
    const keyRoom: RoomData = {
      ...combat('key-room'),
      tags: ['llave'],
      items: [{ id: 'key-item', kind: 'key', position: { x: 0, y: 0 } }],
    };
    return [
      { ...combat('start-room'), tags: ['inicio'] },
      combat('combat-1'),
      combat('combat-2'),
      combat('combat-3'),
      keyRoom,
      bossRoom,
    ];
  }

  it('se cierra de nuevo la conexión en cuanto el héroe entra con la puerta abierta y el jefe sigue vivo', () => {
    const dungeon = generateDungeon(10, makeDungeonPool());
    const world = createDungeonWorld(dungeon, 10);
    initBossEnemies(world);
    const events = createEventQueue(64);

    const bossRuntime = world.roomRuntimes.get(dungeon.bossRoomId)!;
    const bossDoor = bossRuntime.doors[0];
    // Simula que el héroe ya desbloqueó la puerta (abierta) y está dentro.
    world.hero.hasKey = true;
    for (const rt of world.roomRuntimes.values()) {
      for (const d of rt.doors) {
        if (d.connectionIndex === bossDoor.connectionIndex) d.open = true;
      }
    }
    world.currentRoomId = dungeon.bossRoomId;

    stepBossDoorSeal(world, events);

    const doorAfter = world.roomRuntimes.get(dungeon.bossRoomId)!.doors[0];
    expect(doorAfter.open).toBe(false);
    expect(collectTypes(events)).toContain('boss-door-sealed');
  });

  it('no sella si el jefe ya está muerto', () => {
    const dungeon = generateDungeon(11, makeDungeonPool());
    const world = createDungeonWorld(dungeon, 11);
    initBossEnemies(world);
    const events = createEventQueue(64);

    const boss = world.enemies.find((e) => isBoss(e))!;
    boss.hp = 0;

    const bossRuntime = world.roomRuntimes.get(dungeon.bossRoomId)!;
    const bossDoor = bossRuntime.doors[0];
    for (const rt of world.roomRuntimes.values()) {
      for (const d of rt.doors) {
        if (d.connectionIndex === bossDoor.connectionIndex) d.open = true;
      }
    }
    world.currentRoomId = dungeon.bossRoomId;

    stepBossDoorSeal(world, events);

    const doorAfter = world.roomRuntimes.get(dungeon.bossRoomId)!.doors[0];
    expect(doorAfter.open).toBe(true);
    expect(collectTypes(events)).not.toContain('boss-door-sealed');
  });

  it('integración vía stepWorld: matar al jefe limpia la sala, emite boss-defeated y victory, y reabre su puerta', () => {
    const dungeon = generateDungeon(12, makeDungeonPool());
    const world = createDungeonWorld(dungeon, 12);
    initBossEnemies(world);
    const events = createEventQueue(64);

    world.hero.hasKey = true;
    const bossRuntime = world.roomRuntimes.get(dungeon.bossRoomId)!;
    const bossDoor = bossRuntime.doors[0];
    for (const rt of world.roomRuntimes.values()) {
      for (const d of rt.doors) {
        if (d.connectionIndex === bossDoor.connectionIndex) d.open = true;
      }
    }
    world.currentRoomId = dungeon.bossRoomId;
    world.hero.position = { x: bossRuntime.bounds.minX + 1, y: bossRuntime.bounds.minY + 1 };

    const boss = world.enemies.find((e) => isBoss(e))!;
    boss.hp = 0;

    stepWorld(world, events);

    const types = collectTypes(events);
    expect(types).toContain('boss-defeated');
    expect(types).toContain('victory');
    expect(world.phase).toBe('victory');
    const doorAfter = world.roomRuntimes.get(dungeon.bossRoomId)!.doors[0];
    expect(doorAfter.open).toBe(true);
  });
});
