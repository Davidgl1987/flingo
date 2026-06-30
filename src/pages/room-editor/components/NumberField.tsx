export function NumberField({
  label,
  min,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  min?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-400">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm"
        min={min}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
