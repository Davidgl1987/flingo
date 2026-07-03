/**
 * Selector de modo de arma (GDD §3/§5/§12): 3 botones grandes (≥48 px) abajo
 * al centro, cada uno con su barra de recarga visual.
 *
 * La barra de recarga se actualiza con un rAF propio que LEE la sim
 * (session.world) y muta `style` de los divs vía refs — NUNCA setState por
 * frame. El único estado de React es el modo seleccionado (cambia al pulsar).
 */

import { useEffect, useRef, useState } from 'react';
import { ARROW_COOLDOWN, BODY_LAUNCH_COOLDOWN, SPELL_COOLDOWN } from '../content/constants';
import type { GameSession } from '../session';
import type { WeaponMode } from '../sim/world';

const MODES: { mode: WeaponMode; label: string; icon: string }[] = [
  { mode: 'body', label: 'Cuerpo', icon: '●' },
  { mode: 'arrow', label: 'Flecha', icon: '➤' },
  { mode: 'spell', label: 'Hechizo', icon: '✦' },
];

/** Fracción [0,1] de recarga completada para un modo (1 = listo). */
function cooldownProgress(session: GameSession, mode: WeaponMode): number {
  const world = session.world;
  const hero = world.hero;
  const reload = hero.modifiers.reloadMultiplier;
  let elapsed: number;
  let total: number;
  if (mode === 'body') {
    elapsed = world.time - hero.lastLaunchTime;
    total = BODY_LAUNCH_COOLDOWN;
  } else if (mode === 'arrow') {
    elapsed = world.time - hero.lastArrowTime;
    total = ARROW_COOLDOWN * reload;
  } else {
    elapsed = world.time - hero.lastSpellTime;
    total = SPELL_COOLDOWN * reload;
  }
  if (total <= 0) return 1;
  const t = elapsed / total;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function WeaponBar({ session }: { session: GameSession }) {
  const [active, setActive] = useState<WeaponMode>(session.world.hero.weaponMode);
  const overlayRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      for (let i = 0; i < MODES.length; i++) {
        const overlay = overlayRefs.current[i];
        if (overlay) {
          const progress = cooldownProgress(session, MODES[i].mode);
          // Cortina que baja: llena (recargando) → vacía (listo).
          overlay.style.transform = `scaleY(${1 - progress})`;
        }
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [session]);

  const select = (mode: WeaponMode) => {
    session.world.hero.weaponMode = mode;
    setActive(mode);
  };

  return (
    <div className="weapon-bar">
      {MODES.map(({ mode, label, icon }, i) => (
        <button
          key={mode}
          type="button"
          className={`weapon-btn${active === mode ? ' weapon-btn-active' : ''}`}
          onPointerDown={(e) => {
            // Evita que el gesto de puntería del canvas capture este toque.
            e.stopPropagation();
            select(mode);
          }}
          aria-label={`Arma: ${label}`}
          aria-pressed={active === mode}
        >
          <span className="weapon-btn-icon">{icon}</span>
          <span className="weapon-btn-label">{label}</span>
          <div
            className="weapon-btn-cooldown"
            ref={(el) => {
              overlayRefs.current[i] = el;
            }}
          />
        </button>
      ))}
    </div>
  );
}
