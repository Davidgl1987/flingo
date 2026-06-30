import { useState } from 'react';
import { ACTION_COOLDOWNS } from '../../core/constants';
import { UPGRADE_DEFINITIONS } from '../../core/upgrades';
import { useGameStore } from '../../stores/useGameStore';
import type { WeaponMode } from '../../core/types';

const weaponLabels: Record<WeaponMode, string> = {
  body: 'Cuerpo',
  arrow: 'Flecha',
  spell: 'Hechizo',
};

const weaponIcons: Record<WeaponMode, string> = {
  body: '●',
  arrow: '➤',
  spell: '✦',
};

const weaponColors: Record<WeaponMode, string> = {
  body: '#38bdf8',
  arrow: '#facc15',
  spell: '#c084fc',
};

const weaponDarkColors: Record<WeaponMode, string> = {
  body: '#082f49',
  arrow: '#422006',
  spell: '#3b0764',
};

const legendSections = [
  {
    title: 'Jugador',
    entries: [
      { color: '#38bdf8', label: 'Héroe cuerpo', note: 'Bola azul. Daño alto al impactar fuerte.' },
      { color: '#facc15', label: 'Héroe flecha', note: 'Disparo seguro y directo.' },
      { color: '#c084fc', label: 'Héroe hechizo', note: 'Disparo más lento, fuerte y con rebote.' },
    ],
  },
  {
    title: 'Enemigos',
    entries: [
      { color: '#ef4444', label: 'Dummy rojo', note: 'Patrulla, te persigue de cerca y daña al tocar.' },
      { color: '#f97316', label: 'Chaser naranja', note: 'Te persigue siempre. Acelera cuando apuntas.' },
      { color: '#94a3b8', label: 'Cono-pincho gris', note: 'El lado de pinchos castiga ataques frontales.' },
      { color: '#22c55e', label: 'Trail verde', note: 'Persigue de cerca y deja rastro dañino.' },
      { color: '#020617', label: 'Shooter negro', note: 'Persigue, se planta y dispara un cono blanco.' },
    ],
  },
  {
    title: 'Sala',
    entries: [
      { color: '#facc15', label: 'Moneda', note: 'Recompensa.' },
      { color: '#f472b6', label: 'Poción rosa', note: 'Cura 1 HP.' },
      { color: '#e5e7eb', label: 'Llave', note: 'Abre el acceso al boss.' },
      { color: '#b45309', label: 'Barril', note: 'Explota y daña en área.' },
      { color: '#64748b', label: 'Roca', note: 'Obstáculo sólido.' },
      { color: '#020617', label: 'Foso', note: 'Hace daño y devuelve al último punto seguro.' },
      { color: '#7f1d1d', label: 'Pinchos suelo', note: 'Dañan al tocar.' },
      { color: '#2563eb', label: 'Zona lenta', note: 'Frena.' },
      { color: '#14b8a6', label: 'Impulso', note: 'Empuja en su dirección.' },
    ],
  },
];

const panelClass = 'pointer-events-auto rounded-lg border border-white/15 bg-slate-950/80 text-slate-50 shadow-2xl shadow-black/35 backdrop-blur-md';
const buttonClass = 'pointer-events-auto rounded-lg border border-white/15 bg-slate-950/80 px-3 py-2 text-sm text-slate-50 shadow-xl shadow-black/30 backdrop-blur-md transition hover:bg-slate-900 disabled:opacity-45';

export function HUD() {
  const [pauseOpen, setPauseOpen] = useState(false);
  const player = useGameStore((state) => state.player);
  const coins = useGameStore((state) => state.coins);
  const hasKey = useGameStore((state) => state.hasKey);
  const room = useGameStore((state) => state.room);
  const roomIndex = useGameStore((state) => state.currentRoomIndex);
  const worldMap = useGameStore((state) => state.worldMap);
  const message = useGameStore((state) => state.message);
  const phase = useGameStore((state) => state.phase);
  const setWeapon = useGameStore((state) => state.setWeapon);
  const resetRun = useGameStore((state) => state.resetRun);
  const setPaused = useGameStore((state) => state.setPaused);
  const cooldowns = player.actionCooldowns ?? { body: 0, arrow: 0, spell: 0 };
  const openPause = () => {
    setPauseOpen(true);
    setPaused(true);
  };
  const closePause = () => {
    setPauseOpen(false);
    setPaused(false);
  };
  const resetFromPause = () => {
    setPauseOpen(false);
    setPaused(false);
    resetRun();
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between"
      style={{
        paddingTop: 'max(14px, env(safe-area-inset-top))',
        paddingRight: 'max(14px, env(safe-area-inset-right))',
        paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(14px, env(safe-area-inset-left))',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`${panelClass} max-w-[min(520px,calc(100vw-110px))] px-3 py-2 text-sm leading-tight max-sm:max-w-[calc(100vw-116px)] max-sm:text-xs`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
              <span>Sala {roomIndex + 1}/{worldMap?.rooms.length ?? 5}</span>
              <span>{weaponIcons[player.weaponMode]} {weaponLabels[player.weaponMode]}</span>
            </div>
            <div className="mt-1 max-w-[480px] truncate text-xs text-slate-300 max-sm:max-w-[calc(100vw-140px)]">
              {room.name} · {message}
            </div>
          </div>
          <div className={`${panelClass} mt-2 inline-flex items-center gap-3 px-3 py-2 text-base font-bold leading-none max-sm:text-sm`}>
            <span className="flex items-center gap-1" aria-label={`Vida ${player.hp} de ${player.maxHp}`}>
              {Array.from({ length: player.maxHp }, (_, index) => (
                <span key={index} className={index < player.hp ? 'text-rose-400' : 'text-slate-500'}>
                  {index < player.hp ? '♥' : '♡'}
                </span>
              ))}
            </span>
            <span className="flex items-center gap-1 text-amber-300">
              <span className="text-lg">●</span>
              <span>{coins}</span>
            </span>
            {hasKey && (
              <span className="flex items-center gap-1 text-slate-100" aria-label="Llave recogida">
                <span className="h-3 w-5 rounded-sm border border-white/70 bg-slate-200 shadow-[0_0_10px_rgba(226,232,240,0.55)]" />
                <span>Llave</span>
              </span>
            )}
          </div>
        </div>
        <button className={`${buttonClass} grid h-11 w-11 place-items-center px-0 py-0 text-lg`} onClick={openPause} aria-label="Pausa">
          ‖
        </button>
      </div>

      {pauseOpen && (
        <div className="pointer-events-auto fixed inset-0 z-30 grid place-items-center bg-slate-950/70 p-4">
          <section className="max-h-[86vh] w-[min(560px,100%)] overflow-auto rounded-lg border border-white/15 bg-slate-950/95 p-4 text-slate-50 shadow-2xl shadow-black/55">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="m-0 text-lg font-semibold">Pausa</h2>
              <button className={`${buttonClass} grid h-9 w-9 place-items-center px-0 py-0 text-lg`} onClick={closePause} aria-label="Cerrar pausa">×</button>
            </div>
            <div className="mb-4 flex gap-2">
              <button className={buttonClass} onClick={resetFromPause}>Reiniciar</button>
            </div>

            <section className="mb-4">
              <strong className="mb-2 block text-xs uppercase tracking-wide text-slate-300">Mejoras recogidas</strong>
              {player.upgrades.length > 0 ? (
                <div className="grid gap-2">
                  {player.upgrades.map((id, index) => {
                    const upgrade = UPGRADE_DEFINITIONS[id];
                    return (
                      <div className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm" key={`${id}-${index}`}>
                        <b className="block">{upgrade.name}</b>
                        <small className="text-slate-300">{upgrade.description}</small>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="m-0 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-300">Sin mejoras todavía.</p>
              )}
            </section>

            <section>
              <strong className="mb-2 block text-xs uppercase tracking-wide text-slate-300">Leyenda</strong>
              <div className="grid gap-2">
                {legendSections.map((section) => (
                  <details className="rounded-lg border border-white/10 bg-slate-900/50 p-3" key={section.title}>
                    <summary className="cursor-pointer text-sm font-semibold text-slate-100">{section.title}</summary>
                    <div className="mt-3 grid gap-2">
                      {section.entries.map((entry) => (
                        <div className="grid grid-cols-[16px_1fr] items-start gap-2" key={entry.label}>
                          <span className="mt-0.5 h-3.5 w-3.5 rounded-full border border-white/50" style={{ background: entry.color }} />
                          <span>
                            <b className="block text-xs text-slate-50">{entry.label}</b>
                            <small className="block text-[11px] leading-snug text-slate-300">{entry.note}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          </section>
        </div>
      )}

      <div className="flex justify-center">
        <div className="pointer-events-auto flex gap-2">
          {(['body', 'arrow', 'spell'] as WeaponMode[]).map((mode) => {
            const cooldown = cooldowns[mode] ?? 0;
            const fill = cooldown > 0 ? Math.max(0, Math.min(100, (1 - cooldown / ACTION_COOLDOWNS[mode]) * 100)) : 100;
            const color = weaponColors[mode];
            const darkColor = weaponDarkColors[mode];
            return (
              <button
                key={mode}
                className={`relative min-h-12 min-w-[84px] overflow-hidden rounded-lg border-2 px-3 py-2 text-sm font-semibold shadow-2xl shadow-black/30 backdrop-blur-md transition disabled:opacity-45 max-sm:min-w-[74px] max-sm:px-2 max-sm:text-xs ${
                  player.weaponMode === mode ? 'text-white' : 'bg-slate-950/70'
                }`}
                style={{ backgroundColor: player.weaponMode === mode ? darkColor : 'rgba(2, 6, 23, 0.72)', borderColor: color, color: player.weaponMode === mode ? '#ffffff' : color }}
                onClick={() => setWeapon(mode)}
                disabled={phase !== 'playing'}
              >
                <span
                  className="absolute inset-y-0 left-0 transition-[width] duration-75"
                  style={{ width: `${player.weaponMode === mode ? fill : 0}%`, backgroundColor: color }}
                />
                <span className="relative z-10 flex items-center justify-center gap-1 whitespace-nowrap">
                  <span>{weaponIcons[mode]}</span>
                  <span>{weaponLabels[mode]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
