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
  QUEEN_BODY_RAM_DAMAGE_FRACTION,
  QUEEN_COLUMN_DAMAGE_FRACTION,
  QUEEN_COLUMN_HIT_COOLDOWN,
  QUEEN_COLUMN_HP,
  QUEEN_HIT_DAMAGE_CAP_FRACTION,
  QUEEN_LARVA_HP,
  QUEEN_LARVA_MAX,
  QUEEN_LARVA_MAX_BY_PHASE,
  QUEEN_LARVA_PER_WAVE,
  QUEEN_MAX_HP,
  QUEEN_MOVE_SPEED_PHASE1,
  QUEEN_RADIUS,
  QUEEN_STALK_SPEED_BY_PHASE,
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
  it('tiene 55 HP, techo de daño 60/65/70% e inmune a proyectiles/armas normales (rediseño 2026-07-10), GDD §15.6', () => {
    const def = getBossDef('queen');
    expect(def.maxHp).toBe(QUEEN_MAX_HP);
    expect(def.maxHp).toBe(55);
    expect(def.hitDamageCapFraction).toEqual(QUEEN_HIT_DAMAGE_CAP_FRACTION);
    // Rediseño 2026-07-10 (GDD §15.3): su vida está en las columnas, no en el
    // cuerpo — proyectiles/armas normales no le afectan (0 = inmune fuera de
    // ventana; nunca hay ventana que abrir, ver describe de abajo).
    expect(def.damageOutsideWindow).toBe(0);
    expect(def.ramBodyDamageFraction).toBe(QUEEN_BODY_RAM_DAMAGE_FRACTION);
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

describe('Reina: el cuerpo NUNCA es vulnerable a proyectiles/armas normales (rediseño 2026-07-10, GDD §15.3: su vida está en las columnas)', () => {
  it('bossVulnerable es false desde el primer tick y se mantiene tras avanzar la sim', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    expect(boss(world).bossVulnerable).toBe(false);
    advance(world, events, 600); // 10s
    expect(boss(world).bossVulnerable).toBe(false);
  });

  it('un proyectil/arma normal (sin bypass de ventana) no le hace NADA de daño: rebota', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    const q = boss(world);
    const hpBefore = q.hp;
    applyDamageToEnemy(world, q, 10, 1, 0, events);
    expect(q.hp).toBe(hpBefore);

    // Tras avanzar la sim (movimiento/oleadas en curso) sigue siendo inmune.
    advance(world, events, 30);
    const hpBefore2 = q.hp;
    applyDamageToEnemy(world, q, 7, 1, 0, events);
    expect(q.hp).toBe(hpBefore2);
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
    expect(liveLarvae(world).length).toBe(QUEEN_LARVA_PER_WAVE);
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

  it('en fase 1 el cap de larvas vivas simultáneas es 2 (GDD §15.3, playtest 2026-07-06: escalada 2/4/6 por fase), tras muchas oleadas', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    expect(boss(world).bossPhase).toBe(1);

    // 10 oleadas de sobra para saturar el cap si no lo respetara.
    const ticksPerWave = Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT);
    advance(world, events, ticksPerWave * 10);
    expect(liveLarvae(world).length).toBe(QUEEN_LARVA_MAX_BY_PHASE[0]);
    expect(liveLarvae(world).length).toBe(2);
    // El pool preasignado sigue siendo del tamaño del máximo (fase 3 = 6),
    // aunque el cap ACTIVO en fase 1 sea menor (slots reutilizados, sin
    // `.push` en runtime).
    const larvaSlotCount = world.enemies.filter((e) => e.id.startsWith('queen-larva-')).length;
    expect(larvaSlotCount).toBe(QUEEN_LARVA_MAX);
  });

  it('no invoca larvas nuevas mientras el cap de la fase actual ya está lleno (las oleadas de más quedan sin efecto)', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    const ticksPerWave = Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT);

    // Satura el cap de fase 1 (2).
    advance(world, events, ticksPerWave * 10);
    expect(liveLarvae(world).length).toBe(QUEEN_LARVA_MAX_BY_PHASE[0]);

    // Una oleada más: sigue en el cap (no lo sobrepasa).
    advance(world, events, ticksPerWave);
    expect(liveLarvae(world).length).toBe(QUEEN_LARVA_MAX_BY_PHASE[0]);
  });

  it('en fase 2 el cap sube a 4 y en fase 3 a 6 (GDD §15.3)', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    const q = boss(world);
    const ticksPerWave = Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT);

    q.hp = Math.floor(q.maxHp * 0.6); // fuerza fase 2
    advance(world, events, 1);
    expect(q.bossPhase).toBe(2);
    advance(world, events, ticksPerWave * 10);
    expect(liveLarvae(world).length).toBe(QUEEN_LARVA_MAX_BY_PHASE[1]);
    expect(liveLarvae(world).length).toBe(4);

    q.hp = Math.floor(q.maxHp * 0.2); // fuerza fase 3
    advance(world, events, 1);
    expect(q.bossPhase).toBe(3);
    advance(world, events, ticksPerWave * 10);
    expect(liveLarvae(world).length).toBe(QUEEN_LARVA_MAX_BY_PHASE[2]);
    expect(liveLarvae(world).length).toBe(6);
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

describe('Reina: cap de larvas nunca superior al de la fase actual (GDD §15.3, playtest 2026-07-06)', () => {
  it('en fase 1 nunca hay más de 2 larvas vivas, aunque se fuercen muchas oleadas', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    const ticksPerWave = Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT);

    let maxLive = 0;
    for (let wave = 0; wave < 15; wave++) {
      advance(world, events, ticksPerWave);
      maxLive = Math.max(maxLive, liveLarvae(world).length);
    }
    expect(maxLive).toBeLessThanOrEqual(2);
  });

  it('en fase 2 nunca hay más de 4 larvas vivas', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    const q = boss(world);
    q.hp = Math.floor(q.maxHp * 0.6);
    advance(world, events, 1);
    expect(q.bossPhase).toBe(2);

    const ticksPerWave = Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT);
    let maxLive = 0;
    for (let wave = 0; wave < 15; wave++) {
      advance(world, events, ticksPerWave);
      maxLive = Math.max(maxLive, liveLarvae(world).length);
    }
    expect(maxLive).toBeLessThanOrEqual(4);
  });

  it('en fase 3 nunca hay más de 6 larvas vivas', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    const q = boss(world);
    q.hp = Math.floor(q.maxHp * 0.2);
    advance(world, events, 1);
    expect(q.bossPhase).toBe(3);

    const ticksPerWave = Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT);
    let maxLive = 0;
    for (let wave = 0; wave < 15; wave++) {
      advance(world, events, ticksPerWave);
      maxLive = Math.max(maxLive, liveLarvae(world).length);
    }
    expect(maxLive).toBeLessThanOrEqual(6);
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
  it('en fase 1 nunca supera QUEEN_MOVE_SPEED_PHASE1 + QUEEN_STALK_SPEED_BY_PHASE[0] de velocidad neta (deambulación + acecho combinados)', () => {
    const world = makeQueenWorld();
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
    // El acecho (GDD §15.3, playtest 2026-07-06 "la Reina te acecha") se suma
    // a la deambulación normal: el tope pasa de QUEEN_MOVE_SPEED_PHASE1 solo a
    // la suma de ambas velocidades (peor caso: mismo rumbo). Fase 1 usa el
    // primer valor de la tabla escalada por fase (playtest 2026-07-10).
    expect(maxSpeed).toBeLessThanOrEqual(QUEEN_MOVE_SPEED_PHASE1 + QUEEN_STALK_SPEED_BY_PHASE[0] + 0.02);
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

  it('QUEEN_STALK_SPEED_BY_PHASE escala: fase 3 persigue más rápido que fase 1 (playtest 2026-07-10 "incrementaría la velocidad... conforme pasan las fases")', () => {
    expect(QUEEN_STALK_SPEED_BY_PHASE[0]).toBeGreaterThan(0);
    expect(QUEEN_STALK_SPEED_BY_PHASE[1]).toBeGreaterThan(QUEEN_STALK_SPEED_BY_PHASE[0]);
    expect(QUEEN_STALK_SPEED_BY_PHASE[2]).toBeGreaterThan(QUEEN_STALK_SPEED_BY_PHASE[1]);
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

  it('romper una columna (2 embestidas) baja la vida del jefe un QUEEN_COLUMN_DAMAGE_FRACTION; la 1.ª solo agrieta', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue();
    const q = boss(world);
    const col = world.queenColumns[0];
    const before = q.hp;

    // 1.er golpe: agrieta (hp 2→1), sin bajar aún la vida del jefe.
    ramColumn(world, events, col, 1);
    expect(col.hp).toBe(1);
    expect(col.broken).toBe(false);
    expect(q.hp).toBe(before);
    expect(collectTypes(events)).toContain('boss-column-cracked');

    // 2.º golpe: rompe (hp→0) y baja el 12% de la vida del jefe.
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

  it('al cuerpo del jefe los proyectiles/armas normales no le hacen daño (inmune fuera de columnas)', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue();
    const q = boss(world);
    const before = q.hp;
    applyDamageToEnemy(world, q, 10, 0, 0, events); // sin ignore-window: como un proyectil
    expect(q.hp).toBe(before);
  });

  it('una embestida directa al CUERPO del jefe le hace QUEEN_BODY_RAM_DAMAGE_FRACTION de su vida', () => {
    const world = makeQueenWorldWithColumns();
    const events = createEventQueue();
    const q = boss(world);
    const before = q.hp;
    // Héroe sobre el cuerpo del jefe (0,0), embistiendo.
    world.hero.position.x = q.position.x;
    world.hero.position.y = q.position.y;
    world.hero.velocity.x = RAM_SPEED_THRESHOLD + 1;
    world.hero.velocity.y = 0;
    stepHeroEnemyContacts(world, world.contactDamageCooldowns, events);
    expect(q.hp).toBeCloseTo(before - QUEEN_MAX_HP * QUEEN_BODY_RAM_DAMAGE_FRACTION, 5);
  });
});
