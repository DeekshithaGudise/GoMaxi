import { Routes, Route, NavLink, Link, useNavigate } from 'react-router-dom';
import { LayoutGrid, Navigation, ScanLine, Wallet, LogOut, Star, Clock, Users, Car, Siren, ShieldCheck, Power } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/app/session';
import { useAppState, useDispatch } from '@/domain/store/hooks';
import { useDriver } from './useDriver';
import { Logo, Avatar, Card, Badge, Button, StatusBadge, Stat, Modal, Callout, useToast, Toggle, SimTag } from '@/app/shared/ui';
import { ClockWidget } from '@/app/shared/ClockWidget';
import { TripPage } from './TripPage';
import { ScanPage } from './ScanPage';
import { EarningsPage } from './EarningsPage';
import { inr, fmtTime } from '@/domain/util';
import { vehicleEligibility, driverEligibility, isoDate } from '@/domain/engine/compliance';

export default function DriverApp() {
  const { logout } = useSession();
  const nav = useNavigate();
  const { user, current } = useDriver();
  const tabs = [{ to: '/driver', icon: LayoutGrid, label: 'Dashboard', end: true }, { to: '/driver/trip', icon: Navigation, label: 'Trip', badge: !!current }, { to: '/driver/scan', icon: ScanLine, label: 'Scan' }, { to: '/driver/earnings', icon: Wallet, label: 'Earnings' }];
  return (
    <div className="mobile-shell flex flex-col pb-20 shadow-2xl ring-1 ring-mist-200">
      <header className="sticky top-0 z-30 border-b border-navy-700 bg-navy text-white">
        <div className="flex items-center justify-between px-4 py-2.5">
          <Link to="/driver" className="flex items-center gap-2"><Logo size={28} light /><Badge tone="cyan" className="bg-cyan/20 text-cyan">Driver</Badge></Link>
          <div className="flex items-center gap-2"><ClockWidget compact light /><Avatar name={user.name} color={user.avatarColor} size={30} /><button onClick={() => { logout(); nav('/'); }} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10" aria-label="Sign out"><LogOut size={16} /></button></div>
        </div>
      </header>
      <main className="flex-1 px-4 py-4">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="trip" element={<TripPage />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="earnings" element={<EarningsPage />} />
        </Routes>
      </main>
      <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 glass border-t border-mist-200">
        <div className="grid grid-cols-4">{tabs.map(({ to, icon: I, label, end, badge }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isActive ? 'text-electric' : 'text-slate-500'}`}>{({ isActive }) => <><span className={`rounded-xl px-3 py-1 ${isActive ? 'bg-electric-50' : ''}`}><I size={18} /></span>{label}{badge && <span className="absolute right-5 top-2 h-2 w-2 rounded-full bg-coral animate-pulse" />}</>}</NavLink>)}</div>
      </nav>
    </div>
  );
}

function Dashboard() {
  const d = useDriver();
  const dispatch = useDispatch();
  const toast = useToast();
  const nav = useNavigate();
  const state = useAppState((s) => s);
  const [sos, setSos] = useState(false);
  const v = d.vehicle;
  const ve = v ? vehicleEligibility(v) : { eligible: false, reasons: ['No vehicle assigned'] };
  const de = driverEligibility(d.driver, isoDate(state.clock.simTime));
  const online = d.driver.availability !== 'offline';
  const setOnline = async (on: boolean) => { const r = await dispatch({ type: 'driver.setAvailability', driverId: d.driverId, availability: on ? 'available' : 'offline' }); if (!r.ok) toast({ tone: 'danger', title: r.error }); else toast({ tone: on ? 'success' : 'info', title: on ? 'You are online — ready for assignments' : 'You are offline' }); };
  const sched = v ? state.schedules[v.id] : undefined;
  return (
    <div className="animate-fade-up space-y-4">
      <Card className={online ? 'border-go-100 bg-go-50' : ''}>
        <Toggle checked={online} onChange={setOnline} label={<span className="flex items-center gap-2"><Power size={16} className={online ? 'text-go' : 'text-slate-400'} /> {online ? `Online · ${d.driver.availability}` : 'Offline'}</span>} description={online ? `On shift since ${d.driver.shiftStart ? fmtTime(d.driver.shiftStart) : '—'} · ${d.hoursToday} h` : 'Go online to receive trip assignments'} />
      </Card>
      {current(d) && (
        <Card className="border-electric/40 ring-2 ring-electric/15" title={d.current!.status === 'assigned' ? 'New assignment' : 'Current trip'} action={<StatusBadge status={d.current!.status} />}>
          <div className="font-semibold">{state.stations[d.current!.stationId].name} → {state.hotspots[d.current!.hotspotId].name}</div>
          <div className="text-xs text-slate-500">{d.current!.bookingIds.length} booked · {d.current!.boardedBookingIds.length}/{d.current!.capacity} boarded</div>
          <Button className="mt-3 w-full" onClick={() => nav('/driver/trip')}>{d.current!.status === 'assigned' ? 'Review & accept' : 'Open trip'}</Button>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Today's earnings" value={inr(d.todayEarnings)} sub={`${inr(d.todayIncentives)} incentives`} tone="green" icon={<Wallet size={16} />} />
        <Stat label="Completed trips" value={d.completedToday} sub={`${d.completedTotal} lifetime`} tone="blue" icon={<Car size={16} />} />
        <Stat label="Occupancy today" value={`${d.occupancyToday}%`} sub="avg across trips" tone="cyan" icon={<Users size={16} />} />
        <Stat label="Rating" value={d.rating.toFixed(2)} sub={`${d.driver.ratingCount} ratings · ${d.driver.incentiveTier} tier`} tone="amber" icon={<Star size={16} />} />
      </div>
      {v && (
        <Card title={`${v.id} · ${v.registration}`} subtitle={`${v.model} · ${v.capacity} seats · ${state.operators[v.operatorId].name}`} action={<StatusBadge status={v.status} />}>
          <div className={`rounded-xl px-3 py-2 text-sm ${ve.eligible && de.eligible ? 'bg-go-50 text-go-600' : 'bg-coral-50 text-coral'}`}><ShieldCheck size={14} className="inline mr-1" />{ve.eligible && de.eligible ? 'Vehicle & driver compliance verified — eligible for dispatch' : `Not dispatchable: ${[...ve.reasons, ...de.reasons].join('; ')}`}</div>
          {sched && <div className="mt-3"><div className="label mb-1">Today's schedule</div><div className="space-y-1">{sched.blocks.map((b, i) => <div key={i} className="flex items-center gap-2 text-xs"><span className="w-24 font-mono text-slate-500">{b.start}–{b.end}</span><span className={`h-2 w-2 rounded-full ${{ school_commitment: 'bg-slate-400', gomaxi_feeder: 'bg-electric', anchor_route: 'bg-cyan', idle: 'bg-mist-300', maintenance: 'bg-amber' }[b.kind]}`} /><span>{b.label}</span></div>)}</div></div>}
        </Card>
      )}
      <Card title="Commission & incentives" subtitle="Transparent split on every trip" action={<SimTag>Policy</SimTag>}>
        <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-mist-100 p-2"><div className="font-display text-lg font-extrabold">{100 - state.settings.finance.commissionPct}%</div><div className="text-slate-500">to driver</div></div><div className="rounded-xl bg-mist-100 p-2"><div className="font-display text-lg font-extrabold">{state.settings.finance.commissionPct}%</div><div className="text-slate-500">GoMaxi</div></div><div className="rounded-xl bg-go-50 p-2"><div className="font-display text-lg font-extrabold text-go">+{state.settings.finance.driverIncentivePct}%</div><div className="text-slate-500">bonus at ≥{state.settings.dispatch.targetOccupancyPct}% full</div></div></div>
      </Card>
      {d.upcoming.length > 0 && <Card title="Upcoming scheduled departures">{d.upcoming.map((t) => <div key={t.id} className="flex items-center justify-between py-1.5 text-sm"><span>{state.anchorRoutes[t.routeId!]?.name} → {state.hotspots[t.hotspotId].name}</span><span className="font-mono text-xs"><Clock size={12} className="inline" /> {fmtTime(t.scheduledDepartureAt!)}</span></div>)}</Card>}
      <Button variant="danger" className="w-full" onClick={() => setSos(true)}><Siren size={16} /> Driver emergency</Button>
      <Modal open={sos} onClose={() => setSos(false)} title="Driver emergency" footer={<><Button variant="secondary" onClick={() => setSos(false)}>Cancel</Button><Button variant="danger" onClick={async () => { await dispatch({ type: 'safety.sos', userId: d.driverId, tripId: d.current?.id, message: `Driver ${d.user.name} raised an emergency` }); setSos(false); toast({ tone: 'danger', title: 'Emergency sent to ops (simulated)' }); }}>Send</Button></>}><Callout tone="warn">Simulated escalation to the GoMaxi operations desk. No real emergency service is contacted.</Callout></Modal>
    </div>
  );
}
const current = (d: ReturnType<typeof useDriver>) => !!d.current;
