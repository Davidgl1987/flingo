import { UPGRADE_DEFINITIONS } from '../../core/upgrades';
import type { UpgradeId } from '../../core/types';
import { useGameStore } from '../../stores/useGameStore';

const upgradeIcons: Record<UpgradeId, string> = {
  impact_damage: '✹',
  max_hp: '♥',
  slippery: '↝',
  sticky_boots: '◆',
  explosive_body: '✺',
  sharper_arrows: '➤',
  arcane_spell: '✦',
  quick_aim: '◴',
  shield_start: '◌',
};

export function UpgradeModal() {
  const choices = useGameStore((state) => state.upgradeChoices);
  const chooseUpgrade = useGameStore((state) => state.chooseUpgrade);

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/75 p-6">
      <section className="w-[min(720px,100%)] rounded-lg border border-white/15 bg-slate-950/95 p-5 text-slate-50 shadow-2xl shadow-black/50">
        <h2 className="m-0 text-xl font-semibold">Sala limpia</h2>
        <p className="mb-4 mt-2 text-sm text-slate-300">Elige una mejora para la siguiente sala.</p>
        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
          {choices.map((id) => {
            const upgrade = UPGRADE_DEFINITIONS[id];
            return (
              <button
                key={id}
                className="min-h-36 rounded-lg border border-white/15 bg-slate-900/80 p-4 text-left shadow-xl shadow-black/25 transition hover:border-white/35 hover:bg-slate-800"
                onClick={() => chooseUpgrade(id)}
              >
                <span className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-slate-950 text-lg text-sky-200">
                  {upgradeIcons[id]}
                </span>
                <strong className="mb-2 block text-sm text-slate-50">{upgrade.name}</strong>
                <span className="block text-xs leading-snug text-slate-300">{upgrade.description}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
