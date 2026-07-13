/**
 * Modal de recompensa gratis de jefe (docs/plans/ECONOMY_PLAN.md F3, fase
 * 'boss-reward'): al derrotar un jefe NO final, 3 tarjetas grandes usables
 * con el pulgar (una por categoría de ATAQUE cuerpo/flecha/hechizo — los
 * consumibles solo se compran en tienda, F4), con icono, nombre, descripción
 * y pips de nivel actual → nivel nuevo. Elegir aplica la mejora y sigue el
 * flujo con NextDungeonModal (fase 'dungeon-cleared').
 *
 * Si todas las mejoras de ataque ya están al máximo, `ensureBossRewardChoices`
 * ya adelanta la fase a 'dungeon-cleared' por su cuenta (ver session.ts); el
 * `choices.length === 0` de aquí es solo un cinturón-y-tirantes para no
 * renderizar un modal vacío en el frame de transición.
 */

import { chooseBossReward, ensureBossRewardChoices, type GameSession } from '@/game/session/session';
import { getUpgradeLevel, type UpgradeDef } from '@/game/session/upgrades';
import { useUiStore } from '@/game/session/store';
import { UpgradeIcon, UpgradeLevelPips } from './UpgradeIcon';
import './modals.css';

export function BossRewardModal({ session }: { session: GameSession }) {
  const phase = useUiStore((s) => s.phase);

  if (phase !== 'boss-reward') return null;

  // Idempotente: normalmente ya calculadas por el game loop en el mismo frame
  // del cambio de fase; esta llamada cubre el primer render del modal.
  const choices = ensureBossRewardChoices(session);
  if (choices.length === 0) return null;

  const hero = session.world.hero;

  const pick = (def: UpgradeDef) => {
    chooseBossReward(session, def);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal upgrade-modal">
        <h2 className="modal-title">¡Jefe derrotado!</h2>
        <p className="modal-subtitle">Elige una mejora gratis</p>
        <div className="upgrade-cards">
          {choices.map((def) => {
            const level = getUpgradeLevel(hero, def.id);
            return (
              <button key={def.id} type="button" className="upgrade-card" onClick={() => pick(def)}>
                <div className="upgrade-card-head">
                  <UpgradeIcon icon={def.icon} size={32} />
                  <span className="upgrade-card-name">{def.name}</span>
                </div>
                <span className="upgrade-card-desc">{def.description}</span>
                <UpgradeLevelPips level={level} maxLevel={def.maxLevel} previewLevel={level + 1} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
