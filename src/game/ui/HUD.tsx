/**
 * HUD (GDD §12): corazones y monedas arriba, icono de llave, botón de pausa
 * arriba a la derecha, avisos contextuales y selector de armas abajo. React
 * DOM superpuesto al canvas (nunca drei <Html>). Solo lee estado de baja
 * frecuencia del store; las barras de recarga viven en WeaponBar (rAF sobre
 * la sim, sin setState).
 *
 * Feedback visual por CSS (sin re-render por frame): los corazones parpadean
 * en rojo al recibir daño y en rosa al curar (animación retrigger por key);
 * la llave hace "pop" al aparecer (animación de montaje).
 */

import { useEffect, useRef } from 'react';
import { BossHealthBar } from '@/game/features/bosses/BossHealthBar';
import { pauseGame, type GameSession } from '@/game/session';
import { useUiStore } from '@/game/store';
import './hud.css';
import { WeaponBar } from './WeaponBar';

const NOTICE_DURATION_MS = 1200;

export function HUD({ session }: { session: GameSession }) {
  const hp = useUiStore((s) => s.hp);
  const maxHp = useUiStore((s) => s.maxHp);
  const coins = useUiStore((s) => s.coins);
  const hasKey = useUiStore((s) => s.hasKey);
  const phase = useUiStore((s) => s.phase);
  const notice = useUiStore((s) => s.notice);
  const noticeSeq = useUiStore((s) => s.noticeSeq);
  const clearNotice = useUiStore((s) => s.clearNotice);
  const roomIndex = useUiStore((s) => s.roomIndex);
  const totalRooms = useUiStore((s) => s.totalRooms);
  const currentRoomName = useUiStore((s) => s.currentRoomName);

  // Dirección del último cambio de HP, para la animación de daño/curación.
  const prevHp = useRef(hp);
  const hpDelta = hp - prevHp.current;
  useEffect(() => {
    prevHp.current = hp;
  }, [hp]);
  const heartsFlashClass = hpDelta < 0 ? ' hud-hearts-damage' : hpDelta > 0 ? ' hud-hearts-heal' : '';

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(clearNotice, NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice, noticeSeq, clearNotice]);

  return (
    <div className="hud">
      <div className="hud-top">
        <div
          key={`hp-${hp}-${maxHp}`}
          className={`hud-hearts${heartsFlashClass}`}
          aria-label={`Vida: ${hp} de ${maxHp}`}
        >
          {Array.from({ length: maxHp }, (_, i) => (
            <span key={i} className={i < hp ? 'heart-full' : 'heart-empty'}>
              ♥
            </span>
          ))}
        </div>
        <div className="hud-top-right">
          {hasKey && (
            <span className="hud-key" aria-label="Llave" title="Llave">
              🗝
            </span>
          )}
          <div className="hud-coins" aria-label={`Monedas: ${coins}`}>
            <span className="hud-coin-icon" />
            {coins}
          </div>
          <button
            type="button"
            className="hud-pause-btn"
            aria-label="Pausa"
            disabled={phase !== 'playing'}
            onPointerDown={(e) => {
              // Evita que el gesto de puntería del canvas capture este toque.
              e.stopPropagation();
              pauseGame(session);
            }}
          >
            ❚❚
          </button>
        </div>
      </div>
      {roomIndex !== null && totalRooms !== null && (
        <div className="hud-room-banner" aria-label={`Sala ${roomIndex} de ${totalRooms}: ${currentRoomName}`}>
          <span className="hud-room-progress">
            Sala {roomIndex}/{totalRooms}
          </span>
          <span className="hud-room-name">{currentRoomName}</span>
        </div>
      )}
      {notice !== null && <div className="hud-notice">{notice}</div>}
      <BossHealthBar session={session} />
      <WeaponBar session={session} />
    </div>
  );
}
