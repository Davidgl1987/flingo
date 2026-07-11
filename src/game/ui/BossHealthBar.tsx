/**
 * Barra de vida del jefe (GDD §15 / Fase B0, docs/plans/BOSSES_PLAN.md):
 * aparece al entrar en la sala de jefe, con su nombre. Igual que WeaponBar,
 * lee `session.world` en un rAF propio y muta `style` directamente — NUNCA
 * setState por frame. El único estado de React es "hay jefe visible sí/no"
 * y su nombre, que cambian rarísima vez (entrar/salir de la sala de jefe).
 */

import { useEffect, useRef, useState } from 'react';
import { getBossDef } from '@/game/content/bosses';
import type { GameSession } from '@/game/session';
import { isBoss } from '@/game/sim/boss';
import type { Enemy } from '@/game/sim/world';

interface VisibleBoss {
  id: string;
  name: string;
}

/**
 * Busca el primer jefe vivo o muerto de la sala actual del héroe (una sola
 * sala de jefe por run). En modo sala única (?boss= / playtest del editor)
 * las entidades no llevan roomId: el jefe pertenece a la única sala que hay.
 */
function findCurrentBoss(session: GameSession): Enemy | null {
  const world = session.world;
  for (const enemy of world.enemies) {
    if (isBoss(enemy) && (enemy.roomId === undefined || enemy.roomId === world.currentRoomId)) {
      return enemy;
    }
  }
  return null;
}

export function BossHealthBar({ session }: { session: GameSession }) {
  const [visible, setVisible] = useState<VisibleBoss | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const phaseLabelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let lastId: string | null = null;
    const update = () => {
      const boss = findCurrentBoss(session);

      if (boss?.id !== lastId) {
        lastId = boss?.id ?? null;
        setVisible(boss && boss.bossId ? { id: boss.id, name: getBossDef(boss.bossId).name } : null);
      }

      if (boss) {
        const fill = fillRef.current;
        if (fill) {
          const fraction = boss.maxHp > 0 ? Math.max(0, boss.hp / boss.maxHp) : 0;
          fill.style.transform = `scaleX(${fraction})`;
        }
        const phaseLabel = phaseLabelRef.current;
        if (phaseLabel) phaseLabel.textContent = boss.bossPhase > 1 ? `Fase ${boss.bossPhase}` : '';
      }

      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [session]);

  if (!visible) return null;

  return (
    <div className="boss-health-bar" aria-label={`Vida de ${visible.name}`}>
      <div className="boss-health-name">
        {visible.name}
        <span ref={phaseLabelRef} className="boss-health-phase" />
      </div>
      <div className="boss-health-track">
        <div ref={fillRef} className="boss-health-fill" />
      </div>
    </div>
  );
}
