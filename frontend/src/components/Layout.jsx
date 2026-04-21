import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Truck, LayoutDashboard, Package, Users, BookOpen,
  Megaphone, LogOut, Menu, X, ChevronRight,
} from 'lucide-react';

const TABS = {
  admin: [
    { id: 'operations', label: 'Load Operations', icon: Truck },
    { id: 'marketing', label: 'AI Marketing & Sales', icon: Megaphone },
  ],
  carrier: [
    { id: 'operations', label: 'Load Board', icon: Truck },
  ],
};

const NAV = {
  admin: {
    operations: [
      { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/admin/loads',     label: 'Loads',     icon: Package },
      { to: '/admin/carriers',  label: 'Carriers',  icon: Users },
      { to: '/admin/bookings',  label: 'Bookings',  icon: BookOpen },
    ],
    marketing: [
      { to: '/admin/marketing', label: 'AI Marketing', icon: Megaphone },
    ],
  },
  carrier: {
    operations: [
      { to: '/carrier/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/carrier/loads',     label: 'Available Loads', icon: Package },
      { to: '/carrier/bookings',  label: 'My Bookings',     icon: BookOpen },
    ],
  },
};

export default function Layout() {
  const { user, carrier, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role || 'carrier';
  const tabs = TABS[role] || TABS.carrier;

  // Determine active tab from URL
  const isMarketing = location.pathname.includes('/marketing');
  const [activeTab, setActiveTab] = useState(isMarketing ? 'marketing' : 'operations');

  const navItems = (NAV[role]?.[activeTab] || []);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    const firstRoute = NAV[role]?.[tabId]?.[0]?.to;
    if (firstRoute) navigate(firstRoute);
    setMobileOpen(false);
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-navy-700">
        <div className="flex items-center gap-2">
          <Truck className="text-freight-orange" size={24} />
          <span className="text-white font-bold text-lg tracking-tight">FreightEmpire</span>
        </div>
        <p className="text-navy-300 text-xs mt-1">Private Load Board</p>
      </div>

      {/* Tab switcher */}
      {tabs.length > 1 && (
        <div className="px-3 py-3 border-b border-navy-700">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium mb-1 transition-colors ${
                activeTab === t.id
                  ? 'bg-freight-orange text-white'
                  : 'text-navy-200 hover:bg-navy-700 hover:text-white'
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Nav links */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-navy-600 text-white'
                  : 'text-navy-200 hover:bg-navy-700 hover:text-white'
              }`
            }
          >
            <item.icon size={17} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="px-4 py-3 border-t border-navy-700">
        <div className="text-navy-300 text-xs mb-1 truncate">{user?.email}</div>
        {carrier && <div className="text-white text-sm font-medium truncate">{carrier.company_name}</div>}
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`badge text-xs ${role === 'admin' ? 'badge-orange' : 'badge-green'}`}>
            {role === 'admin' ? 'Admin' : 'Carrier'}
          </span>
        </div>
        <button onClick={handleLogout} className="mt-3 flex items-center gap-2 text-navy-300 hover:text-white text-sm transition-colors">
          <LogOut size={15} /> Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-navy-900 shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 flex flex-col bg-navy-900 z-50">
            <button onClick={() => setMobileOpen(false)} className="absolute top-3 right-3 text-white"><X size={20} /></button>
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden bg-navy-900 text-white px-4 py-3 flex items-center gap-3 shrink-0">
          <button onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
          <Truck className="text-freight-orange" size={20} />
          <span className="font-bold">FreightEmpire</span>
        </header>

        {/* Tab bar (desktop — decorative breadcrumb) */}
        <div className="hidden md:flex bg-white border-b border-slate-200 px-6 py-2 items-center gap-2 shrink-0">
          <span className="text-sm font-semibold text-navy-800">
            {tabs.find(t => t.id === activeTab)?.label}
          </span>
          <ChevronRight size={14} className="text-slate-400" />
          <span className="text-sm text-slate-500">
            {navItems.find(i => location.pathname.startsWith(i.to))?.label}
          </span>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
