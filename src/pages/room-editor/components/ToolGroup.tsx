import type { EditorTool } from '../../../game/core/roomEditor';
import { buttonBase, type PaletteEntry } from '../constants';

export function ToolGroup({
  currentTool,
  entries,
  title,
  onSelect,
}: {
  currentTool: EditorTool;
  entries: PaletteEntry[];
  title: string;
  onSelect: (tool: EditorTool) => void;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase text-slate-400">{title}</h2>
      <div className="grid grid-cols-2 gap-2">
        {entries.map((entry) => (
          <button
            className={`${buttonBase} flex min-h-10 items-center gap-2 text-left leading-tight ${
              currentTool === entry.tool ? 'border-sky-300 bg-sky-950 text-sky-50' : 'border-white/10 bg-slate-900 text-slate-100 hover:bg-slate-800'
            }`}
            key={entry.tool}
            onClick={() => onSelect(entry.tool)}
          >
            <span className="h-3 w-3 shrink-0 rounded-sm border border-white/40" style={{ background: entry.color }} />
            <span className="min-w-0 break-words">{entry.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
