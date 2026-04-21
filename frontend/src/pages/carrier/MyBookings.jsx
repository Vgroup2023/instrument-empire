import React, { useEffect, useState } from 'react';
import { BookOpen, RefreshCw, MapPin, Calendar, Truck, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

const STATUS_BADGE = {
  Pending:   'badge-yellow',
  Approved:  'badge-green',
  Rejected:  'badge-red',
  Completed: 'badge-gray',
};

const PAY_BADGE = {
  Unpaid:   'badge-red',
  Invoiced: 'badge-yellow',
  Paid:     'badge-green',
};

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchBookings = () => api.get('/bookings').then(r => setBookings(r.data)).catch(console.error);
  useEffect(() => { fetchBookings(); }, []);

  const filtered = bookings.filter(b => !statusFilter || b.status === statusFilter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-800">My Bookings</h1>
          <p className="text-slate-500 text-sm">{bookings.length} booking{bookings.length !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={fetchBookings} className="btn-secondary p-2"><RefreshCw size={16} /></button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {['', 'Pending', 'Approved', 'Rejected', 'Completed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-navy-800 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:border-slate-400'}`}>
            {s || 'All'} {s && <span className="ml-1 opacity-60">({bookings.filter(b => b.status === s).length})</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <BookOpen size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">{statusFilter ? `No ${statusFilter.toLowerCase()} bookings` : 'No bookings yet'}</p>
          {!statusFilter && (
            <p className="text-slate-400 text-sm mt-1">
              <Link to="/carrier/loads" className="text-navy-600 hover:underline font-medium">Browse available loads</Link> to get started
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(b => (
            <div key={b.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs font-mono text-slate-400">{b.load_number}</p>
                  <div className="flex gap-2 mt-1">
                    <span className={`badge ${STATUS_BADGE[b.status]}`}>{b.status}</span>
                    <span className={`badge ${PAY_BADGE[b.payment_status]}`}>{b.payment_status}</span>
                  </div>
                </div>
                <p className="text-2xl font-bold text-freight-green">${Number(b.rate).toLocaleString()}</p>
              </div>

              <div className="flex items-center gap-2 text-sm font-semibold text-navy-800 mb-3">
                <MapPin size={14} className="text-freight-orange shrink-0" />
                <span>{b.pickup_location}, {b.pickup_state}</span>
                <span className="text-slate-300">→</span>
                <span>{b.delivery_location}, {b.delivery_state}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-1"><Truck size={12} />{b.equipment_type}</div>
                <div className="flex items-center gap-1"><Calendar size={12} />PU: {b.pickup_date}</div>
                <div className="flex items-center gap-1"><Calendar size={12} />DEL: {b.delivery_date}</div>
              </div>

              {b.status === 'Approved' && b.driver_name && (
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
                  <p><span className="font-medium">Driver:</span> {b.driver_name} {b.driver_phone && `· ${b.driver_phone}`}</p>
                  {b.truck_number && <p><span className="font-medium">Truck:</span> {b.truck_number} {b.trailer_number && `· Trailer: ${b.trailer_number}`}</p>}
                </div>
              )}

              {b.status === 'Rejected' && (
                <div className="mt-3 bg-red-50 rounded-lg p-2.5 text-xs text-red-700">
                  Booking was not accepted. <Link to="/carrier/loads" className="font-medium underline">Browse other loads</Link>
                </div>
              )}

              {b.status === 'Pending' && (
                <p className="mt-3 text-xs text-slate-400 italic">Awaiting broker approval — you'll be notified by email and SMS.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
