import React, { useEffect, useState } from 'react';
import {
  Megaphone, Plus, Sparkles, Send, Users, TrendingUp,
  Mail, MessageSquare, Trash2, RefreshCw, ChevronDown,
} from 'lucide-react';
import Modal from '../../components/Modal';
import StatCard from '../../components/StatCard';
import api from '../../services/api';

const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
const STATUS_BADGE = {
  New: 'badge-blue', Contacted: 'badge-yellow', Qualified: 'badge-orange',
  Converted: 'badge-green', Lost: 'badge-gray',
};

const EMPTY_LEAD = {
  company_name: '', contact_name: '', email: '', phone: '',
  lead_type: 'Carrier', source: 'Manual', mc_number: '', dot_number: '',
  equipment_types: '', preferred_lanes: '', notes: '',
};

export default function AIMarketing() {
  const [leads, setLeads] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState(null); // 'add-lead' | 'ai-gen' | 'detail'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_LEAD);
  const [aiForm, setAiForm] = useState({ type: 'Email', tone: 'Professional', objective: '', custom_context: '' });
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('pipeline'); // 'pipeline' | 'generate' | 'metrics'

  const fetchAll = () => {
    const params = statusFilter ? { status: statusFilter } : {};
    api.get('/marketing/leads', { params }).then(r => setLeads(r.data)).catch(console.error);
    api.get('/marketing/metrics').then(r => setMetrics(r.data)).catch(console.error);
  };
  useEffect(() => { fetchAll(); }, [statusFilter]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setAI = (k, v) => setAiForm(f => ({ ...f, [k]: v }));

  const saveLead = async e => {
    e.preventDefault(); setLoading(true);
    try {
      if (modal === 'add-lead') await api.post('/marketing/leads', form);
      else await api.put(`/marketing/leads/${selected.id}`, form);
      fetchAll(); setModal(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };

  const deleteLead = async (id) => {
    if (!confirm('Delete this lead?')) return;
    await api.delete(`/marketing/leads/${id}`).catch(console.error);
    fetchAll();
  };

  const updateLeadStatus = async (id, status) => {
    await api.put(`/marketing/leads/${id}`, { status }).catch(console.error);
    fetchAll();
  };

  const openAI = (lead = null) => {
    setSelected(lead);
    setAiResult('');
    setAiError('');
    setModal('ai-gen');
  };

  const generateAI = async () => {
    setAiLoading(true); setAiError(''); setAiResult('');
    try {
      const { data } = await api.post('/marketing/ai/generate', {
        ...aiForm,
        lead_id: selected?.id,
      });
      setAiResult(data.content);
    } catch (err) {
      setAiError(err.response?.data?.error || 'AI generation failed');
    } finally { setAiLoading(false); }
  };

  const sendContent = async () => {
    if (!selected || !aiResult) return;
    setSendLoading(true);
    try {
      await api.post('/marketing/ai/send', { lead_id: selected.id, type: aiForm.type, content: aiResult });
      alert(`${aiForm.type} sent successfully!`);
      fetchAll();
      setModal(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Send failed');
    } finally { setSendLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-800 flex items-center gap-2"><Megaphone size={22} /> AI Marketing & Sales</h1>
          <p className="text-slate-500 text-sm">Lead pipeline, AI-generated outreach, and campaign tracking</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="btn-secondary p-2"><RefreshCw size={16} /></button>
          <button onClick={() => { setForm(EMPTY_LEAD); setModal('add-lead'); }} className="btn-primary flex items-center gap-2"><Plus size={16} /> Add Lead</button>
          <button onClick={() => openAI(null)} className="btn-orange flex items-center gap-2"><Sparkles size={16} /> AI Generator</button>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { id: 'pipeline', label: 'Lead Pipeline', icon: Users },
          { id: 'generate', label: 'AI Generator', icon: Sparkles },
          { id: 'metrics', label: 'Metrics', icon: TrendingUp },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveSubTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeSubTab === t.id ? 'border-freight-orange text-freight-orange' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── PIPELINE TAB ── */}
      {activeSubTab === 'pipeline' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {['', ...LEAD_STATUSES].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-navy-800 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}>
                {s || 'All'} {s && <span className="ml-1 text-xs opacity-75">({leads.filter(l => l.status === s).length})</span>}
              </button>
            ))}
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Company', 'Contact', 'Type', 'Source', 'Status', 'Last Contacted', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-slate-400">No leads yet. Add your first lead to start your pipeline.</td></tr>
                  )}
                  {leads.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{l.company_name}</p>
                        {l.mc_number && <p className="text-xs text-slate-400 font-mono">MC: {l.mc_number}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700">{l.contact_name}</p>
                        <p className="text-xs text-slate-400">{l.email}</p>
                      </td>
                      <td className="px-4 py-3"><span className="badge badge-blue text-xs">{l.lead_type}</span></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{l.source}</td>
                      <td className="px-4 py-3">
                        <select
                          value={l.status}
                          onChange={e => updateLeadStatus(l.id, e.target.value)}
                          className={`text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer ${
                            l.status === 'New' ? 'bg-blue-100 text-blue-800' :
                            l.status === 'Contacted' ? 'bg-yellow-100 text-yellow-800' :
                            l.status === 'Qualified' ? 'bg-orange-100 text-orange-800' :
                            l.status === 'Converted' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                          }`}>
                          {LEAD_STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{l.last_contacted_at?.split('T')[0] || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openAI(l)} title="Generate AI Content" className="p-1.5 text-navy-600 hover:bg-navy-50 rounded"><Sparkles size={14} /></button>
                          <button onClick={() => { setSelected(l); setForm({ ...l }); setModal('edit-lead'); }} title="Edit" className="p-1.5 text-slate-500 hover:bg-slate-100 rounded">✏️</button>
                          <button onClick={() => deleteLead(l.id)} title="Delete" className="p-1.5 text-red-400 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── AI GENERATOR TAB ── */}
      {activeSubTab === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card space-y-4">
            <h3 className="font-bold text-navy-800 flex items-center gap-2"><Sparkles size={17} /> AI Content Generator</h3>
            <div>
              <label className="label">Content Type</label>
              <div className="flex gap-2">
                {['Email', 'SMS'].map(t => (
                  <button key={t} onClick={() => setAI('type', t)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${aiForm.type === t ? 'border-navy-600 bg-navy-50 text-navy-800' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                    {t === 'Email' ? <Mail size={15} /> : <MessageSquare size={15} />} {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Target Lead (optional)</label>
              <select className="input" value={selected?.id || ''} onChange={e => setSelected(leads.find(l => l.id == e.target.value) || null)}>
                <option value="">— Generic (no specific lead) —</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.company_name} – {l.contact_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tone</label>
              <select className="input" value={aiForm.tone} onChange={e => setAI('tone', e.target.value)}>
                {['Professional', 'Friendly', 'Urgent', 'Value-focused', 'Direct'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Objective</label>
              <input className="input" value={aiForm.objective} onChange={e => setAI('objective', e.target.value)} placeholder="e.g. Get them to call about dedicated lanes on TX-CA" />
            </div>
            <div>
              <label className="label">Additional Context</label>
              <textarea className="input" rows={3} value={aiForm.custom_context} onChange={e => setAI('custom_context', e.target.value)} placeholder="Any specific details, offers, or lane info to include…" />
            </div>
            <button onClick={generateAI} disabled={aiLoading} className="btn-orange w-full flex items-center justify-center gap-2">
              <Sparkles size={16} /> {aiLoading ? 'Generating…' : 'Generate with AI'}
            </button>
          </div>

          <div className="card space-y-4">
            <h3 className="font-bold text-navy-800">Generated Content</h3>
            {aiError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{aiError}</div>}
            {aiLoading && (
              <div className="flex items-center gap-3 text-slate-500 text-sm py-8 justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-freight-orange" />
                Claude is generating your content…
              </div>
            )}
            {aiResult && !aiLoading && (
              <>
                <textarea
                  className="input font-mono text-xs leading-relaxed"
                  rows={16}
                  value={aiResult}
                  onChange={e => setAiResult(e.target.value)}
                />
                <div className="flex gap-3">
                  <button onClick={() => navigator.clipboard.writeText(aiResult)} className="btn-secondary flex items-center gap-2 text-sm">Copy</button>
                  {selected && (
                    <button onClick={sendContent} disabled={sendLoading} className="btn-primary flex items-center gap-2 text-sm">
                      <Send size={14} /> {sendLoading ? 'Sending…' : `Send to ${selected.company_name}`}
                    </button>
                  )}
                </div>
              </>
            )}
            {!aiResult && !aiLoading && (
              <div className="text-center py-12 text-slate-300">
                <Sparkles size={40} className="mx-auto mb-3" />
                <p className="text-sm">Configure options and click Generate</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── METRICS TAB ── */}
      {activeSubTab === 'metrics' && metrics && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Leads" value={metrics.total_leads} icon={Users} color="navy" />
            <StatCard label="New Leads" value={metrics.new_leads} icon={TrendingUp} color="blue" />
            <StatCard label="Converted" value={metrics.converted} icon={TrendingUp} color="green" />
            <StatCard label="Conversion Rate" value={metrics.total_leads > 0 ? `${Math.round((metrics.converted / metrics.total_leads) * 100)}%` : '0%'} icon={TrendingUp} color="orange" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Contacted" value={metrics.contacted} icon={Mail} color="amber" />
            <StatCard label="Qualified" value={metrics.qualified} icon={Users} color="orange" />
            <StatCard label="Lost" value={metrics.lost} icon={Users} color="red" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card">
              <h3 className="font-bold text-navy-800 mb-4">Lead Types</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center"><span className="text-sm text-slate-600">Carrier Leads</span><span className="font-bold">{metrics.carrier_leads}</span></div>
                <div className="flex justify-between items-center"><span className="text-sm text-slate-600">Shipper Leads</span><span className="font-bold">{metrics.shipper_leads}</span></div>
              </div>
            </div>
            <div className="card">
              <h3 className="font-bold text-navy-800 mb-4">By Source</h3>
              {metrics.by_source.length === 0 ? <p className="text-sm text-slate-400">No data yet</p> : (
                <div className="space-y-2">
                  {metrics.by_source.map(s => (
                    <div key={s.source} className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">{s.source}</span>
                      <span className="font-bold">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Lead Modal */}
      <Modal open={modal === 'add-lead' || modal === 'edit-lead'} onClose={() => setModal(null)} title={modal === 'add-lead' ? 'Add New Lead' : 'Edit Lead'}>
        <form onSubmit={saveLead} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Company Name *</label><input className="input" required value={form.company_name} onChange={e => set('company_name', e.target.value)} /></div>
            <div><label className="label">Contact Name *</label><input className="input" required value={form.contact_name} onChange={e => set('contact_name', e.target.value)} /></div>
            <div><label className="label">Email *</label><input className="input" type="email" required value={form.email} onChange={e => set('email', e.target.value)} /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
            <div><label className="label">Lead Type</label>
              <select className="input" value={form.lead_type} onChange={e => set('lead_type', e.target.value)}>
                <option>Carrier</option><option>Shipper</option><option>Both</option>
              </select>
            </div>
            <div><label className="label">Source</label><input className="input" value={form.source} onChange={e => set('source', e.target.value)} placeholder="Website, Referral, Cold Call…" /></div>
            <div><label className="label">MC Number</label><input className="input" value={form.mc_number} onChange={e => set('mc_number', e.target.value)} /></div>
            <div><label className="label">Equipment Types</label><input className="input" value={form.equipment_types} onChange={e => set('equipment_types', e.target.value)} placeholder="Dry Van, Reefer…" /></div>
            <div className="col-span-2"><label className="label">Preferred Lanes</label><input className="input" value={form.preferred_lanes} onChange={e => set('preferred_lanes', e.target.value)} placeholder="TX–CA, Southeast…" /></div>
            <div className="col-span-2"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Save Lead'}</button>
          </div>
        </form>
      </Modal>

      {/* AI Gen Modal (from pipeline) */}
      <Modal open={modal === 'ai-gen'} onClose={() => setModal(null)} title={`AI Generator${selected ? ` — ${selected.company_name}` : ''}`} size="lg">
        <div className="space-y-4">
          <div className="flex gap-2">
            {['Email', 'SMS'].map(t => (
              <button key={t} onClick={() => setAI('type', t)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${aiForm.type === t ? 'border-navy-600 bg-navy-50 text-navy-800' : 'border-slate-200 text-slate-600'}`}>
                {t === 'Email' ? <Mail size={15} /> : <MessageSquare size={15} />} {t}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tone</label>
              <select className="input" value={aiForm.tone} onChange={e => setAI('tone', e.target.value)}>
                {['Professional', 'Friendly', 'Urgent', 'Value-focused', 'Direct'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Objective</label>
              <input className="input" value={aiForm.objective} onChange={e => setAI('objective', e.target.value)} placeholder="Schedule a call, get rates…" />
            </div>
            <div className="col-span-2">
              <label className="label">Additional Context</label>
              <textarea className="input" rows={2} value={aiForm.custom_context} onChange={e => setAI('custom_context', e.target.value)} />
            </div>
          </div>
          <button onClick={generateAI} disabled={aiLoading} className="btn-orange w-full flex items-center justify-center gap-2">
            <Sparkles size={16} /> {aiLoading ? 'Generating…' : 'Generate'}
          </button>
          {aiError && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{aiError}</div>}
          {aiResult && (
            <div className="space-y-3">
              <textarea className="input font-mono text-xs leading-relaxed" rows={12} value={aiResult} onChange={e => setAiResult(e.target.value)} />
              <div className="flex gap-3">
                <button onClick={() => navigator.clipboard.writeText(aiResult)} className="btn-secondary text-sm">Copy</button>
                {selected && (
                  <button onClick={sendContent} disabled={sendLoading} className="btn-primary flex items-center gap-2 text-sm">
                    <Send size={14} /> {sendLoading ? 'Sending…' : 'Send Now'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
