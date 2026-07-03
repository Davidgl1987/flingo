/**
 * Modal de fin de run (GDD §6/§12): estadísticas (salas limpiadas, monedas,
 * puntuación) y botón de reinicio inmediato. Usable con el pulgar.
 */

import { useUiStore } from '../store';

export function GameOverModal({ onRestart }: { onRestart: () => void }) {
  const phase = useUiStore((s) => s.phase);
  const roomsCleared = useUiStore((s) => s.roomsCleared);
  const coins = useUiStore((s) => s.coins);
  const score = useUiStore((s) => s.score);

  if (phase !== 'game-over') return null;

  return (
    <div className="modal-backdrop">
      <div className="modal game-over-modal">
        <h2 className="modal-title">Fin de la run</h2>
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
          Reintentar
        </button>
      </div>
    </div>
  );
}
