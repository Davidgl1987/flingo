import { ROOM_MIN_SIZE } from '@/game/content/constants';
import type { RoomData } from '@/game/sim/world';
import { ALL_TAGS } from '@/editor/constants';

/** Metadatos de la sala: id, nombre, tamaño y tags. */
export function RoomSection({ room, setRoom }: { room: RoomData; setRoom: (r: RoomData) => void }) {
  return (
    <section className="editor-section">
      <h2>Sala</h2>
      <label className="editor-field">
        <span>Identificador</span>
        <input
          value={room.id}
          onChange={(e) => setRoom({ ...room, id: e.target.value.trim() })}
        />
      </label>
      <label className="editor-field">
        <span>Nombre</span>
        <input value={room.name} onChange={(e) => setRoom({ ...room, name: e.target.value })} />
      </label>
      <div className="editor-field-row">
        <label className="editor-field">
          <span>Ancho (impar ≥ {ROOM_MIN_SIZE})</span>
          <input
            type="number"
            min={ROOM_MIN_SIZE}
            step={2}
            value={room.width}
            onChange={(e) => setRoom({ ...room, width: Number(e.target.value) })}
          />
        </label>
        <label className="editor-field">
          <span>Alto (impar ≥ {ROOM_MIN_SIZE})</span>
          <input
            type="number"
            min={ROOM_MIN_SIZE}
            step={2}
            value={room.height}
            onChange={(e) => setRoom({ ...room, height: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="editor-tags">
        {ALL_TAGS.map((tag) => (
          <label key={tag} className="editor-tag">
            <input
              type="checkbox"
              checked={room.tags.includes(tag)}
              onChange={(e) =>
                setRoom({
                  ...room,
                  tags: e.target.checked ? [...room.tags, tag] : room.tags.filter((x) => x !== tag),
                })
              }
            />
            {tag}
          </label>
        ))}
      </div>
    </section>
  );
}
