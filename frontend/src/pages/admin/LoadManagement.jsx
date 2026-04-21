import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Package, RefreshCw } from 'lucide-react';
import Modal from '../../components/Modal';
import LoadCard from '../../components/LoadCard';
import api from '../../services/api';

const EQUIPMENT = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'RGN', 'Tanker', 'Intermodal', 'Power Only', 'Box Truck', 'Sprinter/Cargo Van'];
const STATUSES = ['Available', 'Booked', 'In Transit', 'Completed', 'Cancelled'];

const EMPTY = {
  pickup_location: '', pickup_state: '', delivery_location: '', delivery_state: '',
  rate: '', equipment_type: 'Dry Van', weight: '', commodity: '',
  pickup_date: '', delivery_date: '', pickup_time: '', special_instructions: '', status: 'Available',
};

export default function LoadManagement() {
  const [loads, setLoads] = useState([]);
  const [filter, setFilter] = useState({ status: '', equipment_type: '' });
  const [modal, setModal] = useState(null); // null | 'create' | 'edit'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('table'); // 'table' | 'cards'

  const fetchLoads = () => {
    const params = {};
    if (filter.status) params.status = filter.status;
    if (filter.equipment_type) params.equipment_type = filter.equipment_type;
    api.get('/loads', { params }).then(r => setLoads(r.data)).catch(console.error);
  };

  useEffect(() => { fetchLoads(); }, [filter]);

  const openCreate = () => { setForm(EMPTY); setError(''); setModal('create'); };
  const openEdit = (load) => { setSelected(load); setForm({ ...load }); setError(''); setModal('edit'); };
  const closeModal = () => { setModal(null); setSelected(null); setError(''); };

  const handleSubmit = async e => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      if (modal === 'create') await api.post('/loads', form);
      else await api.put(`/loads/${selected.id}`, form);
      fetchLoads(); closeModal();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this load? This cannot be undone.')) return;
    await api.delete(`/loads/${id}`).catch(console.error);
    fetchLoads();
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const LoadForm = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Pickup City *</label>
          <input className="input" required value={form.pickup_location} onChange={e => set('pickup_location', e.target.value)} placeholder="Dallas" />
        </div>
        <div>
          <label className="label">Pickup State *</label>
          <input className="input" required value={form.pickup_state} onChange={e => set('pickup_state', e.target.value)} placeholder="TX" maxLength={2} />
        </div>
        <div>
          <label className="label">Delivery City *</label>
          <input className="input" required value={form.delivery_location} onChange={e => set('delivery_location', e.target.value)} placeholder="Los Angeles" />
        </div>
        <div>
          <label className="label">Delivery State *</label>
          <input className="input" required value={form.delivery_state} onChange={e => set('delivery_state', e.target.value)} placeholder="CA" maxLength={2} />
        </div>
        <div>
          <label className="label">Rate ($) *</label>
          <input className="input" type="number" required min="1" value={form.rate} onChange={e => set('rate', e.target.value)} placeholder="3500" />
        </div>
        <div>
          <label className="label">Equipment Type *</label>
          <select className="input" value={form.equipment_type} onChange={e => set('equipment_type', e.target.value)}>
            {EQUIPMENT.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Weight</label>
          <input className="input" value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="42,000 lbs" />
        </div>
        <div>
          <label className="label">Commodity</label>
          <input className="input" value={form.commodity} onChange={e => set('commodity', e.target.value)} placeholder="General Freight" />
        </div>
        <div>
          <label className="label">Pickup Date *</label>
          <input className="input" type="date" required value={form.pickup_date} onChange={e => set('pickup_date', e.target.value)} />
        </div>
        <div>
          <label className="label">Delivery Date *</label>
          <input className="input" type="date" required value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} />
        </div>
        <div>
          <label className="label">Pickup Time</label>
          <input className="input" value={form.pickup_time} onChange={e => set('pickup_time', e.target.value)} placeholder="08:00 AM" />
        </div>
        {modal === 'edit' && (
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div className="col-span-2">
          <label className="label">Special Instructions</label>
          <textarea className="input" rows={2} value={form.special_instructions} onChange={e => set('special_instructions', e.target.value)} placeholder="TONU, team required, etc." />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : modal === 'create' ? 'Post Load' : 'Save Changes'}</button>
      </div>
    </form>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-800">Load Management</h1>
          <p className="text-slate-500 text-sm">{loads.length} load{loads.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchLoads} className="btn-secondary p-2"><RefreshCw size={16} /></button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus size={16} /> Post Load</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <select className="input w-auto" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="input w-auto" value={filter.equipment_type} onChange={e => setFilter(f => ({ ...f, equipment_type: e.target.value }))}>
          <option value="">All Equipment</option>
          {EQUIPMENT.map(t => <option key={t}>{t}</option>)}
        </select>
        <div className="flex gap-1 ml-auto">
          {['table', 'cards'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm rounded-lg ${view === v ? 'bg-navy-800 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}>
              {v === 'table' ? 'Table' : 'Cards'}
            </button>
          ))}
        </div>
      </div>

      {/* Table view */}
      {view === 'table' && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Load #', 'Route', 'Equipment', 'Rate', 'Pickup Date', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loads.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-slate-400">No loads found. <button onClick={openCreate} className="text-navy-700 font-medium">Post your first load</button></td></tr>
                )}
                {loads.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.load_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{l.pickup_state} → {l.delivery_state}<br /><span className="text-xs text-slate-400 font-normal">{l.pickup_location} → {l.delivery_location}</span></td>
                    <td className="px-4 py-3 text-slate-600">{l.equipment_type}</td>
                    <td className="px-4 py-3 font-bold text-freight-green">${Number(l.rate).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{l.pickup_date}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${l.status === 'Available' ? 'badge-green' : l.status === 'Booked' ? 'badge-blue' : l.status === 'In Transit' ? 'badge-orange' : l.status === 'Completed' ? 'badge-gray' : 'badge-red'}`}>{l.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(l)} className="text-navy-600 hover:text-navy-900 p-1 rounded hover:bg-slate-100"><Pencil size={15} /></button>
                        <button onClick={() => handleDelete(l.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Card view */}
      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loads.map(l => (
            <LoadCard key={l.id} load={l} action={
              <div className="flex gap-2">
                <button onClick={() => openEdit(l)} className="btn-secondary flex items-center gap-1 text-sm py-1.5"><Pencil size={13} /> Edit</button>
                <button onClick={() => handleDelete(l.id)} className="btn-danger flex items-center gap-1 text-sm py-1.5"><Trash2 size={13} /> Delete</button>
              </div>
            } />
          ))}
          {loads.length === 0 && <div className="col-span-3 text-center py-10 text-slate-400">No loads found.</div>}
        </div>
      )}

      <Modal open={!!modal} onClose={closeModal} title={modal === 'create' ? 'Post New Load' : 'Edit Load'} size="lg">
        <LoadForm />
      </Modal>
    </div>
  );
}
