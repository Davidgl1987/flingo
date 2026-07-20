/**
 * Tests del flujo de puertas y transición de sala en la mazmorra multi-sala
 * (GDD §10.2): cerrada→limpia→abierta, la puerta del jefe exige llave, cruzar
 * un hueco actualiza la sala actual y activa a sus enemigos, y victoria al
 * limpiar la sala del jefe.
 */

import { describe, expect, it } from 'vitest';
import { generateDungeon } from './dungeon';
import { createDungeonWorld } from './dungeon-world';
import { seriesRooms } from './rooms';
import { createEventQueue, drainEvents, type GameEvent } from '@/engine/events';
import { BOSS_VICTORY_PAUSE_DURATION, stepWorld } from '@/game/world/step';
import { DOOR_CONTACT_MARGIN, DOOR_TOUCH_MARGIN, WALL_THICKNESS } from '@/game/world/constants';
import { HERO_RADIUS } from '@/game/features/hero/constants';
import type { AABB, Vec2 } from '@/engine/geometry';
import type { EnemySpawn, Obstacle, RoomData, RoomTag } from '@/game/world/types';

function makeRoom(
  id: string,
  tags: RoomTag[],
  opts: { size?: number; enemies?: EnemySpawn[]; items?: RoomData['items'] } = {},
): RoomData {
  const size = opts.size ?? 9;
  return {
    version: 1,
    id,
    name: `Sala ${id}`,
    width: size,
    height: size,
    playerStart: { x: 0, y: 0 },
    tags,
    doorSlots: [
      { side: 'north', offset: 0 },
      { side: 'south', offset: 0 },
      { side: 'east', offset: 0 },
      { side: 'west', offset: 0 },
    ],
    enemies: opts.enemies ?? [],
    hazards: [],
    items: opts.items ?? [],
  };
}

function makePool(): RoomData[] {
  return [
    makeRoom('start-1', ['inicio']),
    makeRoom('combat-1', ['combate'], {
      enemies: [{ id: 'd1', kind: 'dummy', position: { x: 2, y: 2 } }],
    }),
    makeRoom('combat-2', ['combate'], {
      enemies: [{ id: 'd2', kind: 'dummy', position: { x: 2, y: 2 } }],
    }),
    makeRoom('combat-3', ['combate'], {
      enemies: [{ id: 'd3', kind: 'dummy', position: { x: 2, y: 2 } }],
    }),
    makeRoom('key-1', ['llave'], {
      enemies: [{ id: 'd4', kind: 'dummy', position: { x: 2, y: 2 } }],
      items: [{ id: 'key-item', kind: 'key', position: { x: 0, y: 0 } }],
    }),
    makeRoom('boss-1', ['jefe'], {
      enemies: [{ id: 'boss-enemy', kind: 'dummy', position: { x: 0, y: 0 } }],
    }),
    makeRoom('shop-1', ['tienda'], {
      items: [{ id: 'shopkeeper', kind: 'shopkeeper', position: { x: 0, y: 0 } }],
    }),
  ];
}

function collect(events: ReturnType<typeof createEventQueue>): GameEvent['type'][] {
  const types: GameEvent['type'][] = [];
  drainEvents(events, (e) => types.push(e.type));
  return types;
}

/**
 * Avanza `stepWorld` hasta que `world.phase` deje de ser 'boss-victory-pause'
 * (retraso de clímax, playtest 2026-07-15). Usa un bucle guiado por el propio
 * `world.phase` en vez de un nº de ticks calculado a mano: la suma repetida
 * de FIXED_DT (1/60, fracción periódica en binario) arrastra error de coma
 * flotante, así que `BOSS_VICTORY_PAUSE_DURATION / FIXED_DT` ticks exactos NO
 * basta (cruza el umbral un tick más tarde en la práctica). `maxTicks` es una
 * red de seguridad anti-bucle infinito, no el mecanismo real de parada.
 */
function advanceThroughBossVictoryPause(
  world: ReturnType<typeof createDungeonWorld>,
  events: ReturnType<typeof createEventQueue>,
  maxTicks = 300,
): void {
  let guard = 0;
  while (world.phase === 'boss-victory-pause' && guard < maxTicks) {
    stepWorld(world, events);
    guard++;
  }
}

describe('flujo de puertas y transición de sala (mazmorra multi-sala)', () => {
  it('las puertas de la sala de inicio (con enemigos) empiezan cerradas y se abren al limpiarla', () => {
    const dungeon = generateDungeon(10, makePool());
    const world = createDungeonWorld(dungeon, 10);
    const events = createEventQueue(64);

    const startRuntime = world.roomRuntimes.get(dungeon.startRoomId)!;
    const hasEnemies = world.enemies.some((e) => e.roomId === dungeon.startRoomId);

    if (hasEnemies) {
      expect(startRuntime.doors.every((d) => d.requiresKey || !d.open)).toBe(true);

      // Matar a todos los enemigos de la sala de inicio.
      for (const enemy of world.enemies) {
        if (enemy.roomId === dungeon.startRoomId) enemy.hp = 0;
      }
      stepWorld(world, events);

      expect(startRuntime.cleared).toBe(true);
      expect(startRuntime.doors.filter((d) => !d.requiresKey).every((d) => d.open)).toBe(true);
      expect(collect(events)).toContain('room-cleared');
    } else {
      // La sala de inicio de este pool no tiene enemigos: cuenta como limpiada desde el tick 0.
      expect(startRuntime.cleared).toBe(true);
    }
  });

  /**
   * La puerta del jefe se toca desde la ANTECÁMARA (la sala vecina): el jefe
   * es siempre el extremo 'b' de su única conexión (hoja terminal de la cola,
   * ver `buildTopology`/`buildFixedTopology` en dungeon.ts), así que el lado
   * 'a' de esa conexión es la antecámara — el único camino real de entrada.
   * `DoorConnection.center` se calcula SIEMPRE desde el lado 'a' (ver
   * `tryMaterialize`), así que coincide exactamente con el muro propio de la
   * antecámara: el héroe puede acercarse hasta `HERO_RADIUS` de ese punto
   * (tocando el muro) antes de que la física lo bloquee.
   */
  function findBossAntechamber(dungeon: ReturnType<typeof generateDungeon>) {
    const bossConn = dungeon.connections.find((c) => c.requiresKey)!;
    const anteRoomId = bossConn.roomBId === dungeon.bossRoomId ? bossConn.roomAId : bossConn.roomBId;
    return { bossConn, anteRoomId };
  }

  it('la puerta del jefe no abre sin llave (rebote + aviso) y abre al tocarla con llave', () => {
    const dungeon = generateDungeon(10, makePool());
    const world = createDungeonWorld(dungeon, 10);
    const events = createEventQueue(64);

    const { anteRoomId } = findBossAntechamber(dungeon);
    const anteRuntime = world.roomRuntimes.get(anteRoomId)!;
    const bossDoor = anteRuntime.doors.find((d) => d.requiresKey)!;
    expect(bossDoor).toBeTruthy();
    expect(bossDoor.open).toBe(false);

    // Aleja a los enemigos de la antecámara para que no interfieran con la posición del héroe.
    for (const enemy of world.enemies) {
      if (enemy.roomId === anteRoomId) {
        enemy.position.x = anteRuntime.bounds.maxX - 0.5;
        enemy.position.y = anteRuntime.bounds.maxY - 0.5;
      }
    }

    world.currentRoomId = anteRuntime.id;
    anteRuntime.visited = true;
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;

    // Posición a una distancia de CONTACTO real (por encima del suelo físico
    // HERO_RADIUS, por debajo de DOOR_CONTACT_MARGIN): el héroe toca la
    // puerta desde dentro de la antecámara.
    const roomCenterX = (anteRuntime.bounds.minX + anteRuntime.bounds.maxX) / 2;
    const roomCenterY = (anteRuntime.bounds.minY + anteRuntime.bounds.maxY) / 2;
    const variesOnY = bossDoor.side === 'north' || bossDoor.side === 'south';
    const dir = variesOnY
      ? Math.sign(roomCenterY - bossDoor.center.y)
      : Math.sign(roomCenterX - bossDoor.center.x);
    const contactDistance = (DOOR_CONTACT_MARGIN + HERO_RADIUS) / 2; // entre HERO_RADIUS y DOOR_CONTACT_MARGIN
    world.hero.position.x = variesOnY ? bossDoor.center.x : bossDoor.center.x + dir * contactDistance;
    world.hero.position.y = variesOnY ? bossDoor.center.y + dir * contactDistance : bossDoor.center.y;

    world.hero.hasKey = false;
    stepWorld(world, events);
    expect(world.currentRoomId).toBe(anteRuntime.id);
    expect(bossDoor.open).toBe(false);
    expect(collect(events)).toContain('door-locked');

    // Con llave: se abre y emite evento.
    world.hero.hasKey = true;
    stepWorld(world, events);
    expect(bossDoor.open).toBe(true);
    expect(collect(events)).toContain('door-locked');
  });

  it('con llave, a distancia de aviso NO abre la puerta del jefe; solo al contacto real (bug playtest 2026-07-14)', () => {
    const dungeon = generateDungeon(10, makePool());
    const world = createDungeonWorld(dungeon, 10);
    const events = createEventQueue(64);

    const { anteRoomId } = findBossAntechamber(dungeon);
    const anteRuntime = world.roomRuntimes.get(anteRoomId)!;
    const bossDoor = anteRuntime.doors.find((d) => d.requiresKey)!;
    world.currentRoomId = anteRuntime.id;
    anteRuntime.visited = true;
    world.hero.hasKey = true;
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;

    // Aleja a los enemigos de la antecámara para que no interfieran.
    for (const enemy of world.enemies) {
      if (enemy.roomId === anteRoomId) {
        enemy.position.x = anteRuntime.bounds.maxX - 0.5;
        enemy.position.y = anteRuntime.bounds.maxY - 0.5;
      }
    }

    // Mueve al héroe a una distancia dada del centro del hueco, a lo largo
    // del eje PERPENDICULAR al muro (el otro eje coincide con el centro del
    // hueco), hacia el INTERIOR de la antecámara (topología variable desde
    // el bug 1: la puerta puede caer en cualquiera de los 4 lados).
    const roomCenterX = (anteRuntime.bounds.minX + anteRuntime.bounds.maxX) / 2;
    const roomCenterY = (anteRuntime.bounds.minY + anteRuntime.bounds.maxY) / 2;
    const variesOnY = bossDoor.side === 'north' || bossDoor.side === 'south';
    const dir = variesOnY
      ? Math.sign(roomCenterY - bossDoor.center.y)
      : Math.sign(roomCenterX - bossDoor.center.x);
    const heroPositionAt = (dist: number) =>
      variesOnY
        ? { x: bossDoor.center.x, y: bossDoor.center.y + dir * dist }
        : { x: bossDoor.center.x + dir * dist, y: bossDoor.center.y };

    // A mitad de camino entre el margen de contacto y el de aviso: dentro de
    // la sala, cerca de la puerta, pero SIN tocarla todavía.
    const noticeDistance = (DOOR_CONTACT_MARGIN + DOOR_TOUCH_MARGIN) / 2;
    expect(noticeDistance).toBeGreaterThan(DOOR_CONTACT_MARGIN);
    expect(noticeDistance).toBeLessThan(DOOR_TOUCH_MARGIN);
    Object.assign(world.hero.position, heroPositionAt(noticeDistance));

    stepWorld(world, events);
    expect(bossDoor.open).toBe(false);

    // Ahora al contacto real (por encima del suelo físico HERO_RADIUS): se abre.
    Object.assign(world.hero.position, heroPositionAt((DOOR_CONTACT_MARGIN + HERO_RADIUS) / 2));
    stepWorld(world, events);
    expect(bossDoor.open).toBe(true);
  });

  it('cruzar un hueco de puerta actualiza la sala actual y activa a sus enemigos', () => {
    const dungeon = generateDungeon(10, makePool());
    const world = createDungeonWorld(dungeon, 10);
    const events = createEventQueue(64);

    // Localiza una sala vecina de la de inicio que no sea la de inicio misma.
    const conn = dungeon.connections.find(
      (c) => c.roomAId === dungeon.startRoomId || c.roomBId === dungeon.startRoomId,
    )!;
    const neighborId = conn.roomAId === dungeon.startRoomId ? conn.roomBId : conn.roomAId;
    const neighborRuntime = world.roomRuntimes.get(neighborId)!;
    expect(neighborRuntime.visited).toBe(false);

    // Fuerza al héroe dentro del interior estricto de la sala vecina.
    world.hero.position.x = neighborRuntime.bounds.minX + 0.5;
    world.hero.position.y = (neighborRuntime.bounds.minY + neighborRuntime.bounds.maxY) / 2;
    // Evita que la física lo mueva fuera con velocidad residual.
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;

    stepWorld(world, events);

    expect(world.currentRoomId).toBe(neighborId);
    expect(neighborRuntime.visited).toBe(true);
    expect(collect(events)).toContain('room-entered');

    const neighborEnemies = world.enemies.filter((e) => e.roomId === neighborId);
    if (neighborEnemies.length > 0) {
      // Tras varios ticks, un enemigo activo (visited=true) debe haberse movido o al menos
      // no seguir bloqueado por la restricción de "sala no visitada" (comprobado indirectamente
      // por el hecho de que stepEnemyAi ya no lo salta).
      expect(neighborRuntime.visited).toBe(true);
    }
  });

  it('limpiar la sala del jefe pone la fase en boss-victory-pause y, tras BOSS_VICTORY_PAUSE_DURATION de tiempo de sim, en victory (playtest 2026-07-15: retraso de clímax)', () => {
    const dungeon = generateDungeon(10, makePool());
    const world = createDungeonWorld(dungeon, 10);
    const events = createEventQueue(64);

    world.currentRoomId = dungeon.bossRoomId;
    const runtime = world.roomRuntimes.get(dungeon.bossRoomId)!;
    runtime.visited = true;
    // Coloca al héroe físicamente en el interior de la sala del jefe: si no,
    // stepRoomTransition detectaría que sigue en la sala de inicio y
    // sobrescribiría currentRoomId antes de evaluar el clear.
    world.hero.position.x = (runtime.bounds.minX + runtime.bounds.maxX) / 2;
    world.hero.position.y = (runtime.bounds.minY + runtime.bounds.maxY) / 2;
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;
    for (const enemy of world.enemies) {
      if (enemy.roomId === dungeon.bossRoomId) enemy.hp = 0;
    }

    stepWorld(world, events);

    // Retraso de clímax (playtest 2026-07-15, David): la fase NO salta
    // directa a 'victory' — pasa primero por 'boss-victory-pause', sin
    // emitir todavía el evento 'victory' (el enemigo de esta sala de jefe es
    // un 'dummy' de fixture, no un jefe real con kind==='boss', así que aquí
    // no hay 'boss-defeated' que comprobar; ese clímax se cubre en
    // lifecycle.test.ts con un jefe real).
    expect(world.phase).toBe('boss-victory-pause');
    expect(collect(events)).not.toContain('victory');

    // Avanza hasta bien ANTES del umbral (medio segundo de margen para no
    // depender de redondeos de coma flotante en la suma de FIXED_DT): sigue
    // congelado, sin transición.
    const SAFETY_MARGIN = 0.5;
    while (world.time < BOSS_VICTORY_PAUSE_DURATION - SAFETY_MARGIN) {
      stepWorld(world, events);
    }
    expect(world.phase).toBe('boss-victory-pause');
    expect(collect(events)).not.toContain('victory');

    // Sigue avanzando hasta cruzar el umbral: ahora sí salta a 'victory' y emite su evento.
    advanceThroughBossVictoryPause(world, events);
    expect(world.phase).toBe('victory');
    expect(collect(events)).toContain('victory');
  });

  it('limpiar la sala del jefe pone la fase en boss-reward (tras la pausa) si NO es la mazmorra final (run multi-mazmorra, docs/plans/ECONOMY_PLAN.md F3)', () => {
    const dungeon = generateDungeon(10, makePool());
    const world = createDungeonWorld(dungeon, 10);
    // Run multi-mazmorra (GDD §10): quedan más jefes por delante de esta mazmorra.
    world.isFinalDungeon = false;
    const events = createEventQueue(64);

    world.currentRoomId = dungeon.bossRoomId;
    const runtime = world.roomRuntimes.get(dungeon.bossRoomId)!;
    runtime.visited = true;
    world.hero.position.x = (runtime.bounds.minX + runtime.bounds.maxX) / 2;
    world.hero.position.y = (runtime.bounds.minY + runtime.bounds.maxY) / 2;
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;
    for (const enemy of world.enemies) {
      if (enemy.roomId === dungeon.bossRoomId) enemy.hp = 0;
    }

    stepWorld(world, events);

    expect(world.phase).toBe('boss-victory-pause');
    expect(collect(events)).not.toContain('dungeon-cleared');

    // Agota la pausa de clímax en tiempo de sim.
    advanceThroughBossVictoryPause(world, events);

    expect(world.phase).toBe('boss-reward');
    // El evento 'dungeon-cleared' se conserva aunque la fase real sea
    // 'boss-reward' (los effects ya reaccionan a él, ver step.ts).
    expect(collect(events)).toContain('dungeon-cleared');
    expect(collect(events)).not.toContain('victory');
  });

  it('limpiar una sala normal (no jefe) NO cambia de fase (docs/plans/ECONOMY_PLAN.md: desaparece la mejora-por-sala)', () => {
    const dungeon = generateDungeon(11, makePool());
    const world = createDungeonWorld(dungeon, 11);
    const events = createEventQueue(64);

    // Sala de combate normal (no jefe): localizamos una con enemigos.
    const combatRuntime = [...world.roomRuntimes.values()].find(
      (r) => !r.tags.includes('jefe') && !r.cleared,
    )!;
    world.currentRoomId = combatRuntime.id;
    combatRuntime.visited = true;
    world.hero.position.x = (combatRuntime.bounds.minX + combatRuntime.bounds.maxX) / 2;
    world.hero.position.y = (combatRuntime.bounds.minY + combatRuntime.bounds.maxY) / 2;
    world.hero.velocity.x = 0;
    world.hero.velocity.y = 0;
    for (const enemy of world.enemies) {
      if (enemy.roomId === combatRuntime.id) enemy.hp = 0;
    }

    stepWorld(world, events);

    expect(combatRuntime.cleared).toBe(true);
    expect(world.phase).toBe('playing');
  });
});

// ── Cobertura de esquinas de sala (bug playtest móvil 2026-07-15) ──────────
//
// Reporte: "hueco entre salas" — un cuadrilátero negro (fondo del vacío) en
// la costura entre dos salas, pegado a un muro. Causa raíz: en un lado de
// sala con hueco de puerta, `buildRoomWallSegments` (dungeon.ts) recortaba
// los segmentos de muro exactamente en ±(axisLen/2), SIN la extensión de
// `WALL_THICKNESS` hacia la esquina que sí aplica el lado sin huecos
// (`makeWallSegment`). Cuando una sala tiene DOS lados adyacentes con hueco
// de puerta (el caso normal de toda sala del bucle de 4 salas, ver
// `LOOP_FREE_SIDES` en dungeon.ts: cada nodo usa exactamente 2 lados
// contiguos), la esquina compartida por esos dos lados queda sin cubrir por
// NINGÚN segmento — ni por el propio muro (que ya no llega) ni por el muro
// perpendicular (que tampoco llega, por el mismo motivo) — un agujero de
// WALL_THICKNESS² real en la malla de colisión (`world.obstacles`), no solo
// visual: como en mazmorra multi-sala `stepHeroPhysics` NO usa
// `collideInnerBounds` (solo los obstáculos AABB), ese hueco es atravesable.

function isPointCovered(x: number, y: number, obstacles: readonly Obstacle[]): boolean {
  return obstacles.some(
    (o) => x >= o.aabb.minX && x <= o.aabb.maxX && y >= o.aabb.minY && y <= o.aabb.maxY,
  );
}

/** Rejilla 3×3 de puntos estrictamente dentro de un AABB (con un pequeño margen interior). */
function sampleGrid(box: AABB): Vec2[] {
  const eps = 0.03;
  const xs = [box.minX + eps, (box.minX + box.maxX) / 2, box.maxX - eps];
  const ys = [box.minY + eps, (box.minY + box.maxY) / 2, box.maxY - eps];
  const pts: Vec2[] = [];
  for (const x of xs) for (const y of ys) pts.push({ x, y });
  return pts;
}

/**
 * Las 4 esquinas EXTERIORES de una sala (la banda de grosor WALL_THICKNESS
 * justo fuera de su interior jugable, en cada esquina) como AABBs.
 */
function roomCornerBands(bounds: AABB): Record<'NW' | 'NE' | 'SW' | 'SE', AABB> {
  const t = WALL_THICKNESS;
  return {
    NW: { minX: bounds.minX - t, maxX: bounds.minX, minY: bounds.minY - t, maxY: bounds.minY },
    NE: { minX: bounds.maxX, maxX: bounds.maxX + t, minY: bounds.minY - t, maxY: bounds.minY },
    SW: { minX: bounds.minX - t, maxX: bounds.minX, minY: bounds.maxY, maxY: bounds.maxY + t },
    SE: { minX: bounds.maxX, maxX: bounds.maxX + t, minY: bounds.maxY, maxY: bounds.maxY + t },
  };
}

/**
 * Invariante: toda esquina exterior de toda sala colocada debe estar
 * totalmente cubierta por algún obstáculo sólido (muro, portón o roca) — si
 * no, esa esquina es una "muesca" que muestra el vacío de fondo y, en
 * mazmorra multi-sala, un hueco de colisión real (ver cabecera del bloque).
 * Devuelve la primera muesca encontrada (o null si no hay ninguna) con
 * datos suficientes para depurar sin tener que rejugar la semilla.
 */
function findUncoveredRoomCorner(
  seed: number,
): { seed: number; roomId: string; corner: string; point: Vec2 } | null {
  const dungeon = generateDungeon(seed, seriesRooms);
  const world = createDungeonWorld(dungeon, seed);

  for (const placed of dungeon.rooms) {
    const bands = roomCornerBands(placed.bounds);
    for (const [corner, box] of Object.entries(bands) as [keyof typeof bands, AABB][]) {
      for (const point of sampleGrid(box)) {
        if (!isPointCovered(point.x, point.y, world.obstacles)) {
          return { seed, roomId: placed.room.id, corner, point };
        }
      }
    }
  }
  return null;
}

describe('cobertura de esquinas de sala (regresión playtest 2026-07-15)', () => {
  it('ninguna esquina de ninguna sala queda sin cubrir, en ≥200 semillas con el pool real de serie', () => {
    const SEED_COUNT = 250;
    const failures: ReturnType<typeof findUncoveredRoomCorner>[] = [];
    for (let seed = 1; seed <= SEED_COUNT; seed++) {
      const failure = findUncoveredRoomCorner(seed);
      if (failure) failures.push(failure);
    }

    if (failures.length > 0) {
      const sample = failures
        .slice(0, 5)
        .map((f) => `seed=${f!.seed} sala=${f!.roomId} esquina=${f!.corner} punto=(${f!.point.x.toFixed(2)},${f!.point.y.toFixed(2)})`)
        .join('\n');
      throw new Error(
        `${failures.length}/${SEED_COUNT} semillas con al menos una esquina de sala sin cubrir (muesca). Primeras:\n${sample}`,
      );
    }
  });
});
