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
 * - La Tormenta (GDD §15.5, Fase B4, `bossId==='storm'`; tuning post-playtest
 *   2026-07-05, David: "telegrafiar un poco más el siguiente ataque por el
 *   movimiento del aro"): jefe de esquive puro, cuerpo tormentoso propio
 *   (gris-azulado) envuelto en un halo/vórtice (toro CON HUECO — un toro
 *   completo de color uniforme es simétrico bajo su propio giro y por eso el
 *   giro nunca se leía, ver comentario de `stormHaloGeometry` en assets.ts)
 *   cuya rotación/pulso/opacidad/color delatan el patrón `enemy.bossCounter`
 *   (`applyStormHaloMotion`: espiral GIRA acelerando en el sentido real de
 *   los brazos, anillos PULSAN expandiéndose a la cadencia real de emisión,
 *   ráfaga se CONTRAE/tensa antes de estallar) — así el jugador lee QUÉ va a
 *   esquivar antes de que empiece a disparar, no solo QUE algo va a pasar
 *   (el anillo ámbar genérico ya cubre eso). El patrón de CADA ciclo se
 *   decide al entrar en recarga, no al empezar su telegraph propio
 *   (`storm/pattern.ts::stormEnterReload`), así que el aro puede empezar a
 *   insinuarlo desde la 2ª mitad de la recarga anterior (tinte que se funde
 *   del verde de "ventana abierta" al color del patrón, intensidad
 *   creciente) y llegar a insinuación plena en el IDLE breve que sigue,
 *   antes incluso de que arranque el telegraph con lectura completa. Pose de
 *   recarga (ventana de vulnerabilidad, GDD §15.5 "aviso visual claro"):
 *   cuerpo sustituido por un tono pálido/apagado y halo quieto en su 1ª
 *   mitad — inconfundible frente al resto de estados, encima del anillo
 *   verde genérico ya heredado; el tinte verdoso del halo NUNCA desaparece
 *   del todo mientras la ventana siga abierta, para que insinuar el próximo
 *   patrón no camufle que sigue siendo el momento de golpear.
 *
 * Todo con geometrías/materiales compartidos de assets.ts; cero asignaciones
 * en useFrame (solo escalares y mutación de refs/materiales ya existentes).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Material, Mesh } from 'three';
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
  stormHaloGeometry,
  stormHaloMaterial,
  stormHaloReloadColor,
  stormReloadCoreMaterial,
  STORM_HALO_PATTERN_COLOR,
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
import { STORM_RING_INTERVAL, STORM_SPIRAL_ANGULAR_SPEED } from '@/game/features/bosses/storm/constants';
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
 * del tuning post-playtest 2026-07-05 (espiral/anillos algo más discretos
 * que la ráfaga, que es la más súbita). Punto de llegada del fundido desde
 * `STORM_HALO_RELOAD_OPACITY` durante la insinuación de la 2ª mitad de la
 * recarga.
 */
const STORM_HALO_FULL_OPACITY: readonly [number, number, number] = [0.6, 0.6, 0.65];
/** Opacidad del halo en la 1ª mitad de la recarga (pose quieta, sin insinuar nada todavía) y arranque del fundido hacia STORM_HALO_FULL_OPACITY. */
const STORM_HALO_RELOAD_OPACITY = 0.18;

/**
 * Anima el halo/vórtice de La Tormenta con la firma de movimiento propia de
 * `pattern` (STORM_PATTERN_*, machine-constants.ts) — "lo visual debe
 * prometer lo mecánico" (AGENTS.md): cada patrón se lee distinto antes de
 * que dispare una sola bala. Cero asignaciones (solo mutación de `halo` y
 * escalares).
 *
 * - Espiral: el halo GIRA acelerando, en el mismo SENTIDO que los brazos de
 *   verdad (`patterns.ts::stepSpiral`: `spiralBaseAngle +=
 *   STORM_SPIRAL_ANGULAR_SPEED*dt`, siempre positivo). La conversión de un
 *   ángulo de sim (dx=cosθ, dy=sinθ) al yaw de three.js es la MISMA que ya
 *   usa este fichero para orientar por velocidad, `Math.atan2(dx, dy)`:
 *   para θ creciente ese yaw vale π/2−θ y por tanto DISMINUYE a la misma
 *   velocidad (comprobado numéricamente). El halo tiene que girar en
 *   `rotation.y` NEGATIVO para prometer el sentido real — el código previo
 *   giraba en positivo (además de ser invisible por el toro completo
 *   simétrico, ver comentario de `stormHaloGeometry` en assets.ts, giraba
 *   al revés). `progress` (0..1, tiempo dentro del ciclo) acelera el giro —
 *   la "aceleración" pedida en el playtest — muy por encima de la velocidad
 *   real de los brazos a propósito: el aro no promete velocidad 1:1, solo
 *   sentido y urgencia creciente.
 * - Anillos: pulso de escala que se EXPANDE rítmicamente a la cadencia REAL
 *   de emisión (`STORM_RING_INTERVAL[fase]`, no un número inventado): el
 *   halo "respira" al mismo ritmo con el que van a llegar los anillos de
 *   verdad.
 * - Ráfaga: se CONTRAE/tensa a medida que `progress` avanza hacia 1 (como
 *   tomando impulso); no hay un "release" animado porque la ráfaga no tiene
 *   EXECUTE propio (dispara y pasa a recarga en el mismo tick en que acaba
 *   el telegraph) — el estallido real ES el corte a la pose de recarga.
 *
 * `intensity` (0..1) atenúa el movimiento durante la insinuación de la 2ª
 * mitad de la recarga; en TELEGRAPH/EXECUTE siempre vale 1 (lectura plena).
 */
function applyStormHaloMotion(
  halo: Mesh,
  pattern: number,
  bodyRadius: number,
  worldTime: number,
  delta: number,
  phase: 1 | 2 | 3,
  progress: number,
  intensity: number,
): void {
  if (pattern === STORM_PATTERN_SPIRAL) {
    const speed = STORM_SPIRAL_ANGULAR_SPEED * (0.5 + 2.5 * progress) * intensity;
    halo.rotation.y -= delta * speed; // signo: ver comentario de cabecera (promete el sentido real de los brazos)
    halo.scale.setScalar(bodyRadius * 1.3);
  } else if (pattern === STORM_PATTERN_RINGS) {
    halo.rotation.y += delta * 0.4 * intensity;
    const cadence = (Math.PI * 2) / STORM_RING_INTERVAL[phase - 1]; // un pulso completo por intervalo real entre anillos
    const pulse = 0.5 + 0.5 * Math.sin(worldTime * cadence);
    halo.scale.setScalar(bodyRadius * (1.15 + 0.35 * pulse * intensity));
  } else {
    // Ráfaga radial (STORM_PATTERN_BURST): se tensa/encoge según `progress`.
    halo.rotation.y += delta * 0.4 * intensity;
    const tension = 1 - 0.4 * progress * intensity;
    halo.scale.setScalar(bodyRadius * 1.25 * tension);
  }
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
  // La Tormenta (GDD §15.5): halo/vórtice alrededor del cuerpo, animado según
  // el patrón telegrafiado/en curso y apagado en la pose de recarga.
  const stormHaloRef = useRef<Mesh>(null);
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
      // Halo/vórtice (tuning post-playtest 2026-07-05, David: "telegrafiar
      // un poco más el siguiente ataque por el movimiento del aro"):
      // `enemy.bossCounter` es el patrón de ESTE ciclo — decidido al entrar
      // en RELOAD (ver `storm/pattern.ts::stormEnterReload`), no al empezar
      // el telegraph — así que ya es válido durante IDLE y la 2ª mitad de la
      // recarga, no solo durante TELEGRAPH/EXECUTE. Firma de movimiento
      // DISTINTA por patrón en `applyStormHaloMotion` (arriba); aquí solo se
      // decide CUÁNTO se insinúa (0..1) según la fase del ciclo, y el tinte
      // de color se funde entre `stormHaloReloadColor` (verde, "ventana
      // abierta") y `STORM_HALO_PATTERN_COLOR[patrón]` para que la
      // insinuación nunca camufle que la recarga sigue abierta.
      const stage = enemy.bossStage;
      const pattern = enemy.bossCounter;
      const hasPattern = pattern >= 0 && pattern < STORM_HALO_PATTERN_COLOR.length;
      const halo = stormHaloRef.current;
      if (halo) {
        if (stage === STORM_STAGE_RELOAD) {
          const reloadDuration = STORM_RELOAD_DURATION_BY_PHASE[enemy.bossPhase - 1];
          const remaining = Math.max(0, enemy.bossVulnerableUntil - world.time);
          const reloadFrac = reloadDuration > 0 ? 1 - remaining / reloadDuration : 1; // 0 al abrir, 1 al cerrar
          if (!hasPattern || reloadFrac < 0.5) {
            // 1ª mitad: pose de recarga pura, quieta (sin `rotation.y +=`:
            // se congela donde esté), para que el arranque de la insinuación
            // en la 2ª mitad se note como un "despertar" del aro.
            halo.scale.setScalar(bodyRadius * 1.15);
            stormHaloMaterial.opacity = STORM_HALO_RELOAD_OPACITY;
            stormHaloMaterial.color.copy(stormHaloReloadColor);
          } else {
            // 2ª mitad: insinúa YA el próximo patrón, mezclado con el verde
            // de recarga (nunca se despega del todo mientras la ventana
            // siga abierta) a intensidad creciente hasta el cierre.
            const hintT = (reloadFrac - 0.5) / 0.5; // 0..1 dentro de la 2ª mitad
            applyStormHaloMotion(halo, pattern, bodyRadius, world.time, delta, enemy.bossPhase, hintT, hintT);
            const fullOpacity = STORM_HALO_FULL_OPACITY[pattern];
            stormHaloMaterial.opacity = STORM_HALO_RELOAD_OPACITY + (fullOpacity - STORM_HALO_RELOAD_OPACITY) * hintT;
            stormHaloMaterial.color.copy(stormHaloReloadColor).lerp(STORM_HALO_PATTERN_COLOR[pattern], hintT);
          }
        } else if (stage === STORM_STAGE_IDLE && hasPattern) {
          // Brevísimo (0.2-0.35s) pero el patrón YA se decidió en la recarga
          // anterior: sin parón visual, sigue a intensidad plena hasta que
          // arranque su propio telegraph.
          applyStormHaloMotion(halo, pattern, bodyRadius, world.time, delta, enemy.bossPhase, 1, 1);
          stormHaloMaterial.opacity = STORM_HALO_FULL_OPACITY[pattern];
          stormHaloMaterial.color.copy(STORM_HALO_PATTERN_COLOR[pattern]);
        } else if ((stage === STORM_STAGE_TELEGRAPH || stage === STORM_STAGE_EXECUTE) && hasPattern) {
          const telegraphDuration = STORM_TELEGRAPH_DURATION_BY_PHASE[enemy.bossPhase - 1];
          const remaining = Math.max(0, enemy.bossTelegraphUntil - world.time);
          // En EXECUTE `bossTelegraphUntil` ya está a 0 (ver pattern.ts): remaining=0 → progress=1, coherente con "ya en marcha".
          const progress = stage === STORM_STAGE_TELEGRAPH && telegraphDuration > 0 ? 1 - remaining / telegraphDuration : 1;
          applyStormHaloMotion(halo, pattern, bodyRadius, world.time, delta, enemy.bossPhase, progress, 1);
          stormHaloMaterial.opacity = STORM_HALO_FULL_OPACITY[pattern];
          stormHaloMaterial.color.copy(STORM_HALO_PATTERN_COLOR[pattern]);
        } else {
          // Ambiente (solo el primerísimo ciclo tras onInit, con bossCounter
          // todavía sin decidir): giro lento neutro, mismo azul base que
          // espiral/anillos (STORM_HALO_PATTERN_COLOR[0], reutilizado en vez
          // de parsear un string nuevo cada frame).
          halo.rotation.y += delta * 0.4;
          halo.scale.setScalar(bodyRadius * 1.2);
          stormHaloMaterial.opacity = 0.4;
          stormHaloMaterial.color.copy(STORM_HALO_PATTERN_COLOR[STORM_PATTERN_SPIRAL]);
        }
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
        scale={ENEMY_RADIUS_RENDER}
      />
      <mesh
        ref={shadowRef}
        geometry={unitCircle}
        material={blobShadowMaterial}
        rotation-x={-Math.PI / 2}
        scale={ENEMY_RADIUS_RENDER * 1.3}
      />

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
          {/* Halo/vórtice alrededor del cuerpo (GDD §15.5): silueta propia de
              "ojo de la tormenta", distinta de cuernos/corona/gemas — gira en
              torno al eje vertical del cuerpo (estilo anillo de Saturno);
              rotación/escala/opacidad reales en useFrame. */}
          <mesh ref={stormHaloRef} geometry={stormHaloGeometry} material={stormHaloMaterial} rotation-x={Math.PI / 2} />
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
