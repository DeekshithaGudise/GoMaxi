import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bike, CarTaxiFront, Users, Clock3, ShieldCheck, Leaf, IndianRupee, TrainFront, X } from 'lucide-react';
import { useAppState, useDerived, useDispatch } from '@/domain/store/hooks';
import { overviewMetrics, fleetUtilisation } from '@/domain/engine/analytics';
import { computeUnitEconomics } from '@/domain/engine/finance';
import { Logo, Card, Button, Badge, Stat, Progress, Slider, SimTag, Callout } from '@/app/shared/ui';
import { ClockWidget } from '@/app/shared/ClockWidget';
import { SimulationPage } from '@/app/admin/SimulationPage';
import { Bars, Donut } from '@/app/shared/charts';
import { fareRule, soloAutoFare, bikeTaxiFare } from '@/domain/seed/geo';
import { inr, inrCompact } from '@/domain/util';
import { activeBookingsOf } from '@/domain/engine/pooling';

const STEPS = ['The problem', 'The solution', 'The supply model', 'Live operations', 'The economics', 'The impact'];

export default function DemoApp() {
  const [i, setI] = useState(0);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') setI((x) => Math.min(STEPS.length - 1, x + 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  return (
    <div className="min-h-screen bg-mist">
      <header className="sticky top-0 z-30 bg-navy text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3"><Logo light size={30} /><Badge tone="cyan" className="bg-cyan/20 text-cyan hidden sm:inline-flex">GoMaxi Live Demo</Badge></div>
          <ol className="hidden items-center gap-1 md:flex">{STEPS.map((s, k) => <li key={s}><button onClick={() => setI(k)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${k === i ? 'bg-cyan text-navy' : k < i ? 'text-white/80 hover:bg-white/10' : 'text-white/50 hover:bg-white/10'}`}>{k + 1}. {s}</button></li>)}</ol>
          <div className="flex items-center gap-2"><ClockWidget light compact /><Link to="/" className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Exit demo"><X size={18} /></Link></div>
        </div>
        <Progress value={i + 1} max={STEPS.length} height="h-1" tone="cyan" className="rounded-none bg-white/10" />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="mb-4 flex items-center justify-between"><div><div className="label">Step {i + 1} of {STEPS.length}</div><h1 className="font-display text-3xl font-extrabold tracking-tight text-navy">{STEPS[i]}</h1></div><div className="flex gap-2"><Button variant="secondary" disabled={i === 0} onClick={() => setI(i - 1)}><ArrowLeft size={16} /> Back</Button><Button disabled={i === STEPS.length - 1} onClick={() => setI(i + 1)}>Next <ArrowRight size={16} /></Button></div></div>
        <div key={i} className="animate-fade-up">{[<Problem key="p" />, <Solution key="s" />, <Supply key="u" />, <SimulationPage key="l" embedded />, <Economics key="e" />, <Impact key="i" />][i]}</div>
        <div className="mt-8 flex justify-between border-t border-mist-200 pt-4 text-xs text-slate-500"><span>Use ← → keys to navigate · ~3–5 minutes end to end</span><span>All metrics are prototype/simulated and labelled as such.</span></div>
      </main>
    </div>
  );
}

function Problem() {
  const rule = fareRule('st-byp', 'hs-bag');
  const data = [{ name: 'Walking', fare: 0, time: 35 }, { name: 'Bike taxi', fare: bikeTaxiFare(rule.distanceKm), time: 12 }, { name: 'Solo auto', fare: soloAutoFare(rule.distanceKm), time: 14 }, { name: 'GoMaxi shared', fare: rule.fare, time: rule.durationMin }];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="hero-gradient text-white border-0 lg:row-span-2">
        <TrainFront className="text-cyan" size={28} />
        <h2 className="mt-3 font-display text-2xl font-extrabold leading-tight">The metro is fast. The last 2–3 km are not.</h2>
        <p className="mt-3 text-white/75">Bengaluru's Purple Line moves hundreds of thousands of commuters a day, but from the station to the office the choice is a long walk, a ₹60–100 solo auto, a bike taxi, or a private vehicle that adds to congestion. Feeder buses rarely match office timings.</p>
        <ul className="mt-5 space-y-2 text-sm">
          <li className="flex gap-2"><Clock3 className="mt-0.5 shrink-0 text-cyan" size={16} /> Demand is concentrated into two peaks: 8–11 AM and 5–8:30 PM. Owning a dedicated feeder fleet for ~6 operating hours means idle assets the rest of the day.</li>
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 shrink-0 text-cyan" size={16} /> Safety and predictability matter most for women commuters and late-evening trips.</li>
          <li className="flex gap-2"><Leaf className="mt-0.5 shrink-0 text-cyan" size={16} /> Every solo trip from a station is a vehicle on an already saturated corridor.</li>
        </ul>
      </Card>
      <Card title={`Fare comparison · ${rule.distanceKm} km, Baiyappanahalli → Bagmane Tech Park`} subtitle="Illustrative Bengaluru prices">
        <Bars data={data} x="name" series={[{ key: 'fare', name: 'Fare (₹)', color: '#2563EB' }]} height={220} format={(v) => inr(v)} />
      </Card>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Solo auto" value={inr(data[2].fare)} icon={<CarTaxiFront size={16} />} sub="~14 min, 1 passenger" />
        <Stat label="Bike taxi" value={inr(data[1].fare)} icon={<Bike size={16} />} sub="~12 min, 1 passenger" tone="amber" />
        <Stat label="GoMaxi shared" value={inr(rule.fare)} icon={<Users size={16} />} sub={`~${rule.durationMin} min, 12 seats`} tone="green" />
      </div>
    </div>
  );
}

function Solution() {
  const state = useAppState((s) => s);
  const dispatch = useDispatch();
  const [n, setN] = useState(0);
  useEffect(() => { const id = setInterval(() => setN((x) => (x >= 10 ? 0 : x + 1)), 700); return () => clearInterval(id); }, []);
  const forming = Object.values(state.groups).filter((g) => g.status === 'forming');
  const s = state.settings.dispatch;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Pooling in action" subtitle="Commuters selecting the same hotspot are grouped into one vehicle">
        <div className="relative mx-auto flex h-64 max-w-md items-center justify-between">
          <div className="grid grid-cols-2 gap-2">{Array.from({ length: 10 }).map((_, k) => <div key={k} className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${k < n ? 'translate-x-24 scale-50 bg-electric text-white opacity-0' : 'bg-mist-200 text-slate-600'}`}><Users size={14} /></div>)}</div>
          <svg viewBox="0 0 160 90" className="h-40 w-64">
            <rect x="10" y="25" width="130" height="45" rx="12" fill="#10243A" />
            <rect x="20" y="32" width="90" height="18" rx="4" fill="#20C4D8" opacity={0.9} />
            <circle cx="40" cy="74" r="9" fill="#2563EB" stroke="#fff" strokeWidth="3" /><circle cx="115" cy="74" r="9" fill="#2563EB" stroke="#fff" strokeWidth="3" />
            {Array.from({ length: Math.min(n, 12) }).map((_, k) => <circle key={k} cx={28 + (k % 6) * 14} cy={38 + Math.floor(k / 6) * 10} r="3.5" fill="#fff" />)}
            <text x="75" y="64" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="Inter">{n}/12 · {Math.round((n / 12) * 100)}%</text>
          </svg>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-mist-100 p-2"><div className="font-display text-lg font-extrabold">{s.targetOccupancyPct}%</div>target occupancy</div><div className="rounded-xl bg-mist-100 p-2"><div className="font-display text-lg font-extrabold">{Math.ceil(s.defaultCapacity * s.targetOccupancyPct / 100)}</div>dispatch threshold</div><div className="rounded-xl bg-mist-100 p-2"><div className="font-display text-lg font-extrabold">{s.maxWaitMin} min</div>max wait</div></div>
      </Card>
      <div className="space-y-4">
        <Card title="How a GoMaxi trip works">
          <ol className="space-y-2 text-sm">{['Commuter picks station + destination hotspot, pays a fixed per-seat fare (UPI/card/wallet — simulated).', 'The pooling engine groups compatible bookings; a compliant idle vehicle at the station is assigned and its driver notified.', 'Dispatch is initiated when occupancy hits the threshold or the 5-minute timer expires; under-filled groups follow a configurable policy.', 'Passengers board by QR; duplicates and wrong-vehicle scans are rejected; offline manual verification syncs later.', 'The trip is tracked (simulated GPS), completed, and the fare is split: 85% driver, 15% GoMaxi.'].map((t, k) => <li key={k} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-electric text-xs font-bold text-white">{k + 1}</span><span>{t}</span></li>)}</ol>
        </Card>
        <Card title="Groups forming right now" subtitle="Live from the engine" action={<SimTag>Live</SimTag>}>
          {forming.length === 0 ? <div className="text-sm text-slate-500">No group is forming. <button className="font-semibold text-electric" onClick={() => dispatch({ type: 'booking.create', input: { commuterId: 'usr-h01', stationId: 'st-byp', hotspotId: 'hs-whf', payment: { method: 'upi' }, simulated: true } })}>Create a demo booking →</button></div> : forming.map((g) => <div key={g.id} className="mb-2 flex items-center gap-3 text-sm"><span className="w-40 truncate">{state.stations[g.stationId].name} → {state.hotspots[g.hotspotId].name}</span><Progress value={activeBookingsOf(state, g).length} max={g.capacity} className="flex-1" /><span className="font-mono text-xs">{activeBookingsOf(state, g).length}/{g.capacity}</span></div>)}
        </Card>
      </div>
    </div>
  );
}

function Supply() {
  const u = useDerived(fleetUtilisation);
  const row = u.rows.find((r) => r.vehicle.id === 'GM-101')!;
  const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h + m / 60; };
  const COLORS: Record<string, string> = { school_commitment: '#64748B', gomaxi_feeder: '#2563EB', anchor_route: '#20C4D8', idle: '#D2DBE8', maintenance: '#F59E0B' };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2" title="One eligible vehicle, one day" subtitle={`${row.vehicle.id} · ${row.vehicle.registration} · operated by a school-transport partner (illustrative schedule)`}>
        <div className="flex h-14 overflow-hidden rounded-xl">{row.blocks.map((b, k) => <div key={k} style={{ width: `${((hm(b.end) - hm(b.start)) / 14) * 100}%`, background: COLORS[b.kind] }} className="flex flex-col items-center justify-center text-[10px] font-semibold text-white"><span>{b.start}–{b.end}</span><span className="opacity-90">{b.kind.replace('_', ' ')}</span></div>)}</div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>06:30</span><span>20:30</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Baseline utilisation" value={`${row.baselineUtilisationPct}%`} sub="existing commitments only" /><Stat label="With GoMaxi" value={`${row.utilisationPct}%`} tone="green" sub={`+${row.gomaxi} h revenue time`} /><Stat label="Fleet idle hours saved" value={`${u.totals.gomaxi}`} sub="per day across 10 vehicles" tone="blue" /><Stat label="New fleet purchased" value="0" sub="asset-light" tone="cyan" /></div>
        <Callout tone="warn" className="mt-4" title="Eligibility first">A school vehicle can only join GoMaxi if it holds a contract-carriage permit, insurance and fitness valid for fare-paying passengers. Vehicles without those are blocked by the engine — see Compliance in the admin dashboard.</Callout>
      </Card>
      <Card className="hero-gradient text-white border-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-cyan">The pitch</div>
        <p className="mt-2 font-display text-xl font-extrabold leading-snug">“Every eligible vehicle has hours when it isn't being used. GoMaxi transforms that available capacity into an affordable metro feeder network, without purchasing an entirely new fleet.”</p>
        <ul className="mt-5 space-y-2 text-sm text-white/80"><li>• School-transport & corporate-shuttle operators: idle mid-morning and midday</li><li>• Independent maxi-cab owner-drivers: looking for predictable work</li><li>• Tour operators: weekday mornings free</li></ul>
      </Card>
    </div>
  );
}

function Economics() {
  const a = useAppState((s) => s.settings.finance);
  const dispatch = useDispatch();
  const u = computeUnitEconomics(a);
  const full = computeUnitEconomics({ ...a, occupancyPct: 100 });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="One full trip" subtitle={`12 seats × ${inr(a.averageFare)} = ${inr(full.gbvPerTrip)}`}>
        <Donut data={[{ name: 'Driver', value: full.driverPayoutPerTrip, color: '#2563EB' }, { name: 'GoMaxi', value: full.commissionPerTrip, color: '#20C4D8' }]} height={200} format={(v) => inr(v)} center={<div className="font-display text-lg font-extrabold">{inr(full.gbvPerTrip)}</div>} />
        <div className="grid grid-cols-2 gap-2 text-center text-sm"><div className="rounded-xl bg-electric-50 p-2"><div className="font-display text-xl font-extrabold text-electric">{inr(full.driverPayoutPerTrip)}</div>driver ({100 - a.commissionPct}%)</div><div className="rounded-xl bg-cyan-50 p-2"><div className="font-display text-xl font-extrabold text-cyan-600">{inr(full.commissionPerTrip)}</div>GoMaxi ({a.commissionPct}%)</div></div>
        <div className="mt-3 text-xs text-slate-500">Two full trips an hour → {inr(full.gbvPerTrip * 2)} GBV, {inr(full.commissionPerTrip * 2)} platform revenue, {inr(full.driverPayoutPerTrip * 2)} to the driver.</div>
      </Card>
      <Card className="lg:col-span-2" title="Unit economics at plan assumptions" subtitle="Move a slider — everything recomputes (illustrative, not validated)">
        <div className="grid gap-4 md:grid-cols-2"><Slider label="Occupancy" value={a.occupancyPct} min={40} max={100} step={5} onChange={(v) => dispatch({ type: 'admin.updateFinance', changes: { occupancyPct: v } })} format={(v) => `${v}%`} /><Slider label="Commission" value={a.commissionPct} min={5} max={30} onChange={(v) => dispatch({ type: 'admin.updateFinance', changes: { commissionPct: v } })} format={(v) => `${v}%`} /><Slider label="Vehicles" value={a.vehicles} min={1} max={100} onChange={(v) => dispatch({ type: 'admin.updateFinance', changes: { vehicles: v } })} /><Slider label="Trips per hour" value={a.tripsPerHour} min={0.5} max={4} step={0.25} onChange={(v) => dispatch({ type: 'admin.updateFinance', changes: { tripsPerHour: v } })} /></div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="GBV / trip" value={inr(u.gbvPerTrip)} sub={`${u.seatsPerTrip.toFixed(1)} seats`} /><Stat label="Revenue / vehicle / day" value={inr(u.revenuePerVehiclePerDay)} tone="blue" sub={`${u.tripsPerVehiclePerDay.toFixed(1)} trips`} /><Stat label="Monthly GBV" value={inrCompact(u.gbvPerMonth)} sub={`${a.vehicles} vehicles`} /><Stat label="Contribution margin" value={inrCompact(u.contributionMarginPerMonth)} tone={u.contributionMarginPerMonth >= 0 ? 'green' : 'red'} sub={`${u.contributionMarginPct.toFixed(1)}% of GBV`} /><Stat label="Break-even occupancy" value={!isFinite(u.breakEvenOccupancyPct) ? '∞' : u.breakEvenOccupancyPct > 100 ? '>100%' : `${u.breakEvenOccupancyPct.toFixed(0)}%`} tone={u.breakEvenOccupancyPct <= a.occupancyPct ? 'green' : 'amber'} /><Stat label="Break-even trips / month" value={isFinite(u.breakEvenTripsPerMonth) ? Math.ceil(u.breakEvenTripsPerMonth).toLocaleString('en-IN') : '∞'} /><Stat label="Driver earnings / day" value={inr(u.driverEarningsPerVehiclePerDay)} tone="cyan" sub="per vehicle" /><Stat label="EBITDA (illustrative)" value={inrCompact(u.ebitdaPerMonth)} tone={u.ebitdaPerMonth >= 0 ? 'green' : 'red'} sub={`fixed ${inrCompact(a.fixedMonthlyCost)}/mo`} /></div>
        <div className="mt-3 text-xs text-slate-500"><IndianRupee size={11} className="inline" /> Full model with opex, incentives, PG fees and three scenarios: Admin → Financials.</div>
      </Card>
    </div>
  );
}

function Impact() {
  const m = useDerived(overviewMetrics);
  const u = useDerived(fleetUtilisation);
  const sim = useAppState((s) => s.simulation);
  return (
    <div className="space-y-4">
      <Callout tone="warn" title="Simulated metrics">Figures combine the 5-day sample history and everything created live in this session (including the simulation). They demonstrate the model; they are not operating results.</Callout>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Commuters served" value={m.passengersServed.toLocaleString('en-IN')} sub={`${m.registeredCommuters} registered`} icon={<Users size={16} />} />
        <Stat label="Vehicle utilisation" value={`${u.totals.utilisationPct}%`} sub={`from ${u.totals.baselinePct}% baseline`} tone="blue" />
        <Stat label="Passenger savings" value={inrCompact(m.passengerSavings)} sub="vs solo auto fares" tone="green" icon={<IndianRupee size={16} />} />
        <Stat label="Private trips avoided" value={m.privateTripsReplaced.toLocaleString('en-IN')} sub="est. 0.55 per seat" tone="green" icon={<Leaf size={16} />} />
        <Stat label="Platform commission" value={inrCompact(m.commission)} sub={`on ${inrCompact(m.gbv)} GBV`} tone="cyan" />
        <Stat label="Driver earnings" value={inrCompact(m.driverPayouts)} sub={`${m.completedTrips} trips · ${m.avgOccupancyPct}% occupancy`} tone="blue" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="What a judge just saw" subtitle="End-to-end, on one shared data system">
          <ul className="space-y-2 text-sm">{['A commuter booking that became a real QR pass, scanned by a driver, completed as a trip and reflected in admin finance within the same state.', 'A pooling engine that dispatches on threshold or timeout, never over capacity, never with a non-compliant vehicle or offline driver.', 'A supply model that adds revenue hours to vehicles that already exist.', `A live scenario: ${sim.stats.bookings || 35} commuters, ${sim.params.vehicles} vehicles, ${sim.stats.dispatches || '—'} dispatches, ${sim.stats.completed || '—'} delivered.`, 'An honest compliance posture: permits, insurance, badges and the stage-vs-contract carriage question are modelled, not hand-waved.'].map((t, k) => <li key={k} className="flex gap-2"><ShieldCheck className="mt-0.5 shrink-0 text-go" size={16} /><span>{t}</span></li>)}</ul>
        </Card>
        <Card className="hero-gradient text-white border-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan">Next 12 months</div>
          <ol className="mt-3 space-y-2 text-sm text-white/85">{['Regulatory pathway: aggregator licence application, legal opinion on per-seat contract carriage, B2B whole-vehicle contracts as the launch wedge.', 'Pilot: 2 stations (Baiyappanahalli, KR Puram), 10 verified vehicles, 2 operators, Razorpay payments, AIS-140 telematics.', 'Metro partnership: BMRCL bay access, exit-count data feed, co-branded wayfinding.', 'Scale: 8 stations, 25 vehicles, corporate shuttle contracts, women-only pooled departures in the evening peak.'].map((t, k) => <li key={k} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan text-xs font-bold text-navy">{k + 1}</span>{t}</li>)}</ol>
          <div className="mt-5 flex gap-2"><Link to="/" className="btn btn-md bg-white text-navy">Open the apps</Link><Link to="/admin" className="btn btn-md bg-cyan text-navy">Admin dashboard</Link></div>
        </Card>
      </div>
    </div>
  );
}
