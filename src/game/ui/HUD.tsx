/**
 * HUD (GDD §12): corazones y monedas arriba, icono de llave, avisos
 * contextuales y selector de armas abajo. React DOM superpuesto al canvas
 * (nunca drei <Html>). Solo lee estado de baja frecuencia del store; las
 * barras de recarga viven en WeaponBar (rAF sobre la sim, sin setState).
 */

import { useEffect } from 'react';
import type { GameSession } from '../session';
import { useUiStore } from '../store';
import { WeaponBar } from './WeaponBar';

const NOTICE_DURATION_MS = 1200;

export function HUD({ session }: { session: GameSession }) {
  const hp = useUiStore((s) => s.hp);
  const maxHp = useUiStore((s) => s.maxHp);
  const coins = useUiStore((s) => s.coins);
  const hasKey = useUiStore((s) => s.hasKey);
  const notice = useUiStore((s) => s.notice);
  const noticeSeq = useUiStore((s) => s.noticeSeq);
  const clearNotice = useUiStore((s) => s.clearNotice);
  const roomIndex = useUiStore((s) => s.roomIndex);
  const totalRooms = useUiStore((s) => s.totalRooms);
  const currentRoomName = useUiStore((s) => s.currentRoomName);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(clearNotice, NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice, noticeSeq, clearNotice]);

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-hearts" aria-label={`Vida: ${hp} de ${maxHp}`}>
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
      <WeaponBar session={session} />
    </div>
  );
}
