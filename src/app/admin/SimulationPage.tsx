import { useState } from 'react';
import { Play, Pause, RotateCcw, Zap } from 'lucide-react';
import { useAppState, useDispatch } from '@/domain/store/hooks';
import { Card, PageTitle, Stat, Slider, Select, Button, Badge, Progress, Callout, SimTag, StatusBadge } from '@/app/shared/ui';
import { FleetMap } from '@/app/shared/map/FleetMap';
import { ActivityFeed } from './ActivityFeed';
import { activeBookingsOf } from '@/domain/engine/pooling';
import { fmtCountdown, fmtTime, inr } from '@/domain/util';
import type { SimulationParams } from '@/domain/types';

export function SimulationPage({ embedded = false }: { embedded?: boolean }) {
  const state = useAppState((s) => s);
  const dispatch = useDispatch();
  const sim = state.simulation;
  const [p, setP] = useState<SimulationParams>(sim.params);
  const running = sim.status === 'running', paused = sim.status === 'paused', idle = sim.status === 'idle' || sim.status === 'finished';
  const since = sim.startedAt ?? 0;
  const simTrips = Object.values(state.trips).filter((t) => t.createdAt >= since && sim.status !== 'idle');
  const activeTrips = simTrips.filter((t) => ['assigned', 'boarding', 'en_route'].includes(t.status));
  const groups = Object.values(state.groups).filter((g) => g.status === 'forming' && g.stationId === sim.params.stationId);
  const spawned = sim.spawnedBookingIds.map((id) => state.bookings[id]).filter(Boolean);
  const gbv = simTrips.filter((t) => t.status === 'completed').reduce((a, t) => a + t.grossFare, 0);
  const commission = simTrips.filter((t) => t.status === 'completed').reduce((a, t) => a + t.platformCommission, 0);
  const payout = simTrips.filter((t) => t.status === 'completed').reduce((a, t) => a + t.driverPayout, 0);
  const vehiclesHere = Object.values(state.vehicles).filter((v) => v.homeStationId === sim.params.stationId || v.currentStationId === sim.params.stationId || simTrips.some((t) => t.vehicleId === v.id));
  const station = state.stations[sim.params.stationId];
  const occ = simTrips.filter((t) => t.departedAt).map((t) => t.boardedBookingIds.length / t.capacity);
  const avgOcc = occ.length ? Math.round((occ.reduce((a, b) => a + b, 0) / occ.length) * 100) : 0;
  const progress = sim.scheduledArrivals.length ? (sim.nextArrivalIdx / sim.scheduledArrivals.length) * 100 : 0;

  return (
    <div className="space-y-4 animate-fade-up">
      {!embedded && <PageTitle title="Live simulation" subtitle="A deterministic peak-hour scenario that drives the real engine: every booking, group, dispatch, scan and trip below is a real record visible in the commuter, driver and admin apps." action={<SimTag>Deterministic · seed {sim.params.seed}</SimTag>} />}
      <Card className="hero-gradient text-white border-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-cyan">{sim.status === 'finished' ? 'Scenario complete' : running ? 'Running' : paused ? 'Paused' : 'Ready'}</div><div className="font-display text-2xl font-extrabold">{station.name} · {sim.params.startTime} · {sim.params.demand} commuters · {sim.params.vehicles} vehicles</div><div className="text-sm text-white/70">{Math.round(sim.params.hotspotMix * 100)}% heading to {state.hotspots[sim.params.primaryHotspotId].name}, rest to nearby hotspots · clock {state.clock.speed}×</div></div>
          <div className="flex flex-wrap gap-2">
            {idle && <Button size="lg" className="!bg-cyan !text-navy font-extrabold" onClick={() => dispatch({ type: 'sim.start', params: p })}><Play size={18} /> START LIVE SIMULATION</Button>}
            {running && <Button size="lg" variant="secondary" onClick={() => dispatch({ type: 'sim.pause' })}><Pause size={18} /> Pause</Button>}
            {paused && <Button size="lg" className="!bg-cyan !text-navy font-extrabold" onClick={() => dispatch({ type: 'sim.resume' })}><Play size={18} /> Resume</Button>}
            {!idle || sim.status === 'finished' ? <Button size="lg" variant="ghost" className="text-white hover:bg-white/10" onClick={() => dispatch({ type: 'sim.reset' })}><RotateCcw size={18} /> Reset</Button> : null}
            <div className="flex items-center gap-1 rounded-xl bg-white/10 px-2"><Zap size={14} className="text-cyan" />{[1, 4, 8, 20, 60].map((s) => <button key={s} onClick={() => dispatch({ type: 'clock.setSpeed', speed: s })} className={`rounded-lg px-2 py-1 font-mono text-xs font-bold ${state.clock.speed === s ? 'bg-white text-navy' : 'text-white/80 hover:bg-white/10'}`}>{s}×</button>)}</div>
          </div>
        </div>
        {sim.status !== 'idle' && <div className="mt-4"><div className="flex justify-between text-xs text-white/70"><span>Commuter arrivals {sim.nextArrivalIdx}/{sim.scheduledArrivals.length}</span><span>Sim time {fmtTime(state.clock.simTime, true)}</span></div><Progress value={progress} className="mt-1 bg-white/20" tone="cyan" /></div>}
      </Card>

      {idle && sim.status === 'idle' && (
        <Card title="Scenario parameters" subtitle="Adjust before starting. The same seed always produces the same run.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Select label="Station" value={p.stationId} onChange={(e) => setP({ ...p, stationId: e.target.value })}>{Object.values(state.stations).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Select label="Primary destination" value={p.primaryHotspotId} onChange={(e) => setP({ ...p, primaryHotspotId: e.target.value })}>{Object.values(state.hotspots).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
            <Select label="Start time" value={p.startTime} onChange={(e) => setP({ ...p, startTime: e.target.value })}>{['08:30', '09:00', '09:30', '10:00', '17:30', '18:00', '20:15'].map((t) => <option key={t}>{t}</option>)}</Select>
            <Slider label="Commuter demand" value={p.demand} min={5} max={120} onChange={(v) => setP({ ...p, demand: v })} format={(v) => `${v} pax`} />
            <Slider label="Vehicles available" value={p.vehicles} min={1} max={8} onChange={(v) => setP({ ...p, vehicles: v })} />
            <Slider label="Arrival window" value={p.arrivalWindowMin} min={3} max={40} onChange={(v) => setP({ ...p, arrivalWindowMin: v })} format={(v) => `${v} min`} />
            <Slider label="Share to primary destination" value={p.hotspotMix} min={0.2} max={1} step={0.05} onChange={(v) => setP({ ...p, hotspotMix: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Random seed" value={p.seed} min={1} max={99} onChange={(v) => setP({ ...p, seed: v })} />
          </div>
          <div className="mt-3 text-xs text-slate-500">Vehicle capacity {state.settings.dispatch.defaultCapacity} · threshold {Math.ceil(state.settings.dispatch.defaultCapacity * state.settings.dispatch.targetOccupancyPct / 100)} · max wait {state.settings.dispatch.maxWaitMin} min — change in Settings.</div>
        </Card>
      )}

      {sim.status !== 'idle' && (<>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Stat label="Arrived" value={sim.stats.arrivals} sub={`of ${sim.params.demand}`} />
          <Stat label="Bookings" value={sim.stats.bookings} tone="blue" sub={`${spawned.filter((b) => ['confirmed', 'assigned'].includes(b.status)).length} waiting`} />
          <Stat label="Boarded" value={sim.stats.boarded} tone="cyan" />
          <Stat label="Dispatches" value={sim.stats.dispatches} tone="amber" sub={`${activeTrips.length} active`} />
          <Stat label="Completed pax" value={sim.stats.completed} tone="green" />
          <Stat label="Avg occupancy" value={`${avgOcc}%`} tone={avgOcc >= 75 ? 'green' : 'amber'} sub="departed trips" />
          <Stat label="GBV · commission" value={inr(gbv)} sub={`${inr(commission)} GoMaxi`} />
          <Stat label="Driver payouts" value={inr(payout)} tone="green" />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2" title="Pooling & dispatch board" subtitle={`${station.name} · ${station.pickupBay}`}>
            {groups.length === 0 && activeTrips.length === 0 && <div className="text-sm text-slate-500">{sim.status === 'finished' ? 'All passengers delivered.' : 'Waiting for the first commuters…'}</div>}
            <div className="grid gap-2 md:grid-cols-2">
              {groups.map((g) => { const n = activeBookingsOf(state, g).length; const boarded = activeBookingsOf(state, g).filter((b) => b.status === 'boarded').length; const t = g.tripId ? state.trips[g.tripId] : undefined; return (
                <div key={g.id} className="rounded-2xl border border-mist-200 p-3"><div className="flex justify-between text-sm"><b>→ {state.hotspots[g.hotspotId].name}</b><Badge tone={g.initiatedAt ? 'green' : 'blue'} dot>{g.initiatedAt ? 'dispatching' : 'pooling'}</Badge></div><div className="text-xs text-slate-500">{g.vehicleId ? `${g.vehicleId} · ${state.users[t!.driverId].name}` : 'awaiting vehicle'} · {boarded} boarded</div><div className="mt-1 flex items-end justify-between"><span className="font-display text-xl font-extrabold">{n}/{g.capacity}</span><span className="font-mono text-xs text-electric">{g.initiatedAt ? `leaves ≤ ${fmtCountdown(g.initiatedAt + state.settings.dispatch.boardingGraceMin * 60000 - state.clock.simTime)}` : fmtCountdown(g.deadline - state.clock.simTime)}</span></div><Progress value={n} max={g.capacity} className="mt-1" tone={n >= g.threshold ? 'green' : 'blue'} /></div>); })}
              {activeTrips.filter((t) => t.status === 'en_route').map((t) => <div key={t.id} className="rounded-2xl border border-go-100 bg-go-50 p-3"><div className="flex justify-between text-sm"><b>{t.vehicleId} → {state.hotspots[t.hotspotId].name}</b><StatusBadge status={t.status} /></div><div className="text-xs text-slate-500">{t.boardedBookingIds.length}/{t.capacity} on board · ETA {fmtTime(t.etaAt!)} · {inr(t.grossFare)} GBV</div><Progress value={t.progress * 100} className="mt-2" tone="green" /></div>)}
            </div>
            <div className="mt-4"><FleetMap height={300} vehicles={vehiclesHere} trips={activeTrips} stations={[station]} hotspots={Object.values(state.hotspots).filter((h) => simTrips.some((t) => t.hotspotId === h.id) || h.id === sim.params.primaryHotspotId)} /></div>
          </Card>
          <Card title="Live activity feed" subtitle="Same events the ops overview sees"><ActivityFeed height={560} sinceAt={since} /></Card>
        </div>
        {sim.status === 'finished' && <Callout tone="success" title="Scenario finished">{sim.stats.bookings} bookings → {sim.stats.dispatches} dispatches → {sim.stats.completed} passengers delivered at {avgOcc}% average occupancy. GBV {inr(gbv)}, GoMaxi commission {inr(commission)}, driver payouts {inr(payout)}. Reset to run again or change parameters.</Callout>}
      </>)}
    </div>
  );
}
