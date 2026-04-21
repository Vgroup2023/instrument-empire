import React, { useEffect, useState } from 'react';
import { BookOpen, CheckCircle, XCircle, DollarSign, RefreshCw, Filter } from 'lucide-react';
import Modal from '../../components/Modal';
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

export default function BookingManagement() {
  const [bookings, setBookings] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [payStatus, setPayStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchBookings = () => api.get('/bookings').then(r => setBookings(r.data)).catch(console.error);
  useEffect(() => { fetchBookings(); }, []);

  const filtered = bookings.filter(b => !statusFilter || b.status === statusFilter);

  const openDetail = (b) => { setSelected(b); setPayStatus(b.payment_status); };

  const updateStatus = async (id, status) => {
    setLoading(true);
    try {
      await api.put(`/bookings/${id}/status`, { status, payment_status: payStatus });
      fetchBookings();
      setSelected(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-800">Booking Management</h1>
          <p className="text-slate-500 text-sm">{bookings.length} booking{bookings.length !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={fetchBookings} className="btn-secondary p-2"><RefreshCw size={16} /></button>
      </div>

      {/* Status filter */}
      <div className="card p-4 flex flex-wrap gap-2">
        {['', 'Pending', 'Approved', 'Rejected', 'Completed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-navy-800 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}>
            {s || 'All'}
            {s === 'Pending' && bookings.filter(b => b.status === 'Pending').length > 0 && (
              <span className="ml-1.5 bg-freight-orange text-white text-xs rounded-full px-1.5 py-0.5">
                {bookings.filter(b => b.status === 'Pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Carrier', 'Load', 'Route', 'Rate', 'Pickup Date', 'Status', 'Payment', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">No bookings found.</td></tr>
              )}
              {filtered.map(b => (
                <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{b.company_name}</p>
                    <p className="text-xs text-slate-400">MC: {b.mc_number}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{b.load_number}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{b.pickup_state} → {b.delivery_state}</td>
                  <td className="px-4 py-3 font-bold text-freight-green">${Number(b.rate).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-600">{b.pickup_date}</td>
                  <td className="px-4 py-3"><span className={`badge ${STATUS_BADGE[b.status]}`}>{b.status}</span></td>
                  <td className="px-4 py-3"><span className={`badge ${PAY_BADGE[b.payment_status]}`}>{b.payment_status}</span></td>
                  <td className="px-4 py-3">
                    <button onClick={() => openDetail(b)} className="btn-secondary text-xs py-1 px-3">Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Booking Detail">
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-4">
              <div><span className="text-slate-500">Carrier:</span> <strong>{selected.company_name}</strong></div>
              <div><span className="text-slate-500">MC:</span> {selected.mc_number}</div>
              <div><span className="text-slate-500">Contact:</span> {selected.contact_name}</div>
              <div><span className="text-slate-500">Phone:</span> {selected.contact_phone}</div>
              <div><span className="text-slate-500">Load #:</span> <span className="font-mono">{selected.load_number}</span></div>
              <div><span className="text-slate-500">Rate:</span> <strong className="text-freight-green">${Number(selected.rate).toLocaleString()}</strong></div>
              <div><span className="text-slate-500">Route:</span> {selected.pickup_location}, {selected.pickup_state} → {selected.delivery_location}, {selected.delivery_state}</div>
              <div><span className="text-slate-500">Pickup:</span> {selected.pickup_date}</div>
            </div>

            {/* Driver info */}
            {(selected.driver_name || selected.truck_number) && (
              <div className="border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-2">
                <h4 className="col-span-2 font-semibold text-navy-800 mb-1">Driver / Equipment</h4>
                {selected.driver_name && <div><span className="text-slate-500">Driver:</span> {selected.driver_name}</div>}
                {selected.driver_phone && <div><span className="text-slate-500">Driver Phone:</span> {selected.driver_phone}</div>}
                {selected.truck_number && <div><span className="text-slate-500">Truck #:</span> {selected.truck_number}</div>}
                {selected.trailer_number && <div><span className="text-slate-500">Trailer #:</span> {selected.trailer_number}</div>}
              </div>
            )}

            {selected.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">{selected.notes}</div>
            )}

            {/* Payment status */}
            <div>
              <label className="label">Payment Status</label>
              <select className="input" value={payStatus} onChange={e => setPayStatus(e.target.value)}>
                <option>Unpaid</option><option>Invoiced</option><option>Paid</option>
              </select>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2 flex-wrap">
              {selected.status === 'Pending' && (
                <>
                  <button onClick={() => updateStatus(selected.id, 'Approved')} className="btn-success flex items-center gap-2" disabled={loading}>
                    <CheckCircle size={15} /> Approve Booking
                  </button>
                  <button onClick={() => updateStatus(selected.id, 'Rejected')} className="btn-danger flex items-center gap-2" disabled={loading}>
                    <XCircle size={15} /> Reject
                  </button>
                </>
              )}
              {selected.status === 'Approved' && (
                <button onClick={() => updateStatus(selected.id, 'Completed')} className="btn-primary flex items-center gap-2" disabled={loading}>
                  <CheckCircle size={15} /> Mark Completed
                </button>
              )}
              <button onClick={() => updateStatus(selected.id, selected.status)} className="btn-secondary flex items-center gap-2" disabled={loading}>
                <DollarSign size={14} /> Update Payment Status
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
