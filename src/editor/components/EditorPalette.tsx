import { ENEMY_COLOR, ENEMY_KINDS, HAZARD_COLOR, HAZARD_KINDS, ITEM_COLOR, ITEM_KINDS } from '@/editor/constants';
import type { PlaceKind } from '@/editor/types';

/** Paleta de colocación: inicio del jugador, enemigos, hazards e items. */
export function EditorPalette({ placing, setPlacing }: { placing: PlaceKind; setPlacing: (p: PlaceKind) => void }) {
  return (
    <section className="editor-section">
      <h2>Colocar</h2>
      <div className="editor-palette">
        <button
          type="button"
          className={`editor-palette-btn ${placing?.type === 'start' ? 'active' : ''}`}
          onClick={() => setPlacing({ type: 'start' })}
        >
          ⦿ inicio
        </button>
        {ENEMY_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`editor-palette-btn ${placing?.type === 'enemy' && placing.kind === kind ? 'active' : ''}`}
            style={{ borderColor: ENEMY_COLOR[kind] }}
            onClick={() => setPlacing({ type: 'enemy', kind })}
          >
            {kind}
          </button>
        ))}
        {HAZARD_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`editor-palette-btn ${placing?.type === 'hazard' && placing.kind === kind ? 'active' : ''}`}
            style={{ borderColor: HAZARD_COLOR[kind] }}
            onClick={() => setPlacing({ type: 'hazard', kind })}
          >
            {kind}
          </button>
        ))}
        {ITEM_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`editor-palette-btn ${placing?.type === 'item' && placing.kind === kind ? 'active' : ''}`}
            style={{ borderColor: ITEM_COLOR[kind] }}
            onClick={() => setPlacing({ type: 'item', kind })}
          >
            {kind}
          </button>
        ))}
      </div>
    </section>
  );
}
