/**
 * Modal de mazmorra superada (GDD §10, run multi-mazmorra): se muestra en la
 * fase 'dungeon-cleared' — el jefe de esta mazmorra ha caído pero quedan más
 * jefes por delante en `session.bossSequence`. A diferencia de Victory/GameOver
 * NO reinicia nada: el botón llama a `advanceToNextDungeon` (conserva
 * hp/mejoras/estadísticas acumuladas) y el llamador (GameRoot) remonta el
 * canvas sin tocar el store de UI (hp/monedas/mejoras siguen).
 */

import { useUiStore } from '@/game/session/store';
import type { GameSession } from '@/game/session/session';
import './modals.css';

export function NextDungeonModal({ session, onAdvance }: { session: GameSession; onAdvance: () => void }) {
  const phase = useUiStore((s) => s.phase);

  if (phase !== 'dungeon-cleared') return null;

  // session.stageIndex todavía apunta a la mazmorra recién superada (se
  // incrementa en advanceToNextDungeon, al pulsar el botón).
  const stageNumber = session.stageIndex + 1;
  const totalStages = session.bossSequence.length;

  return (
    <div className="modal-backdrop">
      <div className="modal victory-modal">
        <h2 className="modal-title">¡Jefe derrotado!</h2>
        <p className="modal-subtitle">
          Mazmorra {stageNumber} de {totalStages} superada
        </p>
        <button type="button" className="modal-primary-btn" onClick={onAdvance}>
          Siguiente mazmorra
        </button>
      </div>
    </div>
  );
}
