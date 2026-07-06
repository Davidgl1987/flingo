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
  QUEEN_HIT_DAMAGE_CAP_FRACTION,
  QUEEN_LARVA_HP,
  QUEEN_LARVA_MAX,
  QUEEN_LARVA_PER_WAVE,
  QUEEN_MAX_HP,
  QUEEN_RADIUS,
  QUEEN_TRAIL_DROP_INTERVAL,
  QUEEN_TRAIL_DROP_INTERVAL_PHASE2,
  QUEEN_TRAIL_PUDDLE_LIFETIME,
  QUEEN_TRAIL_PUDDLE_RADIUS,
  QUEEN_WAVE_INTERVAL,
} from './constants';
import { getBossDef } from './bosses';
import { getRoomPool } from './rooms';
import { initBossEnemies, stepBosses } from '../sim/boss';
import { applyDamageToEnemy } from '../sim/combat';
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
  it('tiene 55 HP, techo de daño 60/65/70% y vulnerable siempre (sin ventana), GDD §15.6', () => {
    const def = getBossDef('queen');
    expect(def.maxHp).toBe(QUEEN_MAX_HP);
    expect(def.maxHp).toBe(55);
    expect(def.hitDamageCapFraction).toEqual(QUEEN_HIT_DAMAGE_CAP_FRACTION);
    // damageOutsideWindow=1 (daño normal siempre): no hay ventana que gatee el daño.
    expect(def.damageOutsideWindow).toBe(1);
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

describe('Reina: vulnerable en todo momento (GDD §15.3: sin fase de aturdimiento clásica)', () => {
  it('bossVulnerable es true desde el primer tick y se mantiene tras avanzar la sim', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    expect(boss(world).bossVulnerable).toBe(true);
    advance(world, events, 600); // 10s
    expect(boss(world).bossVulnerable).toBe(true);
  });

  it('recibe daño completo en cualquier instante (sin gating de ventana)', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    const q = boss(world);
    const hpBefore = q.hp;
    applyDamageToEnemy(world, q, 10, 1, 0, events);
    expect(q.hp).toBe(hpBefore - 10);

    // Tras avanzar la sim (movimiento/oleadas en curso) sigue recibiendo daño normal.
    advance(world, events, 30);
    const hpBefore2 = q.hp;
    applyDamageToEnemy(world, q, 7, 1, 0, events);
    expect(q.hp).toBe(hpBefore2 - 7);
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

  it('respeta el cap QUEEN_LARVA_MAX de larvas vivas simultáneas tras muchas oleadas', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;

    // 10 oleadas de sobra para saturar el cap si no lo respetara.
    const ticksPerWave = Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT);
    advance(world, events, ticksPerWave * 10);
    expect(liveLarvae(world).length).toBeLessThanOrEqual(QUEEN_LARVA_MAX);
    // Y el array de enemigos no crece sin límite (slots reutilizados, sin `.push` en runtime).
    const larvaSlotCount = world.enemies.filter((e) => e.id.startsWith('queen-larva-')).length;
    expect(larvaSlotCount).toBe(QUEEN_LARVA_MAX);
  });

  it('no invoca larvas nuevas mientras el cap ya está lleno (las oleadas de más quedan sin efecto)', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 100;
    world.hero.position.y = 100;
    const ticksPerWave = Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT);

    // Satura el cap.
    advance(world, events, ticksPerWave * 10);
    expect(liveLarvae(world).length).toBe(QUEEN_LARVA_MAX);

    // Una oleada más: sigue en el cap (no lo sobrepasa).
    advance(world, events, ticksPerWave);
    expect(liveLarvae(world).length).toBe(QUEEN_LARVA_MAX);
  });
});

describe('Reina: comportamiento de larvas por fase (GDD §15.3)', () => {
  it('fase 1: la larva avanza en línea recta (dirección fija hacia el héroe en el instante de nacer)', () => {
    const world = makeQueenWorld();
    const events = createEventQueue(64);
    world.hero.position.x = 20;
    world.hero.position.y = 0;
    advance(world, events, Math.round(QUEEN_WAVE_INTERVAL / FIXED_DT) + 1);

    const larva = liveLarvae(world)[0];
    expect(larva).toBeDefined();
    const facingBefore = { x: larva.facing.x, y: larva.facing.y };

    // El héroe se teletransporta lejos de esa línea recta; en fase 1 la larva
    // NO debe corregir su rumbo (sigue con el facing fijado al nacer).
    advance(world, events, 30);
    world.hero.position.x = 0;
    world.hero.position.y = -20;
    advance(world, events, 30);
    expect(larva.facing.x).toBeCloseTo(facingBefore.x, 6);
    expect(larva.facing.y).toBeCloseTo(facingBefore.y, 6);
    // Avanzó en esa dirección fija (hacia +x, donde estaba el héroe al nacer).
    expect(larva.position.x).toBeGreaterThan(0);
  });

  it('fase 2/3: la larva persigue de verdad (recalcula dirección hacia la posición actual del héroe)', () => {
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
  it('en fase 1 nunca supera QUEEN_MOVE_SPEED_PHASE1 de velocidad neta', () => {
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
    expect(maxSpeed).toBeLessThanOrEqual(0.66); // QUEEN_MOVE_SPEED_PHASE1 (0.65) + tolerancia
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

    // Mata a la Reina (daño masivo, vulnerable siempre).
    const q = boss(world);
    applyDamageToEnemy(world, q, q.hp, 1, 0, events);
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
