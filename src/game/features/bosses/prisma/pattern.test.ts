/**
 * Tests de El Prisma (GDD §15.4, Fase B3 de docs/plans/BOSSES_PLAN.md):
 * rotación de color (con telegraph de cambio y aceleración por fase), ataque
 * temático por modo (embestida/ráfaga de dardos/arcos con rebote) y solape de
 * 2 colores en fase 3. SIN ventana de vulnerabilidad (tuning post-playtest
 * 2026-07-17): `bossVulnerable` es permanentemente `true`, así que el ÚNICO
 * filtro de daño es el gate de color. El gate en sí (`applyDamageToEnemy`) se
 * testea en `features/combat/combat.test.ts`; aquí se valida que el propio
 * patrón del Prisma lo alimenta correctamente (`bossWeaponGateA/B`) y que
 * `bossVulnerable` nunca vuelve a apagarse. También valida
 * `src/game/features/dungeon/levels/boss-prisma.json` contra room-format.ts.
 */

import { describe, expect, it } from 'vitest';
import bossPrismaJson from '@/game/features/dungeon/levels/boss-prisma.json';
import { stepProjectiles } from '@/game/features/combat/combat';
import { createEventQueue } from '@/engine/events';
import { parseRoomData } from '@/game/features/dungeon/room-format';
import type { EnemySpawn, HazardSpawn, RoomData, RoomTag } from '@/game/world/types';
import { createWorld } from '@/game/world/create';
import { initBossEnemies, stepBosses } from '@/game/features/bosses/lifecycle';
import { getBossDef } from '@/game/features/bosses/registry';
import { collectTypes } from '@/game/features/bosses/test-helpers';
import { prismaOnPhaseChanged } from './pattern';
import {
  PRISMA_ARROW_BURST_COUNT,
  PRISMA_ARROW_CADENCE,
  PRISMA_COLOR_ARROW,
  PRISMA_COLOR_RAM,
  PRISMA_COLOR_SPELL,
  PRISMA_COLOR_TELEGRAPH_LEAD,
  PRISMA_COLOR_WEAPON,
  PRISMA_DAMAGE_OUTSIDE_WINDOW,
  PRISMA_MAX_HP,
  PRISMA_MODE_DURATION_PHASE1,
  PRISMA_MODE_DURATION_PHASE2,
  PRISMA_MODE_DURATION_PHASE3,
  PRISMA_PHASE2_CADENCE_MULTIPLIER,
  PRISMA_PHASE3_OVERLAP_DURATION,
  PRISMA_RADIUS,
  PRISMA_SPELL_ARC_COUNT,
  PRISMA_SPELL_BOUNCES,
} from './constants';

const FIXED_DT = 1 / 60;

function makeRoom(partial: Partial<RoomData> = {}): RoomData {
  return {
    version: 1,
    id: 'prisma-room',
    name: 'Sala del Prisma',
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

function makePrismaWorld(
  opts: { bossSpawn?: Partial<EnemySpawn>; hazards?: HazardSpawn[]; room?: Partial<RoomData> } = {},
) {
  const spawn: EnemySpawn = {
    id: 'boss-1',
    kind: 'boss',
    bossId: 'prisma',
    position: { x: 0, y: 0 },
    ...opts.bossSpawn,
  };
  const world = createWorld(makeRoom({ enemies: [spawn], hazards: opts.hazards ?? [], ...opts.room }));
  initBossEnemies(world);
  return world;
}

/** Avanza N ticks llamando solo a stepBosses (igual patrón que guardian/pattern.test.ts). */
function advance(world: ReturnType<typeof createWorld>, events: ReturnType<typeof createEventQueue>, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    stepBosses(world, FIXED_DT, events);
    world.time += FIXED_DT;
  }
}

describe('El Prisma: definición', () => {
  it('tiene 45 HP y techo de daño 60/65/70% por fase (GDD §15.6)', () => {
    const def = getBossDef('prisma');
    expect(def.maxHp).toBe(PRISMA_MAX_HP);
    expect(def.maxHp).toBe(45);
    expect(def.hitDamageCapFraction).toEqual([0.6, 0.65, 0.7]);
    expect(def.damageOutsideWindow).toBe(PRISMA_DAMAGE_OUTSIDE_WINDOW);
  });
});

describe('Prisma: radio real de jefe (regresión, mismo patrón que Guardián/Reina)', () => {
  it('initBossEnemies aplica PRISMA_RADIUS', () => {
    const world = makePrismaWorld();
    expect(world.enemies[0].radius).toBeCloseTo(PRISMA_RADIUS, 6);
  });
});

describe('El Prisma: color inicial (GDD §15.4 "arranca aleatorio")', () => {
  it('onInit fija bossWeaponGateA a uno de los 3 colores, coherente con bossCounter', () => {
    const world = makePrismaWorld();
    const boss = world.enemies[0];
    expect(PRISMA_COLOR_WEAPON).toContain(boss.bossWeaponGateA);
    expect(boss.bossWeaponGateA).toBe(PRISMA_COLOR_WEAPON[boss.bossCounter]);
    expect(boss.bossWeaponGateB).toBe('');
  });
});

describe('El Prisma: sin ventana de vulnerabilidad (tuning post-playtest 2026-07-17)', () => {
  it('bossVulnerable arranca en true (onInit) y se mantiene true a lo largo de muchos ticks/ciclos', () => {
    const world = makePrismaWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    expect(boss.bossVulnerable).toBe(true);

    // Deja correr la máquina de estados completa (varios ciclos de
    // color/ataque): bossVulnerable no debe apagarse NUNCA, a diferencia del
    // resto de jefes (Guardián/Reina/Tormenta), que sí alternan.
    for (let i = 0; i < 3000; i++) {
      stepBosses(world, FIXED_DT, events);
      world.time += FIXED_DT;
      expect(boss.bossVulnerable).toBe(true);
    }
  });
});

describe('El Prisma: rotación de color azul→amarillo→violeta→azul (GDD §15.4)', () => {
  it('bossCounter cicla 0→1→2→0 al forzar la rotación', () => {
    const world = makePrismaWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.bossCounter = PRISMA_COLOR_RAM;
    boss.bossStage = 0; // IDLE
    boss.bossTimer = 1000; // ningún ataque interfiere durante la prueba

    boss.patrolFrom.x = world.time - 0.001; // ya vencido: rota en el próximo tick
    advance(world, events, 1);
    expect(boss.bossCounter).toBe(PRISMA_COLOR_ARROW);

    boss.patrolFrom.x = world.time - 0.001;
    advance(world, events, 1);
    expect(boss.bossCounter).toBe(PRISMA_COLOR_SPELL);

    boss.patrolFrom.x = world.time - 0.001;
    advance(world, events, 1);
    expect(boss.bossCounter).toBe(PRISMA_COLOR_RAM);
  });

  it('cada modo dura ~PRISMA_MODE_DURATION_PHASE1 (6s) en fase 1', () => {
    const world = makePrismaWorld();
    const boss = world.enemies[0];
    expect(boss.patrolFrom.x - world.time).toBeCloseTo(PRISMA_MODE_DURATION_PHASE1, 6);
  });

  it('telegraph de cambio de color: armado dentro de los últimos 1.5s, no antes (GDD §15.4)', () => {
    const world = makePrismaWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.bossStage = 0;
    boss.bossTimer = 1000; // ningún ataque interfiere
    boss.patrolFrom.x = world.time + 2.0;

    advance(world, events, 20); // 0.333s: quedan ~1.667s > 1.5s, aún no telegrafía
    expect(boss.bossTelegraphKind).toBe('');

    advance(world, events, 20); // ~0.667s totales: quedan ~1.333s <= 1.5s, ya telegrafía
    expect(boss.bossTelegraphKind.startsWith('color-change:')).toBe(true);
    const remaining = boss.bossTelegraphUntil - world.time;
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(PRISMA_COLOR_TELEGRAPH_LEAD + 1e-6);

    // La etiqueta nombra el color SIGUIENTE de la rotación fija.
    const nextWeapon = boss.bossTelegraphKind.slice('color-change:'.length);
    expect(nextWeapon).toBe(PRISMA_COLOR_WEAPON[(boss.bossCounter + 1) % 3]);
  });

  it('fase 2 acelera el modo a ~4.5s y fase 3 a ~4s (GDD §15.6)', () => {
    expect(PRISMA_MODE_DURATION_PHASE2).toBeLessThan(PRISMA_MODE_DURATION_PHASE1);
    expect(PRISMA_MODE_DURATION_PHASE2).toBeCloseTo(4.5, 6);
    expect(PRISMA_MODE_DURATION_PHASE3).toBeLessThan(PRISMA_MODE_DURATION_PHASE2);
    expect(PRISMA_MODE_DURATION_PHASE3).toBeCloseTo(4, 6);

    const world = makePrismaWorld();
    const boss = world.enemies[0];
    boss.bossStage = 0; // onPhaseChanged solo reajusta si está IDLE

    prismaOnPhaseChanged(world, boss, 2);
    expect(boss.patrolFrom.x - world.time).toBeCloseTo(PRISMA_MODE_DURATION_PHASE2, 6);

    prismaOnPhaseChanged(world, boss, 3);
    expect(boss.patrolFrom.x - world.time).toBeCloseTo(PRISMA_MODE_DURATION_PHASE3, 6);
  });
});

describe('El Prisma: solape de 2 colores en fase 3 (GDD §15.4)', () => {
  it('tras rotar en fase 3, bossWeaponGateB conserva el color anterior ~1.5s y luego se limpia', () => {
    const world = makePrismaWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    // `advance` pasa por `stepBosses` → `checkPhaseAndDefeat` (lifecycle.ts),
    // que RECALCULA `bossPhase` de `hp/maxHp` cada tick: hay que bajar el HP
    // de verdad al rango de fase 3 (≤33%), no basta con fijar el campo.
    boss.hp = Math.floor(boss.maxHp * 0.2);
    boss.bossPhase = 3;
    boss.bossCounter = PRISMA_COLOR_RAM;
    boss.bossStage = 0;
    boss.bossTimer = 1000;
    boss.patrolFrom.x = world.time - 0.001; // rota en el próximo tick

    advance(world, events, 1); // rota: ram(0) → arrow(1) (el gate de ESTE tick aún refleja el color previo)
    expect(boss.bossCounter).toBe(PRISMA_COLOR_ARROW);

    advance(world, events, 1); // siguiente tick: el gate ya refleja el color activo + el solape
    expect(boss.bossWeaponGateA).toBe('arrow');
    expect(boss.bossWeaponGateB).toBe('ram');

    // Justo antes de agotarse el solape (PRISMA_PHASE3_OVERLAP_DURATION), sigue activo.
    const ticksForOverlap = Math.round(PRISMA_PHASE3_OVERLAP_DURATION / FIXED_DT);
    advance(world, events, ticksForOverlap - 10);
    expect(boss.bossWeaponGateB).toBe('ram');

    // Pasado ese tiempo, se limpia.
    advance(world, events, 20);
    expect(boss.bossWeaponGateB).toBe('');
  });

  it('sin fase 3, nunca hay solape (bossWeaponGateB siempre "")', () => {
    const world = makePrismaWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.hp = Math.floor(boss.maxHp * 0.6); // rango de fase 2 (66-33%), no fase 3
    boss.bossPhase = 2;
    boss.bossStage = 0;
    boss.bossTimer = 1000;
    boss.patrolFrom.x = world.time - 0.001;

    advance(world, events, 2);
    expect(boss.bossPhase).toBe(2);
    expect(boss.bossWeaponGateB).toBe('');
  });
});

describe('El Prisma: Piedra (azul/ram) — embestida corta con telegraph y daño acotado (GDD §15.4)', () => {
  it('telegrafía ≥0.6s, luego embiste hacia el héroe y le hace daño pasado por el techo de jefe', () => {
    const world = makePrismaWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.bossCounter = PRISMA_COLOR_RAM;
    boss.bossWeaponGateA = 'ram';
    boss.bossStage = 0;
    boss.bossTimer = 0; // telegrafía en el próximo tick
    world.hero.maxHp = 3; // techo de daño pequeño: importa de verdad
    world.hero.hp = 3;
    world.hero.position.x = 1;
    world.hero.position.y = 0;
    // Capturado ANTES de que empiece la embestida: a esta distancia (1u) el
    // Prisma solapa al héroe casi en el primer tick de la carga (radios
    // ~0.94u sumados), así que el golpe puede caer dentro del propio
    // `advance` que agota el telegraph — no esperar a un punto intermedio.
    const hpBefore = world.hero.hp;

    advance(world, events, 1);
    expect(boss.bossTelegraphKind).toBe('prisma-ram');
    expect(boss.bossTelegraphUntil - world.time).toBeGreaterThanOrEqual(0.6 - FIXED_DT);
    expect(collectTypes(events)).toContain('boss-telegraph');

    advance(world, events, 40); // agota el telegraph (0.6s) y entra en la embestida
    expect(boss.bossStage).toBe(2); // PRISMA_ATTACK_EXECUTE
    expect(boss.facing.x).toBeGreaterThan(0.9); // encarado hacia el héroe (+x)

    advance(world, events, 30); // agota la embestida (0.45s) y resuelve el impacto
    expect(world.hero.hp).toBe(hpBefore - 1); // cap: min(1, floor(0.6*3)) = 1, un solo golpe por embestida
    expect(collectTypes(events)).toContain('player-damaged');
    // Sin ventana de vulnerabilidad (tuning post-playtest 2026-07-17):
    // bossVulnerable ya era true ANTES del ataque y sigue true después —
    // nunca se apaga, a diferencia del resto de jefes.
    expect(boss.bossVulnerable).toBe(true);

    advance(world, events, 70);
    expect(boss.bossVulnerable).toBe(true);
  });

  it('nunca hace un golpe letal a vida llena (techo de daño de jefe, GDD §15.1 punto 6)', () => {
    const world = makePrismaWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.bossCounter = PRISMA_COLOR_RAM;
    boss.bossWeaponGateA = 'ram';
    boss.bossStage = 0;
    boss.bossTimer = 0;
    world.hero.maxHp = 3;
    world.hero.hp = 3;
    world.hero.position.x = 1;
    world.hero.position.y = 0;

    advance(world, events, 70); // telegraph + embestida completos
    expect(world.hero.hp).toBeGreaterThan(0);
  });
});

describe('El Prisma: Viento (amarillo/arrow) — ráfaga de dardos (GDD §15.4)', () => {
  it('tras el telegraph, dispara PRISMA_ARROW_BURST_COUNT proyectiles kind:"enemy" teñidos de "arrow" y bossVulnerable sigue true', () => {
    const world = makePrismaWorld();
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.bossCounter = PRISMA_COLOR_ARROW;
    boss.bossWeaponGateA = 'arrow';
    boss.bossStage = 0;
    boss.bossTimer = 0;
    world.hero.position.x = 5;
    world.hero.position.y = 0;

    advance(world, events, 1);
    expect(boss.bossTelegraphKind).toBe('prisma-arrow');

    advance(world, events, 40); // agota el telegraph (0.6s) y dispara la ráfaga
    const enemyProjectiles = world.projectiles.filter((p) => p.active && p.kind === 'enemy' && p.owner === 'enemy');
    expect(enemyProjectiles.length).toBe(PRISMA_ARROW_BURST_COUNT);
    expect(enemyProjectiles.length).toBe(3);
    // Proyectiles teñidos del color de su gate activo (GDD §15.4, feedback
    // playtest 2026-07-17: "los ataques de proyectiles de su color").
    expect(enemyProjectiles.every((p) => p.colorTag === 'arrow')).toBe(true);
    expect(boss.bossVulnerable).toBe(true);
  });
});

describe('El Prisma: Sombra (violeta/spell) — arcos lentos que rebotan en muros (GDD §15.4)', () => {
  it('tras el telegraph, dispara PRISMA_SPELL_ARC_COUNT proyectiles con bouncesLeft, y SÍ rebotan al chocar con la pared', () => {
    const world = makePrismaWorld({ room: { width: 9, height: 9 } });
    const events = createEventQueue(64);
    const boss = world.enemies[0];
    boss.bossCounter = PRISMA_COLOR_SPELL;
    boss.bossWeaponGateA = 'spell';
    boss.bossStage = 0;
    boss.bossTimer = 0;
    world.hero.position.x = 3;
    world.hero.position.y = 0;

    advance(world, events, 1);
    expect(boss.bossTelegraphKind).toBe('prisma-spell');

    advance(world, events, 40); // agota el telegraph (0.6s) y dispara los arcos
    const arcs = world.projectiles.filter((p) => p.active && p.kind === 'enemy' && p.bouncesLeft === PRISMA_SPELL_BOUNCES);
    expect(arcs.length).toBe(PRISMA_SPELL_ARC_COUNT);
    expect(arcs.length).toBe(2);
    // Proyectiles teñidos del color de su gate activo (feedback playtest 2026-07-17).
    expect(arcs.every((p) => p.colorTag === 'spell')).toBe(true);
    expect(boss.bossVulnerable).toBe(true);

    // El héroe estaba EN la trayectoria de disparo (necesario para fijar la
    // puntería): lo aparta antes de dejar volar los arcos, si no
    // `stepEnemyProjectileCollision` los consumiría contra el héroe antes de
    // que lleguen a la pared que este test quiere comprobar.
    world.hero.position.x = -100;
    world.hero.position.y = -100;

    let bounced = false;
    for (let i = 0; i < 300 && !bounced; i++) {
      stepProjectiles(world, FIXED_DT, events);
      if (arcs.some((p) => p.active && p.bouncesLeft < PRISMA_SPELL_BOUNCES)) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(arcs.some((p) => p.active)).toBe(true); // rebota, no desaparece
    expect(collectTypes(events)).toContain('wall-bounce');
  });
});

describe('El Prisma: fase 2 densifica los ataques (cadencia ×0.8, GDD §15.4)', () => {
  it('la cadencia tras un ataque en fase 2 es un 80% de la de fase 1', () => {
    function cadenceAfterArrowAttack(phase: 1 | 2 | 3): number {
      const world = makePrismaWorld();
      const events = createEventQueue(64);
      const boss = world.enemies[0];
      // `stepBosses` corre `checkPhaseAndDefeat` (lifecycle.ts) cada tick, que
      // RECALCULA `bossPhase` de `hp/maxHp`: hay que bajar el HP de verdad
      // (fase 2: 66-33%), no basta con fijar el campo a mano.
      boss.hp = phase >= 2 ? Math.floor(boss.maxHp * 0.6) : boss.maxHp;
      boss.bossPhase = phase;
      boss.bossCounter = PRISMA_COLOR_ARROW;
      boss.bossWeaponGateA = 'arrow';
      boss.bossStage = 0;
      boss.bossTimer = 0;
      boss.patrolFrom.x = world.time + 1000; // que no rote durante la prueba

      // Sin ventana de vulnerabilidad que sirva de "marca" de disparo (tuning
      // post-playtest 2026-07-17: bossVulnerable ya no se apaga/enciende): se
      // detecta el instante justo tras disparar por la transición de vuelta a
      // IDLE (bossStage 0), que es donde `prismaFinishAttack` arma la
      // cadencia nueva en `bossTimer`.
      let wasIdle = boss.bossStage === 0 /* PRISMA_ATTACK_IDLE, no exportado */;
      for (let i = 0; i < 100; i++) {
        stepBosses(world, FIXED_DT, events);
        world.time += FIXED_DT;
        const isIdle = boss.bossStage === 0 /* PRISMA_ATTACK_IDLE, no exportado */;
        if (isIdle && !wasIdle) {
          return boss.bossTimer;
        }
        wasIdle = isIdle;
      }
      throw new Error('el Prisma nunca disparó en la ventana de la prueba');
    }

    const phase1Cadence = cadenceAfterArrowAttack(1);
    const phase2Cadence = cadenceAfterArrowAttack(2);
    expect(phase1Cadence).toBeCloseTo(PRISMA_ARROW_CADENCE, 5);
    expect(phase2Cadence).toBeCloseTo(PRISMA_ARROW_CADENCE * PRISMA_PHASE2_CADENCE_MULTIPLIER, 5);
    expect(phase2Cadence).toBeLessThan(phase1Cadence);
  });
});

describe('src/game/features/dungeon/levels/boss-prisma.json', () => {
  it('valida contra room-format.ts (GDD §13) y referencia el jefe "prisma"', () => {
    const result = parseRoomData(bossPrismaJson);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.room?.boss).toBe('prisma');
    expect(result.room?.tags).toContain('jefe');
  });

  it('sala mediana y simétrica, solo un par de rocas y sin más hazards (GDD §15.4)', () => {
    const result = parseRoomData(bossPrismaJson);
    const room = result.room!;
    expect(room.hazards.length).toBe(2);
    expect(room.hazards.every((h) => h.kind === 'rock')).toBe(true);
    const [a, b] = room.hazards;
    expect(a.position.x).toBeCloseTo(-b.position.x, 6);
    expect(a.position.y).toBeCloseTo(b.position.y, 6);
  });

  it('tiene puertas en los 4 lados, como boss-guardian.json/boss-queen.json', () => {
    const result = parseRoomData(bossPrismaJson);
    const sides = result.room!.doorSlots.map((d) => d.side).sort();
    expect(sides).toEqual(['east', 'north', 'south', 'west']);
  });
});
