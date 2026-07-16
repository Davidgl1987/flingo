/**
 * Antorcha de muro reutilizable (rama `estilo-oscuro`, playtest: "los cirios
 * de los jefes, parece que puedes chocar con ellos... o los haces más
 * pequeños y pegados a la pared, como antorchas"): reemplaza los cirios
 * grandes sueltos en mitad de la sala por antorchas pequeñas ADOSADAS al
 * muro, fuera del carril de juego — atrezzo visual puro (SIN colisión, la
 * sim no las conoce).
 *
 * Compartida por `BossCandlesView.tsx` (sala de jefe) y `ShopLightsView.tsx`
 * (sala de tienda): mismo componente `WallTorch`, cada vista solo decide
 * CUÁNTAS y DÓNDE vía `wallTorchLayout`. Extraída aquí (antes vivía solo en
 * BossCandlesView) para no duplicar geometría/parpadeo entre ambas vistas.
 *
 * Altura de montaje: la base se ancla a `TORCH_BASE_Y` (mismo valor que
 * `WALL_HEIGHT` en RoomView.tsx) — se lee como un aplique colgado del muro a
 * su altura, no como una vela apoyada en el suelo.
 *
 * Parpadeo: misma suma de senos (barata, sin asignaciones) que
 * `CandleLightView`/el cirio de jefe original, desfasada por índice de
 * antorcha para que no titilen sincronizadas entre sí.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh, PointLight } from 'three';
import type { AABB } from '@/engine/geometry';
import { bossCandleFlameMaterial, bossCandleWaxMaterial, unitCone, wallTorchWaxGeometry } from '@/game/render/assets';

/**
 * Desplazamiento HACIA FUERA del interior jugable: la antorcha se planta
 * SOBRE el cuerpo del muro (bounds es el interior; el muro vive más allá),
 * no flotando dentro de la sala — con inset positivo, la del punto medio del
 * muro sur quedaba superpuesta al héroe en cámara (verificado en preview de
 * ?boss=b4: se leía como un apéndice oscuro colgando de la vela).
 */
const TORCH_WALL_OUT = 0.25;
/** Longitud mínima del muro largo para añadir antorchas también en su punto medio (además de las 4 esquinas). */
const MIN_WALL_LENGTH_FOR_MIDPOINTS = 8;

/** Alto de la cera — igual que `wallTorchWaxGeometry` (render/assets.ts). */
const TORCH_WAX_HEIGHT = 0.7;
/** Base de la antorcha a la altura del muro (WALL_HEIGHT=0.9 en RoomView.tsx): aplique colgado, no clavado en el suelo. */
const TORCH_BASE_Y = 0.9;
const FLAME_HEIGHT = TORCH_BASE_Y + TORCH_WAX_HEIGHT + 0.08;
const FLAME_SCALE_XZ = 0.1;
const FLAME_SCALE_Y = 0.2;

/** Luz cálida de la antorcha: ambiente, no foco — más tímida que el cirio de jefe original. */
const LIGHT_HEIGHT = FLAME_HEIGHT;
const LIGHT_INTENSITY = 7.5;
const LIGHT_DISTANCE = 4;
const LIGHT_DECAY = 2;
const LIGHT_COLOR = '#ffb469';

/** Parpadeo: mismo criterio que CandleLightView (2 senos inconmensurados), desfasado por índice de antorcha. */
const FLICKER_FREQ_A = 4.3;
const FLICKER_FREQ_B = 9.1;
const FLICKER_WEIGHT_A = 0.6;
const FLICKER_WEIGHT_B = 0.4;
const FLICKER_AMPLITUDE = 0.16;
/** Desfase fijo (rad) por índice de antorcha — no coincide con las frecuencias de arriba, así que no vuelven a alinearse periódicamente. */
const FLICKER_PHASE_STEP = 2.3;

export function WallTorch({ x, z, index }: { x: number; z: number; index: number }) {
  const lightRef = useRef<PointLight>(null);
  const flameRef = useRef<Mesh>(null);

  useFrame((state) => {
    const light = lightRef.current;
    const flame = flameRef.current;
    if (!light && !flame) return;
    const t = state.clock.elapsedTime + index * FLICKER_PHASE_STEP;
    const flicker = FLICKER_WEIGHT_A * Math.sin(t * FLICKER_FREQ_A) + FLICKER_WEIGHT_B * Math.sin(t * FLICKER_FREQ_B);
    if (light) light.intensity = LIGHT_INTENSITY * (1 + FLICKER_AMPLITUDE * flicker);
    // Pulso de tamaño puro (mismo criterio que el cirio de jefe original): crece/decrece uniforme en X/Y/Z, sin vaivén de posición/rotación.
    if (flame) {
      const pulse = 1 + flicker * 0.1;
      flame.scale.set(FLAME_SCALE_XZ * pulse, FLAME_SCALE_Y * pulse, FLAME_SCALE_XZ * pulse);
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh
        geometry={wallTorchWaxGeometry}
        material={bossCandleWaxMaterial}
        position={[0, TORCH_BASE_Y + TORCH_WAX_HEIGHT / 2, 0]}
      />
      <mesh
        ref={flameRef}
        geometry={unitCone}
        material={bossCandleFlameMaterial}
        position={[0, FLAME_HEIGHT, 0]}
        scale={[FLAME_SCALE_XZ, FLAME_SCALE_Y, FLAME_SCALE_XZ]}
      />
      <pointLight
        ref={lightRef}
        color={LIGHT_COLOR}
        intensity={LIGHT_INTENSITY}
        distance={LIGHT_DISTANCE}
        decay={LIGHT_DECAY}
        position={[0, LIGHT_HEIGHT, 0]}
      />
    </group>
  );
}

/**
 * Posiciones de antorcha SOBRE el perímetro de muro de `bounds` (interior
 * jugable; el muro vive justo más allá): 4 esquinas siempre, más — si
 * `includeMidpoints` y la sala es suficientemente grande — los puntos medios
 * del PAR DE MUROS MÁS LARGO, para que una sala alargada gane antorchas en
 * sus muros largos y no se amontonen todas cerca de las esquinas de un muro
 * corto.
 */
export function wallTorchLayout(bounds: AABB, includeMidpoints: boolean): { x: number; z: number }[] {
  const positions = [
    { x: bounds.minX - TORCH_WALL_OUT, z: bounds.minY - TORCH_WALL_OUT },
    { x: bounds.minX - TORCH_WALL_OUT, z: bounds.maxY + TORCH_WALL_OUT },
    { x: bounds.maxX + TORCH_WALL_OUT, z: bounds.minY - TORCH_WALL_OUT },
    { x: bounds.maxX + TORCH_WALL_OUT, z: bounds.maxY + TORCH_WALL_OUT },
  ];
  if (!includeMidpoints) return positions;

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxY - bounds.minY;
  if (width >= depth && width >= MIN_WALL_LENGTH_FOR_MIDPOINTS) {
    const midX = (bounds.minX + bounds.maxX) / 2;
    positions.push({ x: midX, z: bounds.minY - TORCH_WALL_OUT }, { x: midX, z: bounds.maxY + TORCH_WALL_OUT });
  } else if (depth > width && depth >= MIN_WALL_LENGTH_FOR_MIDPOINTS) {
    const midZ = (bounds.minY + bounds.maxY) / 2;
    positions.push({ x: bounds.minX - TORCH_WALL_OUT, z: midZ }, { x: bounds.maxX + TORCH_WALL_OUT, z: midZ });
  }
  return positions;
}
