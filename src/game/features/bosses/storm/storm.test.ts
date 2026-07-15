/**
 * Tests de La Tormenta (GDD §15.5, Fase B4 de docs/plans/BOSSES_PLAN.md): la
 * máquina de estados del integrador (idle→telegraph→ejecución→recarga),
 * cadencia, densificación/recarga por fase, encadenado espiral→anillos de
 * fase 3, selección de patrón sin repetir el anterior y el gate de daño por
 * ventana. Los 3 generadores de balas en sí (pasillo garantizado) se testean
 * en `./patterns.test.ts` (NO tocado por esta fase); aquí se valida que el
 * ciclo que los orquesta los alimenta correctamente. También valida
 * `src/game/features/dungeon/levels/boss-storm.json` contra room-format.ts.
 */

import { describe, expect, it } from 'vitest';
import bossStormJson from '@/game/features/dungeon/levels/boss-storm.json';
import { applyDamageToEnemy } from '@/game/features/combat/combat';
import { createEventQueue, drainEvents } from '@/engine/events';
import { parseRoomData } from '@/game/features/dungeon/room-format';
import type { EnemySpawn, RoomData, RoomTag } from '@/game/world/types';
import { createWorld } from '@/game/world/create';
import { initBossEnemies, stepBosses } from '@/game/features/bosses/lifecycle';
import { getBossDef } from '@/game/features/bosses/registry';
import { collectTypes } from '@/game/features/bosses/test-helpers';
import { stormState } from './pattern';
import { STORM_RADIUS } from './constants';
import {
  STORM_DAMAGE_OUTSIDE_WINDOW,
  STORM_HIT_DAMAGE_CAP_FRACTION,
  STORM_IDLE_DURATION_BY_PHASE,
  STORM_MAX_HP,
  STORM_PATTERN_BURST,
  STORM_PATTERN_RINGS,
  STORM_PATTERN_SPIRAL,
  STORM_RELOAD_DURATION_BY_PHASE,
  STORM_STAGE_EXECUTE,
  STORM_STAGE_IDLE,
  STORM_STAGE_RELOAD,
  STORM_STAGE_TELEGRAPH,
  STORM_TELEGRAPH_DURATION_BY_PHASE,
  STORM_TELEGRAPH_KIND,
} from './machine-constants';

const FIXED_DT = 1 / 60;

function makeRoom(partial: Partial<RoomData> = {}): RoomData {
  return {
    version: 1,
    id: 'storm-room',
    name: 'Sala de la Tormenta',
    width: 13,
    height: 13,
    playerStart: { x: 0, y: 6 },
    tags: ['jefe'] as RoomTag[],
    doorSlots: [],
    enemies: [],
    hazards: [],
    items: [],
    ...partial,
  };
}

function makeStormWorld(opts: { bossSpawn?: Partial<EnemySpawn>; room?: Partial<RoomData> } = {}) {
  const spawn: EnemySpawn = {
    id: 'boss-1',
    kind: 'boss',
    bossId: 'storm',
    position: { x: 0, y: 0 },
    ...opts.bossSpawn,
  };
  const world = createWorld(makeRoom({ enemies: [spawn], ...opts.room }));
  initBossEnemies(world);
  return world;
}

/** Avanza N ticks llamando solo a stepBosses (mismo patrón que guardian/prisma/pattern.test.ts). */
function advance(world: ReturnType<typeof createWorld>, events: ReturnType<typeof createEventQueue>, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    stepBosses(world, FIXED_DT, events);
    world.time += FIXED_DT;
  }
}

describe('La Tormenta: definición', () => {
  it('tiene 40 HP y techo de daño 60/65/70% por fase (GDD §15.6)', () => {
    const def = getBossDef('storm');
    expect(def.maxHp).toBe(STORM_MAX_HP);
    expect(def.maxHp).toBe(40);
    expect(def.hitDamageCapFraction).toEqual(STORM_HIT_DAMAGE_CAP_FRACTION);
    expect(def.hitDamageCapFraction).toEqual([0.6, 0.65, 0.7]);
    // Sin puzzle de arma/color (a diferencia del Prisma): cualquier arma daña
    // igual. Tras playtest 2026-07-15 SIEMPRE entra algo de daño (0.2, mismo
    // valor que Guardián/Prisma) y la recarga (ventana) sigue siendo donde
    // entra el daño completo — ver describe de más abajo.
    expect(def.damageOutsideWindow).toBe(0.2);
  });
});

describe('La Tormenta: radio real de jefe (regresión, mismo patrón que Guardián/Reina/Prisma)', () => {
  it('initBossEnemies aplica STORM_RADIUS', () => {
    const world = makeStormWorld();
    expect(world.enemies[0].radius).toBeCloseTo(STORM_RADIUS, 6);
  });
});

describe('La Tormenta: onInit', () => {
  it('arranca en IDLE, sin patrón previo (-1) y sin ventana abierta, con su StormState en world.bossState', () => {
    const world = makeStormWorld();
    const boss = world.enemies[0];
    expect(boss.bossStage).toBe(STORM_STAGE_IDLE);
    expect(boss.bossCounter).toBe(-1);
    expect(boss.bossVulnerable).toBe(false);
    expect(world.bossState).not.toBeNull();
    expect(world.bossState?.bossId).toBe('storm');
  });
});

describe('La Tormenta: ciclo idle→telegraph (GDD §15.5)', () => {
  it('tras el idle inicial, telegrafía uno de los 3 patrones con evento boss-telegraph', () => {
    const world = makeStormWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];

    advance(world, events, Math.ceil(STORM_IDLE_DURATION_BY_PHASE[0] / FIXED_DT) + 2);

    expect(boss.bossStage).toBe(STORM_STAGE_TELEGRAPH);
    expect(STORM_TELEGRAPH_KIND).toContain(boss.bossTelegraphKind);
    expect(boss.bossTelegraphUntil - world.time).toBeGreaterThanOrEqual(0.6 - FIXED_DT); // framework: mínimo 0.6s
    expect(collectTypes(events)).toContain('boss-telegraph');
  });
});

describe('La Tormenta: ventana de vulnerabilidad EXACTAMENTE en la recarga (GDD §15.5 "recarga = ventana")', () => {
  it('espiral forzada: nunca vulnerable durante telegraph/ejecución, sí durante la recarga, y vuelve a IDLE al cerrarse', () => {
    const world = makeStormWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.bossCounter = STORM_PATTERN_SPIRAL;
    boss.bossTelegraphKind = STORM_TELEGRAPH_KIND[STORM_PATTERN_SPIRAL];
    boss.bossStage = STORM_STAGE_TELEGRAPH;
    boss.bossTimer = STORM_TELEGRAPH_DURATION_BY_PHASE[0];
    boss.bossTelegraphUntil = world.time + STORM_TELEGRAPH_DURATION_BY_PHASE[0];

    let vulnerableOutsideReload = false;
    let sawReloadVulnerable = false;
    let returnedToIdleNotVulnerable = false;
    for (let i = 0; i < 500; i++) {
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;
      if (boss.bossStage !== STORM_STAGE_RELOAD && boss.bossVulnerable) vulnerableOutsideReload = true;
      if (boss.bossStage === STORM_STAGE_RELOAD && boss.bossVulnerable) sawReloadVulnerable = true;
      if (sawReloadVulnerable && boss.bossStage === STORM_STAGE_IDLE && !boss.bossVulnerable) {
        returnedToIdleNotVulnerable = true;
        break;
      }
    }
    expect(vulnerableOutsideReload).toBe(false);
    expect(sawReloadVulnerable).toBe(true);
    expect(returnedToIdleNotVulnerable).toBe(true);
  });
});

describe('La Tormenta: recarga más corta en fase 2 (GDD §15.5 "recarga−")', () => {
  it('la duración de la recarga en fase 2 es menor que en fase 1', () => {
    function reloadDurationForPhase(phase: 1 | 2): number {
      const world = makeStormWorld();
      const events = createEventQueue(64);
      const boss = world.enemies[0];
      // `stepBosses` recalcula bossPhase de hp/maxHp cada tick (checkPhaseAndDefeat):
      // hay que bajar el hp de verdad, no basta con fijar el campo a mano.
      boss.hp = phase >= 2 ? Math.floor(boss.maxHp * 0.6) : boss.maxHp;
      boss.bossPhase = phase;
      boss.bossCounter = STORM_PATTERN_BURST; // instantánea: entra en recarga en el tick siguiente
      boss.bossTelegraphKind = STORM_TELEGRAPH_KIND[STORM_PATTERN_BURST];
      boss.bossStage = STORM_STAGE_TELEGRAPH;
      boss.bossTimer = 0;
      boss.bossTelegraphUntil = world.time;

      advance(world, events, 1); // dispara la ráfaga y entra en RELOAD
      expect(boss.bossStage).toBe(STORM_STAGE_RELOAD);
      const reloadStart = world.time;
      for (let i = 0; i < 200; i++) {
        stepBosses(world, FIXED_DT, events);
        world.time += FIXED_DT;
        if (boss.bossStage !== STORM_STAGE_RELOAD) return world.time - reloadStart;
      }
      throw new Error('la recarga nunca terminó en la ventana de la prueba');
    }

    const phase1 = reloadDurationForPhase(1);
    const phase2 = reloadDurationForPhase(2);
    expect(phase1).toBeCloseTo(STORM_RELOAD_DURATION_BY_PHASE[0], 1);
    expect(phase2).toBeCloseTo(STORM_RELOAD_DURATION_BY_PHASE[1], 1);
    expect(phase2).toBeLessThan(phase1);
  });
});

describe('La Tormenta: fase 3 encadena espiral→anillos sin recarga intermedia (GDD §15.5)', () => {
  it('tras terminar la espiral en fase 3, sigue en EXECUTE con anillos, sin pasar por telegraph/recarga entre medias', () => {
    const world = makeStormWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.hp = Math.floor(boss.maxHp * 0.2); // rango de fase 3 (<=33%)
    boss.bossPhase = 3;
    boss.bossCounter = STORM_PATTERN_SPIRAL;
    boss.bossTelegraphKind = STORM_TELEGRAPH_KIND[STORM_PATTERN_SPIRAL];
    boss.bossStage = STORM_STAGE_TELEGRAPH;
    boss.bossTimer = 0;
    boss.bossTelegraphUntil = world.time;
    boss.patrolForward = false;

    advance(world, events, 1); // arranca la espiral
    expect(boss.bossStage).toBe(STORM_STAGE_EXECUTE);
    expect(boss.bossCounter).toBe(STORM_PATTERN_SPIRAL);

    let leftExecuteBeforeChain = false;
    let chainedToRings = false;
    let reachedReloadAfterChain = false;
    for (let i = 0; i < 600; i++) {
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;
      if (!chainedToRings) {
        if (boss.bossCounter === STORM_PATTERN_RINGS) {
          chainedToRings = true;
          expect(boss.bossStage).toBe(STORM_STAGE_EXECUTE); // encadena SIN pasar por recarga/idle/telegraph
          expect(boss.patrolForward).toBe(true); // ya encadenó: no vuelve a hacerlo este ciclo
        } else if (boss.bossStage !== STORM_STAGE_EXECUTE) {
          leftExecuteBeforeChain = true;
        }
      } else if (boss.bossStage === STORM_STAGE_RELOAD) {
        reachedReloadAfterChain = true;
        break;
      }
    }
    expect(leftExecuteBeforeChain).toBe(false);
    expect(chainedToRings).toBe(true);
    expect(reachedReloadAfterChain).toBe(true);
  });
});

describe('La Tormenta: el hueco del anillo ENCADENADO (fase 3) apunta al héroe (tuning post-playtest 2026-07-15)', () => {
  it('al encadenar espiral→anillos, ringGapAngle coincide con el ángulo real del héroe respecto al jefe en ese tick', () => {
    const world = makeStormWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.hp = Math.floor(boss.maxHp * 0.2); // rango de fase 3 (<=33%)
    boss.bossPhase = 3;
    boss.bossCounter = STORM_PATTERN_SPIRAL;
    boss.bossTelegraphKind = STORM_TELEGRAPH_KIND[STORM_PATTERN_SPIRAL];
    boss.bossStage = STORM_STAGE_TELEGRAPH;
    boss.bossTimer = 0;
    boss.bossTelegraphUntil = world.time;
    boss.patrolForward = false;

    advance(world, events, 1); // arranca la espiral
    expect(boss.bossStage).toBe(STORM_STAGE_EXECUTE);

    // Coloca al héroe en una posición no trivial (fuera de cualquier eje) para
    // que la coincidencia no pueda pasar "por casualidad" con un ángulo
    // degenerado (0, π/2, ...).
    world.hero.position.x = -2.4;
    world.hero.position.y = 1.1;

    let chained = false;
    for (let i = 0; i < 600 && !chained; i++) {
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;
      if (boss.bossCounter === STORM_PATTERN_RINGS) {
        chained = true;
        // Mismo ángulo que calcula `stormStepPattern` al encadenar (ver
        // `pattern.ts`): atan2 de la posición del héroe MENOS la del jefe,
        // ambas leídas en este mismo tick (el jefe ya se movió por la deriva
        // ambiental de este tick antes de decidir el encadenado).
        const expectedAngle = Math.atan2(
          world.hero.position.y - boss.position.y,
          world.hero.position.x - boss.position.x,
        );
        const state = stormState(world);
        const delta = Math.abs(
          Math.atan2(Math.sin(state.ringGapAngle - expectedAngle), Math.cos(state.ringGapAngle - expectedAngle)),
        );
        expect(delta).toBeLessThan(1e-6);
      }
    }
    expect(chained).toBe(true);
  });
});

describe('La Tormenta: selección de patrón (GDD §15.5 "nunca el mismo dos veces seguidas")', () => {
  it('el patrón decidido AL ENTRAR en recarga (tuning post-playtest 2026-07-15: se adelantó desde el telegraph para que el aro pueda insinuarlo, ver pattern.ts) nunca repite el anterior, y en varios ciclos aparecen los 3', () => {
    const world = makeStormWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];

    let wasReload = boss.bossStage === STORM_STAGE_RELOAD;
    let previous = -1;
    const decided: number[] = [];
    const sawAllThree = new Set<number>();
    // Deja correr la máquina de estados COMPLETA (idle→telegraph→ejecución→
    // recarga real, sin atajos): la selección ya no pasa por
    // `stormEnterTelegraph` en cada ciclo (solo en el primerísimo, "sin
    // previo"), así que hay que capturarla en el tick exacto en que
    // `bossStage` entra en RELOAD, que es donde `stormEnterReload` la fija.
    // Presupuesto de ticks generoso: en el peor caso (60 ciclos seguidos de
    // espiral/anillos, ~5.55s cada uno en fase 1) hacen falta ~20000 ticks.
    for (let i = 0; i < 30000 && decided.length < 60; i++) {
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;
      const isReload = boss.bossStage === STORM_STAGE_RELOAD;
      if (isReload && !wasReload) {
        if (previous >= 0) expect(boss.bossCounter).not.toBe(previous);
        decided.push(boss.bossCounter);
        sawAllThree.add(boss.bossCounter);
        previous = boss.bossCounter;
      }
      wasReload = isReload;
    }
    expect(decided.length).toBeGreaterThanOrEqual(60);
    expect(sawAllThree.size).toBe(3); // los 3 patrones aparecen en 60+ ciclos
  });
});

describe('La Tormenta: ritmo de patrón (GDD §15.6, recalculado tras subir telegraph/recarga en el tuning post-playtest 2026-07-15)', () => {
  it('el intervalo medio entre telegraphs consecutivos (ciclo completo natural) ronda los ~4.5-5s', () => {
    const world = makeStormWorld();
    const events = createEventQueue(64);
    const telegraphTimes: number[] = [];
    // Presupuesto de ticks subido junto con la duración de ciclo (antes
    // 3000 ticks/12 muestras bastaban con reload~1.2s+telegraph~0.7s; ahora
    // un ciclo de espiral/anillos ronda 5.55s, así que 12 muestras en el
    // peor caso piden ~4000 ticks — 6000 deja margen).
    for (let i = 0; i < 6000 && telegraphTimes.length < 12; i++) {
      const before = world.time;
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;
      drainEvents(events, (e) => {
        if (e.type === 'boss-telegraph') telegraphTimes.push(before);
      });
    }
    expect(telegraphTimes.length).toBeGreaterThanOrEqual(8);
    const intervals: number[] = [];
    for (let i = 1; i < telegraphTimes.length; i++) intervals.push(telegraphTimes[i] - telegraphTimes[i - 1]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    // Ciclo completo (idle+telegraph+ejecución+recarga, fase 1) por patrón:
    // ráfaga (sin ejecución propia) = 0.35+1.0+0+1.8 = 3.15s; espiral/anillos
    // (ejecución ~2.4s) = 0.35+1.0+2.4+1.8 = 5.55s. Con los 3 patrones a
    // frecuencia ~1/3 a la larga (exclusión solo del inmediatamente
    // anterior), la media teórica es (2·5.55+3.15)/3 ≈ 4.75s. Banda ancha a
    // propósito (mezcla aleatoria de patrones + tamaño de muestra finito).
    expect(avg).toBeGreaterThan(3.2);
    expect(avg).toBeLessThan(6.2);
  });
});

describe('La Tormenta: daño gateado por la ventana de recarga (damageOutsideWindow=0.2, tuning post-playtest 2026-07-15)', () => {
  it('fuera de la ventana SIEMPRE entra el 20% del golpe (cualquier arma, sin puzzle de color), nunca 0', () => {
    const world = makeStormWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    const hpBefore = boss.hp;

    boss.bossVulnerable = false;
    applyDamageToEnemy(world, boss, 5, 0, 0, events, false, 'ram');
    expect(boss.hp).toBeCloseTo(hpBefore - 5 * STORM_DAMAGE_OUTSIDE_WINDOW);
    expect(boss.hp).toBeCloseTo(hpBefore - 1);
    expect(boss.hp).toBeLessThan(hpBefore); // no inmune: David pidió que "siempre hagan daño"
  });

  it('arma diminuta (D=1) fuera de ventana baja HP fraccionario (>0), no se redondea a 0 → no parece inmune', () => {
    const world = makeStormWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    const hpBefore = boss.hp;

    boss.bossVulnerable = false;
    applyDamageToEnemy(world, boss, 1, 0, 0, events, false, 'spell');
    expect(boss.hp).toBeCloseTo(hpBefore - 0.2);
    expect(boss.hp).toBeLessThan(hpBefore);
  });

  it('dentro de la ventana entra el golpe COMPLETO (más que fuera de ventana), cualquier arma', () => {
    const world = makeStormWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    const hpBefore = boss.hp;

    boss.bossVulnerable = true;
    applyDamageToEnemy(world, boss, 5, 0, 0, events, false, 'ram');
    expect(boss.hp).toBe(hpBefore - 5); // completo
    applyDamageToEnemy(world, boss, 5, 0, 0, events, false, 'arrow');
    expect(boss.hp).toBe(hpBefore - 10);
    applyDamageToEnemy(world, boss, 5, 0, 0, events, false, 'spell');
    expect(boss.hp).toBe(hpBefore - 15);
    expect(5).toBeGreaterThan(5 * STORM_DAMAGE_OUTSIDE_WINDOW); // más que fuera de ventana
  });
});

describe('src/game/features/dungeon/levels/boss-storm.json', () => {
  it('valida contra room-format.ts (GDD §13) y referencia el jefe "storm"', () => {
    const result = parseRoomData(bossStormJson);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.room?.boss).toBe('storm');
    expect(result.room?.tags).toContain('jefe');
  });

  it('arena completamente despejada: sin rocas, fosos ni ningún otro hazard (GDD §15.5)', () => {
    const result = parseRoomData(bossStormJson);
    expect(result.room?.hazards).toEqual([]);
  });

  it('sala 13×13 (coincide con el presupuesto de pasillo de storm/constants.ts::STORM_ARENA_CORNER_RADIUS)', () => {
    const result = parseRoomData(bossStormJson);
    expect(result.room?.width).toBe(13);
    expect(result.room?.height).toBe(13);
  });

  it('tiene puertas en los 4 lados, como el resto de salas de jefe', () => {
    const result = parseRoomData(bossStormJson);
    const sides = result.room!.doorSlots.map((d) => d.side).sort();
    expect(sides).toEqual(['east', 'north', 'south', 'west']);
  });
});
