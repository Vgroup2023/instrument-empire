import React, { useEffect, useState } from 'react';
import { Search, Filter, RefreshCw, Truck } from 'lucide-react';
import LoadCard from '../../components/LoadCard';
import Modal from '../../components/Modal';
import api from '../../services/api';

const EQUIPMENT = ['', 'Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'RGN', 'Tanker', 'Intermodal', 'Power Only', 'Box Truck', 'Sprinter/Cargo Van'];

export default function LoadBoard() {
  const [loads, setLoads] = useState([]);
  const [filter, setFilter] = useState({ equipment_type: '', pickup_state: '', delivery_state: '', date_from: '' });
  const [modal, setModal] = useState(null);
  const [selectedLoad, setSelectedLoad] = useState(null);
  const [bookForm, setBookForm] = useState({ driver_name: '', driver_phone: '', truck_number: '', trailer_number: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const fetchLoads = () => {
    const params = {};
    if (filter.equipment_type) params.equipment_type = filter.equipment_type;
    if (filter.pickup_state) params.pickup_state = filter.pickup_state.toUpperCase();
    if (filter.delivery_state) params.delivery_state = filter.delivery_state.toUpperCase();
    if (filter.date_from) params.date_from = filter.date_from;
    api.get('/loads', { params }).then(r => setLoads(r.data)).catch(console.error);
  };

  useEffect(() => { fetchLoads(); }, [filter]);

  const openBook = (load) => {
    setSelectedLoad(load);
    setBookForm({ driver_name: '', driver_phone: '', truck_number: '', trailer_number: '', notes: '' });
    setError(''); setSuccess('');
    setModal('book');
  };

  const handleBook = async e => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await api.post('/bookings', { load_id: selectedLoad.id, ...bookForm });
      setSuccess('Booking request submitted! The broker will review and confirm shortly.');
      fetchLoads();
    } catch (err) {
      setError(err.response?.data?.error || 'Booking failed');
    } finally { setLoading(false); }
  };

  const setF = (k, v) => setFilter(f => ({ ...f, [k]: v }));
  const setBF = (k, v) => setBookForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-800">Available Loads</h1>
          <p className="text-slate-500 text-sm">{loads.length} load{loads.length !== 1 ? 's' : ''} matching your filters</p>
        </div>
        <button onClick={fetchLoads} className="btn-secondary p-2"><RefreshCw size={16} /></button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={15} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">Filter Loads</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label text-xs">Equipment Type</label>
            <select className="input" value={filter.equipment_type} onChange={e => setF('equipment_type', e.target.value)}>
              {EQUIPMENT.map(t => <option key={t} value={t}>{t || 'All Equipment'}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Pickup State</label>
            <input className="input" value={filter.pickup_state} onChange={e => setF('pickup_state', e.target.value)} placeholder="TX" maxLength={2} />
          </div>
          <div>
            <label className="label text-xs">Delivery State</label>
            <input className="input" value={filter.delivery_state} onChange={e => setF('delivery_state', e.target.value)} placeholder="CA" maxLength={2} />
          </div>
          <div>
            <label className="label text-xs">Pickup Date (From)</label>
            <input className="input" type="date" value={filter.date_from} onChange={e => setF('date_from', e.target.value)} />
          </div>
        </div>
        {(filter.equipment_type || filter.pickup_state || filter.delivery_state || filter.date_from) && (
          <button onClick={() => setFilter({ equipment_type: '', pickup_state: '', delivery_state: '', date_from: '' })}
            className="mt-3 text-xs text-navy-600 hover:underline">Clear filters</button>
        )}
      </div>

      {/* Load grid */}
      {loads.length === 0 ? (
        <div className="card text-center py-16">
          <Truck size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No available loads match your filters</p>
          <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or check back later</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loads.map(load => (
            <LoadCard
              key={load.id}
              load={load}
              action={
                <button
                  onClick={() => openBook(load)}
                  className="btn-orange w-full flex items-center justify-center gap-2 mt-1"
                >
                  <Truck size={15} /> Request Booking
                </button>
              }
            />
          ))}
        </div>
      )}

      {/* Booking modal */}
      <Modal open={modal === 'book'} onClose={() => { setModal(null); setSuccess(''); }} title="Request Booking">
        {selectedLoad && (
          <div>
            {/* Load summary */}
            <div className="bg-navy-50 border border-navy-200 rounded-lg p-4 mb-5 text-sm">
              <p className="font-bold text-navy-800 text-base mb-1">{selectedLoad.pickup_location}, {selectedLoad.pickup_state} → {selectedLoad.delivery_location}, {selectedLoad.delivery_state}</p>
              <div className="flex gap-4 text-slate-600">
                <span>{selectedLoad.equipment_type}</span>
                <span className="font-bold text-freight-green">${Number(selectedLoad.rate).toLocaleString()}</span>
                <span>PU: {selectedLoad.pickup_date}</span>
              </div>
            </div>

            {success ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
                <p className="font-semibold mb-1">✓ Booking Request Submitted</p>
                <p>{success}</p>
                <button className="btn-secondary mt-3 text-sm" onClick={() => { setModal(null); setSuccess(''); }}>Close</button>
              </div>
            ) : (
              <form onSubmit={handleBook} className="space-y-4">
                {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Driver Name</label><input className="input" value={bookForm.driver_name} onChange={e => setBF('driver_name', e.target.value)} placeholder="John Smith" /></div>
                  <div><label className="label">Driver Phone</label><input className="input" type="tel" value={bookForm.driver_phone} onChange={e => setBF('driver_phone', e.target.value)} placeholder="(555) 123-4567" /></div>
                  <div><label className="label">Truck Number</label><input className="input" value={bookForm.truck_number} onChange={e => setBF('truck_number', e.target.value)} placeholder="TRK-001" /></div>
                  <div><label className="label">Trailer Number</label><input className="input" value={bookForm.trailer_number} onChange={e => setBF('trailer_number', e.target.value)} placeholder="TRL-001" /></div>
                  <div className="col-span-2"><label className="label">Notes (optional)</label><textarea className="input" rows={2} value={bookForm.notes} onChange={e => setBF('notes', e.target.value)} placeholder="Any special notes for the broker…" /></div>
                </div>
                <p className="text-xs text-slate-500">Your request will be reviewed by the broker. You'll be notified once approved.</p>
                <div className="flex justify-end gap-3">
                  <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                  <button type="submit" className="btn-orange" disabled={loading}>{loading ? 'Submitting…' : 'Submit Request'}</button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
