import { Routes, Route, NavLink, Link, useNavigate, Navigate } from 'react-router-dom';
import { LayoutDashboard, Map, Brain, TrainFront, Users, ShieldCheck, IndianRupee, Gauge, Route as RouteIcon, Siren, PlayCircle, GitBranch, Settings, LogOut, Menu, X, Presentation } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/app/session';
import { useAppState } from '@/domain/store/hooks';
import { Logo, Avatar, Badge } from '@/app/shared/ui';
import { ClockWidget } from '@/app/shared/ClockWidget';
import { OverviewPage } from './OverviewPage';
import { FleetPage } from './FleetPage';
import { DispatchPage } from './DispatchPage';
import { SettingsPage } from './SettingsPage';
import { HotspotsPage } from './HotspotsPage';
import { StationsPage } from './StationsPage';
import { PeoplePage } from './PeoplePage';
import { CompliancePage } from './CompliancePage';
import { FinancePage } from './FinancePage';
import { UtilisationPage } from './UtilisationPage';
import { RoutesPage } from './RoutesPage';
import { SafetyPage } from './SafetyPage';
import { SimulationPage } from './SimulationPage';

export default function AdminApp({ mode }: { mode: 'admin' | 'metro' }) {
  const { logout, session } = useSession();
  const user = useAppState((s) => s.users[session!.userId]);
  const openAlerts = useAppState((s) => Object.values(s.alerts).filter((a) => a.status !== 'resolved').length);
  const simStatus = useAppState((s) => s.simulation.status);
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const base = `/${mode}`;
  type NavItem = { to: string; icon: typeof LayoutDashboard; label: string; end?: boolean; badge?: string };
  const adminNav: NavItem[] = [
    { to: '', icon: LayoutDashboard, label: 'Operations overview', end: true },
    { to: '/simulation', icon: PlayCircle, label: 'Live simulation', badge: simStatus === 'running' ? 'LIVE' : undefined },
    { to: '/fleet', icon: Map, label: 'Live fleet' },
    { to: '/dispatch', icon: GitBranch, label: 'Pooling & dispatch' },
    { to: '/hotspots', icon: Brain, label: 'Hotspot intelligence' },
    { to: '/stations', icon: TrainFront, label: 'Station analytics' },
    { to: '/people', icon: Users, label: 'Drivers & vehicles' },
    { to: '/compliance', icon: ShieldCheck, label: 'Compliance' },
    { to: '/finance', icon: IndianRupee, label: 'Financials' },
    { to: '/utilisation', icon: Gauge, label: 'Vehicle utilisation' },
    { to: '/routes', icon: RouteIcon, label: 'Anchor routes' },
    { to: '/safety', icon: Siren, label: 'Safety desk', badge: openAlerts ? String(openAlerts) : undefined },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];
  const metroNav: NavItem[] = [
    { to: '', icon: LayoutDashboard, label: 'Network overview', end: true },
    { to: '/stations', icon: TrainFront, label: 'Station analytics' },
    { to: '/hotspots', icon: Brain, label: 'Hotspot demand' },
    { to: '/fleet', icon: Map, label: 'Feeder fleet map' },
    { to: '/utilisation', icon: Gauge, label: 'Vehicle utilisation' },
    { to: '/compliance', icon: ShieldCheck, label: 'Compliance posture' },
  ];
  const items = mode === 'admin' ? adminNav : metroNav;
  const Sidebar = (
    <aside className="flex h-full w-64 flex-col bg-navy text-white">
      <div className="flex items-center justify-between px-5 py-5"><Logo light size={30} /><button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="px-5 pb-3"><Badge tone="cyan" className="bg-cyan/15 text-cyan">{mode === 'admin' ? 'Operations control' : 'Metro authority view'}</Badge></div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map(({ to, icon: I, label, end, badge }) => (
          <NavLink key={to} to={`${base}${to}`} end={end} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
            <I size={17} /><span className="flex-1">{label}</span>{badge && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge === 'LIVE' ? 'bg-coral text-white animate-pulse' : 'bg-coral text-white'}`}>{badge}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <Link to="/demo" className="btn btn-sm w-full bg-cyan text-navy font-bold mb-3"><Presentation size={14} /> GoMaxi Live Demo</Link>
        <div className="flex items-center gap-2"><Avatar name={user.name} color={user.avatarColor} size={34} /><div className="flex-1 min-w-0 text-xs"><div className="truncate font-semibold">{user.name}</div><div className="truncate text-white/50">{user.email}</div></div><button onClick={() => { logout(); nav('/'); }} className="text-white/60 hover:text-white" aria-label="Sign out"><LogOut size={16} /></button></div>
      </div>
    </aside>
  );
  return (
    <div className="flex min-h-screen bg-mist">
      <div className="hidden lg:block sticky top-0 h-screen">{Sidebar}</div>
      {open && <div className="fixed inset-0 z-40 flex lg:hidden"><div className="h-full">{Sidebar}</div><div className="flex-1 bg-navy/50" onClick={() => setOpen(false)} /></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-mist-200 glass px-4 py-2.5 lg:px-6">
          <div className="flex items-center gap-2"><button className="rounded-lg p-1.5 hover:bg-mist-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu"><Menu size={18} /></button><span className="text-xs text-slate-500 hidden sm:block">Bengaluru pilot · Purple Line feeder network · <span className="font-semibold text-amber-700">prototype data</span></span></div>
          <ClockWidget />
        </header>
        <main className="flex-1 p-4 lg:p-6">
          <Routes>
            <Route index element={<OverviewPage mode={mode} />} />
            <Route path="fleet" element={<FleetPage mode={mode} />} />
            <Route path="hotspots" element={<HotspotsPage mode={mode} />} />
            <Route path="stations" element={<StationsPage />} />
            <Route path="utilisation" element={<UtilisationPage />} />
            <Route path="compliance" element={<CompliancePage mode={mode} />} />
            {mode === 'admin' && <>
              <Route path="simulation" element={<SimulationPage />} />
              <Route path="dispatch" element={<DispatchPage />} />
              <Route path="people" element={<PeoplePage />} />
              <Route path="finance" element={<FinancePage />} />
              <Route path="routes" element={<RoutesPage />} />
              <Route path="safety" element={<SafetyPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </>}
            <Route path="*" element={<Navigate to={base} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
