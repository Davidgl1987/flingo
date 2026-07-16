/**
 * Bola héroe: esfera + blob shadow (SIN sombras dinámicas). Lee la sim en
 * useFrame y muta los object3D directamente, con interpolación entre ticks.
 *
 * Feedback visual:
 * - Parpadeo durante los i-frames (GDD §6) y caída al foso (fase 2).
 * - Squash & stretch (fase 4, SOLO render): estiramiento a lo largo de la
 *   velocidad cuando va rápido, aplastamiento breve al detectar una frenada
 *   brusca (impacto). La sim nunca se entera.
 * - Emisión de la estela (GDD §12): deposita puntos en session.effects.trail
 *   cuando supera el umbral de velocidad (el pool lo dibuja TrailView).
 * - Identificador visual de mejoras (F5, docs/plans/ECONOMY_PLAN.md): pinchos
 *   del Erizo de Acero, estiramiento amplificado de la Estela de Cometa,
 *   escala extra del Canto Rodado y burbuja de la Burbuja de Cuarzo. Pinchos
 *   y burbuja viven como HIJOS del mesh del héroe (bodyRef) para heredar
 *   gratis su squash/stretch/escala y su parpadeo de i-frames — solo su
 *   posición/orientación se fija una vez al montar (son estáticos relativos
 *   a la bola); useFrame solo cambia visibilidad/opacidad, nunca su pose.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Quaternion, Vector3, type Group, type Mesh } from 'three';
import { HERO_RADIUS } from './constants';
import { PIT_FALL_DURATION } from '@/game/features/hazards/constants';
import { TRAIL_EMIT_INTERVAL, TRAIL_SPEED_THRESHOLD } from '@/game/features/effects/trail';
import { getUpgradeLevel } from '@/game/session/upgrades';
import type { GameSession } from '@/game/session/session';
import type { WeaponMode } from '@/game/world/types';
import {
  aimDotMaterial,
  blobShadowMaterial,
  candleEyeMaterial,
  candleFlameMaterial,
  heroCandleGeometry,
  heroMaterial,
  heroShieldMaterial,
  heroSpikeGeometry,
  heroSpikeMaterial,
  smallDotGeometry,
  unitCircle,
  unitCone,
  unitSphere,
  WEAPON_COLOR,
} from '@/game/render/assets';
import { useDarkStore } from '@/game/render/dark-store';
import { boulderScaleFactor, cometStretchFactor, shieldBubbleOpacity, spikeCountForLevel } from './upgrade-visuals';

/** Frecuencia del parpadeo de invulnerabilidad (alternancias por segundo). */
const IFRAME_BLINK_HZ = 12;

/**
 * Color del héroe por arma (punto 1 de playtest ronda 3): rigidez del lerp
 * de color (mayor = transición más rápida, pero siempre suave, nunca un
 * corte brusco) y tuning del burst de partículas al cambiar de arma.
 */
const WEAPON_COLOR_LERP_STIFFNESS = 10;
const WEAPON_SWITCH_BURST_COUNT = 14;
const WEAPON_SWITCH_BURST_SPEED = 2.4;
const WEAPON_SWITCH_BURST_SIZE = 0.08;
const WEAPON_SWITCH_BURST_LIFE = 0.32;

/** Estiramiento por u/s de velocidad, con tope de +35% a velocidad alta (esfera, dark=0: SIN CAMBIOS). */
const STRETCH_PER_SPEED = 0.028;
const STRETCH_MAX = 0.35;
/** Frenada (u/s perdidos entre frames) que dispara el squash de impacto. */
const SQUASH_DECEL_THRESHOLD = 3.5;
const SQUASH_DURATION = 0.12;
/** Aplastamiento del squash: escala vertical 0.62, horizontal compensada. */
const SQUASH_FLATTEN = 0.62;

/** Escala uniforme de la Burbuja de Cuarzo (F5) respecto al radio del héroe: envuelve la bola, no la toca. */
const SHIELD_BUBBLE_SCALE = 1.4;

/**
 * Inclinación de la vela hacia la dirección de movimiento (rama
 * `estilo-oscuro`, punto 1 de playtest ronda 4: "podría estirar la parte de
 * arriba de la vela hacia donde se está tirando"; SOLO dark>=1, la esfera de
 * dark=0 no toca este código): ángulo objetivo proporcional a la velocidad,
 * reutilizando el mismo tope/ratio que ya usaba el estiramiento de la esfera
 * (STRETCH_MAX/STRETCH_PER_SPEED — velocidades ya calibradas para este
 * juego, y el tope de 0.35 rad es justo el que pide David), amortiguado con
 * el mismo criterio 1-exp(-k·dt) que el lerp de color de arma de arriba
 * (WEAPON_COLOR_LERP_STIFFNESS) para que nunca dé un tirón. Se suaviza el
 * VECTOR de inclinación entero (no solo su magnitud) para que un cambio
 * brusco de dirección tampoco “salte”, solo se re-oriente con la misma
 * suavidad.
 */
const CANDLE_TILT_MAX = STRETCH_MAX;
const CANDLE_TILT_PER_SPEED = STRETCH_PER_SPEED;
const CANDLE_TILT_LERP_STIFFNESS = 9;

/**
 * Estiramiento VERTICAL de la vela con la velocidad (rama `estilo-oscuro`,
 * mismo punto de playtest): sustituye, SOLO en dark>=1, al estiramiento
 * horizontal de la esfera — alargar un cilindro fino tumbado en el plano del
 * suelo no se lee como "lanzada" (queda como un cilindro acostado), así que
 * aquí se alarga verticalmente en su lugar. Tope más sutil que STRETCH_MAX
 * ("ligero estiramiento", pedido explícito). Nota de tuning: sin
 * herramientas de preview en esta tarea (prohibidas), valor razonado, no
 * verificado visualmente — revisar en playtest real.
 */
const CANDLE_VERTICAL_STRETCH_MAX = 0.15;
const CANDLE_VERTICAL_STRETCH_PER_SPEED = STRETCH_PER_SPEED * 0.5;

/**
 * Pivote de inclinación = "la base" de la vela (punto 1 de playtest ronda 4:
 * "la base no debe despegarse ni hundirse en el suelo"): fracción de
 * `visualRadius` a la que ya quedaba la base del cilindro con el código
 * anterior a este cambio (`body.position.y = visualRadius` fijo, menos la
 * mitad del alto local de `heroCandleGeometry`, 0.55) — se reutiliza tal
 * cual para que el reposo (velocidad ~0, sin inclinar) se vea IDÉNTICO a
 * como se veía antes de este cambio. No es literalmente el suelo (y=0):
 * corregir ese posible pequeño flotado no es parte de este encargo, solo
 * fijar el PIVOTE de la inclinación a ese punto (sea cual sea) para que
 * nunca se despegue ni se hunda AL INCLINARSE.
 */
const CANDLE_PIVOT_HEIGHT_FRACTION = 1 - 0.55;
/** Mitad del alto local de `heroCandleGeometry` (radio 0.42, alto 1.1): mantiene la base pinchada al pivote pase lo que pase con el escalado vertical (squash o estiramiento). */
const CANDLE_HALF_HEIGHT = 0.55;

/**
 * Héroe = vela (rama `estilo-oscuro`, solo dark>=1): la llama/ojos viven en
 * un grupo aparte (`candleGroupRef`), NO como hijo directo del mesh del
 * cuerpo (`bodyRef`) — un hijo de `bodyRef` heredaría gratis su
 * squash/estiramiento vertical, y una llama deformándose igual que la cera
 * se leería raro. Ambos (`bodyRef` y `candleGroupRef`) SÍ son hijos de
 * `candleTiltGroupRef` (el pivote de la base, ver arriba): la inclinación
 * los arrastra a los dos por igual ("la llama y los ojos deben acompañar la
 * inclinación", punto 1 de playtest), pero solo `bodyRef` recibe además el
 * escalado de squash/estiramiento.
 *
 * Llama: pulso de tamaño (punto 3 de playtest ronda 4: "parece que se
 * balancea, mejor que crezca y decrezca") — suma de dos senos a frecuencias
 * inconmensuradas (barato, sin asignaciones) que modulan una escala
 * UNIFORME, nunca su posición/rotación (eliminadas: ya no hay balanceo).
 */
const FLAME_PULSE_FREQ_A = 3.1;
const FLAME_PULSE_FREQ_B = 5.7;
const FLAME_HEIGHT_FACTOR = 1.55;
const FLAME_BASE_SCALE = 0.5;
/** Amplitud del pulso de tamaño de la llama: ±15%, pedido explícito de playtest. */
const FLAME_PULSE_AMPLITUDE = 0.15;

/**
 * Gesto de victoria (playtest 2026-07-15, David: "quizá algún gesto de
 * victoria antes de la modal") durante 'boss-victory-pause' (world/step.ts,
 * BOSS_VICTORY_PAUSE_DURATION): saltitos suaves. SOLO render — no toca
 * velocity/posición de la sim, y usa `world.time` (no un reloj propio),
 * mismo patrón determinista que el bob de items (ItemView.tsx). abs(sin) da
 * un rebote que siempre sale del suelo hacia arriba (nunca se hunde por
 * debajo de la posición de reposo), corte limpio al abrirse el modal porque
 * `world.phase` deja de ser 'boss-victory-pause' ese mismo frame.
 */
const VICTORY_HOP_HEIGHT = 0.16;
const VICTORY_HOP_FREQUENCY = 6.5; // rad/s: ritmo alegre, no frenético

/**
 * Direcciones (en la esfera unitaria) de los 12 pinchos del Erizo de Acero
 * (F5): 3 "anillos ecuatoriales" de 4 pinchos, con un pequeño desfase de
 * ángulo entre anillos para que no queden alineados verticalmente. El orden
 * importa: `spikeCountForLevel` revela los índices [0,4) en nivel 1, [0,8)
 * en nivel 2 y los 12 en nivel 3 — así que el anillo 0 (ecuador puro) es el
 * primero en aparecer. Geometría pura, no se testea (sin infra de render 3D).
 */
function buildSpikeDirections(): Array<{ x: number; y: number; z: number }> {
  const RING_Y = [0, 0.5, -0.5];
  const RING_OFFSET_DEG = [0, 45, 20];
  const dirs: Array<{ x: number; y: number; z: number }> = [];
  for (let ring = 0; ring < RING_Y.length; ring++) {
    const y = RING_Y[ring];
    const xzRadius = Math.sqrt(Math.max(0, 1 - y * y));
    for (let i = 0; i < 4; i++) {
      const angle = ((i * 90 + RING_OFFSET_DEG[ring]) * Math.PI) / 180;
      dirs.push({ x: Math.sin(angle) * xzRadius, y, z: Math.cos(angle) * xzRadius });
    }
  }
  return dirs;
}

const SPIKE_DIRECTIONS = buildSpikeDirections();

/**
 * Héroe-vela (dark>=1, punto 5 de playtest): los 12 pinchos del Erizo de
 * Acero se posicionan con `SPIKE_DIRECTIONS` (puntos sobre la ESFERA
 * unitaria, radio 1) porque en `dark=0` `bodyRef` es literalmente esa esfera
 * — al cambiar su geometría a `heroCandleGeometry` (cilindro chato, radio
 * 0.42 / alto 1.1, ver assets.ts) esos mismos puntos quedarían muy lejos de
 * la nueva superficie (sobre todo el ecuador, a radio 1 contra un cilindro de
 * radio 0.42) y "flotarían" fuera del cuerpo. Reproyección barata: escala
 * cada dirección unitaria por el radio/semialto reales del cilindro en vez de
 * recalcular geometría de contacto exacta — aproximado pero "razonable"
 * (mismo criterio que pide el playtest), sin tocar la orientación (el
 * quaternion de abajo sigue usando la dirección ORIGINAL sin escalar, así los
 * pinchos siguen apuntando hacia fuera).
 */
const CANDLE_SPIKE_SURFACE_XZ = 0.42;
const CANDLE_SPIKE_SURFACE_Y = 0.55;

export function HeroView({ session }: { session: GameSession }) {
  const silhouettes = useDarkStore((s) => s.dark >= 1);
  const candleTiltGroupRef = useRef<Group>(null);
  const bodyRef = useRef<Mesh>(null);
  const shadowRef = useRef<Mesh>(null);
  const shieldRef = useRef<Mesh>(null);
  const spikeRefs = useRef<(Mesh | null)[]>([]);
  // Héroe = vela (dark>=1, ver comentario de FLAME_PULSE_FREQ_A más arriba).
  const candleGroupRef = useRef<Group>(null);
  const flameRef = useRef<Mesh>(null);
  const prevSpeed = useRef(0);
  const squashUntil = useRef(0);
  const trailAccumulator = useRef(0);
  // Arma del frame anterior: detecta el CAMBIO para disparar el burst de
  // partículas una sola vez (no cada frame mientras se mantiene el modo).
  const prevWeaponMode = useRef<WeaponMode | null>(null);
  // Inclinación de la vela (punto 1 de playtest ronda 4): vector 2D (x,z)
  // suavizado cuya magnitud es el ángulo actual y cuya dirección es hacia
  // dónde se inclina — suavizar el VECTOR entero (no ángulo+eje por
  // separado) evita saltos cuando la dirección de movimiento cambia bruscamente.
  const candleLean = useRef({ x: 0, z: 0 });
  // Escalares reutilizados cada frame (cero allocs en useFrame, mismo
  // criterio que el resto del render de esta rama).
  const candleTiltAxis = useRef(new Vector3());
  const candleTiltQuat = useRef(new Quaternion());

  // Pose de los pinchos (F5): fija al montar y cada vez que cambia de esfera
  // a cilindro (silhouettes, ver CANDLE_SPIKE_SURFACE_* arriba) — nunca en
  // useFrame, son hijos estáticos del mesh del héroe (heredan su transform
  // cada frame sin recálculo propio). Usa Quaternion.setFromUnitVectors para
  // orientar el cono (eje +Y local) hacia fuera, en vez de trigonometría de
  // Euler frágil; la orientación usa SIEMPRE la dirección original de la
  // esfera (no la reproyectada), así sigue apuntando "hacia fuera" en ambas
  // geometrías sin necesitar una normal de cilindro exacta.
  useEffect(() => {
    const up = new Vector3(0, 1, 0);
    const surfaceXZ = silhouettes ? CANDLE_SPIKE_SURFACE_XZ : 1;
    const surfaceY = silhouettes ? CANDLE_SPIKE_SURFACE_Y : 1;
    SPIKE_DIRECTIONS.forEach((dir, i) => {
      const mesh = spikeRefs.current[i];
      if (!mesh) return;
      const dirVec = new Vector3(dir.x, dir.y, dir.z);
      mesh.position.set(dir.x * surfaceXZ, dir.y * surfaceY, dir.z * surfaceXZ);
      mesh.quaternion.setFromUnitVectors(up, dirVec);
    });
  }, [silhouettes]);

  useFrame((_, delta) => {
    const world = session.world;
    const hero = world.hero;
    const alpha = session.renderAlpha;
    const x = session.heroPrevX + (hero.position.x - session.heroPrevX) * alpha;
    const z = session.heroPrevY + (hero.position.y - session.heroPrevY) * alpha;

    const tiltGroup = candleTiltGroupRef.current;
    const body = bodyRef.current;
    const shadow = shadowRef.current;
    const shield = shieldRef.current;

    // Niveles de mejora relevantes al render (F5): leídos cada frame desde
    // `hero.upgradeLevels`/`hero.modifiers` — barato (lookups en objeto
    // pequeño) y así una compra en tienda se refleja sin remontar nada.
    const firmezaLevel = getUpgradeLevel(hero, 'cuerpo-firmeza');
    const visualRadius = HERO_RADIUS * boulderScaleFactor(firmezaLevel);
    const cometFactor = cometStretchFactor(getUpgradeLevel(hero, 'cuerpo-velocidad'));
    const spikeVisibleCount = spikeCountForLevel(getUpgradeLevel(hero, 'cuerpo-dano'));
    const shieldCharges = hero.modifiers.shieldCharges;

    for (let i = 0; i < SPIKE_DIRECTIONS.length; i++) {
      const spike = spikeRefs.current[i];
      if (spike) spike.visible = i < spikeVisibleCount;
    }
    if (shield) {
      shield.visible = shieldCharges > 0;
      heroShieldMaterial.opacity = shieldBubbleOpacity(shieldCharges);
    }

    // Color del héroe según arma activa (punto 1 de playtest ronda 3): lerp
    // continuo hacia el color objetivo (nunca un corte brusco), independiente
    // del framerate. El indicador de puntería (aimDotMaterial) comparte el
    // mismo objetivo para que apunten siempre al mismo lenguaje de color. En
    // dark>=1 (héroe = vela) el cuerpo deja de lerpear (queda cera fija,
    // assets.ts) y el lerp se aplica a la llama en su lugar.
    const targetColor = WEAPON_COLOR[hero.weaponMode];
    const colorK = 1 - Math.exp(-WEAPON_COLOR_LERP_STIFFNESS * delta);
    if (silhouettes) {
      candleFlameMaterial.color.lerp(targetColor, colorK);
    } else {
      heroMaterial.color.lerp(targetColor, colorK);
    }
    aimDotMaterial.color.lerp(targetColor, colorK);

    // Cambio de arma: burst de partículas del color NUEVO alrededor del
    // héroe (feedback inmediato, independiente del lerp de color que sigue
    // en curso). Se dispara una sola vez por transición, en el frame en que
    // se detecta el cambio.
    if (prevWeaponMode.current !== null && prevWeaponMode.current !== hero.weaponMode) {
      session.effects.particles.burst(
        x,
        z,
        WEAPON_SWITCH_BURST_COUNT,
        WEAPON_SWITCH_BURST_SPEED,
        WEAPON_SWITCH_BURST_SIZE,
        WEAPON_SWITCH_BURST_LIFE,
        targetColor.r,
        targetColor.g,
        targetColor.b,
        world.rng,
      );
    }
    prevWeaponMode.current = hero.weaponMode;

    // Caída al foso: encoge y se hunde durante la animación.
    if (world.fallingUntil > 0) {
      const remaining = world.fallingUntil - world.time;
      const t = 1 - Math.max(0, remaining) / PIT_FALL_DURATION; // 0 → 1
      const scale = visualRadius * Math.max(0.05, 1 - t);
      if (silhouettes && tiltGroup) {
        // Sin inclinación durante la caída (nunca la tuvo): el pivote vuelve
        // a identidad y `body.position.set` de abajo, que sigue escribiendo
        // coordenadas de MUNDO como siempre, vuelve a ser válido tal cual.
        tiltGroup.position.set(0, 0, 0);
        tiltGroup.quaternion.identity();
      }
      if (body) {
        body.visible = true;
        body.position.set(x, visualRadius * (1 - t) - 0.4 * t, z);
        body.rotation.set(0, 0, 0);
        body.scale.setScalar(scale);
      }
      if (shadow) shadow.visible = false;
      if (silhouettes && candleGroupRef.current) candleGroupRef.current.visible = false;
      prevSpeed.current = 0;
      return;
    }

    const speed = Math.hypot(hero.velocity.x, hero.velocity.y);

    // Squash de impacto: frenada brusca entre frames (rebote/embestida).
    if (prevSpeed.current - speed > SQUASH_DECEL_THRESHOLD) {
      squashUntil.current = world.time + SQUASH_DURATION;
    }
    prevSpeed.current = speed;

    // Estela mientras va rápido (cadencia fija; el pool es circular, nunca crece).
    if (speed > TRAIL_SPEED_THRESHOLD && world.phase === 'playing') {
      trailAccumulator.current += delta;
      while (trailAccumulator.current >= TRAIL_EMIT_INTERVAL) {
        trailAccumulator.current -= TRAIL_EMIT_INTERVAL;
        session.effects.trail.emit(x, z, HERO_RADIUS * 0.8, undefined, targetColor.r, targetColor.g, targetColor.b);
      }
    } else {
      trailAccumulator.current = 0;
    }

    // Parpadeo de i-frames: alterna visibilidad a frecuencia fija.
    const invulnerable = world.time < hero.invulnerableUntil;
    const blinkOn = !invulnerable || Math.floor(world.time * IFRAME_BLINK_HZ) % 2 === 0;

    // Saltito de victoria: ver comentario de VICTORY_HOP_HEIGHT más arriba.
    const victoryHop =
      world.phase === 'boss-victory-pause' ? Math.abs(Math.sin(world.time * VICTORY_HOP_FREQUENCY)) * VICTORY_HOP_HEIGHT : 0;

    const squashing = world.time < squashUntil.current;

    if (silhouettes) {
      // Héroe = vela inclinándose hacia la dirección de movimiento (punto 1
      // de playtest ronda 4): `tiltGroup` vive en el PIVOTE (la base de la
      // vela, ver CANDLE_PIVOT_HEIGHT_FRACTION) y es el único que carga
      // x/z/victoryHop y la rotación de inclinación; `body` (hijo) solo
      // recibe su escala de squash/estiramiento y una posición LOCAL que
      // mantiene su base siempre pinchada al pivote, pase lo que pase con
      // esa escala.
      if (tiltGroup) {
        tiltGroup.position.set(x, visualRadius * CANDLE_PIVOT_HEIGHT_FRACTION + victoryHop, z);

        const targetAngle = Math.min(CANDLE_TILT_MAX, speed * CANDLE_TILT_PER_SPEED);
        let targetLeanX = 0;
        let targetLeanZ = 0;
        if (speed > 1e-4) {
          targetLeanX = (hero.velocity.x / speed) * targetAngle;
          targetLeanZ = (hero.velocity.y / speed) * targetAngle;
        }
        const tiltK = 1 - Math.exp(-CANDLE_TILT_LERP_STIFFNESS * delta);
        const lean = candleLean.current;
        lean.x += (targetLeanX - lean.x) * tiltK;
        lean.z += (targetLeanZ - lean.z) * tiltK;

        const angle = Math.hypot(lean.x, lean.z);
        if (angle > 1e-4) {
          // Eje horizontal perpendicular a la dirección de inclinación
          // (derivado con la fórmula de Rodrigues para que el TOP del
          // cilindro se incline hacia (lean.x, lean.z)): con lean = ángulo ·
          // dirección unitaria, axis = normalize(lean.z, 0, -lean.x).
          candleTiltAxis.current.set(lean.z / angle, 0, -lean.x / angle);
          candleTiltQuat.current.setFromAxisAngle(candleTiltAxis.current, angle);
          tiltGroup.quaternion.copy(candleTiltQuat.current);
        } else {
          tiltGroup.quaternion.identity();
        }
      }

      if (body) {
        body.visible = blinkOn;
        body.rotation.set(0, 0, 0); // el cilindro es de revolución: el yaw no cambia su silueta

        let scaleXZ: number;
        let scaleY: number;
        if (squashing) {
          // Mismo aplastamiento de impacto que ya existía (SQUASH_FLATTEN),
          // aplicado ahora al cilindro en vez de a la esfera.
          const widen = 1 / Math.sqrt(SQUASH_FLATTEN);
          scaleXZ = visualRadius * widen;
          scaleY = visualRadius * SQUASH_FLATTEN;
        } else {
          // Estiramiento vertical con la velocidad (punto 1 de playtest
          // ronda 4): "lanzada", sin tocar el radio. Amplificado por la
          // Estela de Cometa (F5) igual que hacía el estiramiento de la
          // esfera — mismo upgrade, mismo criterio, solo cambia el eje.
          const stretchBonus =
            Math.min(CANDLE_VERTICAL_STRETCH_MAX, speed * CANDLE_VERTICAL_STRETCH_PER_SPEED) * cometFactor;
          scaleXZ = visualRadius;
          scaleY = visualRadius * (1 + stretchBonus);
        }
        body.scale.set(scaleXZ, scaleY, scaleXZ);
        // La base del cilindro (a -CANDLE_HALF_HEIGHT en su espacio local)
        // debe quedar SIEMPRE en el origen de `tiltGroup` (el pivote): se
        // compensa la posición local con la mitad de la altura ACTUAL, así
        // ni el squash ni el estiramiento la despegan del suelo ni la hunden.
        body.position.set(0, scaleY * CANDLE_HALF_HEIGHT, 0);
      }
    } else {
      // Esfera clásica (dark=0): EXACTAMENTE el código de siempre. El
      // tiltGroup se mantiene en identidad (nunca se toca aquí), así que la
      // posición absoluta de `body.position.set` de abajo sigue siendo
      // mundo puro — cero diferencia con el comportamiento anterior a este
      // cambio.
      if (tiltGroup) {
        tiltGroup.position.set(0, 0, 0);
        tiltGroup.quaternion.identity();
      }
      if (body) {
        body.visible = blinkOn;
        body.position.set(x, visualRadius + victoryHop, z);

        if (squashing) {
          // Aplastamiento: bajo y ancho, conservando volumen aproximado.
          const widen = 1 / Math.sqrt(SQUASH_FLATTEN);
          body.rotation.y = 0;
          body.scale.set(visualRadius * widen, visualRadius * SQUASH_FLATTEN, visualRadius * widen);
        } else if (speed > 0.5) {
          // Estiramiento a lo largo de la velocidad (eje Z local rotado hacia
          // la dirección de movimiento), compensado en los otros ejes. La
          // Estela de Cometa (F5) amplifica SOLO el bono que ya depende de la
          // velocidad (nunca el "1" base), así a velocidad 0 no cambia nada.
          const stretchBonus = Math.min(STRETCH_MAX, speed * STRETCH_PER_SPEED) * cometFactor;
          const stretch = 1 + stretchBonus;
          const thin = 1 / Math.sqrt(stretch);
          body.rotation.y = Math.atan2(hero.velocity.x, hero.velocity.y);
          body.scale.set(visualRadius * thin, visualRadius * thin, visualRadius * stretch);
        } else {
          body.rotation.y = 0;
          body.scale.setScalar(visualRadius);
        }
      }
    }

    if (shadow) {
      shadow.visible = true;
      shadow.position.set(x, 0.02, z);
    }

    // Héroe = vela (dark>=1): la llama/ojos siguen al cuerpo (posición e
    // inclinación, vía `tiltGroup`, su padre común) pero NUNCA su
    // squash/estiramiento — grupo aparte, actualizado a mano.
    if (silhouettes) {
      const candleGroup = candleGroupRef.current;
      if (candleGroup) {
        candleGroup.visible = blinkOn;
        // Local a `tiltGroup` (que ya lleva x/z/pivote e inclinación): solo
        // la altura de anclaje de la llama/ojos respecto al pivote de la
        // base, elegida para que la altura ABSOLUTA de la llama/ojos no
        // cambie ni un milímetro respecto a como se veía antes de este
        // cambio (ver comentario de CANDLE_PIVOT_HEIGHT_FRACTION).
        candleGroup.position.set(0, visualRadius * (1 - CANDLE_PIVOT_HEIGHT_FRACTION), 0);
      }
      const flame = flameRef.current;
      if (flame) {
        // Pulso de tamaño (punto 3 de playtest ronda 4): SIN oscilación de
        // posición/rotación (eliminadas, ya no "balancea"), solo escala
        // UNIFORME, con la misma suma de senos barata de siempre
        // (frecuencias inconmensuradas, sin asignaciones, sin estroboscopia).
        const pulseA = Math.sin(world.time * FLAME_PULSE_FREQ_A);
        const pulseB = Math.sin(world.time * FLAME_PULSE_FREQ_B);
        const pulse = 1 + (pulseA * 0.6 + pulseB * 0.4) * FLAME_PULSE_AMPLITUDE;
        flame.position.set(0, visualRadius * FLAME_HEIGHT_FACTOR, 0);
        flame.rotation.z = 0;
        const flameScale = visualRadius * FLAME_BASE_SCALE * pulse;
        flame.scale.set(flameScale, flameScale * 1.8, flameScale);
      }
    }
  });

  return (
    <>
      <group ref={candleTiltGroupRef}>
        <mesh ref={bodyRef} geometry={silhouettes ? heroCandleGeometry : unitSphere} material={heroMaterial} scale={HERO_RADIUS}>
          {/* Pinchos del Erizo de Acero (F5): 12 pre-creados, visibilidad por nivel. */}
          {SPIKE_DIRECTIONS.map((_, i) => (
            <mesh
              key={i}
              ref={(el) => {
                spikeRefs.current[i] = el;
              }}
              geometry={heroSpikeGeometry}
              material={heroSpikeMaterial}
              visible={false}
            />
          ))}
          {/* Burbuja de Cuarzo (F5): visible mientras haya cargas de escudo. */}
          <mesh ref={shieldRef} geometry={unitSphere} material={heroShieldMaterial} scale={SHIELD_BUBBLE_SCALE} visible={false} />
        </mesh>
        {silhouettes && (
          <group ref={candleGroupRef}>
            {/* Llama (MUTABLE, ver useFrame): cono estrecho, autoiluminado. */}
            <mesh ref={flameRef} geometry={unitCone} material={candleFlameMaterial} />
            {/* Carita de vela: dos ojos negros ovalados simples (concept art), a media altura del cilindro (punto 2 de playtest ronda 4), tamaño reducido a la mitad. */}
            <mesh
              geometry={smallDotGeometry}
              material={candleEyeMaterial}
              position={[-HERO_RADIUS * 0.35, 0, HERO_RADIUS * 0.82]}
              scale={[HERO_RADIUS * 0.065, HERO_RADIUS * 0.1, HERO_RADIUS * 0.04]}
            />
            <mesh
              geometry={smallDotGeometry}
              material={candleEyeMaterial}
              position={[HERO_RADIUS * 0.35, 0, HERO_RADIUS * 0.82]}
              scale={[HERO_RADIUS * 0.065, HERO_RADIUS * 0.1, HERO_RADIUS * 0.04]}
            />
          </group>
        )}
      </group>
      <mesh
        ref={shadowRef}
        geometry={unitCircle}
        material={blobShadowMaterial}
        rotation-x={-Math.PI / 2}
        scale={HERO_RADIUS * 1.25}
      />
    </>
  );
}
