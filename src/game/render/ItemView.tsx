/**
 * Objetos recogibles (GDD §9): moneda, poción, llave. Los items nuevos
 * (monedas soltadas por enemigos) se añaden al array `world.items` en runtime
 * (ver sim/items.ts `dropCoinAt`); React reconcilia por key/id con normalidad
 * ya que esto ocurre a tasa de eventos discretos, no por frame.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import type { GameSession } from '../session';
import type { Item } from '../sim/world';
import { coinMaterial, keyMaterial, potionMaterial, unitBox, unitSphere } from './assets';

const ITEM_MATERIAL = { coin: coinMaterial, potion: potionMaterial, key: keyMaterial } as const;
const ITEM_GEOMETRY = { coin: unitSphere, potion: unitSphere, key: unitBox } as const;
const ITEM_SCALE: Record<Item['kind'], number> = { coin: 0.22, potion: 0.28, key: 0.22 };
const ITEM_HEIGHT: Record<Item['kind'], number> = { coin: 0.3, potion: 0.32, key: 0.3 };

function ItemMesh({ session, itemId }: { session: GameSession; itemId: string }) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    const item = session.world.items.find((i) => i.id === itemId);
    const mesh = meshRef.current;
    if (!item || !mesh) return;
    mesh.visible = item.active;
    if (item.active) {
      const bob = Math.sin(session.world.time * 3 + item.position.x) * 0.05;
      mesh.position.set(item.position.x, ITEM_HEIGHT[item.kind] + bob, item.position.y);
      mesh.rotation.y = session.world.time * 1.5;
    }
  });

  const item = session.world.items.find((i) => i.id === itemId);
  const kind = item ? item.kind : 'coin';

  return (
    <mesh
      ref={meshRef}
      geometry={ITEM_GEOMETRY[kind]}
      material={ITEM_MATERIAL[kind]}
      scale={ITEM_SCALE[kind]}
    />
  );
}

export function ItemViews({ session }: { session: GameSession }) {
  return (
    <>
      {session.world.items.map((item) => (
        <ItemMesh key={item.id} session={session} itemId={item.id} />
      ))}
    </>
  );
}
