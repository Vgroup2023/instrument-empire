/** A small row of choices where one is on, used to switch between the views inside a tab. */
export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; badge?: number; tone?: 'red' | 'amber' }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="mb-2 flex max-w-full flex-nowrap gap-2 overflow-x-auto px-1 pb-4 pt-1 text-sm [scrollbar-width:none] [&>*]:shrink-0 [&>*]:whitespace-nowrap">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className={`push rounded-lg border px-3 py-1 font-medium ${value === o.id ? 'border-slate-800 bg-slate-800 text-white [--edge:#0b1220]' : 'push-light border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
          {o.label}
          {o.badge ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${o.tone === 'red' ? 'bg-red-500 text-white' : o.tone === 'amber' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'}`}>{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
