import React from 'react';

export default function StatCard({ label, value, icon: Icon, color = 'navy', sub }) {
  const colors = {
    navy:   'bg-navy-800 text-white',
    orange: 'bg-freight-orange text-white',
    green:  'bg-freight-green text-white',
    red:    'bg-freight-red text-white',
    blue:   'bg-blue-600 text-white',
    amber:  'bg-freight-amber text-white',
  };
  return (
    <div className="card flex items-center gap-4">
      {Icon && (
        <div className={`rounded-xl p-3 ${colors[color]}`}>
          <Icon size={22} />
        </div>
      )}
      <div>
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-800">{value ?? '—'}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
