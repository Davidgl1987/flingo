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
 * de contrato del GDD intactos:
 * - Dummy: ojos simples + balanceo torpe (oscilación de cabeceo) al patrullar.
 * - Chaser: cejas/mirada agresivas orientadas al héroe + pulso de escala al
 *   acelerar (heroAiming, misma señal que ya usa su IA para correr más).
 * - Spike (ronda 3, punto 9: "por detrás no debe tener pinchos, ponle 3 en la
 *   parte delantera"): exactamente 3 púas (mismo unitSpike reescalado), TODAS
 *   ancladas a la dirección `facing` (la cara peligrosa, GDD §7.3/combat.ts
 *   `isSpikeContactDangerous`) en abanico frontal fijo — nunca rotan libres
 *   ni aparecen en la cara trasera.
 * - Trail: squash de babosa (aplastamiento rítmico) + gotas de baba goteando.
 * - Shooter: "ojo/cañón" orientado siempre al héroe, que se ilumina (cambia
 *   de material apagado a material de carga) mientras `shooterPhase==='charge'`.
 * - Boss (GDD §15, Fase B0): composición GENÉRICA reutilizable por cualquier
 *   jefe futuro (B1-B4 pueden sustituir el cuerpo por la suya propia
 *   filtrando por `enemy.bossId`, ver `BossMesh`) — anillo ámbar mientras
 *   `bossTelegraphUntil` está activo (aviso de ataque), anillo verde mientras
 *   `bossVulnerable` (ventana de castigo) y flash blanco-cálido de cuerpo
 *   entero al cambiar de fase (retrigger por `bossPhase`).
 * - Guardián de Canto (GDD §15.2, Fase B1, `bossId==='guardian'`): sustituye
 *   el cuerpo genérico por uno propio (esfera pétrea grande + 2 "cuernos"
 *   cónicos de hombro, escalados con `enemy.radius` como cualquier jefe),
 *   brillo+vibración durante el telegraph (material ámbar intercambiado +
 *   jitter de posición, más intenso que el aro genérico), y estado aturdido
 *   INCONFUNDIBLE: tambaleo (oscilación de rotación en Z) + 3 estrellitas
 *   doradas orbitando sobre la cabeza — todo con geometrías/materiales
 *   compartidos de assets.ts, encima (no en sustitución) de los anillos
 *   genéricos de telegraph/vulnerabilidad ya heredados.
 *
 * Todo con geometrías/materiales compartidos de assets.ts; cero asignaciones
 * en useFrame (solo escalares y mutación de refs ya existentes).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Material, Mesh } from 'three';
import type { GameSession } from '../session';
import type { BossId, Enemy, EnemyKind } from '../sim/world';
import {
  blobShadowMaterial,
  bossBodyMaterial,
  bossPhaseFlashMaterial,
  bossTelegraphMaterial,
  bossVulnerableMaterial,
  chaserBrowMaterial,
  chaserMaterial,
  dummyMaterial,
  enemyHitFlashMaterial,
  eyePupilMaterial,
  eyeWhiteMaterial,
  guardianBodyMaterial,
  guardianHornGeometry,
  guardianHornMaterial,
  guardianStunStarGeometry,
  guardianStunStarMaterial,
  guardianTelegraphGlowMaterial,
  shooterEyeChargeMaterial,
  shooterEyeMaterial,
  shooterMaterial,
  shooterTelegraphMaterial,
  smallDotGeometry,
  smallWedgeGeometry,
  spikeConeMaterial,
  spikeMaterial,
  trailDripMaterial,
  trailMaterial,
  unitCircle,
  unitSphere,
  unitSpike,
} from './assets';

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
  return ENEMY_MATERIAL[kind];
}

const ENEMY_RADIUS_RENDER = 0.4;
/** Duración del flash de cuerpo entero al cambiar de fase (GDD §15.1 punto 3). Puramente cosmético. */
const BOSS_PHASE_FLASH_DURATION = 0.3;

/**
 * Radio/altura del pivote de la cara del Chaser sobre la superficie de su
 * esfera (punto 8 de playtest ronda 3): ligeramente menor que
 * ENEMY_RADIUS_RENDER para que los ojos queden asentados EN la superficie
 * visible, nunca flotando fuera de ella ni hundidos dentro.
 */
const CHASER_FACE_RADIUS = 0.34;
const CHASER_FACE_HEIGHT = 0.1;

/**
 * Púas del Spike (punto 9 de playtest ronda 3): exactamente 3, todas en la
 * cara peligrosa, repartidas en abanico frontal (radianes entre púas
 * contiguas). Nada en la cara trasera.
 */
const SPIKE_FRONT_SPIKE_COUNT = 3;
const SPIKE_FRONT_FAN_SPREAD = 0.55;
/** Nº de gotas de baba del Trail. */
const TRAIL_DRIP_COUNT = 2;

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
  const spikeSecondaryGroupRef = useRef<Group>(null);
  const telegraphRef = useRef<Mesh>(null);
  const wasFlashing = useRef(false);

  // Dummy: ojos + balanceo torpe.
  const dummyEyesRef = useRef<Group>(null);
  // Chaser: cejas/mirada agresiva. `chaserFaceAngle` conserva el último
  // ángulo válido hacia el héroe (mundo) para no degenerar cuando coincide
  // con el centro del enemigo (distancia ~0).
  const chaserFaceRef = useRef<Group>(null);
  const chaserFaceAngle = useRef(0);
  // Trail: cuerpo (para squash) + gotas.
  const trailDripRefs = useRef<(Mesh | null)[]>([]);
  // Shooter: ojo/cañón orientado al héroe.
  const shooterEyeGroupRef = useRef<Group>(null);
  const shooterEyeMeshRef = useRef<Mesh>(null);
  const wasCharging = useRef(false);
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
    // Jefe (GDD §15): a diferencia del resto de arquetipos (radio visual fijo
    // ENEMY_RADIUS_RENDER pase lo que pase en la sim), el cuerpo del jefe
    // escala con su radio REAL de colisión (enemy.radius, configurable por
    // sala vía EnemySpawn.radius) — un jefe se diseña visiblemente más
    // grande, y su radio de golpeo debe leerse igual de grande.
    const bodyRadius = kind === 'boss' ? enemy.radius : ENEMY_RADIUS_RENDER;
    group.position.set(enemy.position.x, bodyRadius + bob, enemy.position.y);

    // La sombra es HIJA del grupo (que ya lleva la posición del enemigo):
    // sus coordenadas son LOCALES. Escribirle coordenadas de mundo aquí la
    // proyectaba a 2× la posición del enemigo flotando a y≈0.42 — las
    // "sombras fantasma que se mueven" del playtest de David (2026-07-05).
    const shadow = shadowRef.current;
    if (shadow) shadow.position.set(0, 0.02 - (bodyRadius + bob), 0);
    if (kind === 'boss' && bodyRef.current) {
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

    const speed = Math.hypot(enemy.velocity.x, enemy.velocity.y);
    if (speed > 0.05) {
      group.rotation.y = Math.atan2(enemy.velocity.x, enemy.velocity.y);
    }

    if (kind === 'spike' && spikeSecondaryGroupRef.current) {
      // Punto 9 de playtest ronda 3 ("Spike por detrás no debe tener
      // pinchos, ponle 3 en la parte delantera"): las 3 púas viven en un
      // único grupo anclado a la dirección `facing` fija del mundo (la cara
      // PELIGROSA, misma normal que usa isSpikeContactDangerous en
      // combat.ts) — nunca rotan libremente ni aparecen en la cara trasera.
      // Compensa la rotación del grupo padre (que sigue la velocidad al
      // patrullar) para que el abanico quede fijo en coordenadas de mundo.
      spikeSecondaryGroupRef.current.rotation.y = Math.atan2(enemy.facing.x, enemy.facing.y) - group.rotation.y;
    }

    if (kind === 'shooter') {
      const charging = enemy.shooterPhase === 'charge';
      if (telegraphRef.current) {
        telegraphRef.current.visible = charging;
        if (charging) {
          telegraphRef.current.scale.setScalar(0.85 + 0.25 * Math.sin(world.time * 14));
        }
      }
      // Ojo/cañón: siempre orientado hacia el héroe (compensando la rotación
      // del grupo, que sigue la velocidad, no la mirada) y se ilumina al cargar.
      if (shooterEyeGroupRef.current) {
        const dx = world.hero.position.x - enemy.position.x;
        const dy = world.hero.position.y - enemy.position.y;
        shooterEyeGroupRef.current.rotation.y = Math.atan2(dx, dy) - group.rotation.y;
      }
      if (charging !== wasCharging.current) {
        wasCharging.current = charging;
        const eye = shooterEyeMeshRef.current;
        if (eye) eye.material = charging ? shooterEyeChargeMaterial : shooterEyeMaterial;
      }
    }

    if (kind === 'dummy' && dummyEyesRef.current) {
      // Los ojos miran ligeramente hacia el héroe cuando persigue (más vivo),
      // y quedan al frente en patrulla.
      if (enemy.chasing) {
        const dx = world.hero.position.x - enemy.position.x;
        const dy = world.hero.position.y - enemy.position.y;
        dummyEyesRef.current.rotation.y = Math.atan2(dx, dy) - group.rotation.y;
      } else {
        dummyEyesRef.current.rotation.y = 0;
      }
    }

    if (kind === 'chaser' && chaserFaceRef.current) {
      // Punto 8 de playtest ronda 3 ("los ojos se meten dentro de la
      // esfera"): la causa era anclar la cara a una POSICIÓN LOCAL fija
      // (delante del cuerpo) y solo rotarla — al compensar la rotación del
      // grupo padre para mirar al héroe, el pivote de la cara nunca seguía la
      // curvatura de la esfera, solo giraba sobre sí mismo en torno a un
      // punto que seguía "al frente"; para ángulos grandes eso proyecta los
      // ojos hacia dentro en vez de sobre la superficie visible. Fix: se
      // RECALCULA la posición del pivote cada frame como una proyección real
      // sobre el ecuador de la esfera (radio fijo CHASER_FACE_RADIUS) en la
      // dirección absoluta hacia el héroe, así que siempre queda sobre la
      // superficie mirando a cámara, sin hundirse ni cuando el héroe está muy
      // cerca (dirección degenerada: mantiene el último ángulo válido).
      const dx = world.hero.position.x - enemy.position.x;
      const dy = world.hero.position.y - enemy.position.y;
      const distToHero = Math.hypot(dx, dy);
      if (distToHero > 1e-4) {
        chaserFaceAngle.current = Math.atan2(dx, dy);
      }
      const worldAngle = chaserFaceAngle.current;
      const localAngle = worldAngle - group.rotation.y;
      const face = chaserFaceRef.current;
      face.position.set(
        Math.sin(localAngle) * CHASER_FACE_RADIUS,
        CHASER_FACE_HEIGHT,
        Math.cos(localAngle) * CHASER_FACE_RADIUS,
      );
      face.rotation.y = localAngle;
      // Pulso de velocidad: se agranda ligeramente mientras corre acelerado
      // (heroAiming es la misma señal que su IA usa para CHASER_SPEED_WHILE_AIMING).
      const pulse = world.heroAiming ? 1.12 + 0.05 * Math.sin(world.time * 16) : 1;
      face.scale.setScalar(pulse);
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

    if (kind === 'trail') {
      const body = bodyRef.current;
      if (body) {
        // Squash de babosa: aplastamiento rítmico vertical, compensado en XZ
        // para conservar volumen aproximado (mismo patrón que el héroe).
        const squash = 1 + Math.sin(world.time * 4.2 + enemy.position.y) * 0.09;
        const widen = 1 / Math.sqrt(squash);
        body.scale.set(ENEMY_RADIUS_RENDER * widen, ENEMY_RADIUS_RENDER * squash, ENEMY_RADIUS_RENDER * widen);
      }
      for (let i = 0; i < TRAIL_DRIP_COUNT; i++) {
        const drip = trailDripRefs.current[i];
        if (!drip) continue;
        const phase = (world.time * 0.9 + i / TRAIL_DRIP_COUNT) % 1;
        const angle = (i / TRAIL_DRIP_COUNT) * Math.PI * 2;
        const r = ENEMY_RADIUS_RENDER * 0.75;
        drip.position.set(
          Math.sin(angle) * r,
          -phase * 0.3,
          Math.cos(angle) * r * 0.6 - ENEMY_RADIUS_RENDER * 0.15,
        );
        drip.scale.setScalar(0.06 * (1 - phase * 0.5));
        drip.visible = true;
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

      {kind === 'dummy' && (
        <group ref={dummyEyesRef} position={[0, 0.08, 0.34]}>
          <mesh geometry={smallDotGeometry} material={eyeWhiteMaterial} position={[-0.12, 0, 0]} scale={0.08} />
          <mesh geometry={smallDotGeometry} material={eyeWhiteMaterial} position={[0.12, 0, 0]} scale={0.08} />
          <mesh geometry={smallDotGeometry} material={eyePupilMaterial} position={[-0.12, 0, 0.06]} scale={0.04} />
          <mesh geometry={smallDotGeometry} material={eyePupilMaterial} position={[0.12, 0, 0.06]} scale={0.04} />
        </group>
      )}

      {kind === 'chaser' && (
        // Posición/rotación reales del pivote se escriben cada frame en
        // useFrame (proyección sobre la superficie esférica); el valor JSX
        // es solo el estado inicial antes del primer frame.
        <group ref={chaserFaceRef} position={[0, CHASER_FACE_HEIGHT, CHASER_FACE_RADIUS]}>
          <mesh geometry={smallDotGeometry} material={eyeWhiteMaterial} position={[-0.13, -0.02, 0]} scale={0.09} />
          <mesh geometry={smallDotGeometry} material={eyeWhiteMaterial} position={[0.13, -0.02, 0]} scale={0.09} />
          <mesh geometry={smallDotGeometry} material={eyePupilMaterial} position={[-0.13, -0.02, 0.06]} scale={0.045} />
          <mesh geometry={smallDotGeometry} material={eyePupilMaterial} position={[0.13, -0.02, 0.06]} scale={0.045} />
          {/* Cejas agresivas: cuñas inclinadas hacia el centro (ceño fruncido). */}
          <mesh
            geometry={smallWedgeGeometry}
            material={chaserBrowMaterial}
            position={[-0.13, 0.09, 0.02]}
            rotation-z={0.5}
            scale={[0.16, 0.045, 0.05]}
          />
          <mesh
            geometry={smallWedgeGeometry}
            material={chaserBrowMaterial}
            position={[0.13, 0.09, 0.02]}
            rotation-z={-0.5}
            scale={[0.16, 0.045, 0.05]}
          />
        </group>
      )}

      {kind === 'spike' && (
        // Punto 9 de playtest ronda 3: exactamente 3 púas, TODAS en la cara
        // peligrosa (abanico centrado en +Z local, que useFrame orienta hacia
        // `enemy.facing`); nada en la cara trasera — comunica "golpéame por
        // aquí" sin ambigüedad. El grupo entero es lo que rota en useFrame.
        <group ref={spikeSecondaryGroupRef}>
          {Array.from({ length: SPIKE_FRONT_SPIKE_COUNT }, (_, i) => {
            const mid = (SPIKE_FRONT_SPIKE_COUNT - 1) / 2;
            const angle = (i - mid) * SPIKE_FRONT_FAN_SPREAD;
            return (
              <mesh
                key={i}
                geometry={unitSpike}
                material={spikeConeMaterial}
                position={[Math.sin(angle) * 0.4, 0, Math.cos(angle) * 0.4]}
                rotation-x={Math.PI / 2}
                rotation-y={angle}
                scale={[0.4, 0.38, 0.4]}
              />
            );
          })}
        </group>
      )}

      {kind === 'trail' &&
        Array.from({ length: TRAIL_DRIP_COUNT }, (_, i) => (
          <mesh
            key={i}
            ref={(el) => {
              trailDripRefs.current[i] = el;
            }}
            geometry={smallDotGeometry}
            material={trailDripMaterial}
            visible={false}
          />
        ))}

      {kind === 'shooter' && (
        <>
          <group ref={shooterEyeGroupRef} position={[0, 0.05, 0.36]}>
            <mesh ref={shooterEyeMeshRef} geometry={smallDotGeometry} material={shooterEyeMaterial} scale={0.13} />
          </group>
          <mesh
            ref={telegraphRef}
            geometry={unitCircle}
            material={shooterTelegraphMaterial}
            rotation-x={-Math.PI / 2}
            position={[0, -0.35, 0]}
            scale={0.75}
            visible={false}
          />
        </>
      )}

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
