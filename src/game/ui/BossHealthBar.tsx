/**
 * Barra de vida del jefe (GDD §15 / Fase B0, docs/plans/BOSSES_PLAN.md):
 * aparece al entrar en la sala de jefe, con su nombre. Igual que WeaponBar,
 * lee `session.world` en un rAF propio y muta `style` directamente — NUNCA
 * setState por frame. El único estado de React es "hay jefe visible sí/no"
 * y su nombre, que cambian rarísima vez (entrar/salir de la sala de jefe).
 */

import { useEffect, useRef, useState } from 'react';
import { getBossDef } from '../content/bosses';
import { QUEEN_COLUMN_DAMAGE_FRACTION } from '../content/constants';
import type { GameSession } from '../session';
import { isBoss } from '../sim/boss';
import type { Enemy } from '../sim/world';

interface VisibleBoss {
  id: string;
  name: string;
  /** true si esta barra debe leerse como "8 columnas" (Reina, rediseño 2026-07-10, GDD §15.3). */
  segmented: boolean;
}

/**
 * Marcas de segmento (rediseño 2026-07-10, GDD §15.3 §7 punto 2: "barra
 * segmentada en 8 chunks conectados a sus cuerdas"): 8 columnas × 12% cada
 * una = 96%; una marca al final de CADA columna (12%, 24%, … 96% del ancho).
 * El 4% final tras la última marca queda SIN separador: es el remate a
 * embestidas al cuerpo (QUEEN_BODY_RAM_DAMAGE_FRACTION), no otra columna.
 * Estáticas por ahora: el drenado animado por cuerda hacia cada columna es
 * de una tarea posterior (T2/T6 del plan de rediseño).
 */
const QUEEN_COLUMN_COUNT = 8;
const SEGMENT_MARK_PERCENTS = Array.from(
  { length: QUEEN_COLUMN_COUNT },
  (_, i) => (i + 1) * QUEEN_COLUMN_DAMAGE_FRACTION * 100,
);

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
        setVisible(
          boss && boss.bossId
            ? { id: boss.id, name: getBossDef(boss.bossId).name, segmented: boss.bossId === 'queen' }
            : null,
        );
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
        {visible.segmented && (
          <div className="boss-health-segments">
            {SEGMENT_MARK_PERCENTS.map((pct) => (
              <span key={pct} className="boss-health-segment-mark" style={{ left: `${pct}%` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
