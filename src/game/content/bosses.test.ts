/**
 * Tests del Guardián de Canto (GDD §15.2, Fase B1 de docs/plans/BOSSES_PLAN.md):
 * ciclo completo patrulla→telegraph→carga→choque→aturdimiento→recuperación,
 * daño+empujón al golpear al héroe, doble carga encadenada solo en fase 2/3,
 * campo de esquirlas solo en fase 3, y la regla de daño por ventana de
 * vulnerabilidad heredada del framework (sim/boss.ts). También valida
 * `src/levels/boss-guardian.json` contra el parser de room-format.ts.
 */

import { describe, expect, it } from 'vitest';
import bossGuardianJson from '../../levels/boss-guardian.json';
import {
  BARREL_DAMAGE,
  GUARDIAN_BARREL_FALL_DURATION,
  GUARDIAN_BARREL_MAX_ACTIVE,
  GUARDIAN_BARREL_SPAWN_INTERVAL,
  GUARDIAN_BARREL_STUN_DURATION,
  GUARDIAN_CHARGE_DAMAGE_PHASE1,
  GUARDIAN_CHARGE_DAMAGE_PHASE3,
  GUARDIAN_MAX_HP,
  GUARDIAN_RADIUS,
  GUARDIAN_STUN_DURATION,
  HERO_RADIUS,
} from './constants';
import { getBossDef } from './bosses';
import { initBossEnemies, stepBosses } from '../sim/boss';
import { applyDamageToEnemy } from '../sim/combat';
import { createEventQueue, drainEvents, type GameEvent } from '../sim/events';
import { stepBarrels } from '../sim/hazards';
import { stepHeroPhysics } from '../sim/physics';
import { parseRoomData } from '../sim/room-format';
import type { EnemySpawn, HazardSpawn, RoomData, RoomTag } from '../sim/world';
import { barrelInAir, createWorld } from '../sim/world';

const FIXED_DT = 1 / 60;

function makeRoom(partial: Partial<RoomData> = {}): RoomData {
  return {
    version: 1,
    id: 'guardian-room',
    name: 'Sala del Guardián',
    width: 15,
    height: 15,
    playerStart: { x: 0, y: 6 },
    tags: ['jefe'] as RoomTag[],
    doorSlots: [],
    enemies: [],
    hazards: [],
    items: [],
    ...partial,
  };
}

/** Roca 2x2 pegada al borde este de una sala 15x15 (halfW=7.5): centrada en x=6.5, así que su cara oeste está en x=5.5. */
function eastRock(): HazardSpawn {
  return { id: 'rock-east', kind: 'rock', position: { x: 6.5, y: 0 }, width: 2, height: 2 };
}

function makeGuardianWorld(opts: { bossSpawn?: Partial<EnemySpawn>; hazards?: HazardSpawn[] } = {}) {
  const spawn: EnemySpawn = {
    id: 'boss-1',
    kind: 'boss',
    bossId: 'guardian',
    position: { x: 0, y: 0 },
    patrolTarget: { x: -6, y: -6 },
    ...opts.bossSpawn,
  };
  const world = createWorld(makeRoom({ enemies: [spawn], hazards: opts.hazards ?? [] }));
  initBossEnemies(world);
  return world;
}

function collectTypes(events: ReturnType<typeof createEventQueue>): GameEvent['type'][] {
  const types: GameEvent['type'][] = [];
  drainEvents(events, (e) => types.push(e.type));
  return types;
}

/** Avanza N ticks llamando a stepBosses (igual patrón que boss.test.ts). */
function advance(world: ReturnType<typeof createWorld>, events: ReturnType<typeof createEventQueue>, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    stepBosses(world, FIXED_DT, events);
    world.time += FIXED_DT;
  }
}

/**
 * Avanza tick a tick hasta que `predicate` sea true (o `maxTicks` como tope
 * de seguridad). Necesario para el aturdimiento (~1.4s ≈ 84 ticks): un
 * `advance` de duración fija que se pase de esa ventana la cerraría de
 * nuevo antes de que el test llegue a comprobarla.
 */
function advanceUntil(
  world: ReturnType<typeof createWorld>,
  events: ReturnType<typeof createEventQueue>,
  predicate: () => boolean,
  maxTicks = 400,
): void {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate()) return;
    stepBosses(world, FIXED_DT, events);
    world.time += FIXED_DT;
  }
}

describe('Guardián de Canto: definición', () => {
  it('tiene 40 HP y techo de daño 60/65/70% por fase (GDD §15.6)', () => {
    const def = getBossDef('guardian');
    expect(def.maxHp).toBe(GUARDIAN_MAX_HP);
    expect(def.maxHp).toBe(40);
    expect(def.hitDamageCapFraction).toEqual([0.6, 0.65, 0.7]);
    expect(def.damageOutsideWindow).toBe(0);
  });
});

describe('Guardián: ciclo patrulla → telegraph → carga → choque → aturdimiento → recuperación', () => {
  it('patrulla (sin telegrafiar) mientras el héroe está lejos, y patrulla es sin daño acumulado', () => {
    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    advance(world, events, 30);
    const boss = world.enemies[0];
    expect(boss.bossTelegraphUntil).toBe(0);
    expect(boss.bossVulnerable).toBe(false);
  });

  it('telegrafía al detectar al héroe a rango medio, con ≥0.6s de aviso (GDD §15.1 punto 2)', () => {
    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 0;
    world.hero.position.y = 3; // dentro de GUARDIAN_DETECT_RANGE (4.5)

    advance(world, events, 1);
    const boss = world.enemies[0];
    expect(boss.bossTelegraphUntil).toBeGreaterThan(world.time);
    expect(boss.bossTelegraphUntil - world.time).toBeGreaterThanOrEqual(0.6);
    expect(collectTypes(events)).toContain('boss-telegraph');
  });

  it('tras el telegraph, carga en línea recta hacia la última posición vista del héroe', () => {
    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 0;
    world.hero.position.y = 3;
    advance(world, events, 1); // entra en telegraph
    const boss = world.enemies[0];
    const posBeforeCharge = { x: boss.position.x, y: boss.position.y };

    advance(world, events, 60); // ~1s: agota el telegraph (0.8s) y entra en carga
    expect(boss.bossStage).toBe(2); // GUARDIAN_STAGE_CHARGING
    // Se movió en la dirección hacia donde estaba el héroe (facing ~ (0,1)).
    expect(boss.position.y).toBeGreaterThan(posBeforeCharge.y);
    expect(boss.facing.y).toBeGreaterThan(0.9);
  });

  it('choque contra una roca aturde al Guardián (ventana de vulnerabilidad ~1.4s, GDD §15.6)', () => {
    const world = makeGuardianWorld({
      bossSpawn: { position: { x: 0, y: 0 } },
      hazards: [eastRock()],
    });
    const events = createEventQueue(64);
    world.hero.position.x = 100; // lejos: no interfiere con el empuje al héroe
    world.hero.position.y = 100;

    // Fuerza la carga directamente hacia la roca (este) sin depender de detección.
    const boss = world.enemies[0];
    boss.bossStage = 1; // GUARDIAN_STAGE_TELEGRAPH
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;
    world.hero.position.x = 10;
    world.hero.position.y = 0;

    // Avanza SOLO hasta el instante del choque (un avance fijo largo se
    // pasaría de la ventana de aturdimiento de 1.4s y la vería ya cerrada).
    advanceUntil(world, events, () => boss.bossVulnerable);
    expect(boss.bossVulnerable).toBe(true);
    expect(boss.bossStage).toBe(3); // GUARDIAN_STAGE_STUNNED

    // La ventana dura ~1.4s y se cierra sola.
    advance(world, events, 90); // 1.5s
    expect(boss.bossVulnerable).toBe(false);
  });

  it('tras recuperarse del aturdimiento (fase 1) vuelve a patrullar, sin encadenar otra carga', () => {
    const world = makeGuardianWorld({ hazards: [eastRock()] });
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.bossStage = 1;
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;
    world.hero.position.x = 10;
    world.hero.position.y = 0;

    advanceUntil(world, events, () => boss.bossVulnerable); // hasta el choque
    expect(boss.bossVulnerable).toBe(true);

    advance(world, events, 120); // agota la ventana de aturdimiento + pausa de recuperación
    expect(boss.bossStage).toBe(0); // GUARDIAN_STAGE_PATROL, no CHAIN_PAUSE
  });
});

describe('Guardián: carga contra el héroe', () => {
  it('la carga que golpea al héroe hace 1 de daño en fases 1-2 (GDD §15.6, bajado de 2 tras playtest 2026-07-06) y lo empuja', () => {
    // El valor literal es parte del contrato de tuning del GDD §15.6.
    expect(GUARDIAN_CHARGE_DAMAGE_PHASE1).toBe(1);

    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    // Coloca al héroe justo en la trayectoria de la carga (facing se fija al
    // entrar en carga, apuntando hacia la posición del héroe en ese instante).
    world.hero.position.x = 0;
    world.hero.position.y = 2;
    boss.position.x = 0;
    boss.position.y = 0;
    boss.bossStage = 1;
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;

    const hpBefore = world.hero.hp;
    advance(world, events, 120); // agota telegraph y avanza la carga hasta el impacto

    expect(world.hero.hp).toBe(hpBefore - 1);
    expect(collectTypes(events)).toContain('player-damaged');
    // Empujón fuerte: el héroe sale despedido en la dirección de la carga (+y).
    expect(world.hero.velocity.y).toBeGreaterThan(0);
  });

  it('la carga hace 2 de daño en fase 3 (GDD §15.6, bajado de 3 tras playtest 2026-07-06)', () => {
    expect(GUARDIAN_CHARGE_DAMAGE_PHASE3).toBe(2);

    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.hp = Math.floor(boss.maxHp * 0.2); // fuerza fase 3
    boss.bossPhase = 3;
    world.hero.position.x = 0;
    world.hero.position.y = 2;
    boss.position.x = 0;
    boss.position.y = 0;
    boss.bossStage = 1;
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;

    const hpBefore = world.hero.hp;
    advance(world, events, 120);

    expect(world.hero.hp).toBe(hpBefore - 2);
  });

  it('nunca hace un golpe letal a vida llena (techo de daño de jefe, GDD §15.1 punto 6)', () => {
    const world = makeGuardianWorld();
    world.hero.maxHp = 3;
    world.hero.hp = 3;
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    world.hero.position.x = 0;
    world.hero.position.y = 2;
    boss.position.x = 0;
    boss.position.y = 0;
    boss.bossStage = 1;
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;

    advance(world, events, 120);
    expect(world.hero.hp).toBeGreaterThan(0);
  });
});

describe('Guardián: doble carga encadenada (fase 2/3, GDD §15.2)', () => {
  it('en fase 1, tras aturdirse vuelve a patrullar (no telegrafía una segunda carga inmediata)', () => {
    const world = makeGuardianWorld({ hazards: [eastRock()] });
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    expect(boss.bossPhase).toBe(1);
    boss.bossStage = 1;
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;
    world.hero.position.x = 10;
    world.hero.position.y = 0;

    advance(world, events, 300); // choca, se aturde
    advance(world, events, 120); // recupera
    expect(boss.bossStage).toBe(0); // PATROL directo, sin CHAIN_PAUSE (4) de por medio
  });

  it('en fase 2 (66%), tras la primera carga encadena una segunda con pausa corta antes de volver a patrullar', () => {
    const world = makeGuardianWorld({ hazards: [eastRock()] });
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.hp = Math.floor(boss.maxHp * 0.6); // fuerza fase 2
    boss.bossPhase = 2;

    boss.bossStage = 1;
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;
    world.hero.position.x = 10;
    world.hero.position.y = 0;

    advanceUntil(world, events, () => boss.bossVulnerable); // primera carga: choca y se aturde
    expect(boss.bossVulnerable).toBe(true);

    advanceUntil(world, events, () => !boss.bossVulnerable, 200); // agota el aturdimiento (1.4s)
    expect(boss.bossStage).toBe(4); // GUARDIAN_STAGE_CHAIN_PAUSE: encadena una 2ª carga

    // Tras la pausa corta, vuelve a telegrafiar (segunda carga de la secuencia).
    advanceUntil(world, events, () => boss.bossStage === 1, 200);
    expect(boss.bossStage).toBe(1);
    expect(collectTypes(events).filter((t) => t === 'boss-telegraph').length).toBeGreaterThanOrEqual(1);
  });

  it('en fase 3 (33%) también encadena 2 cargas (no más de 2, GDD §15.2 solo especifica fase 2/3 con doble carga)', () => {
    const world = makeGuardianWorld({ hazards: [eastRock()] });
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.hp = Math.floor(boss.maxHp * 0.2);
    boss.bossPhase = 3;

    boss.bossStage = 1;
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;
    world.hero.position.x = 10;
    world.hero.position.y = 0;

    advanceUntil(world, events, () => boss.bossVulnerable); // primera carga: choca y se aturde
    advanceUntil(world, events, () => !boss.bossVulnerable, 200); // aturdimiento agotado
    expect(boss.bossStage).toBe(4); // encadena

    advanceUntil(world, events, () => boss.bossVulnerable, 400); // segunda carga: choca de nuevo
    advanceUntil(world, events, () => !boss.bossVulnerable, 200); // segundo aturdimiento agotado
    expect(boss.bossStage).toBe(0); // ya no encadena una tercera: vuelve a patrullar
  });
});

describe('Guardián: campo de esquirlas (fase 3, GDD §15.2)', () => {
  it('NO deja esquirlas en fase 1 al chocar contra una roca', () => {
    const world = makeGuardianWorld({ hazards: [eastRock()] });
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.bossStage = 1;
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;
    world.hero.position.x = 10;
    world.hero.position.y = 0;

    advanceUntil(world, events, () => boss.bossVulnerable);
    expect(boss.bossVulnerable).toBe(true); // confirma que sí chocó
    expect(world.puddles.some((p) => p.active)).toBe(false);
    expect(collectTypes(events)).not.toContain('boss-shard-burst');
  });

  it('SÍ deja un campo de esquirlas (puddle con daño) al chocar en fase 3', () => {
    const world = makeGuardianWorld({ hazards: [eastRock()] });
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.hp = Math.floor(boss.maxHp * 0.2);
    boss.bossPhase = 3;
    boss.bossStage = 1;
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;
    world.hero.position.x = 10;
    world.hero.position.y = 0;

    advance(world, events, 300);
    expect(boss.bossVulnerable).toBe(true);
    expect(world.puddles.some((p) => p.active)).toBe(true);
    expect(collectTypes(events)).toContain('boss-shard-burst');
  });
});

describe('Guardián: daño solo (o principalmente) en ventana de vulnerabilidad', () => {
  it('no pierde HP mientras patrulla/telegrafía/carga (fuera de ventana)', () => {
    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    world.hero.position.x = 0;
    world.hero.position.y = 3;
    advance(world, events, 1); // entra en telegraph
    expect(boss.bossVulnerable).toBe(false);

    const hpBefore = boss.hp;
    applyDamageToEnemy(world, boss, 10, 1, 0, events);
    expect(boss.hp).toBe(hpBefore);
  });

  it('sí pierde HP mientras está aturdido (bossVulnerable=true)', () => {
    const world = makeGuardianWorld({ hazards: [eastRock()] });
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.bossStage = 1;
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;
    world.hero.position.x = 10;
    world.hero.position.y = 0;

    advanceUntil(world, events, () => boss.bossVulnerable);
    expect(boss.bossVulnerable).toBe(true);

    const hpBefore = boss.hp;
    applyDamageToEnemy(world, boss, 10, 1, 0, events);
    expect(boss.hp).toBe(hpBefore - 10);
  });
});

describe('src/levels/boss-guardian.json', () => {
  it('valida contra room-format.ts (GDD §13) y referencia el jefe "guardian"', () => {
    const result = parseRoomData(bossGuardianJson);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.room?.boss).toBe('guardian');
    expect(result.room?.tags).toContain('jefe');
  });

  it('es ~15x15, sin fosos ni otros hazards salvo 4 rocas grandes (GDD §15.2)', () => {
    const result = parseRoomData(bossGuardianJson);
    const room = result.room!;
    expect(room.width).toBe(15);
    expect(room.height).toBe(15);
    expect(room.hazards.every((h) => h.kind === 'rock')).toBe(true);
    expect(room.hazards.length).toBe(4);
  });

  it('tiene puertas en los 4 lados, como boss-test.json', () => {
    const result = parseRoomData(bossGuardianJson);
    const sides = result.room!.doorSlots.map((d) => d.side).sort();
    expect(sides).toEqual(['east', 'north', 'south', 'west']);
  });
});

describe('Guardián: radio real de jefe (regresión B1)', () => {
  it('initBossEnemies aplica GUARDIAN_RADIUS (colisión y render escalan con él)', () => {
    const world = makeGuardianWorld();
    expect(world.enemies[0].radius).toBeCloseTo(GUARDIAN_RADIUS, 6);
  });
});

// ── B1.5: barriles rodantes (GDD §15.2, playtest 2026-07-06) ────────────────

/** Barriles vivos (sin explotar) del mundo de test (sala única: roomId undefined en todos). */
function liveBarrels(world: ReturnType<typeof createWorld>) {
  return world.barrels.filter((b) => !b.exploded);
}

describe('Guardián: aparición periódica de barriles rodantes (GDD §15.2)', () => {
  it('aparece un barril por slot de GUARDIAN_BARREL_SPAWN_INTERVAL, con evento boss-barrel-spawn y en el perímetro', () => {
    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100; // lejos: solo patrulla, sin cargas que detonen barriles
    world.hero.position.y = 100;

    advance(world, events, 1); // primer tick: cruza el slot 0 → primer barril
    expect(liveBarrels(world).length).toBe(1);
    expect(collectTypes(events)).toContain('boss-barrel-spawn');

    // El barril aparece en el perímetro (a ≤1u de alguna pared), no en medio de la arena.
    const barrel = liveBarrels(world)[0];
    const halfW = world.bounds.maxX;
    const distToWall = Math.min(
      halfW - Math.abs(barrel.position.x),
      halfW - Math.abs(barrel.position.y),
    );
    expect(distToWall).toBeLessThanOrEqual(1);

    // Antes del siguiente slot (~8s) no aparece otro.
    const intervalTicks = Math.round(GUARDIAN_BARREL_SPAWN_INTERVAL / FIXED_DT);
    advance(world, events, intervalTicks - 60); // hasta ~1s antes del slot
    expect(liveBarrels(world).length).toBe(1);

    // Cruzado el slot: segundo barril.
    advance(world, events, 120); // ~1s después del slot
    expect(liveBarrels(world).length).toBe(2);
  });

  it('respeta el cap GUARDIAN_BARREL_MAX_ACTIVE de barriles vivos simultáneos', () => {
    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;

    // ~50s = 6 slots de 8s: sin cap habría 6+ barriles.
    advance(world, events, 3000);
    expect(liveBarrels(world).length).toBe(GUARDIAN_BARREL_MAX_ACTIVE);
    // Y el array no crece sin límite (los slots se reutilizan, patrón dropCoinAt).
    expect(world.barrels.length).toBe(GUARDIAN_BARREL_MAX_ACTIVE);
  });
});

describe('Guardián: barril recién caído del cielo no es sólido hasta aterrizar (GDD §15.2, playtest 2026-07-06)', () => {
  it('guardianSpawnBarrel fija landingAt en el futuro y barrelInAir es true hasta que world.time lo alcanza', () => {
    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;

    advance(world, events, 1); // primer slot: aparece el primer barril
    const barrel = liveBarrels(world)[0];
    expect(barrel.landingAt).toBeCloseTo(world.time - FIXED_DT + GUARDIAN_BARREL_FALL_DURATION, 3);
    expect(barrelInAir(barrel, world.time)).toBe(true);

    advance(world, events, Math.round(GUARDIAN_BARREL_FALL_DURATION / FIXED_DT) + 5);
    expect(barrelInAir(barrel, world.time)).toBe(false);
  });

  it('NO explota por contacto del héroe mientras cae (stepBarrels lo ignora), y SÍ explota tras aterrizar', () => {
    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;

    advance(world, events, 1); // aparece el barril, aún cayendo
    const barrel = liveBarrels(world)[0];
    expect(barrelInAir(barrel, world.time)).toBe(true);

    // Héroe plantado justo encima del barril mientras cae: no debe detonar.
    world.hero.position.x = barrel.position.x;
    world.hero.position.y = barrel.position.y;
    stepBarrels(world, events);
    expect(barrel.exploded).toBe(false);

    // Avanza hasta después de landingAt (mismo héroe encima) y repite el contacto.
    advance(world, events, Math.round(GUARDIAN_BARREL_FALL_DURATION / FIXED_DT) + 5);
    expect(barrelInAir(barrel, world.time)).toBe(false);
    stepBarrels(world, events);
    expect(barrel.exploded).toBe(true);
  });

  it('la carga del Guardián ATRAVIESA un barril que aún cae (no lo arrolla) y SÍ lo arrolla una vez aterrizado', () => {
    // Barril recién colocado a mano en la trayectoria de carga, con landingAt
    // futuro (simula el instante justo tras `guardianSpawnBarrel`).
    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    // Barril muy cerca del Guardián (x=0.5): con GUARDIAN_CHARGE_SPEED=7.5u/s
    // la carga lo alcanza a los ~0.07s de empezar a cargar, muy por debajo de
    // GUARDIAN_BARREL_FALL_DURATION (1.1s) — sigue en el aire cuando la carga
    // pasa por su posición.
    world.barrels.push({
      id: 'falling-barrel',
      position: { x: 0.5, y: 0 },
      radius: 0.4,
      exploded: false,
      landingAt: world.time + GUARDIAN_BARREL_FALL_DURATION,
    });

    boss.bossStage = 1; // GUARDIAN_STAGE_TELEGRAPH
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;
    world.hero.position.x = 10; // fija la dirección de carga (este)
    world.hero.position.y = 0;

    // Avanza justo lo suficiente para agotar el telegraph (0.8s) y que la
    // carga recorra los 0.5u hasta el barril, sin llegar a landingAt (1.1s
    // tras el spawn en t=0): barril aún en el aire, atravesado sin arrollar.
    advance(world, events, 55); // ~0.92s
    const barrel = world.barrels.find((b) => b.id === 'falling-barrel')!;
    expect(barrelInAir(barrel, world.time)).toBe(true);
    expect(barrel.exploded).toBe(false);
    expect(boss.bossStage).not.toBe(3); // no se detuvo/aturdió por el barril en el aire

    // El Guardián sigue cargando hasta topar con la pared este (bounds
    // ±7.5): ahí se aturde normal (no por barril).
    advanceUntil(world, events, () => boss.bossVulnerable, 400);
    expect(collectTypes(events)).not.toContain('boss-barrel-charge-stun');
  });
});

describe('Guardián: carga que arrolla un barril (GDD §15.2)', () => {
  /** Mundo con el Guardián telegrafiando una carga hacia el este y un barril vivo plantado en su trayectoria. */
  function setupChargeIntoBarrel() {
    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    world.barrels.push({ id: 'barrel-in-path', position: { x: 3, y: 0 }, radius: 0.4, exploded: false });

    boss.bossStage = 1; // GUARDIAN_STAGE_TELEGRAPH
    boss.bossTelegraphUntil = world.time + 0.8;
    boss.bossTimer = 0.8;
    world.hero.position.x = 10; // fija la dirección de carga (este), lejos del blast
    world.hero.position.y = 0;
    return { world, events, boss };
  }

  it('explota el barril y el Guardián recibe BARREL_DAMAGE SIN gating de ventana (su castigo)', () => {
    const { world, events, boss } = setupChargeIntoBarrel();

    advanceUntil(world, events, () => boss.bossVulnerable);

    const barrel = world.barrels.find((b) => b.id === 'barrel-in-path')!;
    expect(barrel.exploded).toBe(true);
    // No estaba en ventana al arrollarlo (venía cargando): sin el bypass el
    // daño sería 0 (damageOutsideWindow=0). Debe ser exactamente BARREL_DAMAGE.
    expect(boss.hp).toBe(GUARDIAN_MAX_HP - BARREL_DAMAGE);
    const types = collectTypes(events);
    expect(types).toContain('barrel-explosion');
    expect(types).toContain('boss-barrel-charge-stun');
  });

  it('queda aturdido GUARDIAN_BARREL_STUN_DURATION (~2.2s), más que el aturdimiento normal de 1.4s', () => {
    expect(GUARDIAN_BARREL_STUN_DURATION).toBeGreaterThan(GUARDIAN_STUN_DURATION);

    const { world, events, boss } = setupChargeIntoBarrel();
    advanceUntil(world, events, () => boss.bossVulnerable);
    expect(boss.bossStage).toBe(3); // GUARDIAN_STAGE_STUNNED
    expect(boss.bossTimer).toBeCloseTo(GUARDIAN_BARREL_STUN_DURATION, 6);

    // Pasado el aturdimiento NORMAL (1.4s) sigue vulnerable: es el largo.
    advance(world, events, 90); // 1.5s
    expect(boss.bossVulnerable).toBe(true);

    // Y pasado el largo (2.2s en total), se cierra.
    advance(world, events, 60); // total 2.5s
    expect(boss.bossVulnerable).toBe(false);
  });
});

describe('Guardián: poción de recompensa al cambiar de fase (GDD §15.2)', () => {
  it('suelta 1 poción al cruzar a fase 2 y otra al cruzar a fase 3 (2 en total, sin repetir)', () => {
    const world = makeGuardianWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    world.hero.position.x = 100; // lejos: no recoge nada ni provoca cargas
    world.hero.position.y = 100;

    const activePotions = () => world.items.filter((i) => i.active && i.kind === 'potion');
    expect(activePotions().length).toBe(0);

    // Cruza a fase 2 (≤66%).
    boss.hp = Math.floor(boss.maxHp * 0.6);
    advance(world, events, 1);
    expect(boss.bossPhase).toBe(2);
    expect(activePotions().length).toBe(1);
    // La suelta en su posición (el punto del cambio).
    const potion1 = activePotions()[0];
    expect(Math.hypot(potion1.position.x - boss.position.x, potion1.position.y - boss.position.y)).toBeLessThan(0.1);
    expect(collectTypes(events)).toContain('boss-phase-changed');

    // Cruza a fase 3 (≤33%).
    boss.hp = Math.floor(boss.maxHp * 0.2);
    advance(world, events, 1);
    expect(boss.bossPhase).toBe(3);
    expect(activePotions().length).toBe(2);

    // Sin más cruces no hay más pociones (el cambio de fase es de una sola vez).
    advance(world, events, 120);
    expect(activePotions().length).toBe(2);
  });
});

describe('boss-guardian.json: regla anti-trampa de arena (GDD §15.2)', () => {
  /**
   * Radio máximo de un círculo capaz de atravesar el hueco diagonal entre la
   * esquina exterior de una roca y la esquina de la sala (centro pegado a las
   * dos paredes: c = esquina − r; toca la esquina de la roca cuando
   * (g − r)·√2 = r, con g = holgura por eje). El criterio anti-trampa NO es
   * "nadie pasa": es que no quede a medias (héroe sí, Guardián no). Con las
   * rocas pegadas a las esquinas (2.8x2.8 en ±5.5, versión anterior) el hueco
   * era tan estrecho que NINGUNO de los dos cabía (gap=1.2 → radio máx
   * ≈0.284, menor que ambos radios: sin trampa, pero arena "sosa" según
   * playtest 2026-07-06). Con las rocas movidas al centro (1.8x1.8 en ±3.2)
   * el hueco roca-muro se abre mucho (gap=3.4 → radio máx ≈1.992): ahora caben
   * los DOS con holgura de sobra — sigue sin ser trampa, por el motivo
   * contrario.
   */
  function maxRadiusThroughCornerPocket(gap: number): number {
    return (gap * Math.SQRT2) / (1 + Math.SQRT2);
  }

  it('el hueco roca-esquina (roca-muro) es transitable para héroe Y Guardián por igual: sin trampa', () => {
    const room = parseRoomData(bossGuardianJson).room!;
    const halfW = room.width / 2;
    const halfH = room.height / 2;

    for (const rock of room.hazards) {
      const gapX = halfW - (Math.abs(rock.position.x) + rock.width / 2);
      const gapY = halfH - (Math.abs(rock.position.y) + rock.height / 2);
      // Las rocas de esquina son simétricas: misma holgura en ambos ejes.
      expect(gapX).toBeCloseTo(gapY, 6);
      // Rocas movidas hacia el centro tras playtest 2026-07-06 (1.8x1.8 en
      // ±3.2, antes 2.8x2.8 en ±5.5): la holgura roca-muro pasa de 1.2 a 3.4.
      expect(gapX).toBeCloseTo(3.4, 6);
      // Radio máximo que cabe por ese hueco (≈1.992) ahora es MAYOR que el
      // radio del Guardián (el más grande de los dos): caben ambos.
      expect(maxRadiusThroughCornerPocket(gapX)).toBeGreaterThan(GUARDIAN_RADIUS);
    }
    // El Guardián es más grande que el héroe: si él cabe, el héroe también.
    expect(GUARDIAN_RADIUS).toBeGreaterThan(HERO_RADIUS);
  });

  /**
   * Radio máximo de un círculo capaz de atravesar en línea recta el hueco
   * rectangular entre dos rocas vecinas (mismo eje, enfrentadas): el círculo
   * más grande que cabe justo entre ambas caras tiene radio = hueco/2 (se
   * queda centrado, tangente a las dos). A diferencia del hueco roca-esquina
   * (donde la trampa sería que NADIE pase), aquí la trampa real sería que el
   * hueco quede a medias: el héroe cabe pero el Guardián no, dejándole
   * "refugios" tras las rocas donde el jefe nunca puede seguirlo ni cargar
   * limpiamente. Por eso el criterio no es "menor que HERO_RADIUS" sino
   * "mayor que GUARDIAN_RADIUS": caben los dos con holgura.
   */
  function maxRadiusThroughStraightGap(gap: number): number {
    return gap / 2;
  }

  it('ningún hueco roca-roca (rocas vecinas del mismo lado) deja al héroe pasar sin que quepa también el Guardián', () => {
    const room = parseRoomData(bossGuardianJson).room!;
    const byId = new Map(room.hazards.map((h) => [h.id, h]));

    // Por simetría (4 rocas en ±3.2, mismo tamaño) solo hace falta comprobar
    // un par horizontal (NW-NE) y un par vertical (NW-SW); los otros 2 pares
    // (SE-SW horizontal, NE-SE vertical) son geométricamente idénticos.
    const pairs: [string, string, 'x' | 'y'][] = [
      ['rock-nw', 'rock-ne', 'x'],
      ['rock-nw', 'rock-sw', 'y'],
    ];

    for (const [idA, idB, axis] of pairs) {
      const a = byId.get(idA)!;
      const b = byId.get(idB)!;
      const centerGap = Math.abs(a.position[axis] - b.position[axis]);
      const halfWidthA = axis === 'x' ? a.width / 2 : a.height / 2;
      const halfWidthB = axis === 'x' ? b.width / 2 : b.height / 2;
      const gap = centerGap - halfWidthA - halfWidthB;
      expect(gap).toBeCloseTo(4.6, 6);
      expect(maxRadiusThroughStraightGap(gap)).toBeGreaterThan(GUARDIAN_RADIUS);
    }
  });

  it('el Guardián patrulla el perímetro sin atascarse contra las rocas nuevas (esquinas de patrulla lejos de ±3.2)', () => {
    // guardianPatrolCorners (content/bosses.ts) usa margen GUARDIAN_RADIUS+0.5
    // respecto al bounds de la sala: con halfW=halfH=7.5 las esquinas de
    // patrulla caen en ±(7.5 − (0.62+0.5)) = ±6.38, muy lejos de las rocas
    // (que ahora ocupan hasta ±(3.2+0.9)=±4.1) — no debería haber solape.
    const world = makeGuardianWorld({
      bossSpawn: { position: { x: 6.38, y: 6.38 }, patrolTarget: { x: 6.38, y: 6.38 } },
      hazards: (parseRoomData(bossGuardianJson).room!.hazards as HazardSpawn[]),
    });
    const events = createEventQueue(64);
    world.hero.position.x = 100; // lejos: solo patrulla, sin detección/carga
    world.hero.position.y = 100;

    const boss = world.enemies[0];
    // 20s de patrulla pura: si quedara atascado contra una roca, su posición
    // se congelaría (guardianHitsSolid no se comprueba en patrulla, pero un
    // atasco real se vería como oscilación nula o posición fija imposible).
    let minDistToAnyRockCenter = Infinity;
    for (let i = 0; i < 1200; i++) {
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;
      for (const rock of world.obstacles) {
        const dx = boss.position.x - (rock.aabb.minX + rock.aabb.maxX) / 2;
        const dy = boss.position.y - (rock.aabb.minY + rock.aabb.maxY) / 2;
        minDistToAnyRockCenter = Math.min(minDistToAnyRockCenter, Math.hypot(dx, dy));
      }
    }
    // Nunca vulnerable (nunca choca: patrulla en un rectángulo que no
    // solapa ninguna roca) y siempre dentro de bounds.
    expect(boss.bossVulnerable).toBe(false);
    expect(Math.abs(boss.position.x)).toBeLessThanOrEqual(world.bounds.maxX);
    expect(Math.abs(boss.position.y)).toBeLessThanOrEqual(world.bounds.maxY);
    expect(minDistToAnyRockCenter).toBeGreaterThan(0);
  });

  it('el Guardián puede completar una carga contra el héroe sin travarse en las rocas nuevas (bossStage cicla con normalidad)', () => {
    const room = parseRoomData(bossGuardianJson).room!;
    const world = createWorld(room);
    initBossEnemies(world);
    const events = createEventQueue(64);
    const boss = world.enemies[0];

    // Coloca al héroe a rango de detección, lejos de cualquier roca (centro
    // de un lado libre), para forzar una carga limpia patrulla→telegraph→
    // carga→(choque con pared, ninguna roca en la trayectoria)→aturdido→
    // recuperación, confirmando que el ciclo no se cuelga con la arena nueva.
    world.hero.position.x = 0;
    world.hero.position.y = 0;
    boss.position.x = 0;
    boss.position.y = 3;
    boss.patrolTo.x = 0;
    boss.patrolTo.y = 3;

    advanceUntil(world, events, () => boss.bossStage === 1 /* GUARDIAN_STAGE_TELEGRAPH */, 400);
    expect(boss.bossStage).toBe(1);
    advanceUntil(world, events, () => boss.bossStage === 3 /* GUARDIAN_STAGE_STUNNED */, 400);
    expect(boss.bossStage).toBe(3);
    advanceUntil(world, events, () => boss.bossStage === 0 /* de vuelta a PATROL */, 400);
    expect(boss.bossStage).toBe(0);
  });

  it('en modo sala única los huecos de puerta están sellados: héroe empujado contra cada puerta no sale de bounds', () => {
    const room = parseRoomData(bossGuardianJson).room!;
    const world = createWorld(room);
    initBossEnemies(world);
    const events = createEventQueue(64);

    const outward: Record<string, { x: number; y: number }> = {
      north: { x: 0, y: -1 },
      south: { x: 0, y: 1 },
      west: { x: -1, y: 0 },
      east: { x: 1, y: 0 },
    };

    for (const slot of room.doorSlots) {
      const dir = outward[slot.side];
      // Héroe plantado en el centro del hueco de puerta, empujado hacia fuera
      // durante 4s a tope de velocidad (la fricción no importa: se re-imprime
      // la velocidad cada tick, peor caso que cualquier knockback real).
      world.hero.position.x = dir.x * (world.bounds.maxX - 1) + (dir.x === 0 ? slot.offset : 0);
      world.hero.position.y = dir.y * (world.bounds.maxY - 1) + (dir.y === 0 ? slot.offset : 0);
      for (let i = 0; i < 240; i++) {
        world.hero.velocity.x = dir.x * 50; // clampado a MAX_SPEED dentro de stepHeroPhysics
        world.hero.velocity.y = dir.y * 50;
        stepHeroPhysics(world, events);
      }
      expect(Math.abs(world.hero.position.x)).toBeLessThanOrEqual(world.bounds.maxX - HERO_RADIUS + 1e-9);
      expect(Math.abs(world.hero.position.y)).toBeLessThanOrEqual(world.bounds.maxY - HERO_RADIUS + 1e-9);
    }
  });
});
