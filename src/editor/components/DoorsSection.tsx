import { DOOR_WIDTH } from '@/game/content/constants';
import type { RoomData } from '@/game/sim/world';
import { SIDES, SIDE_LABEL } from '@/editor/constants';

/** Huecos de puerta por lado (máx. 2 por lado). */
export function DoorsSection({ room, setRoom }: { room: RoomData; setRoom: (r: RoomData) => void }) {
  return (
    <section className="editor-section">
      <h2>Puertas (máx. 2 por lado)</h2>
      {SIDES.map((side) => {
        const slots = room.doorSlots.filter((s) => s.side === side);
        return (
          <div key={side} className="editor-doors-side">
            <span className="editor-doors-label">{SIDE_LABEL[side]}</span>
            {slots.map((slot, i) => (
              <span key={i} className="editor-door-slot">
                <input
                  type="number"
                  step={0.5}
                  value={slot.offset}
                  onChange={(e) => {
                    const offset = Number(e.target.value);
                    setRoom({
                      ...room,
                      doorSlots: room.doorSlots.map((s) =>
                        s === slot ? { side, offset } : s,
                      ),
                    });
                  }}
                />
                <button
                  type="button"
                  aria-label={`Quitar puerta ${SIDE_LABEL[side]}`}
                  onClick={() =>
                    setRoom({ ...room, doorSlots: room.doorSlots.filter((s) => s !== slot) })
                  }
                >
                  ×
                </button>
              </span>
            ))}
            {slots.length < 2 && (
              <button
                type="button"
                className="editor-btn-small"
                onClick={() =>
                  setRoom({
                    ...room,
                    doorSlots: [
                      ...room.doorSlots,
                      { side, offset: slots.length === 0 ? 0 : slots[0].offset + DOOR_WIDTH + 0.5 },
                    ],
                  })
                }
              >
                + puerta
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
