/**
 * Integración de arranque (fase 3): la sesión por defecto del juego es un
 * mundo de mazmorra multi-sala generado desde el pool de serie, con semilla
 * forzable (?seed=N) que sobrevive a los reinicios.
 */

import { describe, expect, it } from 'vitest';
import { seriesRooms, testRoom } from '@/game/features/dungeon/rooms';
import { advanceToNextDungeon, createDungeonGameSession, createGameSession, restartSession } from './session';

describe('createDungeonGameSession (arranque de run completa)', () => {
  it('crea un mundo multi-sala con el pool de serie: dungeon activo, héroe en la sala de inicio', () => {
    const session = createDungeonGameSession(seriesRooms, 42);
    const world = session.world;

    expect(world.dungeon).not.toBeNull();
    expect(world.dungeon!.rooms.length).toBe(6);
    expect(world.currentRoomId).toBe(world.dungeon!.startRoomId);

    const startRuntime = world.roomRuntimes.get(world.dungeon!.startRoomId)!;
    expect(startRuntime.visited).toBe(true);
    const { position } = world.hero;
    expect(position.x).toBeGreaterThanOrEqual(startRuntime.bounds.minX);
    expect(position.x).toBeLessThanOrEqual(startRuntime.bounds.maxX);
    expect(position.y).toBeGreaterThanOrEqual(startRuntime.bounds.minY);
    expect(position.y).toBeLessThanOrEqual(startRuntime.bounds.maxY);
  });

  it('es determinista con semilla forzada: mismas salas y misma colocación', () => {
    const a = createDungeonGameSession(seriesRooms, 1234);
    const b = createDungeonGameSession(seriesRooms, 1234);
    expect(a.world.dungeon!.rooms.map((r) => r.room.id)).toEqual(
      b.world.dungeon!.rooms.map((r) => r.room.id),
    );
    expect(a.world.dungeon!.rooms.map((r) => r.origin)).toEqual(
      b.world.dungeon!.rooms.map((r) => r.origin),
    );
  });

  it('los enemigos de salas no visitadas existen pero sus salas están sin visitar', () => {
    const session = createDungeonGameSession(seriesRooms, 42);
    const world = session.world;
    const unvisited = [...world.roomRuntimes.values()].filter((r) => !r.visited);
    expect(unvisited.length).toBeGreaterThan(0);
    // Y hay enemigos asignados a salas (etiquetados con roomId).
    expect(world.enemies.every((e) => e.roomId !== undefined)).toBe(true);
  });

  it('restartSession con semilla forzada regenera el MISMO mapa; sin forzar, una run nueva', () => {
    const forced = createDungeonGameSession(seriesRooms, 777);
    const idsBefore = forced.world.dungeon!.rooms.map((r) => r.room.id);
    restartSession(forced);
    expect(forced.seed).toBe(777);
    expect(forced.world.dungeon!.rooms.map((r) => r.room.id)).toEqual(idsBefore);

    const free = createDungeonGameSession(seriesRooms, null);
    const seedBefore = free.seed;
    restartSession(free);
    // Sin forzar: la semilla se resortea (probabilidad de colisión despreciable,
    // pero lo que garantizamos es que el mundo se regenera y sigue siendo válido).
    expect(free.world.dungeon).not.toBeNull();
    expect(typeof free.seed).toBe('number');
    expect(free.world.currentRoomId).toBe(free.world.dungeon!.startRoomId);
    // seedBefore solo se usa para asegurar que ambos son enteros válidos.
    expect(Number.isInteger(seedBefore)).toBe(true);
  });

  it('el modo sala única (playtest del editor) sigue creando un mundo sin dungeon', () => {
    const session = createGameSession(testRoom);
    expect(session.world.dungeon).toBeNull();
    expect(session.dungeonPool).toBeNull();
    // Modo sala única: sin secuencia de jefes, mundo tratado como final.
    expect(session.bossSequence).toEqual([]);
    expect(session.stageIndex).toBe(0);
    expect(session.world.isFinalDungeon).toBe(true);
  });
});

describe('bossSequence (run multi-mazmorra, GDD §10)', () => {
  it('contiene exactamente los jefes de diseño del pool de serie, uno cada uno (sin test-boss)', () => {
    const session = createDungeonGameSession(seriesRooms, 42);
    expect([...session.bossSequence].sort()).toEqual(['guardian', 'queen']);
    expect(session.bossSequence).not.toContain('test-boss');
  });

  it('es determinista con la misma semilla forzada', () => {
    const a = createDungeonGameSession(seriesRooms, 999);
    const b = createDungeonGameSession(seriesRooms, 999);
    expect(a.bossSequence).toEqual(b.bossSequence);
  });

  it('el orden puede variar entre semillas distintas', () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      orders.add(createDungeonGameSession(seriesRooms, seed).bossSequence.join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('la mazmorra del primer stage tiene la sala del primer jefe de la secuencia', () => {
    const session = createDungeonGameSession(seriesRooms, 7);
    const bossRoom = session.world.dungeon!.rooms.find((r) => r.room.id === session.world.dungeon!.bossRoomId)!;
    expect(bossRoom.room.boss).toBe(session.bossSequence[0]);
  });

  it('isFinalDungeon es true en el stage 0 solo si hay un único jefe en la secuencia', () => {
    const session = createDungeonGameSession(seriesRooms, 7);
    expect(session.bossSequence.length).toBe(2);
    expect(session.world.isFinalDungeon).toBe(false);
  });
});

describe('advanceToNextDungeon (run multi-mazmorra, GDD §10)', () => {
  it('conserva hp/maxHp/modifiers/coins/upgradeLevels y stats acumulados; hasKey false; avanza al jefe del siguiente stage', () => {
    const session = createDungeonGameSession(seriesRooms, 42);
    expect(session.bossSequence.length).toBe(2);
    const secondBoss = session.bossSequence[1];

    // Progreso simulado en la primera mazmorra.
    session.world.hero.hp = 2;
    session.world.hero.maxHp = 5;
    session.world.hero.modifiers.ramDamageBonus = 3;
    session.world.hero.hasKey = true;
    session.world.hero.coins = 37;
    session.world.hero.upgradeLevels['cuerpo-dano'] = 2;
    session.world.stats.roomsCleared = 4;
    session.world.stats.coinsCollected = 7;
    session.world.stats.damageDealt = 55.5;
    session.world.stats.score = 120;

    advanceToNextDungeon(session);

    expect(session.stageIndex).toBe(1);
    expect(session.world.hero.hp).toBe(2);
    expect(session.world.hero.maxHp).toBe(5);
    expect(session.world.hero.modifiers.ramDamageBonus).toBe(3);
    expect(session.world.hero.hasKey).toBe(false);
    expect(session.world.hero.coins).toBe(37);
    expect(session.world.hero.upgradeLevels['cuerpo-dano']).toBe(2);
    expect(session.world.stats.roomsCleared).toBe(4);
    expect(session.world.stats.coinsCollected).toBe(7);
    expect(session.world.stats.damageDealt).toBe(55.5);
    expect(session.world.stats.score).toBe(120);

    const nextBossRoom = session.world.dungeon!.rooms.find((r) => r.room.id === session.world.dungeon!.bossRoomId)!;
    expect(nextBossRoom.room.boss).toBe(secondBoss);
    // Con 2 jefes en la secuencia, el stage 1 (índice 1) es el último.
    expect(session.world.isFinalDungeon).toBe(true);
  });

  it('no muta los modifiers ni upgradeLevels del mundo anterior (copia el objeto, no la referencia)', () => {
    const session = createDungeonGameSession(seriesRooms, 42);
    session.world.hero.upgradeLevels['flecha-dano'] = 1;
    const prevModifiers = session.world.hero.modifiers;
    const prevUpgradeLevels = session.world.hero.upgradeLevels;
    advanceToNextDungeon(session);
    expect(session.world.hero.modifiers).not.toBe(prevModifiers);
    expect(session.world.hero.modifiers).toEqual(prevModifiers);
    expect(session.world.hero.upgradeLevels).not.toBe(prevUpgradeLevels);
    expect(session.world.hero.upgradeLevels).toEqual(prevUpgradeLevels);
  });
});

describe('restartSession y muerte: economía (GDD §10, docs/plans/ECONOMY_PLAN.md)', () => {
  it('restartSession NO conserva coins ni upgradeLevels (héroe nuevo de fábrica)', () => {
    const session = createDungeonGameSession(seriesRooms, 42);
    session.world.hero.coins = 50;
    session.world.hero.upgradeLevels['cuerpo-dano'] = 3;

    restartSession(session);

    expect(session.world.hero.coins).toBe(0);
    expect(session.world.hero.upgradeLevels).toEqual({});
  });
});

describe('restartSession (run multi-mazmorra, GDD §10)', () => {
  it('vuelve a stageIndex 0 y re-baraja bossSequence', () => {
    const session = createDungeonGameSession(seriesRooms, 42);
    advanceToNextDungeon(session);
    expect(session.stageIndex).toBe(1);

    restartSession(session);

    expect(session.stageIndex).toBe(0);
    expect(session.bossSequence.length).toBe(2);
    const bossRoom = session.world.dungeon!.rooms.find((r) => r.room.id === session.world.dungeon!.bossRoomId)!;
    expect(bossRoom.room.boss).toBe(session.bossSequence[0]);
  });
});
