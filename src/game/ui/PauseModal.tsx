/**
 * Modal de pausa (GDD §12): mejoras acumuladas + leyenda del juego (colores
 * de enemigos/hazards) + reanudar/reiniciar. La sim ya está detenida por
 * fase ('paused') antes de que este modal se muestre; aquí solo se reanuda
 * (vuelve a 'playing') o se reinicia la run entera.
 */

import { resumeGame, type GameSession } from '../session';
import { UPGRADE_POOL } from '../sim/upgrades';
import { useUiStore } from '../store';

const ENEMY_LEGEND: { label: string; color: string }[] = [
  { label: 'Dummy — básico', color: '#ff5964' },
  { label: 'Chaser — perseguidor', color: '#ff9f45' },
  { label: 'Spike — erizo (púa daña)', color: '#9aa1bd' },
  { label: 'Trail — deja charcos', color: '#4dd68a' },
  { label: 'Shooter — dispara a distancia', color: '#2b2f42' },
];

const HAZARD_LEGEND: { label: string; color: string }[] = [
  { label: 'Foso — caes y pierdes 1 corazón', color: '#05060a' },
  { label: 'Pinchos — daño + empujón', color: '#8d94ad' },
  { label: 'Barril — explota, daño en área', color: '#c0442b' },
  { label: 'Barro — te frena', color: '#6b4a2f' },
  { label: 'Acelerador — te impulsa', color: '#3fd0ff' },
];

export function PauseModal({ session, onRestart }: { session: GameSession; onRestart: () => void }) {
  const phase = useUiStore((s) => s.phase);
  const acquiredUpgrades = useUiStore((s) => s.acquiredUpgrades);

  if (phase !== 'paused') return null;

  const handleResume = () => {
    resumeGame(session);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal pause-modal">
        <h2 className="modal-title">Pausa</h2>

        <section className="pause-section">
          <h3 className="pause-section-title">Mejoras acumuladas</h3>
          {acquiredUpgrades.length === 0 ? (
            <p className="pause-empty">Ninguna todavía.</p>
          ) : (
            <ul className="pause-upgrade-list">
              {acquiredUpgrades.map((id, i) => {
                const def = UPGRADE_POOL.find((u) => u.id === id);
                return (
                  <li key={`${id}-${i}`}>
                    <strong>{def?.name ?? id}</strong>
                    {def && <span className="pause-upgrade-desc"> — {def.description}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="pause-section">
          <h3 className="pause-section-title">Enemigos</h3>
          <ul className="pause-legend">
            {ENEMY_LEGEND.map((e) => (
              <li key={e.label}>
                <span className="pause-legend-swatch" style={{ background: e.color }} />
                {e.label}
              </li>
            ))}
          </ul>
        </section>

        <section className="pause-section">
          <h3 className="pause-section-title">Hazards</h3>
          <ul className="pause-legend">
            {HAZARD_LEGEND.map((h) => (
              <li key={h.label}>
                <span className="pause-legend-swatch" style={{ background: h.color }} />
                {h.label}
              </li>
            ))}
          </ul>
        </section>

        <div className="pause-actions">
          <button type="button" className="modal-primary-btn" onClick={handleResume}>
            Reanudar
          </button>
          <button type="button" className="modal-secondary-btn" onClick={onRestart}>
            Reiniciar run
          </button>
        </div>
      </div>
    </div>
  );
}
