/**
 * Proyectiles: pool preasignado de meshes (uno por slot de `world.projectiles`,
 * nunca se crean/destruyen, solo se muestran/ocultan). Cada slot reserva de
 * antemano las tres formas posibles (flecha/hechizo/enemigo) y solo activa la
 * que toque; un slot puede reciclarse de un `kind`/`owner` a otro entre
 * disparos, así que la forma visible y su escala se deciden en useFrame,
 * nunca por props JSX estáticas (el radio del hechizo puede cambiar con la
 * mejora "Hechizo Arcano").
 *
 * Formas (feedback de playtest):
 * - Flecha (punto 3, "las flechas son bolas"): asta cilíndrica + punta cónica
 *   + emplumado, orientada según su velocidad (rotación en el plano XZ). Las
 *   proporciones se definen a radio unitario; el GRUPO se escala por
 *   `p.radius` cada frame (nunca se recrea geometría).
 * - Hechizo (punto 2, "efecto como rayo"): núcleo esférico brillante + zigzag
 *   eléctrico (segmentos preasignados, jitter determinista por frame a partir
 *   de world.time + índice de slot, SIN asignaciones) + chispas violeta en la
 *   estela.
 *
 * Presupuesto: nada de `new` en useFrame; el zigzag/chispas usan un número
 * FIJO de sub-meshes por slot (creados una vez en el JSX), mutados con
 * position/rotation/scale/visible cada frame.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh } from 'three';
import type { GameSession } from '../session';
import type { Projectile } from '../sim/world';
import {
  arrowFletchingGeometry,
  arrowMaterial,
  arrowShaftGeometry,
  arrowTipGeometry,
  arrowTipMaterial,
  enemyProjectileMaterial,
  spellBoltMaterial,
  spellBoltSegmentGeometry,
  spellCoreGeometry,
  spellCoreMaterial,
  spellSparkGeometry,
  spellSparkMaterial,
  unitSphere,
} from './assets';

type ProjectileKind = Projectile['kind'];

// Proporciones de la flecha a radio unitario (el grupo se escala por p.radius).
const ARROW_SHAFT_LENGTH = 2.6;
const ARROW_SHAFT_THICKNESS = 0.85;
const ARROW_TIP_LENGTH = 1.1;
const ARROW_TIP_THICKNESS = 1.3;
const ARROW_FLETCHING_SCALE = 1.6;
const ARROW_FLETCHING_SPREAD = 0.5;

/** Nº de segmentos del zigzag eléctrico por proyectil de hechizo. */
const SPELL_BOLT_SEGMENTS = 4;
/** Longitud total del zigzag a radio unitario (delante y detrás del núcleo). */
const SPELL_BOLT_LENGTH = 2.2;
/** Amplitud del jitter lateral del zigzag a radio unitario. */
const SPELL_BOLT_JITTER = 0.5;
/** Nº de chispas de estela por proyectil de hechizo. */
const SPELL_SPARK_COUNT = 3;
/** Cuánto se alargan las chispas por detrás del núcleo, a radio unitario. */
const SPELL_SPARK_TRAIL = 2.6;

/** Hash determinista barato, sin estado: dos enteros → [-1,1]. Sin Math.random. */
function jitter11(a: number, b: number): number {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Flecha: asta + punta + emplumado, proporciones a radio unitario (el grupo padre se escala por p.radius). */
function ArrowShape() {
  return (
    <>
      <mesh
        geometry={arrowShaftGeometry}
        material={arrowMaterial}
        rotation-x={Math.PI / 2}
        scale={[ARROW_SHAFT_THICKNESS, ARROW_SHAFT_LENGTH, ARROW_SHAFT_THICKNESS]}
      />
      <mesh
        geometry={arrowTipGeometry}
        material={arrowTipMaterial}
        position={[0, 0, ARROW_SHAFT_LENGTH / 2 + ARROW_TIP_LENGTH / 2]}
        rotation-x={Math.PI / 2}
        scale={[ARROW_TIP_THICKNESS, ARROW_TIP_LENGTH, ARROW_TIP_THICKNESS]}
      />
      <mesh
        geometry={arrowFletchingGeometry}
        material={arrowTipMaterial}
        position={[ARROW_FLETCHING_SPREAD, 0, -ARROW_SHAFT_LENGTH / 2]}
        rotation-x={-Math.PI / 2}
        scale={ARROW_FLETCHING_SCALE}
      />
      <mesh
        geometry={arrowFletchingGeometry}
        material={arrowTipMaterial}
        position={[-ARROW_FLETCHING_SPREAD, 0, -ARROW_SHAFT_LENGTH / 2]}
        rotation-x={-Math.PI / 2}
        scale={ARROW_FLETCHING_SCALE}
      />
    </>
  );
}

/** Hechizo: núcleo + zigzag eléctrico + chispas, proporciones a radio unitario. */
function SpellShape({ session, slotIndex }: { session: GameSession; slotIndex: number }) {
  const boltRefs = useRef<(Mesh | null)[]>([]);
  const sparkRefs = useRef<(Mesh | null)[]>([]);
  const segDepth = spellBoltSegmentGeometry.parameters.depth as number;

  useFrame((state) => {
    const p = session.world.projectiles[slotIndex];
    if (!p.active || p.kind !== 'spell') return;
    const t = state.clock.elapsedTime;

    // Zigzag: segmentos encadenados en Z local, cada uno con desplazamiento
    // lateral (X) oscilante — jitter determinista por segmento y por slot
    // (sin Math.random), sin asignaciones.
    const step = SPELL_BOLT_LENGTH / SPELL_BOLT_SEGMENTS;
    let prevX = 0;
    let prevZ = -SPELL_BOLT_LENGTH / 2;
    for (let i = 0; i < SPELL_BOLT_SEGMENTS; i++) {
      const seg = boltRefs.current[i];
      if (!seg) continue;
      const z = -SPELL_BOLT_LENGTH / 2 + step * (i + 1);
      const wobble = Math.sin(t * 22 + slotIndex * 7 + i * 2.3) * SPELL_BOLT_JITTER;
      const x = i === SPELL_BOLT_SEGMENTS - 1 ? 0 : wobble;
      const midX = (prevX + x) / 2;
      const midZ = (prevZ + z) / 2;
      const dx = x - prevX;
      const dz = z - prevZ;
      const len = Math.hypot(dx, dz);
      seg.position.set(midX, 0, midZ);
      seg.rotation.set(0, Math.atan2(dx, dz), 0);
      seg.scale.set(1, 1, len / segDepth);
      prevX = x;
      prevZ = z;
    }
    // Chispas: puntitos deterministas en la estela (Z negativa), con leve
    // deriva lateral/temporal para que parpadeen sin asignar nada.
    for (let i = 0; i < SPELL_SPARK_COUNT; i++) {
      const spark = sparkRefs.current[i];
      if (!spark) continue;
      const phase = jitter11(slotIndex * 11 + i * 5, 3);
      const trailT = ((t * 3 + i / SPELL_SPARK_COUNT) % 1) * SPELL_SPARK_TRAIL;
      spark.position.set(phase * SPELL_BOLT_JITTER * 0.7, Math.sin(t * 9 + i) * 0.15, -SPELL_BOLT_LENGTH / 2 - trailT);
      const fade = 1 - trailT / SPELL_SPARK_TRAIL;
      spark.scale.setScalar(0.4 * fade);
    }
  });

  return (
    <>
      <mesh geometry={spellCoreGeometry} material={spellCoreMaterial} scale={0.7} />
      {Array.from({ length: SPELL_BOLT_SEGMENTS }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            boltRefs.current[i] = el;
          }}
          geometry={spellBoltSegmentGeometry}
          material={spellBoltMaterial}
        />
      ))}
      {Array.from({ length: SPELL_SPARK_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            sparkRefs.current[i] = el;
          }}
          geometry={spellSparkGeometry}
          material={spellSparkMaterial}
        />
      ))}
    </>
  );
}

function ProjectileSlot({ session, index }: { session: GameSession; index: number }) {
  const groupRef = useRef<Group>(null);
  const arrowGroupRef = useRef<Group>(null);
  const spellGroupRef = useRef<Group>(null);
  const enemyBodyRef = useRef<Mesh>(null);
  const lastKind = useRef<ProjectileKind | null>(null);

  useFrame(() => {
    const p = session.world.projectiles[index];
    const group = groupRef.current;
    if (!group) return;
    if (!p.active) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.position.set(p.position.x, 0.3, p.position.y);

    // Orientación: alinea el eje +Z local (asta de flecha / eje del hechizo)
    // con la dirección de movimiento.
    const speed = Math.hypot(p.velocity.x, p.velocity.y);
    if (speed > 0.01) {
      group.rotation.y = Math.atan2(p.velocity.x, p.velocity.y);
    }

    if (lastKind.current !== p.kind) lastKind.current = p.kind;

    const arrowGroup = arrowGroupRef.current;
    if (arrowGroup) {
      arrowGroup.visible = p.kind === 'arrow';
      if (p.kind === 'arrow') arrowGroup.scale.setScalar(p.radius);
    }
    const spellGroup = spellGroupRef.current;
    if (spellGroup) {
      spellGroup.visible = p.kind === 'spell';
      if (p.kind === 'spell') spellGroup.scale.setScalar(p.radius);
    }
    const enemyBody = enemyBodyRef.current;
    if (enemyBody) {
      enemyBody.visible = p.kind === 'enemy';
      if (p.kind === 'enemy') enemyBody.scale.setScalar(p.radius);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <group ref={arrowGroupRef}>
        <ArrowShape />
      </group>
      <group ref={spellGroupRef}>
        <SpellShape session={session} slotIndex={index} />
      </group>
      <mesh ref={enemyBodyRef} geometry={unitSphere} material={enemyProjectileMaterial} />
    </group>
  );
}

export function ProjectileViews({ session }: { session: GameSession }) {
  const count = session.world.projectiles.length;
  const indices = Array.from({ length: count }, (_, i) => i);
  return (
    <>
      {indices.map((i) => (
        <ProjectileSlot key={i} session={session} index={i} />
      ))}
    </>
  );
}
