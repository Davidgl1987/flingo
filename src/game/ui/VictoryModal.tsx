/**
 * Modal de victoria (GDD §10, run multi-mazmorra): fin de juego real — se
 * muestra tras limpiar la sala del ÚLTIMO jefe de `bossSequence`
 * (`world.isFinalDungeon`, ver step.ts::stepDungeonRoomClear). Estadísticas +
 * reinicio inmediato (nueva run, nueva semilla) o vuelta al menú. Usable con
 * el pulgar.
 */

import { useUiStore } from '@/game/session/store';
import './modals.css';

export function VictoryModal({ onRestart, onExitToTitle }: { onRestart: () => void; onExitToTitle?: () => void }) {
  const phase = useUiStore((s) => s.phase);
  const roomsCleared = useUiStore((s) => s.roomsCleared);
  const coins = useUiStore((s) => s.coins);
  const score = useUiStore((s) => s.score);

  if (phase !== 'victory') return null;

  return (
    <div className="modal-backdrop">
      <div className="modal victory-modal">
        <h2 className="modal-title">¡Victoria!</h2>
        <p className="modal-subtitle">Has derrotado a todos los jefes</p>
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
        <div className="pause-actions">
          <button type="button" className="modal-primary-btn" onClick={onRestart}>
            Jugar otra run
          </button>
          {onExitToTitle && (
            <button type="button" className="modal-secondary-btn" onClick={onExitToTitle}>
              Menú principal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
