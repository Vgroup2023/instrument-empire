import React, { useEffect, useState } from 'react';
import { Package, Users, BookOpen, TrendingUp, Clock, CheckCircle, Truck, DollarSign } from 'lucide-react';
import StatCard from '../../components/StatCard';
import api from '../../services/api';

export default function AdminDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/loads'),
      api.get('/carriers'),
      api.get('/bookings'),
    ]).then(([loads, carriers, bookings]) => {
      const l = loads.data, c = carriers.data, b = bookings.data;
      setData({
        totalLoads: l.length,
        availableLoads: l.filter(x => x.status === 'Available').length,
        bookedLoads: l.filter(x => x.status === 'Booked').length,
        inTransit: l.filter(x => x.status === 'In Transit').length,
        completedLoads: l.filter(x => x.status === 'Completed').length,
        totalCarriers: c.length,
        approvedCarriers: c.filter(x => x.status === 'Approved').length,
        pendingCarriers: c.filter(x => x.status === 'Pending').length,
        totalBookings: b.length,
        pendingBookings: b.filter(x => x.status === 'Pending').length,
        totalRevenue: l.filter(x => x.status === 'Completed').reduce((s, x) => s + x.rate, 0),
        recentLoads: l.slice(0, 5),
        recentBookings: b.slice(0, 5),
      });
    }).catch(console.error);
  }, []);

  if (!data) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-800" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-800">Operations Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">Real-time overview of your freight network</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Loads" value={data.totalLoads} icon={Package} color="navy" />
        <StatCard label="Available" value={data.availableLoads} icon={TrendingUp} color="green" />
        <StatCard label="Active Carriers" value={data.approvedCarriers} icon={Truck} color="orange" />
        <StatCard label="Revenue (Completed)" value={`$${data.totalRevenue.toLocaleString()}`} icon={DollarSign} color="blue" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Booked Loads" value={data.bookedLoads} icon={BookOpen} color="blue" />
        <StatCard label="In Transit" value={data.inTransit} icon={Truck} color="amber" />
        <StatCard label="Pending Carriers" value={data.pendingCarriers} icon={Clock} color="amber"
          sub={data.pendingCarriers > 0 ? 'Needs review' : 'All clear'} />
        <StatCard label="Pending Bookings" value={data.pendingBookings} icon={Clock} color="orange"
          sub={data.pendingBookings > 0 ? 'Awaiting approval' : 'All clear'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Loads */}
        <div className="card">
          <h2 className="font-bold text-navy-800 mb-4 flex items-center gap-2"><Package size={17} /> Recent Loads</h2>
          {data.recentLoads.length === 0 ? (
            <p className="text-sm text-slate-400">No loads yet. Create your first load.</p>
          ) : (
            <div className="space-y-2">
              {data.recentLoads.map(l => (
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-xs font-mono text-slate-400">{l.load_number}</p>
                    <p className="text-sm font-medium text-slate-700">{l.pickup_state} → {l.delivery_state}</p>
                    <p className="text-xs text-slate-400">{l.equipment_type} · {l.pickup_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-freight-green text-sm">${Number(l.rate).toLocaleString()}</p>
                    <span className={`badge text-xs mt-1 ${
                      l.status === 'Available' ? 'badge-green' :
                      l.status === 'Booked' ? 'badge-blue' :
                      l.status === 'In Transit' ? 'badge-orange' : 'badge-gray'
                    }`}>{l.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Bookings */}
        <div className="card">
          <h2 className="font-bold text-navy-800 mb-4 flex items-center gap-2"><BookOpen size={17} /> Recent Bookings</h2>
          {data.recentBookings.length === 0 ? (
            <p className="text-sm text-slate-400">No booking requests yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recentBookings.map(b => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{b.company_name}</p>
                    <p className="text-xs text-slate-400">{b.load_number} · {b.pickup_state} → {b.delivery_state}</p>
                  </div>
                  <span className={`badge text-xs ${
                    b.status === 'Pending' ? 'badge-yellow' :
                    b.status === 'Approved' ? 'badge-green' :
                    b.status === 'Rejected' ? 'badge-red' : 'badge-gray'
                  }`}>{b.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
