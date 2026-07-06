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
import { GUARDIAN_CHARGE_DAMAGE_PHASE1, GUARDIAN_MAX_HP, GUARDIAN_RADIUS } from './constants';
import { getBossDef } from './bosses';
import { initBossEnemies, stepBosses } from '../sim/boss';
import { applyDamageToEnemy } from '../sim/combat';
import { createEventQueue, drainEvents, type GameEvent } from '../sim/events';
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
  it('la carga que golpea al héroe hace GUARDIAN_CHARGE_DAMAGE_PHASE1 (2) de daño y lo empuja', () => {
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

    expect(world.hero.hp).toBe(hpBefore - GUARDIAN_CHARGE_DAMAGE_PHASE1);
    expect(collectTypes(events)).toContain('player-damaged');
    // Empujón fuerte: el héroe sale despedido en la dirección de la carga (+y).
    expect(world.hero.velocity.y).toBeGreaterThan(0);
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
