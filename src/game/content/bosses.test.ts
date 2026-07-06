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
import { stepHeroPhysics } from '../sim/physics';
import { parseRoomData } from '../sim/room-format';
import type { EnemySpawn, HazardSpawn, RoomData, RoomTag } from '../sim/world';
import { createWorld } from '../sim/world';

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
   * (g − r)·√2 = r, con g = holgura por eje). Debe ser MENOR que el radio del
   * héroe: ni el héroe (0.38) ni el Guardián (0.62) caben — "o caben los dos,
   * o no cabe ninguno".
   */
  function maxRadiusThroughCornerPocket(gap: number): number {
    return (gap * Math.SQRT2) / (1 + Math.SQRT2);
  }

  it('ningún hueco roca-esquina es transitable para el héroe (y por tanto tampoco asimétrico)', () => {
    const room = parseRoomData(bossGuardianJson).room!;
    const halfW = room.width / 2;
    const halfH = room.height / 2;

    for (const rock of room.hazards) {
      const gapX = halfW - (Math.abs(rock.position.x) + rock.width / 2);
      const gapY = halfH - (Math.abs(rock.position.y) + rock.height / 2);
      // Las rocas de esquina son simétricas: misma holgura en ambos ejes.
      expect(gapX).toBeCloseTo(gapY, 6);
      expect(maxRadiusThroughCornerPocket(gapX)).toBeLessThan(HERO_RADIUS);
    }
    // El Guardián es más grande que el héroe: si el héroe no cabe, él tampoco.
    expect(GUARDIAN_RADIUS).toBeGreaterThan(HERO_RADIUS);
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
