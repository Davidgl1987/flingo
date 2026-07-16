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
 * - Flecha (ronda 3, punto 3: "las flechas apenas se ven, puedes usar un
 *   cono"): CONO amarillo grande como cuerpo dominante (mucho más ancho que
 *   el fino asta+punta de la ronda anterior, que seguía sin leerse bien en
 *   móvil) + un asta corta detrás para dar sensación de proyectil alargado,
 *   orientado según su velocidad (rotación en el plano XZ). Proporciones a
 *   radio unitario; el GRUPO se escala por `p.radius` cada frame (nunca se
 *   recrea geometría).
 * - Hechizo (ronda 3, punto 11: "quita la bola, haz el rayo más grande"): SIN
 *   núcleo esférico — solo el zigzag eléctrico (más ancho/largo que antes) +
 *   chispas violeta en la estela, jitter determinista por frame a partir de
 *   world.time + índice de slot, SIN asignaciones.
 *
 * Presupuesto: nada de `new` en useFrame; el zigzag/chispas usan un número
 * FIJO de sub-meshes por slot (creados una vez en el JSX), mutados con
 * position/rotation/scale/visible cada frame.
 *
 * Identificador visual de mejoras (F5, docs/plans/ECONOMY_PLAN.md): la flecha
 * se ensancha por nivel de Colmillo de Hierro (flecha-dano) — SOLO en la
 * escala transversal (ejes X/Y del grupo, perpendiculares al vuelo), nunca en
 * el largo. El hechizo (Orbe Voraz / hechizo-dano) NO tiene lógica propia
 * aquí: su radio de sim ya crece con `spellRadiusBonus` (`p.radius`, ver
 * combat.ts) y `spellGroup.scale.setScalar(p.radius)` de más abajo ya lo
 * refleja — añadir otro factor duplicaría el efecto.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh, PointLight } from 'three';
import type { GameSession } from '@/game/session/session';
import type { Projectile } from '@/game/world/types';
import { getUpgradeLevel } from '@/game/session/upgrades';
import { arrowMaterial, arrowShaftGeometry, arrowTipMaterial, enemyProjectileMaterial, spellBoltMaterial, spellBoltSegmentGeometry, spellSparkGeometry, spellSparkMaterial, unitCone, unitSphere, WEAPON_COLOR } from '@/game/render/assets';
import { useDarkStore } from '@/game/render/dark-store';
import { arrowWidthScaleForLevel } from './upgrade-visuals';

/**
 * Luz de proyectil (rama `estilo-oscuro`, punto 3 de playtest: "los ataques
 * de flecha y hechizo deben emitir luz también", solo dark>=1): el view ya
 * reserva un <group> POR SLOT del pool (nunca instancing), así que cada slot
 * lleva su propia pointLight — nada de un pool aparte, se apaga sola con
 * `group.visible=false` cuando el slot está inactivo (three.js no atraviesa
 * objetos invisibles al recolectar luces, mismo criterio que EnemyViews).
 * Color del arma activa (`WEAPON_COLOR`, arrow/spell); el proyectil del
 * shooter enemigo (`kind==='enemy'`) recibe una versión bastante más débil,
 * en su propio color, trivial de sumar con el mismo ref. SIN sombra (coste).
 */
const PROJECTILE_LIGHT_INTENSITY = 6;
const PROJECTILE_LIGHT_DISTANCE = 3;
const PROJECTILE_LIGHT_DECAY = 2;
const PROJECTILE_LIGHT_INTENSITY_ENEMY = 3;
const PROJECTILE_LIGHT_DISTANCE_ENEMY = 2.2;

type ProjectileKind = Projectile['kind'];

// Proporciones de la flecha a radio unitario (el grupo se escala por
// p.radius): CONO grande como cuerpo dominante (mucho más ancho que el fino
// asta+punta anterior), con un asta corta detrás para dar sentido de
// proyectil alargado en vuelo.
const ARROW_CONE_LENGTH = 2.2;
const ARROW_CONE_THICKNESS = 2.6;
const ARROW_SHAFT_LENGTH = 1.6;
const ARROW_SHAFT_THICKNESS = 0.9;

/** Nº de segmentos del zigzag eléctrico por proyectil de hechizo. */
const SPELL_BOLT_SEGMENTS = 5;
/** Longitud total del zigzag a radio unitario (delante y detrás del centro): más grande (punto 11). */
const SPELL_BOLT_LENGTH = 3.2;
/** Amplitud del jitter lateral del zigzag a radio unitario: más ancho (punto 11). */
const SPELL_BOLT_JITTER = 0.85;
/** Grosor de cada segmento del zigzag (antes 0.045 a radio unitario del proyectil: casi invisible). */
const SPELL_BOLT_THICKNESS = 0.16;
/** Nº de chispas de estela por proyectil de hechizo. */
const SPELL_SPARK_COUNT = 4;
/** Cuánto se alargan las chispas por detrás del centro, a radio unitario. */
const SPELL_SPARK_TRAIL = 3.4;

/** Hash determinista barato, sin estado: dos enteros → [-1,1]. Sin Math.random. */
function jitter11(a: number, b: number): number {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * Flecha: CONO amarillo grande (cuerpo dominante, claramente visible) +
 * asta corta detrás, proporciones a radio unitario (el grupo padre se
 * escala por p.radius). El cono apunta en +Z local (la punta hacia delante,
 * en la dirección de movimiento — ProjectileSlot alinea +Z con la
 * velocidad).
 */
function ArrowShape() {
  return (
    <>
      <mesh
        geometry={unitCone}
        material={arrowMaterial}
        position={[0, 0, ARROW_CONE_LENGTH / 2]}
        rotation-x={Math.PI / 2}
        scale={[ARROW_CONE_THICKNESS, ARROW_CONE_LENGTH, ARROW_CONE_THICKNESS]}
      />
      <mesh
        geometry={arrowShaftGeometry}
        material={arrowTipMaterial}
        position={[0, 0, -ARROW_SHAFT_LENGTH / 2]}
        rotation-x={Math.PI / 2}
        scale={[ARROW_SHAFT_THICKNESS, ARROW_SHAFT_LENGTH, ARROW_SHAFT_THICKNESS]}
      />
    </>
  );
}

/** Hechizo: núcleo + zigzag eléctrico + chispas, proporciones a radio unitario. */
function SpellShape({ session, slotIndex }: { session: GameSession; slotIndex: number }) {
  const boltRefs = useRef<(Mesh | null)[]>([]);
  const sparkRefs = useRef<(Mesh | null)[]>([]);
  const segDepth = spellBoltSegmentGeometry.parameters.depth as number;
  const segBaseThickness = spellBoltSegmentGeometry.parameters.width as number;
  const boltThicknessScale = SPELL_BOLT_THICKNESS / segBaseThickness;

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
      seg.scale.set(boltThicknessScale, boltThicknessScale, len / segDepth);
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
      {/* Punto 11 de playtest ronda 3: sin núcleo esférico — solo energía/rayo. */}
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
  const silhouettes = useDarkStore((s) => s.dark >= 1);
  const groupRef = useRef<Group>(null);
  const arrowGroupRef = useRef<Group>(null);
  const spellGroupRef = useRef<Group>(null);
  const enemyBodyRef = useRef<Mesh>(null);
  const lightRef = useRef<PointLight>(null);
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
      if (p.kind === 'arrow') {
        // Colmillo de Hierro (F5): ensancha SOLO la sección transversal
        // (X/Y del grupo), el largo (Z, dirección de vuelo) se queda en p.radius.
        const widthScale = p.radius * arrowWidthScaleForLevel(getUpgradeLevel(session.world.hero, 'flecha-dano'));
        arrowGroup.scale.set(widthScale, widthScale, p.radius);
      }
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

    // Luz del proyectil (punto 3 de playtest, solo dark>=1: `lightRef` solo
    // existe si `silhouettes` montó la pointLight de abajo). Flecha/hechizo:
    // color del arma activa; shooter enemigo: mismo criterio, más débil.
    const light = lightRef.current;
    if (light) {
      if (p.kind === 'arrow' || p.kind === 'spell') {
        light.color.copy(WEAPON_COLOR[p.kind]);
        light.intensity = PROJECTILE_LIGHT_INTENSITY;
        light.distance = PROJECTILE_LIGHT_DISTANCE;
      } else {
        light.color.copy(enemyProjectileMaterial.color);
        light.intensity = PROJECTILE_LIGHT_INTENSITY_ENEMY;
        light.distance = PROJECTILE_LIGHT_DISTANCE_ENEMY;
      }
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
      {silhouettes && <pointLight ref={lightRef} decay={PROJECTILE_LIGHT_DECAY} />}
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
