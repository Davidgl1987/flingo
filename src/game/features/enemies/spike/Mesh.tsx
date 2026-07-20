/**
 * Spike (ronda 3, punto 9: "por detrás no debe tener pinchos, ponle 3 en la
 * parte delantera"): exactamente 3 púas (mismo unitSpike reescalado), TODAS
 * ancladas a la dirección `facing` en abanico frontal fijo — nunca rotan
 * libres ni aparecen en la cara trasera. En dark=0 esto sigue intacto.
 *
 * Mecánica invertida (playtest 2026-07-20, David: "que si le atacas por
 * detrás te pinche; solo se le podrá hacer daño por delante"): `facing`
 * (donde apuntan estas 3 púas y vive el ojo, más abajo) es ahora el lado
 * VULNERABLE — el lado peligroso (el que te pincha a TI) es el arco
 * trasero, ver `isSpikeContactDangerous` en combat.ts. Las púas de arriba
 * (dark=0) y el ojo (dark>=1) siguen marcando `facing` sin cambiar de sitio
 * — solo cambia lo que ese lado SIGNIFICA en la sim (ahora "atácame aquí"
 * en vez de "cuidado aquí").
 *
 * Penitente de Púas (rama `estilo-oscuro`, punto 5 de playtest ronda 4: "no
 * queda claro por qué lado pincha... que por delante tenga el ojo, y por la
 * espalda los pinchos", SOLO dark>=1): el frente se lee ahora por el OJO
 * (grande, dentro del grupo que sigue `facing`), no por conos — las 3 púas
 * FUNCIONALES de arriba se OCULTAN en dark>=1 para no competir visualmente
 * con el ojo; en dark=0 se quedan tal cual (paridad con el look clásico).
 * Las púas DECORATIVAS (silueta de erizo del concept) se restringen al ARCO
 * TRASERO (±SPIKE_DECOR_REAR_HALF_ARC alrededor de -facing) y viven DENTRO
 * del mismo grupo que sigue `facing` (no como antes, estáticas en el grupo
 * exterior que rota con el movimiento) — así el arco trasero decorativo se
 * mantiene siempre alineado con la cara peligrosa REAL de la sim.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { RefObject } from 'react';
import type { Group } from 'three';
import type { GameSession } from '@/game/session/session';
import type { Enemy } from '@/game/world/types';
import {
  smallDotGeometry,
  spikeConeMaterial,
  spikeEyeGlowMaterial,
  unitSpike,
} from '@/game/render/assets';
import { useDarkStore } from '@/game/render/dark-store';

/**
 * Púas del Spike (punto 9 de playtest ronda 3): exactamente 3, todas en la
 * cara `facing` (VULNERABLE desde la mecánica invertida del 2026-07-20, ver
 * comentario de cabecera), repartidas en abanico frontal (radianes entre
 * púas contiguas). Nada en la cara trasera. Ocultas en dark>=1 (punto 5 de
 * playtest ronda 4, ver comentario de cabecera): en dark=0 se quedan igual.
 */
const SPIKE_FRONT_SPIKE_COUNT = 3;
const SPIKE_FRONT_FAN_SPREAD = 0.55;

/** Nº de púas decorativas en el arco TRASERO del erizo (dark>=1, puramente estéticas). */
const SPIKE_DECOR_RING_COUNT = 6;
/**
 * Semiancho angular del arco trasero (punto 5 de playtest ronda 4: "conos
 * decorativos SOLO en el arco trasero, ±120° alrededor de -facing"): dentro
 * del grupo que sigue `facing` (ángulo local 0 = +Z local = `facing`), el
 * arco trasero cae centrado en π (= -facing).
 */
const SPIKE_DECOR_REAR_HALF_ARC = (120 * Math.PI) / 180;
/** Tamaño del ojo grande del Penitente de Púas (punto 5: "el OJO grande centrado en facing"), agrandado respecto al original ahora que es el único indicador visual del frente en dark>=1. */
const SPIKE_EYE_SCALE: readonly [number, number, number] = [0.19, 0.22, 0.09];

export function SpikeMesh({
  session,
  enemyId,
  groupRef,
}: {
  session: GameSession;
  enemyId: string;
  groupRef: RefObject<Group | null>;
}) {
  const silhouettes = useDarkStore((s) => s.dark >= 1);
  const spikeSecondaryGroupRef = useRef<Group>(null);

  useFrame(() => {
    const world = session.world;
    const enemy = world.enemies.find((e: Enemy) => e.id === enemyId);
    const group = groupRef.current;
    if (!enemy || !group || enemy.hp <= 0) return;

    if (spikeSecondaryGroupRef.current) {
      // Punto 9 de playtest ronda 3 ("Spike por detrás no debe tener
      // pinchos, ponle 3 en la parte delantera"): las 3 púas viven en un
      // único grupo anclado a la dirección `facing` fija del mundo (la cara
      // VULNERABLE desde 2026-07-20, misma normal que usa
      // isSpikeContactDangerous en combat.ts) — nunca rotan libremente ni
      // aparecen en la cara trasera (la cara peligrosa REAL ahora).
      // Compensa la rotación del grupo padre (que sigue la velocidad al
      // patrullar) para que el abanico quede fijo en coordenadas de mundo.
      spikeSecondaryGroupRef.current.rotation.y = Math.atan2(enemy.facing.x, enemy.facing.y) - group.rotation.y;
    }
  });

  return (
    <>
      {/* Polos decorativos (arriba/abajo, dark>=1, puramente estéticos): en
          el eje Y no hay "delante" ni "detrás" (invariantes a la rotación en
          Y), así que se quedan en el grupo exterior sin necesitar seguir a
          `facing`. */}
      {silhouettes && (
        <>
          <mesh geometry={unitSpike} material={spikeConeMaterial} position={[0, 0.4, 0]} scale={[0.24, 0.22, 0.24]} />
          <mesh
            geometry={unitSpike}
            material={spikeConeMaterial}
            position={[0, -0.4, 0]}
            rotation-x={Math.PI}
            scale={[0.24, 0.22, 0.24]}
          />
        </>
      )}
      {/* Punto 9 de playtest ronda 3: exactamente 3 púas, TODAS en la cara
          `facing` (abanico centrado en +Z local, que useFrame orienta hacia
          `enemy.facing`) — VULNERABLE desde 2026-07-20; nada en la cara
          trasera (la peligrosa REAL) — comunica "golpéame por aquí" sin
          ambigüedad. El grupo entero es lo que rota en useFrame
          para seguir SIEMPRE la dirección real de `facing`, independiente de
          hacia dónde patrulle el cuerpo. */}
      <group ref={spikeSecondaryGroupRef}>
        {/* Púas FUNCIONALES del frente: ocultas en dark>=1 (punto 5 de
            playtest ronda 4, ver comentario de cabecera — el frente se lee
            por el OJO, no por conos); en dark=0 se quedan igual. */}
        {!silhouettes &&
          Array.from({ length: SPIKE_FRONT_SPIKE_COUNT }, (_, i) => {
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
        {/* Púas decorativas del erizo (dark>=1, puramente estéticas): SOLO en
            el arco TRASERO (±SPIKE_DECOR_REAR_HALF_ARC alrededor de -facing,
            ángulo local π) — nunca delante, para no competir con el ojo. Al
            vivir dentro de este mismo grupo (que sigue `facing`), el arco
            trasero se mantiene siempre opuesto a la cara peligrosa real.
            Orientación (playtest 2026-07-20, David: "no lleva bien puestos
            los pinchos, apuntan hacia dentro"): `unitSpike` (ConeGeometry)
            tiene su ápice en +Y local por defecto. La punta yace EXACTAMENTE
            sobre el eje de rotación-Y, así que `rotation-y={angle}` (el
            patrón que sí usan las 3 púas FUNCIONALES de arriba, con un
            abanico estrecho de ±0.55 rad donde el error es casi
            imperceptible) es un no-op sobre la punta: el eje Euler por
            defecto ('XYZ') aplica la rotación en Y ANTES que la de X al
            transformar un vector, y un punto sobre el eje de rotación no se
            mueve por esa rotación — así que la punta quedaba SIEMPRE fija en
            +Z local (independiente de `angle`), en vez de seguir la posición
            radial de cada púa. Para el arco trasero, con ±120°, eso es
            visible a ojo: en el centro exacto del arco (`angle` = π) la
            punta terminaba apuntando a +Z, justo hacia el CENTRO del cuerpo
            (dirección opuesta a su propia posición, que está en -Z) — hacia
            dentro. Fix: usar `rotation-z={-angle}` en su lugar (verificado
            numéricamente con Object3D.matrixWorld: con rotation-x=π/2 y
            rotation-z=-angle, la punta SÍ sigue la dirección radial
            (sin(angle), 0, cos(angle)) para cualquier `angle`, dot=1 con la
            posición). Las 3 púas FUNCIONALES de dark=0 no se tocan. */}
        {silhouettes &&
          Array.from({ length: SPIKE_DECOR_RING_COUNT }, (_, i) => {
            const t = SPIKE_DECOR_RING_COUNT > 1 ? i / (SPIKE_DECOR_RING_COUNT - 1) : 0.5;
            const angle = Math.PI + (t - 0.5) * 2 * SPIKE_DECOR_REAR_HALF_ARC;
            return (
              <mesh
                key={`rear-${i}`}
                geometry={unitSpike}
                material={spikeConeMaterial}
                position={[Math.sin(angle) * 0.38, 0.03, Math.cos(angle) * 0.38]}
                rotation-x={Math.PI / 2}
                rotation-z={-angle}
                scale={[0.26, 0.24, 0.26]}
              />
            );
          })}
        {/* Penitente de Púas: un único ojo cálido GRANDE, siempre centrado en
            `facing` (punto 5 de playtest ronda 4: "por delante tenga el
            ojo"). */}
        {silhouettes && (
          <mesh geometry={smallDotGeometry} material={spikeEyeGlowMaterial} position={[0, 0.06, 0.42]} scale={SPIKE_EYE_SCALE} />
        )}
      </group>
    </>
  );
}
