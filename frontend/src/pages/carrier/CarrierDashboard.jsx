import React, { useEffect, useState } from 'react';
import { Package, BookOpen, DollarSign, CheckCircle, Clock, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatCard from '../../components/StatCard';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

export default function CarrierDashboard() {
  const { carrier } = useAuth();
  const [loads, setLoads] = useState([]);
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    api.get('/loads').then(r => setLoads(r.data)).catch(console.error);
    api.get('/bookings').then(r => setBookings(r.data)).catch(console.error);
  }, []);

  const approved = bookings.filter(b => b.status === 'Approved');
  const pending  = bookings.filter(b => b.status === 'Pending');
  const completed = bookings.filter(b => b.status === 'Completed');
  const totalEarned = completed.reduce((s, b) => s + (b.rate || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-800">Welcome, {carrier?.company_name}</h1>
        <p className="text-slate-500 text-sm mt-0.5">MC: {carrier?.mc_number} · DOT: {carrier?.dot_number}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Available Loads" value={loads.length} icon={Package} color="green" />
        <StatCard label="Active Bookings" value={approved.length} icon={Truck} color="orange" />
        <StatCard label="Pending Requests" value={pending.length} icon={Clock} color="amber" />
        <StatCard label="Completed Loads" value={completed.length} icon={CheckCircle} color="navy" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Available loads preview */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-navy-800 flex items-center gap-2"><Package size={17} /> Available Loads</h2>
            <Link to="/carrier/loads" className="text-sm text-navy-600 hover:underline font-medium">View all →</Link>
          </div>
          {loads.length === 0 ? (
            <p className="text-sm text-slate-400">No available loads at this time. Check back soon.</p>
          ) : (
            <div className="space-y-3">
              {loads.slice(0, 4).map(l => (
                <div key={l.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{l.pickup_location}, {l.pickup_state} → {l.delivery_location}, {l.delivery_state}</p>
                    <p className="text-xs text-slate-400">{l.equipment_type} · PU: {l.pickup_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-freight-green">${Number(l.rate).toLocaleString()}</p>
                    <Link to="/carrier/loads" className="text-xs text-navy-600 hover:underline">Book →</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent bookings */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-navy-800 flex items-center gap-2"><BookOpen size={17} /> My Bookings</h2>
            <Link to="/carrier/bookings" className="text-sm text-navy-600 hover:underline font-medium">View all →</Link>
          </div>
          {bookings.length === 0 ? (
            <p className="text-sm text-slate-400">No booking history yet. <Link to="/carrier/loads" className="text-navy-600 font-medium hover:underline">Browse loads</Link></p>
          ) : (
            <div className="space-y-2">
              {bookings.slice(0, 5).map(b => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{b.pickup_state} → {b.delivery_state}</p>
                    <p className="text-xs text-slate-400 font-mono">{b.load_number}</p>
                  </div>
                  <div className="text-right">
                    <span className={`badge text-xs ${
                      b.status === 'Pending' ? 'badge-yellow' :
                      b.status === 'Approved' ? 'badge-green' :
                      b.status === 'Rejected' ? 'badge-red' : 'badge-gray'
                    }`}>{b.status}</span>
                    <p className="text-xs text-slate-400 mt-1">${Number(b.rate).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Equipment & Lanes */}
      <div className="card">
        <h2 className="font-bold text-navy-800 mb-3">My Profile</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Insurance Status</p>
            <span className={`badge ${carrier?.insurance_status === 'Received' ? 'badge-green' : 'badge-yellow'}`}>{carrier?.insurance_status || 'Pending'}</span>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Safety Rating</p>
            <span className={`badge ${carrier?.safety_status === 'Satisfactory' ? 'badge-green' : 'badge-gray'}`}>{carrier?.safety_status || 'Unknown'}</span>
          </div>
          <div className="col-span-2">
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Equipment Types</p>
            <p className="text-slate-700">
              {(() => { try { return JSON.parse(carrier?.equipment_types || '[]').join(', '); } catch { return carrier?.equipment_types || '—'; } })()}
            </p>
          </div>
          <div className="col-span-2 lg:col-span-4">
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Preferred Lanes</p>
            <p className="text-slate-700">{carrier?.preferred_lanes || 'Not specified'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
