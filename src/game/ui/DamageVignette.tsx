/**
 * Vignette roja de daño (punto 5 de playtest): overlay DOM con
 * radial-gradient transparente en el centro, opaco en los bordes.
 *
 * - Flash breve al recibir daño: se detecta comparando el HP sincronizado del
 *   store (baja frecuencia, GDD "store.ts") con el HP anterior — mismo patrón
 *   que HUD.tsx ya usa para el parpadeo de corazones — y se retriggea
 *   remontando el nodo con `key`, sin re-render por frame ni enganchar a la
 *   cola de eventos de gameplay.
 * - Con hp === 1: el mismo vignette en bucle palpitante suave (animación CSS
 *   `animation-iteration-count: infinite`) hasta curarse o morir.
 *
 * Puramente CSS: ninguna lógica de esta pieza corre en el hot path de la sim.
 */

import { useEffect, useRef } from 'react';
import { useUiStore } from '../store';

export function DamageVignette() {
  const hp = useUiStore((s) => s.hp);
  const phase = useUiStore((s) => s.phase);

  const prevHp = useRef(hp);
  const damaged = hp < prevHp.current;
  useEffect(() => {
    prevHp.current = hp;
  }, [hp]);

  const critical = hp === 1 && phase === 'playing';

  return (
    <div
      key={damaged ? `hit-${hp}` : 'idle'}
      className={`damage-vignette${damaged ? ' damage-vignette-hit' : ''}${critical ? ' damage-vignette-critical' : ''}`}
      aria-hidden="true"
    />
  );
}
