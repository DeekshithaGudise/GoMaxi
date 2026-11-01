import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Wallet, CreditCard, Smartphone, Users, Clock3, ShieldCheck, Bike, CarTaxiFront } from 'lucide-react';
import { useAppState, useDispatch, useNow } from '@/domain/store/hooks';
import { useCommuter } from './useCommuter';
import { Button, Card, Badge, Toggle, Input, Callout, SimTag, Progress } from '@/app/shared/ui';
import { QrPass } from '@/app/shared/qr/QrPass';
import { fareRule } from '@/domain/seed/geo';
import { fmtCountdown, fmtTime, inr } from '@/domain/util';
import { activeBookingsOf } from '@/domain/engine/pooling';
import type { PaymentMethod } from '@/domain/types';
import type { CreateBookingResult } from '@/domain/engine/booking';

type Step = 'station' | 'destination' | 'ride' | 'payment' | 'done';

export function BookFlow() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { userId, commuter, active } = useCommuter();
  const state = useAppState((s) => s);
  const now = useNow();
  const dispatch = useDispatch();
  const [step, setStep] = useState<Step>(params.get('hotspot') ? 'ride' : params.get('station') ? 'destination' : 'station');
  const [stationId, setStationId] = useState(params.get('station') ?? commuter.homeStationId);
  const [hotspotId, setHotspotId] = useState<string | null>(params.get('hotspot'));
  const [anchorId] = useState<string | null>(params.get('anchor'));
  const [women, setWomen] = useState(commuter.womenPriorityDefault);
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '' });
  const [forceFail, setForceFail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateBookingResult | null>(null);
  const bookingInFlight = useRef(false);

  useEffect(() => { if (active && !result && !bookingInFlight.current && step !== 'done') nav(`/commuter/booking/${active.id}`, { replace: true }); }, [active, step, nav, result]);

  const station = state.stations[stationId];
  const rule = hotspotId ? fareRule(stationId, hotspotId) : null;
  const anchor = anchorId ? state.trips[anchorId] : undefined;
  const fare = anchor?.routeId ? state.anchorRoutes[anchor.routeId].fare : rule?.fare ?? 0;
  const forming = useMemo(() => Object.values(state.groups).find((g) => g.stationId === stationId && g.hotspotId === hotspotId && g.status === 'forming' && !g.initiatedAt && g.deadline > now), [state.groups, stationId, hotspotId, now]);
  const formingCount = forming ? activeBookingsOf(state, forming).length : 0;
  const formingTrip = forming?.tripId ? state.trips[forming.tripId] : undefined;
  const eligibleHere = Object.values(state.vehicles).filter((v) => v.currentStationId === stationId && v.status === 'idle').length;

  const pay = async (quickUpi = false) => {
    if (quickUpi) setMethod('upi');
    setBusy(true); setError(null); bookingInFlight.current = true;
    await new Promise((r) => setTimeout(r, 1100)); // simulated gateway latency
    const res = await dispatch({ type: 'booking.create', input: { commuterId: userId, stationId, hotspotId: hotspotId!, payment: { method: quickUpi ? 'upi' : method, forceFail: quickUpi ? false : forceFail, cardLast4: card.number.replace(/\s/g, '').slice(-4), upiId: upi }, womenPriority: women, anchorTripId: anchorId ?? undefined } });
    setBusy(false);
    if (!res.ok) { bookingInFlight.current = false; setError(res.error); return; }
    const data = res.data as CreateBookingResult;
    setResult(data);
    if (data.ok) setStep('done'); else { bookingInFlight.current = false; setError(data.error ?? 'Payment failed'); if (quickUpi) setStep('payment'); }
  };

  const steps: Step[] = ['station', 'destination', 'ride', 'payment', 'done'];
  const idx = steps.indexOf(step);

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex items-center gap-2">
        {step !== 'done' && <button onClick={() => (idx === 0 ? nav('/commuter') : setStep(steps[idx - 1]))} className="rounded-xl p-2 hover:bg-mist-100" aria-label="Back"><ArrowLeft size={18} /></button>}
        <div className="flex-1"><div className="label">Step {Math.min(idx + 1, 4)} of 4</div><h1 className="font-display text-xl font-extrabold">{{ station: 'Choose your metro station', destination: 'Where are you heading?', ride: 'Your shared ride', payment: 'Pay & confirm', done: 'You’re booked!' }[step]}</h1></div>
      </div>
      <Progress value={Math.min(idx + 1, 4)} max={4} height="h-1.5" />

      {step === 'station' && (
        <div className="space-y-2">
          {Object.values(state.stations).map((s) => (
            <button key={s.id} onClick={() => { setStationId(s.id); setStep('destination'); }} className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${s.id === stationId ? 'border-electric bg-electric-50/40' : 'border-mist-200 hover:border-electric'}`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy font-display font-extrabold text-cyan">M</span>
              <span className="flex-1"><span className="block font-semibold">{s.name}</span><span className="block text-xs text-slate-500">{s.line} Line · {s.pickupBay}</span></span>
              {s.id === commuter.homeStationId && <Badge tone="cyan">Home</Badge>}
            </button>
          ))}
        </div>
      )}

      {step === 'destination' && (
        <div className="space-y-2">
          <div className="text-xs text-slate-500">From <b>{station.name}</b>. Fares are fixed per seat; no surge.</div>
          {Object.values(state.hotspots).map((h) => { const r = fareRule(stationId, h.id); const g = Object.values(state.groups).find((x) => x.stationId === stationId && x.hotspotId === h.id && x.status === 'forming'); return (
            <button key={h.id} onClick={() => { setHotspotId(h.id); setStep('ride'); }} className="flex w-full items-center gap-3 rounded-2xl border border-mist-200 p-3.5 text-left hover:border-electric">
              <span className="flex-1 min-w-0"><span className="block font-semibold">{h.name}</span><span className="block text-xs text-slate-500">{h.description}</span><span className="mt-1 flex flex-wrap gap-1.5 text-[11px]"><Badge tone="slate">{r.distanceKm} km</Badge><Badge tone="slate">~{r.durationMin} min</Badge>{g && <Badge tone="green" dot>{activeBookingsOf(state, g).length} pooling now</Badge>}</span></span>
              <span className="text-right"><span className="block font-display text-xl font-extrabold text-electric">{inr(r.fare)}</span><span className="block text-[10px] text-slate-500">per seat</span></span>
            </button>
          ); })}
        </div>
      )}

      {step === 'ride' && rule && hotspotId && (
        <div className="space-y-3">
          <Card>
            <div className="flex items-start justify-between"><div><div className="label">Route</div><div className="font-display text-lg font-extrabold">{station.name} → {state.hotspots[hotspotId].name}</div><div className="text-xs text-slate-500">{rule.distanceKm} km · ~{rule.durationMin} min · pickup at {station.pickupBay}</div></div><div className="text-right"><div className="font-display text-2xl font-extrabold text-electric">{inr(fare)}</div><div className="text-[10px] text-slate-500">fixed per seat</div></div></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-go-50 p-2"><div className="font-bold text-go">{inr(fare)}</div><div className="text-slate-600">GoMaxi shared</div></div>
              <div className="rounded-xl bg-mist-100 p-2"><div className="flex items-center justify-center gap-1 font-bold text-slate-600"><Bike size={12} />{inr(rule ? Math.round(Math.max(40, 20 + rule.distanceKm * 9) / 5) * 5 : 0)}</div><div className="text-slate-500">Bike taxi</div></div>
              <div className="rounded-xl bg-mist-100 p-2"><div className="flex items-center justify-center gap-1 font-bold text-slate-600"><CarTaxiFront size={12} />{inr(rule ? Math.round(Math.max(60, 30 + rule.distanceKm * 16) / 5) * 5 : 0)}</div><div className="text-slate-500">Solo auto</div></div>
            </div>
          </Card>
          {anchor ? (
            <Card title="Scheduled departure" action={<Badge tone="cyan">Anchor route</Badge>}>
              <div className="text-sm">{state.anchorRoutes[anchor.routeId!]?.name} · departs <b>{fmtTime(anchor.scheduledDepartureAt!)}</b> · {anchor.bookingIds.length}/{anchor.capacity} seats booked · vehicle {anchor.vehicleId}</div>
            </Card>
          ) : (
            <Card title="Pooling status" subtitle="You'll be grouped with commuters heading the same way" action={<SimTag>Live</SimTag>}>
              {forming ? (
                <><div className="flex items-center gap-2 text-sm"><Users size={16} className="text-electric" /> <b>{formingCount}</b> of {forming.capacity} seats taken{formingTrip ? ` · ${formingTrip.vehicleId} waiting at the bay` : ''}</div>
                <Progress value={formingCount} max={forming.capacity} className="mt-2" />
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600"><Clock3 size={14} /> Departs in ≤ <span className="font-mono font-bold text-electric">{fmtCountdown(forming.deadline - now)}</span> or as soon as {forming.threshold} seats fill</div></>
              ) : (
                <div className="text-sm text-slate-600">You'll open a new pool. It departs within <b>{state.settings.dispatch.maxWaitMin} minutes</b> or as soon as <b>{Math.ceil(state.settings.dispatch.defaultCapacity * state.settings.dispatch.targetOccupancyPct / 100)} seats</b> fill. {eligibleHere > 0 ? `${eligibleHere} vehicle${eligibleHere > 1 ? 's' : ''} ready at ${station.name}.` : 'A vehicle will be assigned as soon as one is free.'}</div>
              )}
            </Card>
          )}
          <Card><Toggle checked={women} onChange={setWomen} label="Women-priority seating" description="Front-row seats are held for passengers who opt in; the driver sees this on your pass." /></Card>
          <Callout tone="info"><ShieldCheck size={14} className="inline mr-1" />Free cancellation until dispatch is initiated; 50% refund after. Driver and vehicle details appear on your pass.</Callout>
          <Button size="lg" className="w-full" loading={busy} onClick={() => pay(true)}>{busy ? 'Booking…' : <>Pay {inr(fare)} with UPI & book <ArrowRight size={16} /></>}</Button>
          <Button size="md" variant="secondary" className="w-full" onClick={() => setStep('payment')}>Choose card, wallet or other options</Button>
        </div>
      )}

      {step === 'payment' && (
        <div className="space-y-3">
          <Callout tone="warn" title="Simulated payment gateway">No real money moves. The flow mirrors a Razorpay-style order → capture so a licensed provider can be plugged in later.</Callout>
          <div className="grid grid-cols-3 gap-2">
            {([['upi', 'UPI', Smartphone], ['card', 'Card', CreditCard], ['wallet', `Wallet · ${inr(commuter.walletBalance)}`, Wallet]] as const).map(([m, label, I]) => (
              <button key={m} onClick={() => setMethod(m)} className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-xs font-semibold ${method === m ? 'border-electric bg-electric-50/50 text-electric' : 'border-mist-200 text-slate-600'}`}><I size={18} />{label}</button>
            ))}
          </div>
          <Card>
            {method === 'upi' && <Input label="UPI ID" placeholder="name@bank (use name@fail to test a failure)" value={upi} onChange={(e) => setUpi(e.target.value)} />}
            {method === 'card' && <div className="space-y-2"><Input label="Card number" placeholder="4111 1111 1111 1111 (…0000 fails)" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} inputMode="numeric" /><div className="grid grid-cols-2 gap-2"><Input label="Expiry" placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} /><Input label="CVV" placeholder="•••" type="password" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} /></div></div>}
            {method === 'wallet' && <div className="text-sm">Pay {inr(fare)} from your GoMaxi wallet. Balance after: <b>{inr(commuter.walletBalance - fare)}</b>{commuter.walletBalance < fare && <span className="text-coral"> — insufficient, top up or choose another method.</span>}</div>}
            <div className="mt-3 border-t border-mist-200 pt-3"><Toggle checked={forceFail} onChange={setForceFail} label="Demo: simulate gateway failure" description="Shows the failure path and retry." /></div>
          </Card>
          {error && <Callout tone="danger" title="Payment failed">{error} — nothing was charged. Please try again or choose another method.</Callout>}
          <div className="card card-pad flex items-center justify-between"><div><div className="label">Total</div><div className="font-display text-2xl font-extrabold">{inr(fare)}</div></div><Button size="lg" loading={busy} onClick={() => pay()}>{busy ? 'Processing…' : `Pay ${inr(fare)}`}</Button></div>
        </div>
      )}

      {step === 'done' && result?.ok && (
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-go text-white"><Check size={28} /></div>
          <div><div className="font-display text-xl font-extrabold">Seat confirmed</div><div className="text-sm text-slate-500">Booking {result.booking.id} · paid {inr(result.booking.fare)} via {result.payment.method.toUpperCase()} <SimTag /></div></div>
          <div className="flex justify-center"><QrPass booking={result.booking} /></div>
          <Card className="text-left text-sm">
            {result.trip ? <>Vehicle <b>{result.trip.vehicleId}</b> ({state.vehicles[result.trip.vehicleId].registration}) with driver <b>{state.users[result.trip.driverId].name}</b> is assigned. Head to <b>{station.pickupBay}</b> and show this QR to board.</> : <>You're in pooling group <b>{result.group?.id}</b>. A vehicle will be assigned shortly — keep this pass handy.</>}
          </Card>
          <Button size="lg" className="w-full" onClick={() => nav(`/commuter/booking/${result.booking.id}`)}>Track my ride <ArrowRight size={16} /></Button>
        </div>
      )}
    </div>
  );
}
