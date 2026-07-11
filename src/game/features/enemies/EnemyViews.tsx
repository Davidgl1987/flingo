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
 *
 * Todo con geometrías/materiales compartidos de assets.ts; cero asignaciones
 * en useFrame (solo escalares y mutación de refs ya existentes).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Material, Mesh } from 'three';
import { QUEEN_LARVA_ID_PREFIX } from '@/game/features/bosses/queen/constants';
import type { GameSession } from '@/game/session';
import type { BossId, Enemy, EnemyKind } from '@/game/sim/world';
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
  shooterMaterial,
  spikeMaterial,
  trailMaterial,
  unitCircle,
  unitSphere,
} from '@/game/render/assets';
import { ChaserMesh } from './chaser/Mesh';
import { DummyMesh } from './dummy/Mesh';
import { ShooterMesh } from './shooter/Mesh';
import { SpikeMesh } from './spike/Mesh';
import { TrailMesh } from './trail/Mesh';

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
  return ENEMY_MATERIAL[kind];
}

/** true si este id de enemigo es una larva de la Reina del Enjambre (GDD §15.3): mini-dummy, escala menor. */
function isQueenLarvaId(enemyId: string): boolean {
  return enemyId.startsWith(QUEEN_LARVA_ID_PREFIX);
}

const ENEMY_RADIUS_RENDER = 0.4;
/** Duración del flash de cuerpo entero al cambiar de fase (GDD §15.1 punto 3). Puramente cosmético. */
const BOSS_PHASE_FLASH_DURATION = 0.3;

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

  useFrame(() => {
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

    const speed = Math.hypot(enemy.velocity.x, enemy.velocity.y);
    if (speed > 0.05) {
      group.rotation.y = Math.atan2(enemy.velocity.x, enemy.velocity.y);
    }

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
