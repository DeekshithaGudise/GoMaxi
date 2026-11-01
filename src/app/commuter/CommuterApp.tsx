import { Routes, Route, NavLink, Link, useNavigate } from 'react-router-dom';
import { Home, Ticket, History, ShieldCheck, LogOut, MapPin, ArrowRight, Sparkles, Leaf, Clock3, Users } from 'lucide-react';
import { useState } from 'react';
import { useAppState, useNow } from '@/domain/store/hooks';
import { useSession } from '@/app/session';
import { useCommuter } from './useCommuter';
import { Logo, Avatar, Card, Badge, Button, StatusBadge, Progress, SimTag } from '@/app/shared/ui';
import { ClockWidget } from '@/app/shared/ClockWidget';
import { BookFlow } from './BookFlow';
import { BookingDetail } from './BookingDetail';
import { TripsPage } from './TripsPage';
import { SafetyPage } from './SafetyPage';
import { fareRule } from '@/domain/seed/geo';
import { fmtCountdown, fmtTime, inr, MIN } from '@/domain/util';
import { activeBookingsOf } from '@/domain/engine/pooling';

export default function CommuterApp() {
  const { logout } = useSession();
  const nav = useNavigate();
  const { user } = useCommuter();
  const tabs = [{ to: '/commuter', icon: Home, label: 'Home', end: true }, { to: '/commuter/book', icon: Ticket, label: 'Book' }, { to: '/commuter/trips', icon: History, label: 'Trips' }, { to: '/commuter/safety', icon: ShieldCheck, label: 'Safety' }];
  return (
    <div className="mobile-shell flex flex-col pb-20 shadow-2xl ring-1 ring-mist-200">
      <header className="sticky top-0 z-30 glass border-b border-mist-200">
        <div className="flex items-center justify-between px-4 py-2.5">
          <Link to="/commuter"><Logo size={28} /></Link>
          <div className="flex items-center gap-2">
            <ClockWidget compact />
            <button onClick={() => nav('/commuter/safety')} aria-label="Profile"><Avatar name={user.name} color={user.avatarColor} size={30} /></button>
            <button onClick={() => { logout(); nav('/'); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-mist-100" aria-label="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 py-4">
        <Routes>
          <Route index element={<HomeScreen />} />
          <Route path="book" element={<BookFlow />} />
          <Route path="booking/:id" element={<BookingDetail />} />
          <Route path="trips" element={<TripsPage />} />
          <Route path="safety" element={<SafetyPage />} />
        </Routes>
      </main>
      <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 glass border-t border-mist-200">
        <div className="grid grid-cols-4">
          {tabs.map(({ to, icon: I, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isActive ? 'text-electric' : 'text-slate-500'}`}>{({ isActive }) => <><span className={`rounded-xl px-3 py-1 ${isActive ? 'bg-electric-50' : ''}`}><I size={18} /></span>{label}</>}</NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function HomeScreen() {
  const { user, commuter, active, mine } = useCommuter();
  const stations = useAppState((s) => s.stations);
  const hotspots = useAppState((s) => s.hotspots);
  const groups = useAppState((s) => s.groups);
  const trips = useAppState((s) => s.trips);
  const state = useAppState((s) => s);
  const now = useNow();
  const nav = useNavigate();
  const [stationId, setStationId] = useState(commuter.homeStationId);
  const station = stations[stationId];
  const forming = Object.values(groups).filter((g) => g.stationId === stationId && g.status === 'forming').map((g) => ({ g, n: activeBookingsOf(state, g).length, trip: g.tripId ? trips[g.tripId] : undefined }));
  const scheduled = Object.values(trips).filter((t) => t.kind === 'anchor' && t.stationId === stationId && ['assigned', 'boarding'].includes(t.status) && (t.scheduledDepartureAt ?? 0) > now - 2 * MIN).sort((a, b) => (a.scheduledDepartureAt ?? 0) - (b.scheduledDepartureAt ?? 0));
  const quick = Object.values(hotspots).map((h) => ({ h, rule: fareRule(stationId, h.id) })).sort((a, b) => a.rule.distanceKm - b.rule.distanceKm).slice(0, 6);
  const completed = mine.filter((b) => b.status === 'completed');
  const hour = new Date(now + 19800000).getUTCHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-4 animate-fade-up">
      <section className="rounded-3xl bg-navy p-5 text-white hero-gradient">
        <div className="text-xs font-semibold uppercase tracking-wide text-cyan">{greet}</div>
        <h1 className="mt-1 font-display text-2xl font-extrabold">{user.name.split(' ')[0]}, where to today?</h1>
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/10 p-2 pl-3">
          <MapPin size={16} className="text-cyan" />
          <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="flex-1 bg-transparent text-sm font-semibold text-white focus:outline-none [&>option]:text-navy" aria-label="Metro station">{Object.values(stations).map((s) => <option key={s.id} value={s.id}>{s.name} Metro</option>)}</select>
          <Button size="sm" className="!bg-cyan !text-navy" onClick={() => nav(`/commuter/book?station=${stationId}`)}>Book <ArrowRight size={14} /></Button>
        </div>
        <div className="mt-3 text-[11px] text-white/60">Pickup: {station.pickupBay}</div>
      </section>

      {active ? (
        <Card className="border-electric/30 ring-2 ring-electric/15" title="Your upcoming ride" action={<StatusBadge status={active.status} />}>
          <ActiveSummary bookingId={active.id} />
        </Card>
      ) : (
        <Card title="Available shared rides" subtitle={`From ${station.name} · live pooling`} action={<SimTag>Live</SimTag>}>
          {forming.length === 0 && scheduled.length === 0 && <p className="text-sm text-slate-500">No group is forming right now. Book a seat and GoMaxi opens a new pool — departs within {state.settings.dispatch.maxWaitMin} min or as soon as {Math.ceil(state.settings.dispatch.defaultCapacity * state.settings.dispatch.targetOccupancyPct / 100)} seats fill.</p>}
          <div className="space-y-2">
            {forming.map(({ g, n, trip }) => (
              <button key={g.id} onClick={() => nav(`/commuter/book?station=${stationId}&hotspot=${g.hotspotId}`)} className="flex w-full items-center gap-3 rounded-2xl border border-mist-200 p-3 text-left hover:border-electric">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric-50 text-electric"><Users size={18} /></div>
                <div className="flex-1 min-w-0"><div className="font-semibold">{hotspots[g.hotspotId].name}</div><div className="text-xs text-slate-500">{n}/{g.capacity} seats filled · {trip ? `${trip.vehicleId} at bay` : 'vehicle being assigned'} · departs in ≤ {fmtCountdown(g.deadline - now)}</div><Progress value={n} max={g.capacity} className="mt-1.5" tone={n >= g.threshold ? 'green' : 'blue'} /></div>
                <div className="text-right"><div className="font-display font-extrabold text-navy">{inr(fareRule(stationId, g.hotspotId).fare)}</div><div className="text-[10px] text-slate-500">per seat</div></div>
              </button>
            ))}
            {scheduled.map((t) => (
              <button key={t.id} onClick={() => nav(`/commuter/book?station=${stationId}&hotspot=${t.hotspotId}&anchor=${t.id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-mist-200 p-3 text-left hover:border-electric">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600"><Clock3 size={18} /></div>
                <div className="flex-1 min-w-0"><div className="font-semibold">{state.anchorRoutes[t.routeId!]?.name} <Badge tone="cyan" className="ml-1">Scheduled</Badge></div><div className="text-xs text-slate-500">{t.routeStops?.map((h) => hotspots[h].name).join(' → ')} · departs {fmtTime(t.scheduledDepartureAt!)} · {t.bookingIds.length}/{t.capacity} booked</div></div>
                <div className="font-display font-extrabold">{inr(state.anchorRoutes[t.routeId!]?.fare ?? 0)}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card title="Nearby destinations" subtitle="Fixed per-seat fares vs solo options">
        <div className="grid grid-cols-2 gap-2">
          {quick.map(({ h, rule }) => (
            <button key={h.id} onClick={() => nav(`/commuter/book?station=${stationId}&hotspot=${h.id}`)} className="rounded-2xl border border-mist-200 p-3 text-left hover:border-electric">
              <div className="truncate text-sm font-semibold">{h.name}</div>
              <div className="text-[11px] text-slate-500">{rule.distanceKm} km · ~{rule.durationMin} min</div>
              <div className="mt-1.5 flex items-baseline gap-1.5"><span className="font-display text-lg font-extrabold text-electric">{inr(rule.fare)}</span><span className="text-[10px] text-slate-400 line-through">{inr(Math.round(60 + rule.distanceKm * 10))} auto</span></div>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-go-50 border-go-100"><Leaf className="text-go" size={18} /><div className="mt-2 font-display text-xl font-extrabold text-go">{inr(commuter.totalSavings)}</div><div className="text-xs text-slate-600">saved vs solo autos across {completed.length} shared rides</div></Card>
        <Card className="bg-electric-50 border-electric-100"><Sparkles className="text-electric" size={18} /><div className="mt-2 font-display text-xl font-extrabold text-electric">{inr(commuter.walletBalance)}</div><div className="text-xs text-slate-600">GoMaxi wallet (simulated)</div></Card>
      </div>

      <Card title="Ride safely" subtitle="Built into every trip">
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>• Verified drivers with PSV badge, photo ID and vehicle registration shown before boarding.</li>
          <li>• Share your live trip link with trusted contacts; SOS reaches the GoMaxi safety desk instantly.</li>
          <li>• After {state.settings.dispatch.nightSafeDropFrom} nobody is dropped at an isolated point — our safe-drop protocol applies.</li>
          <li>• Women-priority seating can be set per booking or by default in your profile.</li>
        </ul>
      </Card>
    </div>
  );
}

export function ActiveSummary({ bookingId }: { bookingId: string }) {
  const b = useAppState((s) => s.bookings[bookingId]);
  const trip = useAppState((s) => (b?.tripId ? s.trips[b.tripId] : undefined));
  const group = useAppState((s) => (b?.groupId ? s.groups[b.groupId] : undefined));
  const hotspots = useAppState((s) => s.hotspots);
  const stations = useAppState((s) => s.stations);
  const users = useAppState((s) => s.users);
  const now = useNow();
  const nav = useNavigate();
  if (!b) return null;
  const line = trip?.status === 'en_route' ? `En route · ETA ${trip.etaAt ? fmtTime(trip.etaAt) : '—'}` : trip?.status === 'boarding' ? `${trip.vehicleId} at ${stations[b.stationId].pickupBay}` : trip ? `Driver ${users[trip.driverId]?.name} notified` : group ? `Pooling · ${group.bookingIds.length}/${group.capacity} seats` : 'Finding a vehicle';
  return (
    <button onClick={() => nav(`/commuter/booking/${b.id}`)} className="w-full text-left">
      <div className="flex items-center justify-between"><div className="font-semibold">{stations[b.stationId].name} → {hotspots[b.hotspotId].name}</div><div className="font-display font-extrabold">{inr(b.fare)}</div></div>
      <div className="mt-0.5 text-xs text-slate-500">{line}</div>
      {group && group.status === 'forming' && !group.initiatedAt && <div className="mt-2 flex items-center gap-2 text-xs"><Clock3 size={14} className="text-electric" /> Departs in ≤ <span className="font-mono font-bold text-electric">{fmtCountdown(group.deadline - now)}</span> or when {group.threshold} seats fill</div>}
      {trip && trip.status === 'en_route' && <Progress value={trip.progress * 100} className="mt-2" tone="green" />}
      <div className="mt-2 text-xs font-semibold text-electric">Open boarding pass →</div>
    </button>
  );
}
