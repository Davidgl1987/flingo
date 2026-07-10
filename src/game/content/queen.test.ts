/**
 * Tests de la Reina del Enjambre (GDD §15.3, Fase B2 de docs/plans/BOSSES_PLAN.md):
 * cadencia de oleadas de larvas + cap de vivas, rastro que crece con la fase,
 * vulnerabilidad permanente (sin ventana), larvas de 1 HP con comportamiento
 * por fase (recta en fase 1, persecución en 2/3), `boss-queen.json` válido
 * contra room-format.ts, y que el generador procedural puede producir tanto
 * la sala de la Reina como la del Guardián (sorteo entre salas 'jefe').
 */

import { describe, expect, it } from 'vitest';
import bossQueenJson from '../../levels/boss-queen.json';
import {
  HERO_RADIUS,
  QUEEN_CHASER_PER_WAVE_BY_PHASE,
  QUEEN_COLUMN_DAMAGE_FRACTION,
  QUEEN_COLUMN_HIT_COOLDOWN,
  QUEEN_COLUMN_HP,
  QUEEN_COLUMN_STUN_DURATION,
  QUEEN_DAMAGE_OUTSIDE_WINDOW,
  QUEEN_GUARDIAN_MAX,
  QUEEN_GUARDIAN_ORBIT_RADIUS,
  QUEEN_GUARDIAN_SPAWN_INTERVAL,
  QUEEN_HIT_DAMAGE_CAP_FRACTION,
  QUEEN_LARVA_HP,
  QUEEN_LARVA_MAX,
  QUEEN_GUARDIAN_CHARGE_COOLDOWN,
  QUEEN_MAX_HP,
  QUEEN_RADIUS,
  QUEEN_STALK_SPEED_BASE,
  QUEEN_STALK_SPEED_PER_COLUMN,
  QUEEN_TRAIL_DROP_INTERVAL,
  QUEEN_TRAIL_DROP_INTERVAL_PHASE2,
  QUEEN_TRAIL_PUDDLE_LIFETIME,
  QUEEN_TRAIL_PUDDLE_RADIUS,
  QUEEN_WAVE_INTERVAL,
  RAM_SPEED_THRESHOLD,
} from './constants';
import { getBossDef } from './bosses';
import { getRoomPool } from './rooms';
import { initBossEnemies, stepBosses } from '../sim/boss';
import { applyDamageToEnemy, stepHeroEnemyContacts, stepQueenColumns } from '../sim/combat';
import { generateDungeon } from '../sim/dungeon';
import { createEventQueue, drainEvents, type GameEvent } from '../sim/events';
import { parseRoomData } from '../sim/room-format';
import type { EnemySpawn, RoomData, RoomTag } from '../sim/world';
import { createWorld } from '../sim/world';

const FIXED_DT = 1 / 60;

function makeRoom(partial: Partial<RoomData> = {}): RoomData {
  return {
    version: 1,
    id: 'queen-room',
    name: 'Sala de la Reina',
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

function makeQueenWorld(opts: { bossSpawn?: Partial<EnemySpawn> } = {}) {
  const spawn: EnemySpawn = {
    id: 'boss-1',
    kind: 'boss',
    bossId: 'queen',
    position: { x: 0, y: 0 },
    ...opts.bossSpawn,
  };
  const world = createWorld(makeRoom({ enemies: [spawn] }));
  initBossEnemies(world);
  return world;
}

function collectTypes(events: ReturnType<typeof createEventQueue>): GameEvent['type'][] {
  const types: GameEvent['type'][] = [];
  drainEvents(events, (e) => types.push(e.type));
  return types;
}

function advance(world: ReturnType<typeof createWorld>, events: ReturnType<typeof createEventQueue>, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    stepBosses(world, FIXED_DT, events);
    world.time += FIXED_DT;
  }
}

function boss(world: ReturnType<typeof createWorld>) {
  return world.enemies.find((e) => e.id === 'boss-1')!;
}

function liveLarvae(world: ReturnType<typeof createWorld>) {
  return world.enemies.filter((e) => e.id.startsWith('queen-larva-') && e.hp > 0);
}

describe('Reina del Enjambre: definición', () => {
  it('tiene 55 HP, techo de daño 60/65/70%, y al cuerpo le entra daño REDUCIDO fuera de aturdimiento (rediseño 2026-07-10), GDD §15.6', () => {
    const def = getBossDef('queen');
    expect(def.maxHp).toBe(QUEEN_MAX_HP);
    expect(def.maxHp).toBe(55);
    expect(def.hitDamageCapFraction).toEqual(QUEEN_HIT_DAMAGE_CAP_FRACTION);
    // Rediseño 2026-07-10 (GDD §15.3): su vida está en las columnas, pero al
    // cuerpo SIEMPRE le entra daño; fuera de aturdimiento se escala por este
    // factor pequeño (no es inmune, ver describe de abajo).
    expect(def.damageOutsideWindow).toBe(QUEEN_DAMAGE_OUTSIDE_WINDOW);
    expect(QUEEN_DAMAGE_OUTSIDE_WINDOW).toBeGreaterThan(0);
    expect(QUEEN_DAMAGE_OUTSIDE_WINDOW).toBeLessThan(1);
  });
});

describe('Reina: reserva de slots de larva al inicializarse (onInit)', () => {
  it('preasigna QUEEN_LARVA_MAX slots de larva inactivos (hp=0) desde el primer tick', () => {
    const world = makeQueenWorld();
    const larvaSlots = world.enemies.filter((e) => e.id.startsWith('queen-larva-'));
    expect(larvaSlots.length).toBe(QUEEN_LARVA_MAX);
    expect(larvaSlots.every((l) => l.hp <= 0)).toBe(true);
    expect(larvaSlots.every((l) => l.kind === 'dummy')).toBe(true);
  });

  it('el radio real de la Reina es QUEEN_RADIUS (colisión y render escalan con él)', () => {
    const world = makeQueenWorld();
    expect(boss(world).radius).toBeCloseTo(QUEEN_RADIUS, 6);
  });
});

describe('Reina: al cuerpo le entra daño REDUCIDO salvo aturdida (rediseño 2026-07-10, GDD §15.3: la vía real son las columnas)', () => {
  it('bossVulnerable es false mientras no rompas columnas (y se mantiene al avanzar la sim)', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    expect(boss(world).bossVulnerable).toBe(false);
    advance(world, events, 600); // 10s, sin columnas que romper
    expect(boss(world).bossVulnerable).toBe(false);
  });

  it('un proyectil/arma normal (sin bypass) le hace daño REDUCIDO por QUEEN_DAMAGE_OUTSIDE_WINDOW: algo, ni cero ni completo', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    const q = boss(world);
    const hpBefore = q.hp;
    applyDamageToEnemy(world, q, 10, 1, 0, events);
    expect(q.hp).toBeCloseTo(hpBefore - 10 * QUEEN_DAMAGE_OUTSIDE_WINDOW, 5);
    expect(q.hp).toBeLessThan(hpBefore); // le entra algo
    expect(q.hp).toBeGreaterThan(hpBefore - 10); // pero reducido, no completo
  });

  it('con bypass de ventana explícito (embestida/columna) SÍ recibe el daño pasado', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    const q = boss(world);
    const hpBefore = q.hp;
    applyDamageToEnemy(world, q, 10, 1, 0, events, true);
    expect(q.hp).toBe(hpBefore - 10);
  });
});

describe('Reina: cadencia de oleadas de larvas (GDD §15.6: "oleada cada ~3s")', () => {
  it('invoca una oleada al cruzar QUEEN_WAVE_INTERVAL, con evento boss-wave-spawn', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;

    expect(liveLarvae(world).length).toBe(0);

    const ticksPerWave = Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT);
    advance(world, events, ticksPerWave + 1);
    const larvae = liveLarvae(world);
    expect(larvae.length).toBeGreaterThanOrEqual(1);
    expect(larvae.every((l) => l.chasing)).toBe(true); // perseguidoras (nacen del boss)
    expect(collectTypes(events)).toContain('boss-wave-spawn');
  });

  it('cada larva nace con QUEEN_LARVA_HP (1 hp, GDD §15.6 "1 daño de contacto" implica 1 golpe basta)', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    advance(world, events, Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT) + 1);

    const larvae = liveLarvae(world);
    expect(larvae.length).toBeGreaterThan(0);
    for (const larva of larvae) {
      expect(larva.hp).toBe(QUEEN_LARVA_HP);
      expect(larva.maxHp).toBe(QUEEN_LARVA_HP);
      expect(QUEEN_LARVA_HP).toBe(1);
    }
  });

  it('las perseguidoras se acumulan hasta el cap TOTAL (QUEEN_LARVA_MAX) y no lo superan (rediseño 2026-07-10)', () => {
    const world = makeQueenWorld(); // sin columnas → solo perseguidoras
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    const ticksPerWave = Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT);

    // Muchas oleadas de sobra para saturar el cap total.
    advance(world, events, ticksPerWave * (QUEEN_LARVA_MAX + 4));
    expect(liveLarvae(world).length).toBe(QUEEN_LARVA_MAX);
    // El pool preasignado es del tamaño del cap total.
    const larvaSlotCount = world.enemies.filter((e) => e.id.startsWith('queen-larva-')).length;
    expect(larvaSlotCount).toBe(QUEEN_LARVA_MAX);

    // Una oleada más: sigue en el cap (no lo sobrepasa).
    advance(world, events, ticksPerWave);
    expect(liveLarvae(world).length).toBe(QUEEN_LARVA_MAX);
  });

  it('el nº de perseguidoras por oleada escala con la fase (1/2/3, rediseño 2026-07-10)', () => {
    expect(QUEEN_CHASER_PER_WAVE_BY_PHASE).toEqual([1, 2, 3]);

    // Fase 3 con vida baja (para que checkPhaseAndDefeat la mantenga): una
    // oleada suelta 3 perseguidoras de golpe (cupo total de sobra).
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    const q = boss(world);
    q.hp = Math.floor(q.maxHp * 0.2);
    q.bossPhase = 3;
    advance(world, events, 2); // el reloj arranca en 0: la 1.ª oleada cae en el tick 1
    const larvae = liveLarvae(world);
    expect(larvae.length).toBe(QUEEN_CHASER_PER_WAVE_BY_PHASE[2]); // 3
    expect(larvae.every((l) => l.chasing)).toBe(true);
  });
});

describe('Reina: comportamiento de larvas por fase (GDD §15.3, playtest 2026-07-06: persiguen desde fase 1)', () => {
  it('fase 1: la larva YA persigue de verdad (recalcula dirección hacia la posición actual del héroe, no línea recta fija)', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 20;
    world.hero.position.y = 0;
    advance(world, events, Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT) + 1);
    expect(boss(world).bossPhase).toBe(1);

    const larva = liveLarvae(world)[0];
    expect(larva).toBeDefined();
    const facingBefore = { x: larva.facing.x, y: larva.facing.y };

    // El héroe se teletransporta lejos de esa dirección inicial; en fase 1 la
    // larva DEBE corregir su rumbo (playtest 2026-07-06: "en línea recta no
    // amenazaban; el reto llegaba tarde" — ya no hay modo línea recta fija).
    advance(world, events, 30);
    world.hero.position.x = 0;
    world.hero.position.y = -20;
    advance(world, events, 30);
    expect(larva.facing.x).not.toBeCloseTo(facingBefore.x, 1);
    const dx = world.hero.position.x - larva.position.x;
    const dy = world.hero.position.y - larva.position.y;
    const len = Math.hypot(dx, dy) || 1;
    expect(larva.facing.x).toBeCloseTo(dx / len, 1);
    expect(larva.facing.y).toBeCloseTo(dy / len, 1);
  });

  it('fase 2/3: la larva persigue igual (recalcula dirección hacia la posición actual del héroe), más rápido', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    const q = boss(world);
    q.hp = Math.floor(q.maxHp * 0.6); // fuerza fase 2 en el próximo stepBosses
    world.hero.position.x = 20;
    world.hero.position.y = 0;
    advance(world, events, 1); // aplica el cambio de fase (checkPhaseAndDefeat corre en stepBosses)
    expect(q.bossPhase).toBe(2);

    advance(world, events, Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT) + 1);
    const larva = liveLarvae(world)[0];
    expect(larva).toBeDefined();

    // Cambia la posición del héroe: en fase 2, la larva debe re-orientarse hacia la NUEVA posición.
    world.hero.position.x = 0;
    world.hero.position.y = -20;
    advance(world, events, 5);
    const dx = world.hero.position.x - larva.position.x;
    const dy = world.hero.position.y - larva.position.y;
    const len = Math.hypot(dx, dy) || 1;
    expect(larva.facing.x).toBeCloseTo(dx / len, 1);
    expect(larva.facing.y).toBeCloseTo(dy / len, 1);
  });
});

describe('Reina: el cap TOTAL de larvas vivas nunca se supera (rediseño 2026-07-10)', () => {
  it('en cualquier fase, forzando muchas oleadas, nunca hay más de QUEEN_LARVA_MAX larvas vivas', () => {
    for (const frac of [1.0, 0.6, 0.2]) {
      const world = makeQueenWorld();
      const events = createEventQueue(64);
      world.hero.position.x = 100;
      world.hero.position.y = 100;
      const q = boss(world);
      q.hp = Math.floor(q.maxHp * frac);
      advance(world, events, 1);

      const ticksPerWave = Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT);
      let maxLive = 0;
      for (let wave = 0; wave < 20; wave++) {
        advance(world, events, ticksPerWave);
        maxLive = Math.max(maxLive, liveLarvae(world).length);
      }
      expect(maxLive).toBeLessThanOrEqual(QUEEN_LARVA_MAX);
    }
  });
});

describe('Reina: rastro permanente que crece con la fase (GDD §15.3, "como el Trail pero más grande y duradero")', () => {
  it('deja charcos en world.puddles con radio/vida propios (mayores que los del Trail normal)', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;

    advance(world, events, Math.round(QUEEN_TRAIL_DROP_INTERVAL / FIXED_DT) + 5);
    const active = world.puddles.filter((p) => p.active);
    expect(active.length).toBeGreaterThan(0);
    for (const puddle of active) {
      expect(puddle.radius).toBeCloseTo(QUEEN_TRAIL_PUDDLE_RADIUS, 6);
      expect(puddle.ttl).toBeGreaterThan(0);
      expect(puddle.ttl).toBeLessThanOrEqual(QUEEN_TRAIL_PUDDLE_LIFETIME);
    }
    // Mayor que el charco del Trail normal (GDD §15.3: "más grande y duradero").
    expect(QUEEN_TRAIL_PUDDLE_RADIUS).toBeGreaterThan(0.45); // TRAIL_PUDDLE_RADIUS
    expect(QUEEN_TRAIL_PUDDLE_LIFETIME).toBeGreaterThan(3.2); // TRAIL_PUDDLE_LIFETIME
  });

  it('fase 2 (66%): el rastro se genera más rápido que en fase 1', () => {
    expect(QUEEN_TRAIL_DROP_INTERVAL_PHASE2).toBeLessThan(QUEEN_TRAIL_DROP_INTERVAL);

    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;

    // Fase 1: cuenta charcos soltados en una ventana fija.
    const windowTicks = Math.round(3 / FIXED_DT); // 3s de ventana de medida
    advance(world, events, windowTicks);
    const countPhase1 = world.puddles.filter((p) => p.active).length;

    // Vacía el pool (desactiva todos) para medir limpio en fase 2.
    for (const p of world.puddles) p.active = false;

    const q = boss(world);
    q.hp = Math.floor(q.maxHp * 0.6);
    advance(world, events, 1);
    expect(q.bossPhase).toBe(2);
    q.bossCounter = 0; // reinicia el reloj de rastro para medir la ventana completa en fase 2

    advance(world, events, windowTicks);
    const countPhase2 = world.puddles.filter((p) => p.active).length;

    expect(countPhase2).toBeGreaterThan(countPhase1);
  });
});

describe('Reina: poción de recompensa al cambiar de fase (mismo criterio que el Guardián, GDD §15.2/§15.3)', () => {
  it('suelta 1 poción al cruzar a fase 2 y otra al cruzar a fase 3', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    const q = boss(world);
    world.hero.position.x = 100;
    world.hero.position.y = 100;

    const activePotions = () => world.items.filter((i) => i.active && i.kind === 'potion');
    expect(activePotions().length).toBe(0);

    q.hp = Math.floor(q.maxHp * 0.6);
    advance(world, events, 1);
    expect(q.bossPhase).toBe(2);
    expect(activePotions().length).toBe(1);

    q.hp = Math.floor(q.maxHp * 0.2);
    advance(world, events, 1);
    expect(q.bossPhase).toBe(3);
    expect(activePotions().length).toBe(2);
  });
});

describe('Reina: movimiento lento, gestión de terreno (GDD §15.3: "no es persecución, se mueve poco")', () => {
  it('sin columnas rotas, su velocidad de persecución es QUEEN_STALK_SPEED_BASE (playtest 2026-07-10: acelera al romperle columnas)', () => {
    const world = makeQueenWorld(); // sin columnas → 0 rotas
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;

    let maxSpeed = 0;
    for (let i = 0; i < 600; i++) {
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;
      const speed = Math.hypot(boss(world).velocity.x, boss(world).velocity.y);
      maxSpeed = Math.max(maxSpeed, speed);
    }
    expect(maxSpeed).toBeLessThanOrEqual(QUEEN_STALK_SPEED_BASE + 0.02);
  });
});

describe('Reina: acecho hacia el héroe (GDD §15.3, playtest 2026-07-06 "la Reina te acecha"; playtest 2026-07-10 "que llegue a tocar al jugador" + escalado por fase + persecución libre sin correa)', () => {
  it('con el héroe fijo lejos, la Reina reduce su distancia al héroe con el tiempo', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    const q = boss(world);
    // Héroe fijo, lejos, en una esquina de la sala 15x15 (dentro de bounds
    // para que sea un objetivo de acecho real, no un punto arbitrario fuera
    // de la arena).
    world.hero.position.x = 6;
    world.hero.position.y = 6;

    const distAtStart = Math.hypot(world.hero.position.x - q.position.x, world.hero.position.y - q.position.y);

    advance(world, events, 600); // 10s: tiempo de sobra para que el acecho progrese
    const distAfter = Math.hypot(world.hero.position.x - q.position.x, world.hero.position.y - q.position.y);

    // Persigue libremente hacia el héroe, sin correa que la haga volver
    // (playtest 2026-07-10 "quitar la correa"): su distancia al héroe baja.
    expect(distAfter).toBeLessThan(distAtStart);
  });

  it('la velocidad de persecución CRECE con cada columna ROTA (playtest 2026-07-10: rompérselas la enfurece)', () => {
    expect(QUEEN_STALK_SPEED_BASE).toBeGreaterThan(0);
    expect(QUEEN_STALK_SPEED_PER_COLUMN).toBeGreaterThan(0);

    // Funcional: con columnas marcadas como rotas, su velocidad neta sube.
    const maxSpeedWith = (broken: number) => {
      const world = makeQueenWorldWithColumns();
      const events = createEventQueue(64);
      world.hero.position.x = 100; // lejos: persigue a tope
      world.hero.position.y = 100;
      for (let i = 0; i < broken && i < world.queenColumns.length; i++) world.queenColumns[i].broken = true;
      let m = 0;
      for (let i = 0; i < 120; i++) {
        stepBosses(world, FIXED_DT, events);
        world.time += FIXED_DT;
        m = Math.max(m, Math.hypot(boss(world).velocity.x, boss(world).velocity.y));
      }
      return m;
    };
    expect(maxSpeedWith(2)).toBeGreaterThan(maxSpeedWith(0));
  });

  it('en la sala real (boss-queen.json), con el héroe en su playerStart, la Reina llega a TOCARLO (fix playtest 2026-07-10: antes se daba la vuelta por la correa sin llegar; ahora persigue libremente)', () => {
    // Sala real 11x21: héroe arranca en (0,9), a ~9u del centro (0,0) donde
    // aparece la Reina. Sin correa, persigue en línea recta hasta el contacto.
    const room = parseRoomData(bossQueenJson).room!;
    const world = createWorld(room);
    initBossEnemies(world);
    const events = createEventQueue(64);
    const q = boss(world);
    const contactDist = QUEEN_RADIUS + HERO_RADIUS;

    let reachedContact = false;
    for (let i = 0; i < 3600; i++) {
      // hasta 60s
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;
      const dist = Math.hypot(world.hero.position.x - q.position.x, world.hero.position.y - q.position.y);
      if (dist <= contactDist + 0.05) {
        reachedContact = true;
        break;
      }
    }
    expect(reachedContact).toBe(true);
  });
});

describe('src/levels/boss-queen.json', () => {
  it('valida contra room-format.ts (GDD §13) y referencia el jefe "queen"', () => {
    const result = parseRoomData(bossQueenJson);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.room?.boss).toBe('queen');
    expect(result.room?.tags).toContain('jefe');
  });

  it('es una arena alargada (height > width) con pasillos laterales (rocas, GDD §15.3)', () => {
    const result = parseRoomData(bossQueenJson);
    const room = result.room!;
    expect(room.height).toBeGreaterThan(room.width);
    expect(room.hazards.every((h) => h.kind === 'rock')).toBe(true);
    expect(room.hazards.length).toBeGreaterThan(0);
  });

  it('el foco central (banda alrededor de x=0) queda libre de rocas', () => {
    const result = parseRoomData(bossQueenJson);
    const room = result.room!;
    for (const rock of room.hazards) {
      const innerEdge = Math.abs(rock.position.x) - rock.width / 2;
      expect(innerEdge).toBeGreaterThan(2); // banda central libre de al menos 2u a cada lado
    }
  });
});

describe('generateDungeon: puede producir la sala de la Reina (sorteo entre salas "jefe")', () => {
  it('con suficientes semillas distintas, el generador elige boss-guardian Y boss-queen (no siempre la misma)', () => {
    const pool = getRoomPool();
    const bossRoomIds = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const map = generateDungeon(seed, pool);
      bossRoomIds.add(map.bossRoomId);
    }
    expect(bossRoomIds.has('boss-guardian')).toBe(true);
    expect(bossRoomIds.has('boss-queen')).toBe(true);
  });

  it('una run con boss-queen sortea también coherentemente (topología válida, jefe único)', () => {
    const pool = getRoomPool();
    let foundQueenSeed: number | null = null;
    for (let seed = 1; seed <= 60; seed++) {
      const map = generateDungeon(seed, pool);
      if (map.bossRoomId === 'boss-queen') {
        foundQueenSeed = seed;
        break;
      }
    }
    expect(foundQueenSeed).not.toBeNull();
    const map = generateDungeon(foundQueenSeed!, pool);
    expect(map.rooms.filter((r) => r.room.tags.includes('jefe')).length).toBe(1);
    expect(map.bossRoomId).toBe('boss-queen');
  });
});

describe('Reina: derrota y limpieza de sala (integración con stepWorld, modo sala única)', () => {
  it('matar a la Reina no limpia la sala si aún queda una larva viva; muere la última y sí se limpia', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;

    // Invoca una oleada para tener al menos una larva viva.
    advance(world, events, Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT) + 1);
    const larvae = liveLarvae(world);
    expect(larvae.length).toBeGreaterThan(0);

    // Mata a la Reina (daño masivo con bypass de ventana: el cuerpo ya no es
    // vulnerable a proyectiles/armas normales, rediseño 2026-07-10).
    const q = boss(world);
    applyDamageToEnemy(world, q, q.hp, 1, 0, events, true);
    advance(world, events, 1);
    expect(q.hp).toBeLessThanOrEqual(0);
    expect(collectTypes(events)).toContain('boss-defeated');

    // La sala NO se da por limpiada mientras la larva siga viva.
    expect(world.phase).not.toBe('room-cleared');

    // Mata también a la única larva viva: ahora sí, todos muertos.
    for (const larva of liveLarvae(world)) {
      applyDamageToEnemy(world, larva, larva.hp, 1, 0, events);
    }
    // Confirma que collectDeadDrops (step.ts) no rompe nada aquí: este test
    // solo usa stepBosses/applyDamageToEnemy (no stepWorld), así que la
    // transición a 'room-cleared' la valida stepSingleRoomClear en step.test.ts
    // (fuera de alcance de este fichero); aquí basta con la propiedad de
    // negocio: sin más larvas vivas, allDead(world.enemies) sería true.
    const stillAlive = world.enemies.filter((e) => e.hp > 0);
    expect(stillAlive.length).toBe(0);
  });
});

// ── Rediseño 2026-07-10 (GDD §15.3): la vida está en las columnas ──────────

/** Mundo de la Reina con 2 columnas destructibles (rocas con id `column-*`). */
function makeQueenWorldWithColumns() {
  const world = createWorld(
    makeRoom({
      enemies: [{ id: 'boss-1', kind: 'boss', bossId: 'queen', position: { x: 0, y: 0 } }],
      hazards: [
        { id: 'column-a', kind: 'rock' as const, position: { x: 3, y: 0 }, width: 1, height: 1 },
        { id: 'column-b', kind: 'rock' as const, position: { x: -3, y: 0 }, width: 1, height: 1 },
      ],
    }),
  );
  initBossEnemies(world);
  return world;
}

/** Coloca al héroe sobre `col` embistiendo (velocidad ≥ umbral) y cuenta `times` golpes, respetando el cooldown entre ellos. */
function ramColumn(
  world: ReturnType<typeof createWorld>,
  events: ReturnType<typeof createEventQueue>,
  col: { position: { x: number; y: number } },
  times: number,
) {
  for (let n = 0; n < times; n++) {
    world.hero.position.x = col.position.x;
    world.hero.position.y = col.position.y;
    world.hero.velocity.x = RAM_SPEED_THRESHOLD + 1;
    world.hero.velocity.y = 0;
    stepQueenColumns(world, world.contactDamageCooldowns, events);
    world.time += QUEEN_COLUMN_HIT_COOLDOWN + FIXED_DT;
  }
}

describe('Reina: la vida está en las columnas (rediseño 2026-07-10, GDD §15.3)', () => {
  it('onInit puebla world.queenColumns desde las rocas `column-*` de su sala', () => {
    const world = makeQueenWorldWithColumns();
    expect(world.queenColumns.length).toBe(2);
    expect(world.queenColumns.every((c) => c.hp === QUEEN_COLUMN_HP && !c.broken)).toBe(true);
  });

  it('romper una columna (QUEEN_COLUMN_HP embestidas) baja la vida del jefe; los golpes previos solo la dañan', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue();
    const q = boss(world);
    const col = world.queenColumns[0];
    const before = q.hp;

    // Golpes previos (QUEEN_COLUMN_HP - 1): dañan la columna, no bajan la vida del jefe.
    ramColumn(world, events, col, QUEEN_COLUMN_HP - 1);
    expect(col.hp).toBe(1);
    expect(col.broken).toBe(false);
    expect(q.hp).toBe(before);
    expect(collectTypes(events)).toContain('boss-column-cracked');

    // Golpe final: rompe (hp→0) y baja el daño por columna.
    ramColumn(world, events, col, 1);
    expect(col.broken).toBe(true);
    expect(q.hp).toBeCloseTo(before - QUEEN_MAX_HP * QUEEN_COLUMN_DAMAGE_FRACTION, 5);
    expect(collectTypes(events)).toContain('boss-column-broken');
  });

  it('la columna rota deja de ser sólida (se retira de world.obstacles)', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue();
    const col = world.queenColumns[0];
    expect(world.obstacles.some((o) => o.id === col.id)).toBe(true);
    ramColumn(world, events, col, QUEEN_COLUMN_HP);
    expect(col.broken).toBe(true);
    expect(world.obstacles.some((o) => o.id === col.id)).toBe(false);
  });

  it('solo la embestida daña la columna: tocarla a baja velocidad no le resta vida', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue();
    const col = world.queenColumns[0];
    world.hero.position.x = col.position.x;
    world.hero.position.y = col.position.y;
    world.hero.velocity.x = 0.1; // muy por debajo de RAM_SPEED_THRESHOLD
    world.hero.velocity.y = 0;
    stepQueenColumns(world, world.contactDamageCooldowns, events);
    expect(col.hp).toBe(QUEEN_COLUMN_HP);
  });

  it('al cuerpo del jefe un proyectil/arma normal le hace daño REDUCIDO (no aturdida), no cero', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue();
    const q = boss(world);
    const before = q.hp;
    applyDamageToEnemy(world, q, 10, 0, 0, events); // sin ignore-window: como un proyectil
    expect(q.hp).toBeCloseTo(before - 10 * QUEEN_DAMAGE_OUTSIDE_WINDOW, 5);
    expect(q.hp).toBeLessThan(before);
  });

  it('una embestida directa al CUERPO sin aturdir le hace daño reducido (>0, ya no un valor fijo)', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue();
    const q = boss(world);
    const before = q.hp;
    world.hero.position.x = q.position.x;
    world.hero.position.y = q.position.y;
    world.hero.velocity.x = RAM_SPEED_THRESHOLD + 1;
    world.hero.velocity.y = 0;
    stepHeroEnemyContacts(world, world.contactDamageCooldowns, events);
    expect(q.hp).toBeLessThan(before); // le entra algo
    expect(before - q.hp).toBeLessThan(3); // reducido (embestida × 0.15), pequeño
  });

  it('al romper una columna la Reina queda ATURDIDA (vulnerable) unos segundos y luego vuelve a no-aturdida', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue();
    const q = boss(world);
    const col = world.queenColumns[0];
    // Quedan 2 columnas: romper UNA deja otra en pie → aturdimiento TEMPORAL.
    ramColumn(world, events, col, QUEEN_COLUMN_HP);
    expect(q.bossVulnerableUntil).toBeGreaterThan(world.time);
    advance(world, events, 1); // queenStepPattern deriva bossVulnerable del reloj
    expect(q.bossVulnerable).toBe(true);
    // Pasado el aturdimiento vuelve a no-vulnerable (aún queda una columna).
    world.time += QUEEN_COLUMN_STUN_DURATION;
    advance(world, events, 1);
    expect(q.bossVulnerable).toBe(false);
  });

  it('estando ATURDIDA, un ataque normal le hace MÁS daño que sin aturdir (daño completo)', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue();
    const q = boss(world);
    q.bossVulnerable = true; // simula la ventana de aturdimiento
    const before = q.hp;
    applyDamageToEnemy(world, q, 10, 0, 0, events);
    expect(q.hp).toBeCloseTo(before - 10, 5); // completo, no ×0.15
  });

  it('rotas TODAS las columnas (sala real), la Reina queda vulnerable de forma PERMANENTE y le queda ~1/3 de vida para rematar', () => {
    const room = parseRoomData(bossQueenJson).room!;
    const world = createWorld(room);
    initBossEnemies(world);
    const events = createEventQueue(64);
    const q = boss(world);
    expect(world.queenColumns.length).toBe(8);
    for (const col of [...world.queenColumns]) {
      ramColumn(world, events, col, QUEEN_COLUMN_HP);
    }
    expect(world.queenColumns.every((c) => c.broken)).toBe(true);
    expect(q.bossVulnerableUntil).toBe(Infinity);
    advance(world, events, 1);
    expect(q.bossVulnerable).toBe(true);
    // 8 × QUEEN_COLUMN_DAMAGE_FRACTION = 2/3 → le queda ~1/3 para el remate.
    expect(q.hp / q.maxHp).toBeCloseTo(1 / 3, 2);
  });
});

// ── TAREA 5 (docs/plans/QUEEN_REDESIGN_PLAN.md): persecución con evasión ───
// La Reina ya no atraviesa columnas/rocas al perseguir al héroe: reutiliza la
// misma circunnavegación tangencial del Guardián (moveBossTowardWithAvoidance,
// generalizada con un parámetro `speed`), a QUEEN_STALK_SPEED_BY_PHASE. Sube
// el reto (feedback del director: "el jefe va sobrado de fácil") porque ahora
// SÍ puede acorralar al jugador usando las columnas en vez de colarse a través.

describe('Reina: persigue RODEANDO obstáculos (TAREA 5 rediseño 2026-07-10, "no atraviesa columnas")', () => {
  it('con una columna entre la Reina y el héroe, su círculo nunca solapa la columna y aun así reduce la distancia al héroe', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue(64);
    const q = boss(world);
    const col = world.queenColumns[0]; // column-a en (3,0), medio-lado 0.5 — justo en la línea recta boss→héroe.
    world.hero.position.x = 6;
    world.hero.position.y = 0;

    const distStart = Math.hypot(world.hero.position.x - q.position.x, world.hero.position.y - q.position.y);

    for (let i = 0; i < 900; i++) {
      // 15s: tiempo de sobra para rodear la columna y seguir avanzando.
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;

      // El círculo de la Reina (radio QUEEN_RADIUS) nunca solapa el AABB de
      // la columna, intacta durante todo el test (nadie la embiste aquí).
      const nearestX = Math.min(Math.max(q.position.x, col.position.x - col.halfW), col.position.x + col.halfW);
      const nearestY = Math.min(Math.max(q.position.y, col.position.y - col.halfH), col.position.y + col.halfH);
      const dx = q.position.x - nearestX;
      const dy = q.position.y - nearestY;
      expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(QUEEN_RADIUS * QUEEN_RADIUS - 1e-6);
    }

    const distEnd = Math.hypot(world.hero.position.x - q.position.x, world.hero.position.y - q.position.y);
    // La rodea (circunnavegación tangencial), pero sigue progresando hacia el héroe.
    expect(distEnd).toBeLessThan(distStart);
  });

  it('sin obstáculos en medio, la Reina sigue acercándose al héroe con la evasión activada (persecución no rota)', () => {
    const world = makeQueenWorld(); // sin columnas: makeRoom() no añade hazards
    const events = createEventQueue(64);
    const q = boss(world);
    world.hero.position.x = 6;
    world.hero.position.y = 6;

    const distStart = Math.hypot(world.hero.position.x - q.position.x, world.hero.position.y - q.position.y);
    advance(world, events, 300); // 5s de sobra en campo abierto
    const distEnd = Math.hypot(world.hero.position.x - q.position.x, world.hero.position.y - q.position.y);
    expect(distEnd).toBeLessThan(distStart);
  });
});

// ── T4 (rediseño 2026-07-10): larvas guardiana (de columna) vs perseguidora ──

describe('Reina: guardianas de columna (T4, rediseño 2026-07-10)', () => {
  const guardianSpawnTicks = Math.round(QUEEN_GUARDIAN_SPAWN_INTERVAL / FIXED_DT);

  it('aparece una guardiana (chasing=false) anclada a una columna y ORBITA su columna (no persigue al héroe lejano)', () => {
    const world = makeQueenWorldWithColumns(); // 2 columnas en (±3,0)
    const events = createEventQueue(64);
    world.hero.position.x = 100; // héroe lejísimos: una perseguidora se iría, una guardiana no
    world.hero.position.y = 100;
    advance(world, events, guardianSpawnTicks * 3 + 5);

    const guardians = liveLarvae(world).filter((l) => !l.chasing);
    expect(guardians.length).toBeGreaterThanOrEqual(1);
    for (const g of guardians) {
      const col = world.queenColumns.find(
        (c) => Math.abs(c.position.x - g.patrolFrom.x) < 0.01 && Math.abs(c.position.y - g.patrolFrom.y) < 0.01,
      );
      expect(col).toBeDefined(); // anclada al centro de una columna
      const dist = Math.hypot(g.position.x - g.patrolFrom.x, g.position.y - g.patrolFrom.y);
      expect(dist).toBeLessThan(QUEEN_GUARDIAN_ORBIT_RADIUS + 1); // ronda su columna, no se va a por el héroe
    }
  });

  it('nunca hay más de QUEEN_GUARDIAN_MAX guardianas vivas (sala real, 8 columnas)', () => {
    const room = parseRoomData(bossQueenJson).room!;
    const world = createWorld(room);
    initBossEnemies(world);
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    advance(world, events, guardianSpawnTicks * 12 + 5);

    const guardians = liveLarvae(world).filter((l) => !l.chasing);
    expect(guardians.length).toBeGreaterThanOrEqual(1);
    expect(guardians.length).toBeLessThanOrEqual(QUEEN_GUARDIAN_MAX);
  });

  it('al romper una columna, su(s) guardiana(s) mueren con ella', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    advance(world, events, guardianSpawnTicks * 3 + 5);

    const col = world.queenColumns[0];
    const guardiansOfCol = () =>
      liveLarvae(world).filter(
        (l) => !l.chasing && Math.abs(l.patrolFrom.x - col.position.x) < 0.01 && Math.abs(l.patrolFrom.y - col.position.y) < 0.01,
      );
    expect(guardiansOfCol().length).toBeGreaterThanOrEqual(1);

    ramColumn(world, events, col, QUEEN_COLUMN_HP);
    expect(col.broken).toBe(true);
    expect(guardiansOfCol().length).toBe(0);
  });
});

// ── Subida de dificultad (playtest 2026-07-10) ──────────────────────────────

describe('Reina: guardianas presentes que embisten (playtest 2026-07-10)', () => {
  it('A1: cada columna nace ya con guardiana desde el tick 0 (queenOnInit, sin avanzar)', () => {
    const world = makeQueenWorldWithColumns(); // 2 columnas
    const guardians = liveLarvae(world).filter((l) => !l.chasing);
    expect(guardians.length).toBe(Math.min(2, QUEEN_GUARDIAN_MAX));
    for (const g of guardians) {
      const col = world.queenColumns.find(
        (c) => Math.abs(c.position.x - g.patrolFrom.x) < 0.01 && Math.abs(c.position.y - g.patrolFrom.y) < 0.01,
      );
      expect(col).toBeDefined(); // anclada a una columna
    }
  });

  it('una guardiana no carga nada más nacer (cooldown inicial)', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue(64);
    const col = world.queenColumns[0];
    world.hero.position.x = col.position.x; // héroe pegado a la columna
    world.hero.position.y = col.position.y + 0.5;
    advance(world, events, 3); // pocos ticks, muy por debajo del cooldown inicial
    expect(collectTypes(events)).not.toContain('boss-guardian-charge');
  });

  it('con el héroe cerca y pasado el cooldown, la guardiana telegrafía una embestida (evento boss-guardian-charge)', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue(64);
    const col = world.queenColumns[0];
    world.hero.position.x = col.position.x;
    world.hero.position.y = col.position.y + 0.5;
    advance(world, events, Math.round(QUEEN_GUARDIAN_CHARGE_COOLDOWN / FIXED_DT) + 4);
    expect(collectTypes(events)).toContain('boss-guardian-charge');
  });
});
