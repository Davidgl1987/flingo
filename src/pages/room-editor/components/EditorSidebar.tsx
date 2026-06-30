import { ROOMS } from '../../../game/core/rooms';
import type { EditorTool } from '../../../game/core/roomEditor';
import { baseTools, buttonBase, enemyTools, hazardTools, itemTools, panelClass } from '../constants';
import { ToolGroup } from './ToolGroup';

export function EditorSidebar({
  sourceRoom,
  tool,
  onLoadSourceRoom,
  onSelectTool,
}: {
  sourceRoom: string;
  tool: EditorTool;
  onLoadSourceRoom: (id: string) => void;
  onSelectTool: (tool: EditorTool) => void;
}) {
  return (
    <aside className={`${panelClass} flex flex-col gap-4`}>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h1 className="m-0 text-lg font-bold">Editor</h1>
          <a className={`${buttonBase} border-white/15 bg-slate-900 text-xs text-slate-100 hover:bg-slate-800`} href="/">
            Juego
          </a>
        </div>
        <label className="block text-xs font-semibold uppercase text-slate-400" htmlFor="source-room">Base</label>
        <select
          id="source-room"
          className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-50"
          value={sourceRoom}
          onChange={(event) => onLoadSourceRoom(event.target.value)}
        >
          <option value="draft">Sala borrador</option>
          {ROOMS.map((candidate, index) => (
            <option key={candidate.id} value={index}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>

      <ToolGroup currentTool={tool} entries={baseTools} title="Herramientas" onSelect={onSelectTool} />
      <ToolGroup currentTool={tool} entries={enemyTools} title="Enemigos" onSelect={onSelectTool} />
      <ToolGroup currentTool={tool} entries={hazardTools} title="Sala" onSelect={onSelectTool} />
      <ToolGroup currentTool={tool} entries={itemTools} title="Objetos" onSelect={onSelectTool} />

      <div className="rounded-lg border border-sky-400/20 bg-sky-950/30 p-3 text-xs leading-relaxed text-sky-100">
        Click en un tile coloca la herramienta. En seleccionar, click sobre un elemento lo elige y click en un tile vacio lo mueve.
      </div>
    </aside>
  );
}
