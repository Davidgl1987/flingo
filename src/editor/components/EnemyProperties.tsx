import type { EnemySpawn } from '@/game/sim/world';
import { snap } from '@/editor/utils';

export function EnemyProperties({ enemy, onChange }: { enemy: EnemySpawn; onChange: (e: EnemySpawn) => void }) {
  return (
    <div>
      <p className="editor-hint">
        {enemy.kind} · <code>{enemy.id}</code>
      </p>
      <div className="editor-field-row">
        <label className="editor-field">
          <span>HP (vacío = defecto)</span>
          <input
            type="number"
            min={1}
            value={enemy.hp ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              const next = { ...enemy };
              if (v === '') delete next.hp;
              else next.hp = Number(v);
              onChange(next);
            }}
          />
        </label>
        <label className="editor-field">
          <span>Radio</span>
          <input
            type="number"
            min={0.1}
            step={0.05}
            value={enemy.radius ?? ''}
            placeholder="0.4"
            onChange={(e) => {
              const v = e.target.value;
              const next = { ...enemy };
              if (v === '') delete next.radius;
              else next.radius = Number(v);
              onChange(next);
            }}
          />
        </label>
      </div>
      <label className="editor-tag">
        <input
          type="checkbox"
          checked={enemy.patrolTarget !== undefined}
          onChange={(e) => {
            const next = { ...enemy };
            if (e.target.checked) {
              next.patrolTarget = { x: snap(enemy.position.x + 2), y: enemy.position.y };
            } else {
              delete next.patrolTarget;
            }
            onChange(next);
          }}
        />
        Patrulla con destino
      </label>
      {enemy.patrolTarget && (
        <div className="editor-field-row">
          <label className="editor-field">
            <span>Destino X</span>
            <input
              type="number"
              step={0.5}
              value={enemy.patrolTarget.x}
              onChange={(e) =>
                onChange({ ...enemy, patrolTarget: { x: Number(e.target.value), y: enemy.patrolTarget!.y } })
              }
            />
          </label>
          <label className="editor-field">
            <span>Destino Y</span>
            <input
              type="number"
              step={0.5}
              value={enemy.patrolTarget.y}
              onChange={(e) =>
                onChange({ ...enemy, patrolTarget: { x: enemy.patrolTarget!.x, y: Number(e.target.value) } })
              }
            />
          </label>
        </div>
      )}
      {enemy.kind === 'spike' && (
        <div className="editor-field">
          <span>Dirección de la púa</span>
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
                  (enemy.facing?.x ?? 0) === dir.x && (enemy.facing?.y ?? 1) === dir.y ? 'active' : ''
                }`}
                onClick={() => onChange({ ...enemy, facing: { x: dir.x, y: dir.y } })}
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
