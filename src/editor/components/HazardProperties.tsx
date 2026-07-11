import type { HazardSpawn } from '@/game/sim/world';

export function HazardProperties({ hazard, onChange }: { hazard: HazardSpawn; onChange: (h: HazardSpawn) => void }) {
  return (
    <div>
      <p className="editor-hint">
        {hazard.kind} · <code>{hazard.id}</code>
      </p>
      <div className="editor-field-row">
        <label className="editor-field">
          <span>Ancho</span>
          <input
            type="number"
            min={0.2}
            step={0.2}
            value={hazard.width}
            onChange={(e) => onChange({ ...hazard, width: Number(e.target.value) })}
          />
        </label>
        <label className="editor-field">
          <span>Alto</span>
          <input
            type="number"
            min={0.2}
            step={0.2}
            value={hazard.height}
            onChange={(e) => onChange({ ...hazard, height: Number(e.target.value) })}
          />
        </label>
      </div>
      {hazard.kind === 'boost' && (
        <div className="editor-field">
          <span>Dirección del impulso</span>
          <div className="editor-field-row">
            {(
              [
                ['↑', { x: 0, y: -1 }],
                ['↓', { x: 0, y: 1 }],
                ['←', { x: -1, y: 0 }],
                ['→', { x: 1, y: 0 }],
              ] as const
            ).map(([label, dir]) => (
              <button
                key={label}
                type="button"
                className={`editor-btn-small ${
                  (hazard.direction?.x ?? 0) === dir.x && (hazard.direction?.y ?? 1) === dir.y ? 'active' : ''
                }`}
                onClick={() => onChange({ ...hazard, direction: { x: dir.x, y: dir.y } })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
