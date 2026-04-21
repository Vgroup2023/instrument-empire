import React, { useEffect, useState } from 'react';
import { Users, Shield, Search, CheckCircle, XCircle, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import Modal from '../../components/Modal';
import api from '../../services/api';

const STATUS_BADGE = {
  Pending:  'badge-yellow',
  Approved: 'badge-green',
  Rejected: 'badge-red',
};

export default function CarrierManagement() {
  const [carriers, setCarriers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [fmcsaData, setFmcsaData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchCarriers = () => api.get('/carriers').then(r => setCarriers(r.data)).catch(console.error);
  useEffect(() => { fetchCarriers(); }, []);

  const filtered = carriers.filter(c =>
    (!statusFilter || c.status === statusFilter) &&
    (!search || `${c.company_name} ${c.mc_number} ${c.dot_number}`.toLowerCase().includes(search.toLowerCase()))
  );

  const openDetail = (carrier) => {
    setSelected(carrier);
    setFmcsaData(carrier.fmcsa_data ? JSON.parse(carrier.fmcsa_data) : null);
    setRejectionReason('');
    setModal('detail');
  };

  const handleStatus = async (carrierId, status) => {
    setLoading(true);
    try {
      await api.put(`/carriers/${carrierId}/status`, { status, rejection_reason: rejectionReason });
      fetchCarriers();
      setModal(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };

  const runFMCSA = async (carrierId) => {
    setLoading(true);
    try {
      const { data } = await api.post(`/carriers/${carrierId}/verify-fmcsa`);
      setFmcsaData(data.fmcsaData);
      fetchCarriers();
    } catch (err) {
      alert('FMCSA check failed');
    } finally { setLoading(false); }
  };

  const equipmentTypes = (c) => {
    try { return JSON.parse(c.equipment_types).join(', '); } catch { return c.equipment_types; }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-800">Carrier Management</h1>
          <p className="text-slate-500 text-sm">{carriers.length} carrier{carriers.length !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={fetchCarriers} className="btn-secondary p-2"><RefreshCw size={16} /></button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search by name, MC, or DOT…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['', 'Pending', 'Approved', 'Rejected'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-navy-800 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:border-slate-400'}`}>
            {s || 'All'}
            {s === 'Pending' && carriers.filter(c => c.status === 'Pending').length > 0 && (
              <span className="ml-1.5 bg-freight-orange text-white text-xs rounded-full px-1.5 py-0.5">
                {carriers.filter(c => c.status === 'Pending').length}
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
                {['Company', 'MC / DOT', 'Equipment', 'Insurance', 'Safety', 'Status', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">No carriers found.</td></tr>
              )}
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{c.company_name}</p>
                    <p className="text-xs text-slate-400">{c.contact_name}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    <div>MC: {c.mc_number}</div>
                    <div>DOT: {c.dot_number}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-32 truncate">{equipmentTypes(c)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${c.insurance_status === 'Received' ? 'badge-green' : 'badge-yellow'}`}>{c.insurance_status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${c.safety_status === 'Satisfactory' ? 'badge-green' : c.safety_status === 'Unsatisfactory' ? 'badge-red' : 'badge-gray'}`}>{c.safety_status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_BADGE[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{c.created_at?.split('T')[0]}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openDetail(c)} className="btn-secondary text-xs py-1 px-3">Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      <Modal open={modal === 'detail'} onClose={() => setModal(null)} title="Carrier Detail" size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="col-span-2 bg-slate-50 rounded-lg p-4">
                <h4 className="font-bold text-navy-800 text-base mb-3">{selected.company_name}</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-slate-500">MC:</span> <strong>{selected.mc_number}</strong></div>
                  <div><span className="text-slate-500">DOT:</span> <strong>{selected.dot_number}</strong></div>
                  <div><span className="text-slate-500">Contact:</span> {selected.contact_name}</div>
                  <div><span className="text-slate-500">Phone:</span> {selected.contact_phone}</div>
                  <div><span className="text-slate-500">Email:</span> {selected.contact_email}</div>
                  <div><span className="text-slate-500">Preferred Lanes:</span> {selected.preferred_lanes || 'N/A'}</div>
                  <div className="col-span-2"><span className="text-slate-500">Equipment:</span> {equipmentTypes(selected)}</div>
                  {selected.factoring_company && <div className="col-span-2"><span className="text-slate-500">Factoring:</span> {selected.factoring_company} — {selected.factoring_contact}</div>}
                </div>
              </div>
            </div>

            {/* FMCSA Section */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-navy-800 flex items-center gap-2"><Shield size={16} /> FMCSA Verification</h4>
                <button onClick={() => runFMCSA(selected.id)} className="btn-secondary text-xs py-1 px-3 flex items-center gap-1" disabled={loading}>
                  <RefreshCw size={12} /> {loading ? 'Checking…' : 'Run Check'}
                </button>
              </div>
              {fmcsaData ? (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-slate-500">Status:</span> <strong className={fmcsaData.operatingStatus === 'Authorized' ? 'text-green-600' : 'text-red-600'}>{fmcsaData.operatingStatus}</strong></div>
                  <div><span className="text-slate-500">Safety:</span> <strong>{fmcsaData.safetyRating}</strong></div>
                  <div><span className="text-slate-500">Insurance:</span> {fmcsaData.insuranceOnFile}</div>
                  <div><span className="text-slate-500">Source:</span> <span className="text-xs">{fmcsaData.source}</span></div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">No FMCSA data. Run a check above.</p>
              )}
            </div>

            {/* Documents */}
            <div className="border border-slate-200 rounded-lg p-4">
              <h4 className="font-semibold text-navy-800 mb-3">Documents</h4>
              <div className="flex gap-3">
                <span className={`badge ${selected.insurance_file ? 'badge-green' : 'badge-yellow'}`}>
                  {selected.insurance_file ? '✓ COI Uploaded' : '⚠ COI Missing'}
                </span>
                <span className={`badge ${selected.w9_file ? 'badge-green' : 'badge-yellow'}`}>
                  {selected.w9_file ? '✓ W-9 Uploaded' : '⚠ W-9 Missing'}
                </span>
              </div>
            </div>

            {/* Approval actions */}
            {selected.status === 'Pending' && (
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-navy-800">Decision</h4>
                <div>
                  <label className="label">Rejection Reason (if rejecting)</label>
                  <input className="input" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="Missing valid COI, unsafe rating, etc." />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => handleStatus(selected.id, 'Approved')} className="btn-success flex items-center gap-2" disabled={loading}>
                    <CheckCircle size={15} /> Approve Carrier
                  </button>
                  <button onClick={() => handleStatus(selected.id, 'Rejected')} className="btn-danger flex items-center gap-2" disabled={loading}>
                    <XCircle size={15} /> Reject
                  </button>
                </div>
              </div>
            )}

            {selected.status === 'Approved' && (
              <div className="flex gap-3">
                <button onClick={() => handleStatus(selected.id, 'Rejected')} className="btn-danger flex items-center gap-2 text-sm">
                  <XCircle size={14} /> Revoke Approval
                </button>
              </div>
            )}
            {selected.status === 'Rejected' && (
              <button onClick={() => handleStatus(selected.id, 'Approved')} className="btn-success flex items-center gap-2 text-sm">
                <CheckCircle size={14} /> Re-approve Carrier
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
