import React from 'react';
import { MapPin, Calendar, Truck, DollarSign, Package } from 'lucide-react';

const STATUS_BADGE = {
  Available:  'badge-green',
  Booked:     'badge-blue',
  'In Transit': 'badge-orange',
  Completed:  'badge-gray',
  Cancelled:  'badge-red',
};

export default function LoadCard({ load, action }) {
  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-slate-400 font-mono">{load.load_number}</p>
          <p className={`badge mt-1 ${STATUS_BADGE[load.status] || 'badge-gray'}`}>{load.status}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-freight-green">${Number(load.rate).toLocaleString()}</p>
          <p className="text-xs text-slate-400">Gross Rate</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm font-semibold text-navy-800 mb-3">
        <MapPin size={15} className="text-freight-orange shrink-0" />
        <span>{load.pickup_location}, {load.pickup_state}</span>
        <span className="text-slate-300">→</span>
        <span>{load.delivery_location}, {load.delivery_state}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mb-4">
        <div className="flex items-center gap-1"><Truck size={13} className="text-slate-400" />{load.equipment_type}</div>
        <div className="flex items-center gap-1"><Package size={13} className="text-slate-400" />{load.weight || 'TBD'}{load.commodity ? ` · ${load.commodity}` : ''}</div>
        <div className="flex items-center gap-1"><Calendar size={13} className="text-slate-400" />PU: {load.pickup_date}</div>
        <div className="flex items-center gap-1"><Calendar size={13} className="text-slate-400" />DEL: {load.delivery_date}</div>
      </div>

      {load.special_instructions && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 mb-3 italic">{load.special_instructions}</p>
      )}

      {action}
    </div>
  );
}
