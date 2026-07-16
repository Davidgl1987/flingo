/**
 * Shooter: "ojo/cañón" orientado siempre al héroe, que se ilumina (cambia de
 * material apagado a material de carga) mientras `shooterPhase==='charge'`.
 *
 * Aguaboca (rama `estilo-oscuro`, solo dark>=1): el "ojo" pasa a ser una
 * boca-tubo (cilindro corto horizontal, `unitCylinder` reutilizado con
 * rotación local) en vez del punto esférico de `dark=0` — mismo criterio de
 * intercambio de material al cargar/descargar, solo cambian geometría y
 * paleta (piedra oscura ↔ azul brillante en vez de gris ↔ rojo).
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { RefObject } from 'react';
import type { Group, Mesh } from 'three';
import type { GameSession } from '@/game/session/session';
import type { Enemy } from '@/game/world/types';
import {
  DARK_SILHOUETTES,
  shooterEyeChargeMaterial,
  shooterEyeMaterial,
  shooterTelegraphMaterial,
  shooterTubeGlowMaterial,
  shooterTubeRestMaterial,
  smallDotGeometry,
  unitCircle,
  unitCylinder,
} from '@/game/render/assets';

/** Material/geometría "en reposo" y "cargando" del ojo/cañón, según modo. */
const EYE_REST_MATERIAL = DARK_SILHOUETTES ? shooterTubeRestMaterial : shooterEyeMaterial;
const EYE_CHARGE_MATERIAL = DARK_SILHOUETTES ? shooterTubeGlowMaterial : shooterEyeChargeMaterial;

export function ShooterMesh({
  session,
  enemyId,
  groupRef,
}: {
  session: GameSession;
  enemyId: string;
  groupRef: RefObject<Group | null>;
}) {
  const telegraphRef = useRef<Mesh>(null);
  const shooterEyeGroupRef = useRef<Group>(null);
  const shooterEyeMeshRef = useRef<Mesh>(null);
  const wasCharging = useRef(false);

  useFrame(() => {
    const world = session.world;
    const enemy = world.enemies.find((e: Enemy) => e.id === enemyId);
    const group = groupRef.current;
    if (!enemy || !group || enemy.hp <= 0) return;

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
      if (eye) eye.material = charging ? EYE_CHARGE_MATERIAL : EYE_REST_MATERIAL;
    }
  });

  return (
    <>
      <group ref={shooterEyeGroupRef} position={[0, 0.05, 0.36]}>
        {DARK_SILHOUETTES ? (
          <mesh
            ref={shooterEyeMeshRef}
            geometry={unitCylinder}
            material={EYE_REST_MATERIAL}
            rotation-x={Math.PI / 2}
            scale={[0.22, 0.22, 0.42]}
          />
        ) : (
          <mesh ref={shooterEyeMeshRef} geometry={smallDotGeometry} material={EYE_REST_MATERIAL} scale={0.13} />
        )}
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
  );
}
