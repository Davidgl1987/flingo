/**
 * Modal de victoria (GDD §10.3): limpiar la sala del jefe. Estadísticas +
 * reinicio inmediato (nueva semilla, GDD §10.2). Usable con el pulgar.
 */

import { useUiStore } from '@/game/store';

export function VictoryModal({ onRestart }: { onRestart: () => void }) {
  const phase = useUiStore((s) => s.phase);
  const roomsCleared = useUiStore((s) => s.roomsCleared);
  const coins = useUiStore((s) => s.coins);
  const score = useUiStore((s) => s.score);

  if (phase !== 'victory') return null;

  return (
    <div className="modal-backdrop">
      <div className="modal victory-modal">
        <h2 className="modal-title">¡Victoria!</h2>
        <p className="modal-subtitle">Has derrotado al jefe de la mazmorra</p>
        <dl className="game-over-stats">
          <div className="game-over-stat">
            <dt>Salas limpiadas</dt>
            <dd>{roomsCleared}</dd>
          </div>
          <div className="game-over-stat">
            <dt>Monedas</dt>
            <dd>{coins}</dd>
          </div>
          <div className="game-over-stat">
            <dt>Puntuación</dt>
            <dd>{score}</dd>
          </div>
        </dl>
        <button type="button" className="modal-primary-btn" onClick={onRestart}>
          Jugar otra run
        </button>
      </div>
    </div>
  );
}
