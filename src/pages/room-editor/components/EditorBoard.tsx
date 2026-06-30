import type { EditorSelection } from '../../../game/core/roomEditor';
import type { RoomDefinition, Vec2 } from '../../../game/core/types';
import { editorCellSize, panelClass } from '../constants';
import {
  getCellContents,
  gridPixelSize,
  makeRange,
  selectionKey,
  tileToGridPoint,
  type CellContent,
} from '../utils';
import { NumberField } from './NumberField';

export function EditorBoard({
  room,
  selected,
  onCellClick,
  onChangeName,
  onChangeWidth,
  onChangeHeight,
}: {
  room: RoomDefinition;
  selected: EditorSelection | null;
  onCellClick: (pos: Vec2) => void;
  onChangeName: (name: string) => void;
  onChangeWidth: (width: number) => void;
  onChangeHeight: (height: number) => void;
}) {
  const columns = makeRange(room.width);
  const rows = makeRange(room.height);

  return (
    <section className={`${panelClass} min-w-0`}>
      <div className="mb-3 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
        <label className="block">
          <span className="text-xs font-semibold uppercase text-slate-400">Nombre</span>
          <input
            className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm"
            value={room.name}
            onChange={(event) => onChangeName(event.target.value)}
          />
        </label>
        <NumberField label="Ancho" min={5} value={room.width} onChange={onChangeWidth} />
        <NumberField label="Alto" min={5} value={room.height} onChange={onChangeHeight} />
      </div>

      <div className="overflow-auto rounded-lg border border-white/10 bg-slate-900/70 p-3">
        <div
          className="relative grid min-w-max gap-px"
          style={{
            gridTemplateColumns: `repeat(${room.width}, ${editorCellSize}px)`,
          }}
        >
          <PatrolLines room={room} />
          {rows.map((y) =>
            columns.map((x) => {
              const pos = { x, y };
              const cellContents = getCellContents(room, pos);
              const isSelectedCell = selected ? cellContents.some((content) => content.selectionKey === selectionKey(selected)) : false;
              const isPlayerStart = room.playerStart.x === x && room.playerStart.y === y;

              return (
                <button
                  key={`${x}:${y}`}
                  className={`relative z-10 h-10 w-10 border border-slate-700/80 bg-slate-800/80 text-[10px] transition hover:bg-slate-700 ${
                    isSelectedCell ? 'outline outline-2 outline-sky-300' : ''
                  } ${isPlayerStart ? 'ring-1 ring-sky-300' : ''}`}
                  onClick={() => onCellClick(pos)}
                  title={`x ${x}, y ${y}`}
                >
                  <span className="absolute left-1 top-0.5 text-[9px] text-slate-500">{x},{y}</span>
                  <CellContents contents={cellContents} isPlayerStart={isPlayerStart} />
                </button>
              );
            }),
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
        <span>Enemigos: {room.enemies.length}</span>
        <span>Peligros: {room.hazards.length}</span>
        <span>Objetos: {room.items.length}</span>
        <span>Spawn: {room.playerStart.x}, {room.playerStart.y}</span>
      </div>
    </section>
  );
}

function PatrolLines({ room }: { room: RoomDefinition }) {
  const width = gridPixelSize(room.width);
  const height = gridPixelSize(room.height);
  const lines = room.enemies
    .filter((enemy) => enemy.patrolTarget)
    .map((enemy) => ({
      id: enemy.id,
      start: tileToGridPoint(enemy.pos, room),
      end: tileToGridPoint(enemy.patrolTarget!, room),
    }));

  if (lines.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 z-20"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      {lines.map((line) => (
        <g key={line.id}>
          <line
            stroke="#c4b5fd"
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeWidth="3"
            x1={line.start.x}
            x2={line.end.x}
            y1={line.start.y}
            y2={line.end.y}
          />
          <line
            stroke="#312e81"
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeWidth="1"
            x1={line.start.x}
            x2={line.end.x}
            y1={line.start.y}
            y2={line.end.y}
          />
        </g>
      ))}
    </svg>
  );
}

function CellContents({ contents, isPlayerStart }: { contents: CellContent[]; isPlayerStart: boolean }) {
  return (
    <span className="absolute inset-0 grid place-items-center">
      <span className="relative h-6 w-6">
        {contents.map((content, index) => (
          <span
            className={`absolute border border-white/60 ${content.shape === 'circle' ? 'rounded-full' : content.shape === 'diamond' ? 'rotate-45 rounded-sm' : 'rounded-sm'}`}
            key={`${content.selectionKey}-${index}`}
            style={{
              background: content.color,
              height: `${content.size}px`,
              left: `${12 - content.size / 2 + index * 2}px`,
              top: `${12 - content.size / 2 + index * 2}px`,
              width: `${content.size}px`,
            }}
          >
            {content.label && (
              <span className="grid h-full w-full -rotate-45 place-items-center text-[8px] font-bold leading-none text-white">
                {content.label}
              </span>
            )}
          </span>
        ))}
        {isPlayerStart && (
          <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full border border-white bg-sky-400 text-[9px] font-bold text-slate-950">
            P
          </span>
        )}
      </span>
    </span>
  );
}
