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
 * - Spike: además de su púa frontal ya existente, várias púas secundarias
 *   (mismo unitSpike reescalado) + giro lento de amenaza sobre su eje.
 * - Trail: squash de babosa (aplastamiento rítmico) + gotas de baba goteando.
 * - Shooter: "ojo/cañón" orientado siempre al héroe, que se ilumina (cambia
 *   de material apagado a material de carga) mientras `shooterPhase==='charge'`.
 *
 * Todo con geometrías/materiales compartidos de assets.ts; cero asignaciones
 * en useFrame (solo escalares y mutación de refs ya existentes).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Material, Mesh } from 'three';
import type { GameSession } from '../session';
import type { Enemy, EnemyKind } from '../sim/world';
import {
  blobShadowMaterial,
  chaserBrowMaterial,
  chaserMaterial,
  dummyMaterial,
  enemyHitFlashMaterial,
  eyePupilMaterial,
  eyeWhiteMaterial,
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
};

const ENEMY_RADIUS_RENDER = 0.4;

/** Nº de púas secundarias del Spike (además de la frontal ya existente). */
const SPIKE_SECONDARY_COUNT = 3;
/** Nº de gotas de baba del Trail. */
const TRAIL_DRIP_COUNT = 2;

function EnemyMesh({
  session,
  enemyId,
  kind,
}: {
  session: GameSession;
  enemyId: string;
  kind: EnemyKind;
}) {
  const bodyRef = useRef<Mesh>(null);
  const shadowRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const spikeFaceRef = useRef<Mesh>(null);
  const spikeSecondaryGroupRef = useRef<Group>(null);
  const telegraphRef = useRef<Mesh>(null);
  const wasFlashing = useRef(false);

  // Dummy: ojos + balanceo torpe.
  const dummyEyesRef = useRef<Group>(null);
  // Chaser: cejas/mirada agresiva.
  const chaserFaceRef = useRef<Group>(null);
  // Trail: cuerpo (para squash) + gotas.
  const trailDripRefs = useRef<(Mesh | null)[]>([]);
  // Shooter: ojo/cañón orientado al héroe.
  const shooterEyeGroupRef = useRef<Group>(null);
  const shooterEyeMeshRef = useRef<Mesh>(null);
  const wasCharging = useRef(false);

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
    group.position.set(enemy.position.x, ENEMY_RADIUS_RENDER + bob, enemy.position.y);

    const shadow = shadowRef.current;
    if (shadow) shadow.position.set(enemy.position.x, 0.02, enemy.position.y);

    const flashing = world.time < enemy.hitFlashUntil;
    if (flashing !== wasFlashing.current) {
      wasFlashing.current = flashing;
      const body = bodyRef.current;
      if (body) {
        body.material = flashing ? enemyHitFlashMaterial : ENEMY_MATERIAL[kind];
      }
    }

    const speed = Math.hypot(enemy.velocity.x, enemy.velocity.y);
    if (speed > 0.05) {
      group.rotation.y = Math.atan2(enemy.velocity.x, enemy.velocity.y);
    }

    if (kind === 'spike') {
      if (spikeFaceRef.current) {
        // La púa apunta siempre en la dirección `facing` fija del mundo, no en
        // la de movimiento (el Spike no rota al patrullar): compensa la
        // rotación del grupo para que quede en coordenadas de mundo.
        spikeFaceRef.current.rotation.y = Math.atan2(enemy.facing.x, enemy.facing.y) - group.rotation.y;
      }
      // Giro lento de amenaza: las púas secundarias rotan sobre el eje
      // vertical del enemigo, independiente de su orientación de movimiento.
      if (spikeSecondaryGroupRef.current) {
        spikeSecondaryGroupRef.current.rotation.y = world.time * 0.6 - group.rotation.y;
      }
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
      const dx = world.hero.position.x - enemy.position.x;
      const dy = world.hero.position.y - enemy.position.y;
      chaserFaceRef.current.rotation.y = Math.atan2(dx, dy) - group.rotation.y;
      // Pulso de velocidad: se agranda ligeramente mientras corre acelerado
      // (heroAiming es la misma señal que su IA usa para CHASER_SPEED_WHILE_AIMING).
      const pulse = world.heroAiming ? 1.12 + 0.05 * Math.sin(world.time * 16) : 1;
      chaserFaceRef.current.scale.setScalar(pulse);
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
        material={ENEMY_MATERIAL[kind]}
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
        <group ref={chaserFaceRef} position={[0, 0.1, 0.34]}>
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
        <>
          <mesh
            ref={spikeFaceRef}
            geometry={unitSpike}
            material={spikeConeMaterial}
            position={[0, 0, 0.42]}
            rotation-x={Math.PI / 2}
            scale={[0.45, 0.4, 0.45]}
          />
          {/* Púas secundarias: mismo cono de amenaza, repartidas y giratorias. */}
          <group ref={spikeSecondaryGroupRef}>
            {Array.from({ length: SPIKE_SECONDARY_COUNT }, (_, i) => {
              const angle = ((i + 1) / (SPIKE_SECONDARY_COUNT + 1)) * Math.PI * 2;
              return (
                <mesh
                  key={i}
                  geometry={unitSpike}
                  material={spikeConeMaterial}
                  position={[Math.sin(angle) * 0.36, 0, Math.cos(angle) * 0.36]}
                  rotation-x={Math.PI / 2}
                  rotation-y={angle}
                  scale={[0.28, 0.26, 0.28]}
                />
              );
            })}
          </group>
        </>
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
    </group>
  );
}

export function EnemyViews({ session }: { session: GameSession }) {
  return (
    <>
      {session.world.enemies.map((enemy) => (
        <EnemyMesh key={enemy.id} session={session} enemyId={enemy.id} kind={enemy.kind} />
      ))}
    </>
  );
}
