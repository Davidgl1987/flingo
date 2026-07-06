/**
 * Objetos recogibles (GDD §9): moneda, poción, llave. Los items nuevos
 * (monedas soltadas por enemigos, ver sim/items.ts `dropCoinAt`/`dropPotionAt`)
 * se añaden a `world.items` en runtime vía `.push`, sin pasar por setState de
 * React: `ItemViews` necesita su propio trigger de re-render por `.length`
 * (ver comentario en `ItemViews` más abajo) o esos items nacen sin mesh.
 *
 * Formas (feedback de playtest):
 * - Moneda (punto 9): cilindro plano ("moneda de canto visible") que gira
 *   sobre su eje vertical con el tiempo del mundo (determinista).
 * - Poción (punto 10): frasco compuesto (cuerpo bulboso + cuello + tapón),
 *   rosa/rojo, en vez de una esfera genérica.
 * - Llave: sin cambios (caja dorada, ya legible).
 *
 * Todas las formas usan geometrías/materiales compartidos de assets.ts; el
 * grupo por item se muta en useFrame (posición de bob + rotación), cero
 * asignaciones.
 */

import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import type { Group } from 'three';
import type { GameSession } from '../session';
import type { Item } from '../sim/world';
import {
  coinGeometry,
  coinMaterial,
  coinRimMaterial,
  keyMaterial,
  potionBodyGeometry,
  potionCapGeometry,
  potionCapMaterial,
  potionMaterial,
  potionNeckGeometry,
  unitBox,
} from './assets';

const ITEM_HEIGHT: Record<Item['kind'], number> = { coin: 0.3, potion: 0.32, key: 0.3 };
/** Radio visual de la moneda (diámetro del cilindro plano de assets.ts, escalado). */
const COIN_RADIUS = 0.24;
const POTION_SCALE = 0.24;

function CoinShape() {
  return (
    <>
      {/* Cara de la moneda: cilindro plano, dorado. */}
      <mesh geometry={coinGeometry} material={coinMaterial} scale={[COIN_RADIUS * 2, 1, COIN_RADIUS * 2]} />
      {/* Canto más oscuro (mismo cilindro, radio ligeramente menor y opaco por dentro): da volumen al girar. */}
      <mesh
        geometry={coinGeometry}
        material={coinRimMaterial}
        scale={[COIN_RADIUS * 1.94, 1.02, COIN_RADIUS * 1.94]}
      />
    </>
  );
}

function PotionShape() {
  return (
    <group scale={POTION_SCALE}>
      {/* Cuerpo bulboso. */}
      <mesh geometry={potionBodyGeometry} material={potionMaterial} scale={[0.85, 1, 0.85]} />
      {/* Cuello fino sobre el cuerpo. */}
      <mesh geometry={potionNeckGeometry} material={potionMaterial} position={[0, 0.95, 0]} scale={[1, 0.7, 1]} />
      {/* Tapón/corcho en la boca. */}
      <mesh geometry={potionCapGeometry} material={potionCapMaterial} position={[0, 1.42, 0]} scale={[1, 0.4, 1]} />
    </group>
  );
}

function ItemMesh({ session, itemId }: { session: GameSession; itemId: string }) {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    const item = session.world.items.find((i) => i.id === itemId);
    const group = groupRef.current;
    if (!item || !group) return;
    group.visible = item.active;
    if (item.active) {
      const bob = Math.sin(session.world.time * 3 + item.position.x) * 0.05;
      group.position.set(item.position.x, ITEM_HEIGHT[item.kind] + bob, item.position.y);
      if (item.kind === 'coin') {
        // Moneda (ronda 3, punto 10: "que giren en el otro eje"): gira sobre
        // el eje Z (perpendicular al que se usaba antes, X) para que se vea
        // el volteo real (canto visible) con el otro "sentido" de vuelco en
        // pantalla — rotar sobre el eje vertical Y no mostraría ningún cambio
        // visual en un disco plano (ese es el único eje descartado).
        group.rotation.set(0, 0, 0);
        group.rotation.z = session.world.time * 2.4;
      } else {
        group.rotation.set(0, session.world.time * 1.5, 0);
      }
    }
  });

  const item = session.world.items.find((i) => i.id === itemId);
  const kind = item ? item.kind : 'coin';

  return (
    <group ref={groupRef}>
      {kind === 'coin' && <CoinShape />}
      {kind === 'potion' && <PotionShape />}
      {kind === 'key' && <mesh geometry={unitBox} material={keyMaterial} scale={0.22} />}
    </group>
  );
}

export function ItemViews({ session }: { session: GameSession }) {
  // Mismo bug/fix que BarrelViews (HazardView.tsx): `world.items` crece por
  // `.push` (dropCoinAt/dropPotionAt) sin ningún setState de React de por
  // medio, así que el `.map` de abajo nunca ve los items nuevos a menos que
  // este componente vuelva a renderizar. Trigger barato: length leída una vez
  // por frame, setState solo si cambió.
  const [count, setCount] = useState(session.world.items.length);
  useFrame(() => {
    if (session.world.items.length !== count) setCount(session.world.items.length);
  });
  return (
    <>
      {session.world.items.map((item) => (
        <ItemMesh key={item.id} session={session} itemId={item.id} />
      ))}
    </>
  );
}
