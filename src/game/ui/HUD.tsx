/**
 * HUD mínimo (fase 1): corazones y monedas arriba, en React DOM superpuesto
 * al canvas (nunca drei <Html>). Solo lee estado de baja frecuencia del store.
 */

import { useEffect } from 'react';
import { useUiStore } from '../store';

const NOTICE_DURATION_MS = 1200;

export function HUD() {
  const hp = useUiStore((s) => s.hp);
  const maxHp = useUiStore((s) => s.maxHp);
  const coins = useUiStore((s) => s.coins);
  const notice = useUiStore((s) => s.notice);
  const noticeSeq = useUiStore((s) => s.noticeSeq);
  const clearNotice = useUiStore((s) => s.clearNotice);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(clearNotice, NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice, noticeSeq, clearNotice]);

  return (
    <div className="hud">
      <div className="hud-hearts" aria-label={`Vida: ${hp} de ${maxHp}`}>
        {Array.from({ length: maxHp }, (_, i) => (
          <span key={i} className={i < hp ? 'heart-full' : 'heart-empty'}>
            ♥
          </span>
        ))}
      </div>
      <div className="hud-coins" aria-label={`Monedas: ${coins}`}>
        <span className="hud-coin-icon" />
        {coins}
      </div>
      {notice !== null && <div className="hud-notice">{notice}</div>}
    </div>
  );
}
