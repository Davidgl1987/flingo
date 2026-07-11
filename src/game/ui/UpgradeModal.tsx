/**
 * Modal de elección de mejora (GDD §11/§12): 3 tarjetas grandes usables con
 * el pulgar, mostradas al limpiar la sala (phase 'room-cleared'). La elección
 * aplica el efecto sobre la sim y reanuda el juego.
 */

import { ensureUpgradeChoices, chooseUpgrade, type GameSession } from '@/game/session';
import type { UpgradeDef } from '@/game/sim/upgrades';
import { useUiStore } from '@/game/store';

export function UpgradeModal({ session }: { session: GameSession }) {
  const phase = useUiStore((s) => s.phase);
  const addUpgrade = useUiStore((s) => s.addUpgrade);

  if (phase !== 'room-cleared') return null;

  // Idempotente: normalmente ya calculadas por el game loop en el mismo frame
  // del cambio de fase; esta llamada cubre el primer render del modal.
  const choices = ensureUpgradeChoices(session);

  const pick = (def: UpgradeDef) => {
    chooseUpgrade(session, def);
    addUpgrade(def.id);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal upgrade-modal">
        <h2 className="modal-title">¡Sala limpiada!</h2>
        <p className="modal-subtitle">Elige una mejora</p>
        <div className="upgrade-cards">
          {choices.map((def) => (
            <button
              key={def.id}
              type="button"
              className="upgrade-card"
              onClick={() => pick(def)}
            >
              <span className="upgrade-card-name">{def.name}</span>
              <span className="upgrade-card-desc">{def.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
