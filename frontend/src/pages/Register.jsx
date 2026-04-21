import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Truck, CheckCircle, AlertCircle, Upload } from 'lucide-react';
import api from '../services/api';

const EQUIPMENT_TYPES = [
  'Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'RGN', 'Tanker',
  'Intermodal', 'Power Only', 'Box Truck', 'Sprinter/Cargo Van',
];

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    company_name: '', mc_number: '', dot_number: '',
    contact_name: '', email: '', contact_phone: '',
    password: '', confirm_password: '',
    equipment_types: [], preferred_lanes: '',
    factoring_company: '', factoring_contact: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleEquipment = (type) => {
    set('equipment_types', form.equipment_types.includes(type)
      ? form.equipment_types.filter(t => t !== type)
      : [...form.equipment_types, type]);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (form.password !== form.confirm_password) return setError('Passwords do not match');
    if (form.equipment_types.length === 0) return setError('Select at least one equipment type');
    setError(''); setLoading(true);
    try {
      await api.post('/auth/register', form);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <CheckCircle size={48} className="text-freight-green mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-navy-800 mb-2">Application Submitted!</h2>
          <p className="text-slate-600 mb-6">Your carrier application is under review. We'll notify you via email once approved — typically within 1–2 business days.</p>
          <Link to="/login" className="btn-primary inline-block">Back to Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-white mb-2">
            <Truck className="text-freight-orange" size={28} />
            <span className="text-2xl font-bold">FreightEmpire</span>
          </div>
          <p className="text-navy-300 text-sm">Carrier Onboarding Application</p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mb-6 justify-center">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-2 w-16 rounded-full transition-colors ${s <= step ? 'bg-freight-orange' : 'bg-navy-700'}`} />
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-7">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Step 1: Company Info */}
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-navy-800 mb-4">Company Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="label">Company Name *</label>
                    <input className="input" required value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="ABC Trucking LLC" />
                  </div>
                  <div>
                    <label className="label">MC Number *</label>
                    <input className="input" required value={form.mc_number} onChange={e => set('mc_number', e.target.value)} placeholder="MC-123456" />
                  </div>
                  <div>
                    <label className="label">DOT Number *</label>
                    <input className="input" required value={form.dot_number} onChange={e => set('dot_number', e.target.value)} placeholder="1234567" />
                  </div>
                  <div>
                    <label className="label">Contact Name *</label>
                    <input className="input" required value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="John Smith" />
                  </div>
                  <div>
                    <label className="label">Phone *</label>
                    <input className="input" type="tel" required value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="(555) 123-4567" />
                  </div>
                  <div>
                    <label className="label">Email Address *</label>
                    <input className="input" type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="dispatch@company.com" />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button type="button" className="btn-primary" onClick={() => {
                    if (!form.company_name || !form.mc_number || !form.dot_number || !form.contact_name || !form.email || !form.contact_phone)
                      return setError('Please fill all required fields');
                    setError(''); setStep(2);
                  }}>Next →</button>
                </div>
              </div>
            )}

            {/* Step 2: Equipment & Lanes */}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-navy-800 mb-4">Equipment & Operations</h3>
                <div>
                  <label className="label">Equipment Type(s) *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                    {EQUIPMENT_TYPES.map(type => (
                      <label key={type} className={`flex items-center gap-2 cursor-pointer rounded-lg border p-2.5 text-sm transition-colors ${
                        form.equipment_types.includes(type) ? 'border-navy-600 bg-navy-50 text-navy-800 font-medium' : 'border-slate-200 text-slate-600 hover:border-slate-400'
                      }`}>
                        <input type="checkbox" className="hidden" checked={form.equipment_types.includes(type)} onChange={() => toggleEquipment(type)} />
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${form.equipment_types.includes(type) ? 'border-navy-600 bg-navy-600' : 'border-slate-300'}`}>
                          {form.equipment_types.includes(type) && <div className="w-2 h-2 bg-white rounded-sm" />}
                        </div>
                        {type}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Preferred Lanes</label>
                  <input className="input" value={form.preferred_lanes} onChange={e => set('preferred_lanes', e.target.value)} placeholder="e.g. TX–CA, Southeast, Midwest" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Factoring Company (optional)</label>
                    <input className="input" value={form.factoring_company} onChange={e => set('factoring_company', e.target.value)} placeholder="TBS Factoring" />
                  </div>
                  <div>
                    <label className="label">Factoring Contact</label>
                    <input className="input" value={form.factoring_contact} onChange={e => set('factoring_contact', e.target.value)} placeholder="Contact name or email" />
                  </div>
                </div>
                <div className="flex justify-between pt-2">
                  <button type="button" className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
                  <button type="button" className="btn-primary" onClick={() => {
                    if (form.equipment_types.length === 0) return setError('Select at least one equipment type');
                    setError(''); setStep(3);
                  }}>Next →</button>
                </div>
              </div>
            )}

            {/* Step 3: Account Setup */}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-navy-800 mb-4">Create Your Account</h3>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <strong>Documents Required:</strong> After approval, you'll need to upload your Certificate of Insurance (COI) and W-9. Our team will contact you.
                </div>
                <div>
                  <label className="label">Password *</label>
                  <input className="input" type="password" required value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 8 characters" minLength={8} />
                </div>
                <div>
                  <label className="label">Confirm Password *</label>
                  <input className="input" type="password" required value={form.confirm_password} onChange={e => set('confirm_password', e.target.value)} placeholder="Re-enter password" />
                </div>
                <p className="text-xs text-slate-500">
                  By submitting, you agree that your information will be reviewed and verified. Approval is at the discretion of FreightEmpire.
                </p>
                <div className="flex justify-between pt-2">
                  <button type="button" className="btn-secondary" onClick={() => setStep(2)}>← Back</button>
                  <button type="submit" className="btn-orange" disabled={loading}>
                    {loading ? 'Submitting…' : 'Submit Application'}
                  </button>
                </div>
              </div>
            )}
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            Already approved? <Link to="/login" className="text-navy-700 font-semibold hover:underline">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
