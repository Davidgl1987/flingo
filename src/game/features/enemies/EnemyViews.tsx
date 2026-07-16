/**
 * Enemigos (GDD §7): un mesh por enemigo (≤10 por sala, el presupuesto lo
 * permite explícitamente). Lee la sim en useFrame; nunca la muta.
 *
 * Flash blanco de golpe: se implementa INTERCAMBIANDO materiales compartidos
 * de assets.ts (material del arquetipo ↔ enemyHitFlashMaterial) en vez de
 * mutar colores o crear materiales por instancia — cumple estrictamente la
 * regla de "materiales compartidos, creados una vez".
 *
 * Personalidad por arquetipo (punto 11 de playtest): pura composición
 * geométrica + micro-animación de RENDER (nunca toca la sim), silueta/color
 * de contrato del GDD intactos. Cada arquetipo (Dummy/Chaser/Spike/Trail/
 * Shooter) tiene su propio bloque visual extraído a `<kind>/Mesh.tsx`; aquí
 * solo vive lo compartido por TODOS (cuerpo, sombra, flash de golpe,
 * orientación por velocidad) y lo específico de jefe (GDD §15, Fase B0):
 * - Boss (genérico): anillo ámbar mientras `bossTelegraphUntil` está activo
 *   (aviso de ataque), anillo verde mientras `bossVulnerable` (ventana de
 *   castigo) y flash blanco-cálido de cuerpo entero al cambiar de fase
 *   (retrigger por `bossPhase`).
 * - Guardián de Canto (GDD §15.2, Fase B1, `bossId==='guardian'`): sustituye
 *   el cuerpo genérico por uno propio (esfera pétrea grande + 2 "cuernos"
 *   cónicos de hombro, escalados con `enemy.radius` como cualquier jefe),
 *   brillo+vibración durante el telegraph (material ámbar intercambiado +
 *   jitter de posición, más intenso que el aro genérico), y estado aturdido
 *   INCONFUNDIBLE: tambaleo (oscilación de rotación en Z) + 3 estrellitas
 *   doradas orbitando sobre la cabeza — todo con geometrías/materiales
 *   compartidos de assets.ts, encima (no en sustitución) de los anillos
 *   genéricos de telegraph/vulnerabilidad ya heredados.
 * - Guardianas de la Reina (larvas `chasing===false`, GDD §15.3, rediseño
 *   2026-07-10): aviso de embestida sobre `enemy.bossStage` (0=orbita,
 *   1=TELEGRAFÍA, 2=carga) — parpadeo ámbar + hinchazón pulsante durante la
 *   telegrafía, tono rojo intenso y constante mientras carga; el flash de
 *   golpe (hitFlash, ya existente) tiene prioridad y nunca se pisan.
 * - El Prisma (GDD §15.4, Fase B3, `bossId==='prisma'`): el núcleo (mismo
 *   `bodyRef` compartido) MUTA su color al del arma activa
 *   (`enemy.bossWeaponGateA`, mapeado con `WEAPON_COLOR` — el mismo mapeo
 *   instantáneo arma↔color que ya usa la Weapon bar del héroe), en vez de
 *   intercambiar materiales — un único Prisma vivo a la vez, mismo criterio
 *   que `heroMaterial`. Telegraph de cambio de color: "tartamudeo" (parpadeo
 *   rápido alternando el color actual y el siguiente, leído de
 *   `bossTelegraphKind==='color-change:<arma>'`). Solape de fase 3
 *   (`bossWeaponGateB!==''`): alterna los dos colores activos a un ritmo más
 *   calmado. 3 gemas orbitando el núcleo dan silueta propia, distinta de
 *   cuernos/corona.
 * - La Tormenta (GDD §15.5, Fase B4, `bossId==='storm'`; rediseño de telegraph
 *   post-playtest 2026-07-15, David: "que el anillo fuera siempre como el
 *   anillo de Saturno, en horizontal, y que se iluminara por partes... de la
 *   forma en la que van a salir las bolas"): jefe de esquive puro, cuerpo
 *   tormentoso propio (gris-azulado) envuelto en un halo SIEMPRE horizontal
 *   (plano del suelo, nunca inclinado — el toro-arco giratorio anterior se
 *   leía verticalizado en playtest, ver comentario largo en
 *   `stormHaloSegmentGeometry`, assets.ts) compuesto de `STORM_HALO_SEGMENTS`
 *   secciones fijas cuyo COLOR (nunca su rotación) delata, sección por
 *   sección, POR DÓNDE va a salir el patrón `enemy.bossCounter`
 *   (`stormSegmentLit`, más abajo: espiral ilumina 4 secciones centradas en
 *   los ángulos reales de los brazos —girando a la velocidad angular real
 *   durante el telegraph—, anillos ilumina TODO el anillo menos el hueco de
 *   diseño real del primer anillo, ráfaga ilumina las 3 zonas con balas y
 *   apaga los 3 pasillos reales) — así el jugador lee POR DÓNDE va a esquivar
 *   antes de que empiece a disparar, no solo QUE algo va a pasar (el anillo
 *   ámbar genérico ya cubre eso). El patrón de CADA ciclo se decide al entrar
 *   en recarga, no al empezar su telegraph propio
 *   (`storm/pattern.ts::stormEnterReload` → `stormResetPatternState`, que YA
 *   arranca el generador para que sus ángulos sean reales desde ya), así que
 *   el aro puede empezar a insinuarlo desde la 2ª mitad de la recarga
 *   anterior (secciones que se funden del verde de "ventana abierta" al
 *   color resuelto del patrón, intensidad creciente) y llegar a insinuación
 *   plena en el IDLE breve que sigue, antes incluso de que arranque el
 *   telegraph con lectura completa. Pose de recarga (ventana de
 *   vulnerabilidad, GDD §15.5 "aviso visual claro"): cuerpo sustituido por un
 *   tono pálido/apagado y anillo VERDE UNIFORME (todas las secciones iguales)
 *   en su 1ª mitad — inconfundible frente al resto de estados, encima del
 *   anillo verde genérico ya heredado; el tinte verdoso NUNCA desaparece del
 *   todo mientras la ventana siga abierta, para que insinuar el próximo
 *   patrón no camufle que sigue siendo el momento de golpear.
 *
 * Todo con geometrías/materiales compartidos de assets.ts; cero asignaciones
 * en useFrame (solo escalares y mutación de refs/materiales ya existentes).
 */

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Group, InstancedMesh, Material, Mesh } from 'three';
import { QUEEN_LARVA_ID_PREFIX } from '@/game/features/bosses/queen/constants';
import { dampAngleTowards } from '@/engine/geometry';
import type { GameSession } from '@/game/session/session';
import type { BossId, Enemy, EnemyKind } from '@/game/world/types';
import {
  blobShadowMaterial,
  bossBodyMaterial,
  bossPhaseFlashMaterial,
  bossTelegraphMaterial,
  bossVulnerableMaterial,
  chaserMaterial,
  DARK_SILHOUETTES,
  dummyMaterial,
  enemyHitFlashMaterial,
  guardianBodyMaterial,
  guardianHornGeometry,
  guardianHornMaterial,
  guardianStunStarGeometry,
  guardianStunStarMaterial,
  guardianTelegraphGlowMaterial,
  queenBodyMaterial,
  queenCrownMaterial,
  queenCrownSpikeGeometry,
  queenGuardianChargeMaterial,
  queenGuardianTelegraphMaterial,
  queenSummonPulseMaterial,
  prismaCoreMaterial,
  prismaGemGeometry,
  prismaGemMaterial,
  shooterMaterial,
  spikeMaterial,
  stormBodyMaterial,
  stormHaloSegmentGeometry,
  stormHaloMaterial,
  stormHaloReloadColor,
  stormReloadCoreMaterial,
  STORM_HALO_DIM_COLOR,
  STORM_HALO_PATTERN_COLOR,
  STORM_HALO_SEGMENTS,
  trailMaterial,
  unitCircle,
  unitSphere,
  WEAPON_COLOR,
} from '@/game/render/assets';
import {
  STORM_PATTERN_RINGS,
  STORM_PATTERN_SPIRAL,
  STORM_RELOAD_DURATION_BY_PHASE,
  STORM_STAGE_EXECUTE,
  STORM_STAGE_IDLE,
  STORM_STAGE_RELOAD,
  STORM_STAGE_TELEGRAPH,
  STORM_TELEGRAPH_DURATION_BY_PHASE,
} from '@/game/features/bosses/storm/machine-constants';
import {
  STORM_BURST_CORRIDORS,
  STORM_CORRIDOR_SAFETY,
  STORM_MIN_EMISSION_RADIUS,
  STORM_SPIRAL_ANGULAR_SPEED,
  STORM_SPIRAL_ARMS,
  stormCorridorMinAngle,
} from '@/game/features/bosses/storm/constants';
import { stormState } from '@/game/features/bosses/storm/pattern';
import type { StormState } from '@/game/features/bosses/storm/patterns';
import { ChaserMesh } from '@/game/features/enemies/chaser/Mesh';
import { DummyMesh } from '@/game/features/enemies/dummy/Mesh';
import { ShooterMesh } from '@/game/features/enemies/shooter/Mesh';
import { SpikeMesh } from '@/game/features/enemies/spike/Mesh';
import { TrailMesh } from '@/game/features/enemies/trail/Mesh';

const ENEMY_MATERIAL: Record<EnemyKind, Material> = {
  dummy: dummyMaterial,
  chaser: chaserMaterial,
  spike: spikeMaterial,
  trail: trailMaterial,
  shooter: shooterMaterial,
  boss: bossBodyMaterial,
};

/**
 * Luz tenue MÓVIL de enemigo (rama `estilo-oscuro`, punto 3 de playtest:
 * "quiero ver moverse esa lucecita en la oscuridad", mucho menor que la vela
 * del héroe — CandleLightView: 45/8.5 vs esto, ~3/3): mismo color que los
 * ojos/acentos emisivos ya existentes de cada arquetipo (assets.ts), para que
 * la luz se lea como "el brillo de sus ojos alcanza el entorno", no como un
 * añadido aparte. `boss` usa un ámbar genérico tenue (no distingue por
 * bossId: los acentos de cada jefe ya tienen su propio idioma visual, esta
 * luz solo necesita delatar "algo grande se mueve ahí").
 */
const ENEMY_LIGHT_COLOR: Record<EnemyKind, string> = {
  dummy: '#ffc169',
  chaser: '#b18cff',
  spike: '#ffb36b',
  trail: '#c9bce8',
  shooter: '#7cc7ff',
  boss: '#e0b56a',
};
/** Altura LOCAL de la luz sobre el centro del cuerpo del enemigo (el `group` ya vive a `bodyRadius` del suelo). */
const ENEMY_LIGHT_HEIGHT = 0.5;
const ENEMY_LIGHT_INTENSITY = 3;
const ENEMY_LIGHT_INTENSITY_BOSS = 4;
const ENEMY_LIGHT_DISTANCE = 3;
const ENEMY_LIGHT_DISTANCE_BOSS = 3.5;
const ENEMY_LIGHT_DECAY = 2;

/**
 * Material "en reposo" del cuerpo (sin flash de golpe/fase/telegraph
 * encima): el genérico por arquetipo, salvo el Guardián de Canto
 * (`bossId==='guardian'`), que sustituye el violeta genérico de jefe por su
 * propio pétreo (GDD §15.2). Único punto de verdad para los 3 sitios que
 * restauran el material tras un flash temporal.
 */
function restingBodyMaterial(kind: EnemyKind, bossId: BossId | undefined): Material {
  if (kind === 'boss' && bossId === 'guardian') return guardianBodyMaterial;
  if (kind === 'boss' && bossId === 'queen') return queenBodyMaterial;
  // El Prisma (GDD §15.4): MUTABLE, ver comentario de cabecera — su color se
  // actualiza cada frame más abajo en vez de intercambiar material.
  if (kind === 'boss' && bossId === 'prisma') return prismaCoreMaterial;
  // La Tormenta (GDD §15.5): cuerpo tormentoso propio, sustituido por
  // stormReloadCoreMaterial mientras está en RELOAD (ver useFrame de abajo).
  if (kind === 'boss' && bossId === 'storm') return stormBodyMaterial;
  return ENEMY_MATERIAL[kind];
}

/** El Prisma (GDD §15.4): mapea el gate de arma ('ram'|'arrow'|'spell') al mismo color que `WEAPON_COLOR` del héroe ('ram'→'body'). */
function prismaWeaponColor(weapon: string): (typeof WEAPON_COLOR)['body'] {
  if (weapon === 'arrow') return WEAPON_COLOR.arrow;
  if (weapon === 'spell') return WEAPON_COLOR.spell;
  return WEAPON_COLOR.body;
}

/** true si este id de enemigo es una larva de la Reina del Enjambre (GDD §15.3): mini-dummy, escala menor. */
function isQueenLarvaId(enemyId: string): boolean {
  return enemyId.startsWith(QUEEN_LARVA_ID_PREFIX);
}

const ENEMY_RADIUS_RENDER = 0.4;

/**
 * Escala ESTÁTICA del cuerpo compartido por arquetipo (dark>=1, silueta del
 * concept art): "Vigía de hollín" ligeramente achatado, "Acechador del
 * Umbral" alto y fino. Fijada UNA vez al montar vía JSX (no en useFrame): el
 * único código que muta `bodyRef.scale` después del montaje es el bloque de
 * jefe/larva de más abajo (`kind==='boss' || isLarva`), que nunca se
 * cumple para dummy/chaser, así que este valor persiste sin pisarse. Radio
 * de colisión intacto (`enemy.radius`/`ENEMY_RADIUS_RENDER` no cambian, esto
 * es solo la escala visual del mesh). `dark=0`: siempre el escalar plano de
 * siempre (paridad exacta con `main`).
 */
function bodyScaleForKind(kind: EnemyKind): number | [number, number, number] {
  if (!DARK_SILHOUETTES) return ENEMY_RADIUS_RENDER;
  if (kind === 'dummy') {
    return [ENEMY_RADIUS_RENDER * 1.08, ENEMY_RADIUS_RENDER * 0.82, ENEMY_RADIUS_RENDER * 1.08];
  }
  if (kind === 'chaser') {
    return [ENEMY_RADIUS_RENDER * 0.78, ENEMY_RADIUS_RENDER * 1.45, ENEMY_RADIUS_RENDER * 0.78];
  }
  return ENEMY_RADIUS_RENDER;
}
/** Duración del flash de cuerpo entero al cambiar de fase (GDD §15.1 punto 3). Puramente cosmético. */
const BOSS_PHASE_FLASH_DURATION = 0.3;
/**
 * Umbral de velocidad por debajo del cual NO se actualiza el objetivo de
 * orientación (bug playtest 2026-07-14: "los ojos bailan cada frame", sobre
 * todo en las larvas de la Reina, ver comentario en el useFrame más abajo).
 */
const ORIENTATION_SPEED_THRESHOLD = 0.2;
/**
 * Constante de amortiguación del giro hacia la orientación objetivo (mismo
 * patrón `1 - exp(-lambda*dt)` que CameraRig/particles/effectsState, ver
 * `dampAngleTowards` en `src/engine/geometry.ts`). Suficientemente rápida
 * para no sentirse "flotante" pero sin snap instantáneo.
 */
const ORIENTATION_DAMP_LAMBDA = 12;

/** El Prisma (GDD §15.4): velocidad angular del "tartamudeo" de color durante el telegraph de cambio (~10Hz, en rad/s: 2π×10). */
const PRISMA_COLOR_TELEGRAPH_BLINK_SPEED = 63;
/** El Prisma, fase 3 (GDD §15.4): ritmo más calmado (~4Hz) al alternar los 2 colores del solape. */
const PRISMA_OVERLAP_BLINK_SPEED = 25;
/** Velocidad angular de la órbita visual de las gemas del Prisma. */
const PRISMA_GEM_ORBIT_SPEED = 1.4;

/**
 * La Tormenta (GDD §15.5): opacidad "plena" del halo por patrón durante
 * telegraph/ejecución (índice = STORM_PATTERN_*) — mismos valores que antes
 * del rediseño post-playtest 2026-07-15 (espiral/anillos algo más discretos
 * que la ráfaga, que es la más súbita). Punto de llegada del fundido desde
 * `STORM_HALO_RELOAD_OPACITY` durante la insinuación de la 2ª mitad de la
 * recarga.
 */
const STORM_HALO_FULL_OPACITY: readonly [number, number, number] = [0.6, 0.6, 0.65];
/** Opacidad del halo en la 1ª mitad de la recarga (pose quieta, sin insinuar nada todavía) y arranque del fundido hacia STORM_HALO_FULL_OPACITY. */
const STORM_HALO_RELOAD_OPACITY = 0.18;
/** Radio del anillo respecto al cuerpo (constante: la lectura ahora es espacial —qué secciones se iluminan—, no de "respiración" de tamaño). */
const STORM_HALO_RADIUS_FACTOR = 1.25;
/** Ángulo (rad) que cubre cada sección del grid FIJO del anillo (`STORM_HALO_SEGMENTS`, assets.ts). */
const STORM_HALO_SEGMENT_ANGLE = (Math.PI * 2) / STORM_HALO_SEGMENTS;
/**
 * Semiancho angular (rad) de una sección iluminada de la ESPIRAL: los brazos
 * son rayos puntuales (sin ancho de diseño propio, a diferencia de anillos/
 * ráfaga que sí tienen un hueco/pasillo REAL — ver `stormSegmentLit`), así
 * que este es un ancho de LECTURA (no toca la sim) elegido para que las 4
 * secciones se vean como 4 bloques distintos con hueco de sobra entre ellos
 * (4 · 2 · esto ≈ el 40% del anillo).
 */
const STORM_HALO_SPIRAL_ARM_HALF_WIDTH = STORM_HALO_SEGMENT_ANGLE * 1.8;

/**
 * Diferencia angular con signo mínima entre dos ángulos, en (−π, π]. Copia
 * local de utilidad de ángulos (mismo criterio que
 * `patterns.test.ts::angularDelta`; no se exporta desde sim porque es
 * puramente de lectura de render, no entra en ninguna garantía de pasillo).
 */
function stormAngularDelta(a: number, b: number): number {
  const twoPi = Math.PI * 2;
  let d = (b - a) % twoPi;
  if (d < -Math.PI) d += twoPi;
  if (d > Math.PI) d -= twoPi;
  return d;
}

/**
 * true si la sección de grid centrada en `segAngle` (ángulo de MUNDO fijo,
 * ver comentario del bucle en `useFrame` más abajo) cae dentro de una zona
 * con balas del patrón `pattern` en el instante actual — "lo visual promete
 * lo mecánico" (AGENTS.md): los anchos de anillos/ráfaga son los REALES de
 * `stormCorridorMinAngle`/`STORM_CORRIDOR_SAFETY` (los MISMOS que usa
 * `patterns.ts` para abrir el hueco/pasillo de verdad, nunca un número
 * inventado); el de la espiral es de lectura (ver
 * `STORM_HALO_SPIRAL_ARM_HALF_WIDTH`). `spiralAngleNow` ya trae aplicada la
 * velocidad angular REAL de los brazos (`STORM_SPIRAL_ANGULAR_SPEED`, ver
 * el `useFrame`).
 */
function stormSegmentLit(segAngle: number, pattern: number, state: StormState, spiralAngleNow: number): boolean {
  if (pattern === STORM_PATTERN_SPIRAL) {
    const step = (Math.PI * 2) / STORM_SPIRAL_ARMS;
    for (let k = 0; k < STORM_SPIRAL_ARMS; k++) {
      const armAngle = spiralAngleNow + k * step;
      if (Math.abs(stormAngularDelta(segAngle, armAngle)) <= STORM_HALO_SPIRAL_ARM_HALF_WIDTH) return true;
    }
    return false;
  }
  const gapHalf = (stormCorridorMinAngle(STORM_MIN_EMISSION_RADIUS) * STORM_CORRIDOR_SAFETY) / 2;
  if (pattern === STORM_PATTERN_RINGS) {
    // Todo el anillo iluminado MENOS el hueco de diseño real (ver `emitRing`
    // en patterns.ts): así siempre acaba dejando pasar por ahí.
    return Math.abs(stormAngularDelta(segAngle, state.ringGapAngle)) > gapHalf;
  }
  // Ráfaga (STORM_PATTERN_BURST, único que queda): oscuro en cada uno de los
  // STORM_BURST_CORRIDORS huecos reales (centrados en burstBaseAngle +
  // c·sector, ver `fireRadialBurst`), iluminado en el resto (las 3 zonas con
  // balas).
  const sector = (Math.PI * 2) / STORM_BURST_CORRIDORS;
  for (let c = 0; c < STORM_BURST_CORRIDORS; c++) {
    const gapCenter = state.burstBaseAngle + c * sector;
    if (Math.abs(stormAngularDelta(segAngle, gapCenter)) <= gapHalf) return false;
  }
  return true;
}

function EnemyMesh({
  session,
  enemyId,
  kind,
  bossId,
}: {
  session: GameSession;
  enemyId: string;
  kind: EnemyKind;
  bossId?: BossId;
}) {
  const bodyRef = useRef<Mesh>(null);
  const shadowRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const wasFlashing = useRef(false);

  // Boss (GDD §15): anillo de telegraph (ámbar), anillo de ventana de
  // vulnerabilidad (verde) y flash de cuerpo entero al cambiar de fase.
  const bossTelegraphRingRef = useRef<Mesh>(null);
  const bossVulnerableRingRef = useRef<Mesh>(null);
  const bossPhaseFlashUntil = useRef(0);
  const lastBossPhase = useRef(1);
  const wasPhaseFlashing = useRef(false);
  // Guardián de Canto (GDD §15.2): brillo de telegraph propio (jitter de
  // vibración) y grupo de estrellitas del aturdimiento (orbitan sobre la
  // cabeza); los cuernos (JSX más abajo) son estáticos, sin ref necesaria.
  const guardianStunGroupRef = useRef<Group>(null);
  const guardianStunStarRefs = useRef<(Mesh | null)[]>([]);
  const wasGuardianTelegraphing = useRef(false);
  // Reina del Enjambre (GDD §15.3): pulso de invocación (anillo que se
  // expande brevemente cada vez que suelta una oleada de larvas); la corona
  // (JSX más abajo) es estática, sin ref necesaria.
  const queenSummonPulseRef = useRef<Mesh>(null);
  const queenSummonPulseUntil = useRef(0);
  const lastQueenWaveTimer = useRef(0);
  // El Prisma (GDD §15.4): 3 gemas orbitando el núcleo, silueta propia.
  const prismaGemRefs = useRef<(Mesh | null)[]>([]);
  // La Tormenta (GDD §15.5): anillo de Saturno segmentado alrededor del
  // cuerpo — un InstancedMesh de `STORM_HALO_SEGMENTS` secciones (mismo
  // patrón `setMatrixAt`/`setColorAt` que TrailView/ParticleView), color por
  // sección mutado según el patrón telegrafiado/en curso, apagado (verde
  // uniforme) en la pose de recarga. `obj`/`color` son escalares reutilizados
  // cada frame en el bucle de secciones (cero allocs).
  const stormHaloRef = useRef<InstancedMesh>(null);
  const stormHaloScratch = useMemo(() => ({ obj: new THREE.Object3D(), color: new THREE.Color() }), []);
  // Orientación (yaw) suavizada del grupo: yaw actual y yaw OBJETIVO, ver
  // comentario extenso en el useFrame más abajo. `null` = "aún no
  // inicializado" (primer frame con enemigo válido: snap directo sin girar
  // desde 0).
  const orientationYaw = useRef<number | null>(null);
  const orientationTarget = useRef(0);

  useFrame((_, delta) => {
    const world = session.world;
    const enemy = world.enemies.find((e: Enemy) => e.id === enemyId);
    const group = groupRef.current;
    if (!enemy || !group) return;

    if (enemy.hp <= 0) {
      group.visible = false;
      return;
    }
    group.visible = true;

    // Balanceo torpe del Dummy al patrullar (no perseguir): cabeceo vertical
    // suave, puramente cosmético, no afecta a la física.
    const bob =
      kind === 'dummy' && !enemy.chasing ? Math.sin(world.time * 5 + enemy.position.x * 3) * 0.035 : 0;
    const isLarva = kind === 'dummy' && isQueenLarvaId(enemyId);
    // Jefe (GDD §15): a diferencia del resto de arquetipos (radio visual fijo
    // ENEMY_RADIUS_RENDER pase lo que pase en la sim), el cuerpo del jefe
    // escala con su radio REAL de colisión (enemy.radius, configurable por
    // sala vía EnemySpawn.radius) — un jefe se diseña visiblemente más
    // grande, y su radio de golpeo debe leerse igual de grande. Las larvas de
    // la Reina (GDD §15.3, mini-dummy) son el caso simétrico: más PEQUEÑAS
    // que un Dummy normal, también leyendo `enemy.radius` real en vez del
    // tamaño fijo del arquetipo.
    const bodyRadius = kind === 'boss' || isLarva ? enemy.radius : ENEMY_RADIUS_RENDER;
    group.position.set(enemy.position.x, bodyRadius + bob, enemy.position.y);

    // La sombra es HIJA del grupo (que ya lleva la posición del enemigo):
    // sus coordenadas son LOCALES. Escribirle coordenadas de mundo aquí la
    // proyectaba a 2× la posición del enemigo flotando a y≈0.42 — las
    // "sombras fantasma que se mueven" del playtest de David (2026-07-05).
    const shadow = shadowRef.current;
    if (shadow) shadow.position.set(0, 0.02 - (bodyRadius + bob), 0);
    if ((kind === 'boss' || isLarva) && bodyRef.current) {
      bodyRef.current.scale.setScalar(bodyRadius);
    }

    const flashing = world.time < enemy.hitFlashUntil;
    if (flashing !== wasFlashing.current) {
      wasFlashing.current = flashing;
      const body = bodyRef.current;
      if (body) {
        body.material = flashing ? enemyHitFlashMaterial : restingBodyMaterial(kind, bossId);
      }
    }

    // Guardiana de la Reina (larva `chasing===false`, GDD §15.3, máquina de
    // embestida en `bossStage`: 0=orbita, 1=TELEGRAFÍA, 2=carga): aviso
    // legible de que va a embestir — parpadeo ámbar + hinchazón pulsante
    // durante la telegrafía, tono rojo intenso y constante mientras carga.
    // El flash de golpe (arriba) tiene prioridad: nunca se pisan.
    if (isLarva && !flashing) {
      // Cubre también la perseguidora (`chasing===true`) y la guardiana en
      // reposo (`bossStage===0`) para restaurar el aspecto normal: una larva
      // es un objeto reciclado por la sim (pool por `hp<=0`, ver
      // `queenActivateGuardian`/`queenSpawnChasers`), así que puede renacer
      // con otro rol tras morir a mitad de carga — sin este `else` quedaría
      // con el material rojo intenso de carga pegado indefinidamente.
      const body = bodyRef.current;
      if (body) {
        if (!enemy.chasing && enemy.bossStage === 1) {
          const blink = Math.sin(world.time * 22) > 0;
          body.material = blink ? queenGuardianTelegraphMaterial : restingBodyMaterial(kind, bossId);
          body.scale.setScalar(bodyRadius * (1 + 0.15 * (0.5 + 0.5 * Math.sin(world.time * 22))));
        } else if (!enemy.chasing && enemy.bossStage === 2) {
          body.material = queenGuardianChargeMaterial;
          body.scale.setScalar(bodyRadius * 1.12);
        } else {
          body.material = restingBodyMaterial(kind, bossId);
          body.scale.setScalar(bodyRadius);
        }
      }
    }

    // Umbral + giro amortiguado de orientación (bug playtest 2026-07-14: "los
    // ojos bailan cada frame", sobre todo en las larvas de la Reina): la cara
    // de cada enemigo se orienta según su velocidad instantánea, pero incluso
    // por ENCIMA del umbral de velocidad las larvas orbitando a la Reina
    // (steering de órbita + separación entre larvas) zigzaguean de dirección
    // cada tick sin desplazarse realmente distinto — el umbral solo no basta.
    // Fix real: el umbral decide solo si se actualiza el OBJETIVO de yaw (un
    // enemigo quieto no gira), y el yaw ACTUAL siempre avanza hacia ese
    // objetivo por el arco más corto con suavizado exponencial
    // (`dampAngleTowards`, mismo patrón que CameraRig/particles), así que un
    // objetivo que zigzaguea produce como mucho un temblor pequeño y
    // amortiguado, nunca un salto de cara instantáneo.
    const speed = Math.hypot(enemy.velocity.x, enemy.velocity.y);
    if (speed > ORIENTATION_SPEED_THRESHOLD) {
      orientationTarget.current = Math.atan2(enemy.velocity.x, enemy.velocity.y);
    }
    if (orientationYaw.current === null) {
      // Primer frame con este enemigo: snap directo al objetivo inicial (o a
      // 0 si aún no se movió) para no girar visiblemente desde 0.
      orientationYaw.current = speed > ORIENTATION_SPEED_THRESHOLD ? orientationTarget.current : 0;
    } else {
      orientationYaw.current = dampAngleTowards(
        orientationYaw.current,
        orientationTarget.current,
        ORIENTATION_DAMP_LAMBDA,
        delta,
      );
    }
    group.rotation.y = orientationYaw.current;

    if (kind === 'boss') {
      // Telegraph genérico (GDD §15.1 punto 2): anillo ámbar visible mientras
      // `bossTelegraphUntil` no ha vencido, con el mismo pulso de escala que
      // ya usa el Shooter (lenguaje visual consistente entre "aviso de
      // ataque" en toda la sim).
      const telegraphing = world.time < enemy.bossTelegraphUntil;
      if (bossTelegraphRingRef.current) {
        bossTelegraphRingRef.current.visible = telegraphing;
        if (telegraphing) {
          bossTelegraphRingRef.current.scale.setScalar(bodyRadius * (1.5 + 0.2 * Math.sin(world.time * 14)));
        }
      }
      // Ventana de vulnerabilidad (GDD §15.1 punto 4): anillo verde mientras
      // `bossVulnerable`, radio fijo (no pulsa: se distingue del telegraph
      // por color Y por comportamiento, para que nunca se confundan).
      if (bossVulnerableRingRef.current) {
        bossVulnerableRingRef.current.visible = enemy.bossVulnerable;
        bossVulnerableRingRef.current.scale.setScalar(bodyRadius * 1.5);
      }
      // Flash de cambio de fase (GDD §15.1 punto 3): retrigger al detectar
      // que bossPhase cambió desde el último frame leído.
      if (enemy.bossPhase !== lastBossPhase.current) {
        lastBossPhase.current = enemy.bossPhase;
        bossPhaseFlashUntil.current = world.time + BOSS_PHASE_FLASH_DURATION;
      }
      const phaseFlashing = world.time < bossPhaseFlashUntil.current;
      if (phaseFlashing !== wasPhaseFlashing.current && !flashing) {
        // Solo aplica el flash de fase si el flash de golpe (hitFlash, ya
        // gestionado arriba) no está ya mostrando su propio material: el
        // golpe que causa el cambio de fase ya parpadea en blanco ese mismo
        // instante, así que el flash de fase continúa el gesto sin pisarlo.
        wasPhaseFlashing.current = phaseFlashing;
        const body = bodyRef.current;
        if (body) body.material = phaseFlashing ? bossPhaseFlashMaterial : restingBodyMaterial(kind, bossId);
      }
    }

    if (kind === 'boss' && bossId === 'guardian') {
      // Vibración + brillo del telegraph (GDD §15.2 "brilla y vibra ~0.8s"):
      // MÁS intenso que el aro genérico ya dibujado arriba — jitter de
      // posición del propio cuerpo (no de un anillo aparte) + material ámbar
      // intercambiado, para que sea inconfundible el aviso de un jefe que va
      // a embestir en línea recta.
      const telegraphing = world.time < enemy.bossTelegraphUntil && !flashing;
      if (telegraphing !== wasGuardianTelegraphing.current) {
        wasGuardianTelegraphing.current = telegraphing;
        const body = bodyRef.current;
        if (body && !flashing) body.material = telegraphing ? guardianTelegraphGlowMaterial : guardianBodyMaterial;
      }
      const body = bodyRef.current;
      if (body) {
        const jitter = telegraphing ? Math.sin(world.time * 40) * 0.05 : 0;
        body.position.x = jitter;
      }

      // Tambaleo del aturdimiento (estado INCONFUNDIBLE, entregable 3):
      // oscilación de rotación en Z (se "balancea" como grogui) + 3
      // estrellitas doradas orbitando sobre la cabeza. Nunca se confunde con
      // el telegraph: distinto eje de movimiento (bamboleo lateral vs jitter
      // de posición) y color (dorado vs ámbar).
      if (groupRef.current) {
        groupRef.current.rotation.z = enemy.bossVulnerable ? Math.sin(world.time * 6) * 0.18 : 0;
      }
      if (guardianStunGroupRef.current) {
        guardianStunGroupRef.current.visible = enemy.bossVulnerable;
        if (enemy.bossVulnerable) {
          for (let i = 0; i < guardianStunStarRefs.current.length; i++) {
            const star = guardianStunStarRefs.current[i];
            if (!star) continue;
            const angle = world.time * 3 + (i / guardianStunStarRefs.current.length) * Math.PI * 2;
            const orbitRadius = bodyRadius * 0.7;
            star.position.set(Math.cos(angle) * orbitRadius, bodyRadius * 1.3, Math.sin(angle) * orbitRadius);
            star.rotation.y = angle * 2;
          }
        }
      }
    }

    if (kind === 'boss' && bossId === 'queen') {
      // Pulso de invocación (GDD §15.3): `enemy.bossTelegraphUntil` se
      // reutiliza en queenStepPattern como cuenta atrás (no un timestamp)
      // hasta la próxima oleada de larvas — se RESETEA a QUEEN_WAVE_INTERVAL
      // justo cuando invoca. Detectar ese salto hacia arriba (en vez de su
      // decaimiento normal) es la señal de "acaba de invocar", sin necesitar
      // leer eventos de sim desde el render.
      if (enemy.bossTelegraphUntil > lastQueenWaveTimer.current + 0.05) {
        queenSummonPulseUntil.current = world.time + 0.35;
      }
      lastQueenWaveTimer.current = enemy.bossTelegraphUntil;

      const pulsing = world.time < queenSummonPulseUntil.current;
      if (queenSummonPulseRef.current) {
        queenSummonPulseRef.current.visible = pulsing;
        if (pulsing) {
          const t = 1 - Math.max(0, queenSummonPulseUntil.current - world.time) / 0.35;
          queenSummonPulseRef.current.scale.setScalar(bodyRadius * (1.2 + t * 1.8));
        }
      }
    }

    if (kind === 'boss' && bossId === 'prisma') {
      // Núcleo con el color del arma activa (GDD §15.4): MUTA el color del
      // material compartido en vez de intercambiarlo (ver restingBodyMaterial
      // + comentario de cabecera). El flash de golpe (arriba) tiene
      // prioridad: mismo criterio que el Guardián (guardianTelegraphGlow más
      // abajo), que tampoco compite contra el flash de fase.
      if (!flashing) {
        const activeColor = prismaWeaponColor(enemy.bossWeaponGateA);
        const telegraphingColorChange =
          enemy.bossTelegraphKind.startsWith('color-change:') && world.time < enemy.bossTelegraphUntil;
        if (telegraphingColorChange) {
          // Tartamudeo (GDD §15.4): parpadeo rápido alternando el color
          // actual y el siguiente (leído del propio `bossTelegraphKind`).
          const nextWeapon = enemy.bossTelegraphKind.slice('color-change:'.length);
          const nextColor = prismaWeaponColor(nextWeapon);
          const blink = Math.sin(world.time * PRISMA_COLOR_TELEGRAPH_BLINK_SPEED) > 0;
          prismaCoreMaterial.color.copy(blink ? activeColor : nextColor);
        } else if (enemy.bossWeaponGateB !== '') {
          // Solape de fase 3 (GDD §15.4): alterna los dos colores activos a
          // un ritmo más calmado que el tartamudeo del telegraph.
          const overlapColor = prismaWeaponColor(enemy.bossWeaponGateB);
          const blink = Math.sin(world.time * PRISMA_OVERLAP_BLINK_SPEED) > 0;
          prismaCoreMaterial.color.copy(blink ? activeColor : overlapColor);
        } else {
          prismaCoreMaterial.color.copy(activeColor);
        }
      }

      // Gemas orbitando el núcleo (silueta propia, distinta de cuernos/corona).
      for (let i = 0; i < prismaGemRefs.current.length; i++) {
        const gem = prismaGemRefs.current[i];
        if (!gem) continue;
        const angle = world.time * PRISMA_GEM_ORBIT_SPEED + (i / prismaGemRefs.current.length) * Math.PI * 2;
        const orbitRadius = bodyRadius * 1.35;
        gem.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius);
        gem.rotation.y = angle * 1.5;
      }
    }

    if (kind === 'boss' && bossId === 'storm') {
      // Anillo de Saturno segmentado (rediseño post-playtest 2026-07-15,
      // David: "que se iluminara por partes... de la forma en la que van a
      // salir las bolas"): `enemy.bossCounter` es el patrón de ESTE ciclo —
      // decidido al entrar en RELOAD (`storm/pattern.ts::stormEnterReload` →
      // `stormResetPatternState`, que YA arranca el generador), así que ya es
      // válido —y sus ÁNGULOS REALES ya están en `world.bossState`— durante
      // IDLE y la 2ª mitad de la recarga, no solo durante TELEGRAPH/EXECUTE.
      // Aquí solo se decide CUÁNTO se insinúa (`mixT`, 0..1) y si se muestra
      // el layout real del patrón (`showPatternLayout`) o un anillo uniforme
      // (verde en recarga 1ª mitad, azul neutro en el brevísimo ambiente sin
      // patrón decidido tras `onInit`/cambio de fase).
      const state = stormState(world);
      const stage = enemy.bossStage;
      const pattern = enemy.bossCounter;
      const hasPattern = pattern >= 0 && pattern < STORM_HALO_PATTERN_COLOR.length;
      const halo = stormHaloRef.current;
      if (halo) {
        let showPatternLayout = false;
        let mixT = 1; // 0 = verde de recarga puro, 1 = color resuelto del patrón puro
        let spiralAngleNow = 0;
        let uniformColor = STORM_HALO_PATTERN_COLOR[STORM_PATTERN_SPIRAL]; // ambiente por defecto
        if (stage === STORM_STAGE_RELOAD) {
          const reloadDuration = STORM_RELOAD_DURATION_BY_PHASE[enemy.bossPhase - 1];
          const remaining = Math.max(0, enemy.bossVulnerableUntil - world.time);
          const reloadFrac = reloadDuration > 0 ? 1 - remaining / reloadDuration : 1; // 0 al abrir, 1 al cerrar
          if (!hasPattern || reloadFrac < 0.5) {
            // 1ª mitad: pose de recarga pura, anillo VERDE UNIFORME, para que
            // el arranque de la insinuación en la 2ª mitad se note como un
            // "despertar" del aro.
            uniformColor = stormHaloReloadColor;
            stormHaloMaterial.opacity = STORM_HALO_RELOAD_OPACITY;
          } else {
            // 2ª mitad: insinúa YA el patrón real (secciones reales del
            // generador, arrancado desde que se decidió en
            // `stormEnterReload`), mezclado con el verde de recarga (nunca se
            // despega del todo mientras la ventana siga abierta) a
            // intensidad creciente hasta el cierre.
            const hintT = (reloadFrac - 0.5) / 0.5; // 0..1 dentro de la 2ª mitad
            showPatternLayout = true;
            mixT = hintT;
            spiralAngleNow = state.spiralBaseAngle; // estático: stepSpiral aún no corre (EXECUTE no ha empezado)
            const fullOpacity = STORM_HALO_FULL_OPACITY[pattern];
            stormHaloMaterial.opacity = STORM_HALO_RELOAD_OPACITY + (fullOpacity - STORM_HALO_RELOAD_OPACITY) * hintT;
          }
        } else if (stage === STORM_STAGE_IDLE && hasPattern) {
          // Brevísimo (0.2-0.35s) pero el patrón YA se decidió en la recarga
          // anterior: sin parón visual, sigue a intensidad plena hasta que
          // arranque su propio telegraph.
          showPatternLayout = true;
          mixT = 1;
          spiralAngleNow = state.spiralBaseAngle; // estático, mismo criterio que el hint de recarga
          stormHaloMaterial.opacity = STORM_HALO_FULL_OPACITY[pattern];
        } else if ((stage === STORM_STAGE_TELEGRAPH || stage === STORM_STAGE_EXECUTE) && hasPattern) {
          showPatternLayout = true;
          mixT = 1;
          if (pattern === STORM_PATTERN_SPIRAL) {
            if (stage === STORM_STAGE_TELEGRAPH) {
              // Durante el telegraph los brazos aún no giran de verdad
              // (`stepSpiral` no corre hasta EXECUTE): se avanza el ángulo
              // ANALÍTICAMENTE con la MISMA fórmula que `stepSpiral`
              // (`spiralBaseAngle += STORM_SPIRAL_ANGULAR_SPEED·dt`) para que
              // el aro "pueda rotar a la velocidad angular real de los
              // brazos" desde el propio aviso (petición explícita de David).
              const telegraphDuration = STORM_TELEGRAPH_DURATION_BY_PHASE[enemy.bossPhase - 1];
              const remaining = Math.max(0, enemy.bossTelegraphUntil - world.time);
              const elapsed = telegraphDuration > 0 ? telegraphDuration - remaining : 0;
              spiralAngleNow = state.spiralBaseAngle + STORM_SPIRAL_ANGULAR_SPEED * elapsed;
            } else {
              // EXECUTE: `stepSpiral` ya avanza `state.spiralBaseAngle` de
              // verdad cada tick — leerlo directamente es exacto.
              spiralAngleNow = state.spiralBaseAngle;
            }
          }
          stormHaloMaterial.opacity = STORM_HALO_FULL_OPACITY[pattern];
        } else {
          // Ambiente (solo el brevísimo primer IDLE tras `onInit`/cambio de
          // fase, con `bossCounter` todavía sin decidir, `-1`): anillo azul
          // neutro uniforme — NUNCA verde aquí, para no prometer una ventana
          // de vulnerabilidad que no está abierta.
          stormHaloMaterial.opacity = 0.4;
        }

        // Bucle de secciones (cero allocs: `obj`/`color` de
        // `stormHaloScratch`, reutilizados). `segAngle` es un ángulo de
        // MUNDO fijo del grid (0..2π), el MISMO sistema de ángulos que las
        // balas reales (dx=cosθ, dy=sinθ, `patterns.ts::emitBulletAtAngle`).
        // `groupRef` (el padre) ya lleva `rotation.y = orientationYaw.current`
        // (yaw de orientación por velocidad, ver más arriba: La Tormenta
        // deriva sin parar y SÍ gira) — para que la sección caiga en el
        // ángulo de MUNDO `segAngle` pese a esa rotación del padre, su
        // rotación LOCAL debe CANCELARLA: `stormHaloSegmentGeometry`
        // (assets.ts) ya deja el centro de su arco en el ángulo local 0, así
        // que colocarlo en el ángulo de mundo `segAngle` con un padre rotado
        // Ω exige `rotation.y = -segAngle - Ω` (rotaciones Y componen por
        // suma: Ry(Ω)·Ry(local) = Ry(Ω+local); se comprueba con Ω=0,
        // segAngle=0 → local=0 → sección en (1,0,0), que es justo donde cae
        // dx=cos0=1, dy=sin0=0 tras `group.position.set(x,h,y)` — sim.x↔render.x, sim.y↔render.z).
        const { obj, color } = stormHaloScratch;
        const parentYaw = orientationYaw.current ?? 0;
        const segmentScale = bodyRadius * STORM_HALO_RADIUS_FACTOR;
        for (let i = 0; i < STORM_HALO_SEGMENTS; i++) {
          const segAngle = i * STORM_HALO_SEGMENT_ANGLE;
          if (showPatternLayout) {
            const lit = stormSegmentLit(segAngle, pattern, state, spiralAngleNow);
            color.copy(stormHaloReloadColor).lerp(lit ? STORM_HALO_PATTERN_COLOR[pattern] : STORM_HALO_DIM_COLOR, mixT);
          } else {
            color.copy(uniformColor);
          }
          obj.position.set(0, 0, 0);
          obj.rotation.set(0, -segAngle - parentYaw, 0);
          obj.scale.setScalar(segmentScale);
          obj.updateMatrix();
          halo.setMatrixAt(i, obj.matrix);
          halo.setColorAt(i, color);
        }
        halo.instanceMatrix.needsUpdate = true;
        if (halo.instanceColor) halo.instanceColor.needsUpdate = true;
      }
      const body = bodyRef.current;
      if (body && !flashing) {
        body.material = stage === STORM_STAGE_RELOAD ? stormReloadCoreMaterial : stormBodyMaterial;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <mesh
        ref={bodyRef}
        geometry={unitSphere}
        material={restingBodyMaterial(kind, bossId)}
        scale={bodyScaleForKind(kind)}
      />
      <mesh
        ref={shadowRef}
        geometry={unitCircle}
        material={blobShadowMaterial}
        rotation-x={-Math.PI / 2}
        scale={ENEMY_RADIUS_RENDER * 1.3}
      />

      {/* Luz tenue móvil (punto 3 de playtest, SOLO dark>=1): hija del
          `group` que ya sigue la posición del enemigo cada frame — se apaga
          sola con `group.visible=false` al morir (three.js no atraviesa
          objetos invisibles al recolectar luces), sin lógica extra aquí. SIN
          sombra (coste, y no la pide David: solo la vela debe bloquear luz). */}
      {DARK_SILHOUETTES && (
        <pointLight
          color={ENEMY_LIGHT_COLOR[kind]}
          intensity={kind === 'boss' ? ENEMY_LIGHT_INTENSITY_BOSS : ENEMY_LIGHT_INTENSITY}
          distance={kind === 'boss' ? ENEMY_LIGHT_DISTANCE_BOSS : ENEMY_LIGHT_DISTANCE}
          decay={ENEMY_LIGHT_DECAY}
          position={[0, ENEMY_LIGHT_HEIGHT, 0]}
        />
      )}

      {kind === 'dummy' && <DummyMesh session={session} enemyId={enemyId} groupRef={groupRef} />}
      {kind === 'chaser' && <ChaserMesh session={session} enemyId={enemyId} groupRef={groupRef} />}
      {kind === 'spike' && <SpikeMesh session={session} enemyId={enemyId} groupRef={groupRef} />}
      {kind === 'trail' && <TrailMesh session={session} enemyId={enemyId} bodyRef={bodyRef} />}
      {kind === 'shooter' && <ShooterMesh session={session} enemyId={enemyId} groupRef={groupRef} />}

      {kind === 'boss' && (
        <>
          {/* Anillo de telegraph (ámbar, GDD §15.1 punto 2) y de ventana de
              vulnerabilidad (verde, punto 4): discos bajo los pies, igual
              lenguaje visual que el telegraph del Shooter pero con radio e
              intensidad de jefe. Genéricos: cualquier jefe B1-B4 los hereda
              sin más composición. */}
          <mesh
            ref={bossTelegraphRingRef}
            geometry={unitCircle}
            material={bossTelegraphMaterial}
            rotation-x={-Math.PI / 2}
            position={[0, -0.42, 0]}
            visible={false}
          />
          <mesh
            ref={bossVulnerableRingRef}
            geometry={unitCircle}
            material={bossVulnerableMaterial}
            rotation-x={-Math.PI / 2}
            position={[0, -0.4, 0]}
            visible={false}
          />
        </>
      )}

      {kind === 'boss' && bossId === 'guardian' && (
        <>
          {/* Cuerpo grande y pesado con "hombros"/cuernos (GDD §15.2): 2 conos
              cortos y anchos anclados a los lados de la esfera pétrea,
              orientados hacia fuera — silueta reconocible de embestida antes
              de que empiece a moverse. Escala fija en local (ya vive dentro
              del `group` que escala con `enemy.radius` vía bodyRef arriba). */}
          <mesh
            geometry={guardianHornGeometry}
            material={guardianHornMaterial}
            position={[-0.45, 0.15, 0.15]}
            rotation-z={Math.PI / 2.4}
            rotation-y={-0.4}
          />
          <mesh
            geometry={guardianHornGeometry}
            material={guardianHornMaterial}
            position={[0.45, 0.15, 0.15]}
            rotation-z={-Math.PI / 2.4}
            rotation-y={0.4}
          />

          {/* Estado aturdido INCONFUNDIBLE (entregable 3): 3 estrellitas
              doradas orbitando sobre la cabeza mientras `bossVulnerable`;
              posición real recalculada en useFrame (órbita). */}
          <group ref={guardianStunGroupRef} visible={false}>
            {[0, 1, 2].map((i) => (
              <mesh
                key={i}
                ref={(el) => {
                  guardianStunStarRefs.current[i] = el;
                }}
                geometry={guardianStunStarGeometry}
                material={guardianStunStarMaterial}
                scale={0.1}
              />
            ))}
          </group>
        </>
      )}

      {kind === 'boss' && bossId === 'queen' && (
        <>
          {/* Corona: 5 púas finas en abanico sobre la cabeza (silueta de
              "reina de enjambre", distinta del Guardián) — estática en local,
              ya vive dentro del `group` que escala con `enemy.radius`. */}
          {[0, 1, 2, 3, 4].map((i) => {
            const angle = (i - 2) * 0.5;
            return (
              <mesh
                key={i}
                geometry={queenCrownSpikeGeometry}
                material={queenCrownMaterial}
                position={[Math.sin(angle) * 0.32, 0.55, Math.cos(angle) * 0.32]}
                rotation-x={-0.25}
                rotation-z={angle * 0.4}
              />
            );
          })}

          {/* Pulso de invocación (GDD §15.3): anillo que se expande
              brevemente bajo los pies cada vez que suelta una oleada de
              larvas; posición/escala reales en useFrame. */}
          <mesh
            ref={queenSummonPulseRef}
            geometry={unitCircle}
            material={queenSummonPulseMaterial}
            rotation-x={-Math.PI / 2}
            position={[0, -0.38, 0]}
            visible={false}
          />
        </>
      )}

      {kind === 'boss' && bossId === 'prisma' && (
        <>
          {/* Silueta propia (GDD §15.4): 3 gemas pequeñas orbitando el núcleo
              (distinta de cuernos/corona) — posición real recalculada en
              useFrame (órbita continua, siempre visible). */}
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              ref={(el) => {
                prismaGemRefs.current[i] = el;
              }}
              geometry={prismaGemGeometry}
              material={prismaGemMaterial}
            />
          ))}
        </>
      )}

      {kind === 'boss' && bossId === 'storm' && (
        <>
          {/* Anillo de Saturno segmentado alrededor del cuerpo (GDD §15.5,
              rediseño post-playtest 2026-07-15): silueta propia de "ojo de
              la tormenta", distinta de cuernos/corona/gemas — SIEMPRE plano/
              horizontal (nunca rota tras montarse: la geometría de cada
              sección ya nace pre-rotada flat, ver `stormHaloSegmentGeometry`
              en assets.ts); qué sección se ilumina se decide mutando el color
              por instancia cada frame en useFrame. */}
          <instancedMesh
            ref={stormHaloRef}
            args={[stormHaloSegmentGeometry, stormHaloMaterial, STORM_HALO_SEGMENTS]}
            frustumCulled={false}
          />
        </>
      )}
    </group>
  );
}

export function EnemyViews({ session }: { session: GameSession }) {
  return (
    <>
      {session.world.enemies.map((enemy) => (
        <EnemyMesh key={enemy.id} session={session} enemyId={enemy.id} kind={enemy.kind} bossId={enemy.bossId} />
      ))}
    </>
  );
}
