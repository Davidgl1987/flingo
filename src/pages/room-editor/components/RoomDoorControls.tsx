import type { DoorSide, RoomDefinition } from '../../../game/core/types';
import { doorSides } from '../constants';
import { doorOffsetsForSide } from '../utils';

export function RoomDoorControls({ room, onChange }: { room: RoomDefinition; onChange: (room: RoomDefinition) => void }) {
  const toggleDoor = (side: DoorSide, offset: number) => {
    const doorSlots = room.doorSlots ?? [];
    const exists = doorSlots.some((slot) => slot.side === side && slot.offset === offset);
    if (exists) {
      onChange({ ...room, doorSlots: doorSlots.filter((slot) => !(slot.side === side && slot.offset === offset)) });
      return;
    }

    const sideSlots = doorSlots.filter((slot) => slot.side === side);
    if (sideSlots.length >= 2 || sideSlots.some((slot) => Math.abs(slot.offset - offset) < 2)) return;
    onChange({ ...room, doorSlots: [...doorSlots, { side, offset }] });
  };

  return (
    <section className="mt-3 rounded-md border border-white/10 bg-slate-900/60 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">Puertas</h3>
      <div className="grid gap-2">
        {doorSides.map((side) => {
          const offsets = doorOffsetsForSide(room, side);
          const selectedOffsets = room.doorSlots?.filter((slot) => slot.side === side).map((slot) => slot.offset) ?? [];
          return (
            <div key={side}>
              <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{side}</span>
              <div className="flex flex-wrap gap-1">
                {offsets.map((offset) => {
                  const selected = selectedOffsets.includes(offset);
                  const disabled = !selected && (selectedOffsets.length >= 2 || selectedOffsets.some((candidate) => Math.abs(candidate - offset) < 2));
                  return (
                    <button
                      className={`min-w-9 rounded border px-2 py-1 text-xs ${selected ? 'border-sky-300 bg-sky-950 text-sky-100' : 'border-white/10 bg-slate-950 text-slate-300 disabled:opacity-35'}`}
                      disabled={disabled}
                      key={`${side}-${offset}`}
                      onClick={() => toggleDoor(side, offset)}
                    >
                      {offset}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
