import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Share2, Siren, Star, Phone, Languages, ShieldCheck, XCircle, Flag, Check } from 'lucide-react';
import { useAppState, useDispatch, useNow } from '@/domain/store/hooks';
import { useCommuter } from './useCommuter';
import { Button, Card, Badge, StatusBadge, Avatar, Progress, Modal, Callout, SimTag, useToast, Input } from '@/app/shared/ui';
import { QrPass } from '@/app/shared/qr/QrPass';
import { FleetMap } from '@/app/shared/map/FleetMap';
import { fmtCountdown, fmtTime, inr, fmtDateTime } from '@/domain/util';
import { activeBookingsOf } from '@/domain/engine/pooling';

export function BookingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { userId } = useCommuter();
  const state = useAppState((s) => s);
  const now = useNow();
  const dispatch = useDispatch();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sos, setSos] = useState(false);
  const [report, setReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [copied, setCopied] = useState(false);
  const b = id ? state.bookings[id] : undefined;
  if (!b || b.commuterId !== userId) return <Callout tone="danger" title="Booking not found">This booking doesn't belong to your account. <Link className="underline" to="/commuter">Go home</Link></Callout>;
  const trip = b.tripId ? state.trips[b.tripId] : undefined;
  const group = b.groupId ? state.groups[b.groupId] : undefined;
  const vehicle = trip ? state.vehicles[trip.vehicleId] : undefined;
  const driver = trip ? state.drivers[trip.driverId] : undefined;
  const driverUser = trip ? state.users[trip.driverId] : undefined;
  const payment = b.paymentId ? state.payments[b.paymentId] : undefined;
  const station = state.stations[b.stationId], hotspot = state.hotspots[b.hotspotId];
  const cancellable = b.status === 'confirmed' || b.status === 'assigned';
  const initiated = !!group?.initiatedAt;
  const active = ['confirmed', 'assigned', 'boarded'].includes(b.status);

  const cancel = async () => { const r = await dispatch({ type: 'booking.cancel', bookingId: b.id }); setConfirmCancel(false); if (r.ok) toast({ tone: 'success', title: 'Booking cancelled', body: initiated ? '50% refunded to your wallet (post-dispatch policy).' : 'Full refund credited to your wallet.' }); else toast({ tone: 'danger', title: 'Could not cancel', body: r.error }); };
  const raiseSos = async () => { await dispatch({ type: 'safety.sos', userId, tripId: trip?.id, bookingId: b.id }); setSos(false); toast({ tone: 'danger', title: 'SOS sent to GoMaxi safety desk', body: 'Simulated escalation — your emergency contacts would receive your live location.' }); };
  const share = async () => { if (!trip) return; const r = await dispatch({ type: 'safety.shareTrip', tripId: trip.id }); if (r.ok) { const url = `${location.origin}/share/${r.data as string}`; try { await navigator.clipboard.writeText(url); } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 2000); toast({ tone: 'success', title: 'Live trip link copied', body: url }); } };
  const submitReport = async () => { if (!reportText.trim()) return; await dispatch({ type: 'safety.report', userId, tripId: trip?.id, bookingId: b.id, message: reportText.trim() }); setReport(false); setReportText(''); toast({ tone: 'success', title: 'Report submitted', body: 'Our safety desk will review it.' }); };
  const rate = async () => { const r = await dispatch({ type: 'booking.rate', bookingId: b.id, rating, comment }); if (r.ok) toast({ tone: 'success', title: 'Thanks for rating your driver' }); };

  const timeline = [
    { k: 'Booked & paid', at: b.createdAt, done: true },
    { k: trip ? `Vehicle ${trip.vehicleId} assigned` : 'Vehicle assignment', at: trip?.createdAt, done: !!trip },
    { k: 'Boarded (QR verified)', at: b.boardedAt, done: !!b.boardedAt },
    { k: 'Departed', at: trip?.departedAt, done: !!trip?.departedAt },
    { k: 'Arrived', at: b.completedAt, done: b.status === 'completed' },
  ];

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex items-center gap-2"><button onClick={() => nav(-1)} className="rounded-xl p-2 hover:bg-mist-100" aria-label="Back"><ArrowLeft size={18} /></button><div className="flex-1"><div className="label">{b.id}</div><h1 className="font-display text-xl font-extrabold">{station.name} → {hotspot.name}</h1></div><StatusBadge status={b.status} /></div>

      {b.status === 'cancelled' || b.status === 'expired' ? <Callout tone="warn" title={b.status === 'expired' ? 'Booking expired' : 'Booking cancelled'}>{payment?.status === 'refunded' ? `${inr(payment.refundAmount ?? 0)} refunded to your wallet.` : 'No refund applicable.'}</Callout> : null}
      {b.status === 'completed' && <Callout tone="success" title="Trip completed">You arrived at {hotspot.name} at {fmtTime(b.completedAt!)}. You saved {inr(b.soloAutoFare - b.fare)} vs a solo auto.</Callout>}
      {trip?.deviationAlert && <Callout tone="danger" title="Route deviation detected">Our safety desk is in touch with the driver. Use SOS if you feel unsafe.</Callout>}

      {active && (
        <Card className="text-center">
          <div className="label mb-2">Boarding pass · show to driver</div>
          <QrPass booking={b} used={b.status === 'boarded'} />
          {b.womenPriority && <div className="mt-2"><Badge tone="purple">Women-priority seat</Badge></div>}
          <div className="mt-3 text-xs text-slate-500">
            {b.status === 'boarded' ? `Boarded at ${fmtTime(b.boardedAt!)} — enjoy the ride` : trip?.status === 'boarding' ? `${trip.vehicleId} is waiting at ${station.pickupBay}` : trip ? `Driver notified · heading to the bay` : `Pooling · ${group ? activeBookingsOf(state, group).length : 1}/${group?.capacity ?? 12} seats`}
          </div>
          {group && group.status === 'forming' && !group.initiatedAt && <div className="mt-2 text-sm">Departs in ≤ <span className="font-mono font-bold text-electric">{fmtCountdown(group.deadline - now)}</span> or when {group.threshold} seats fill</div>}
          {group && group.initiatedAt && b.status !== 'boarded' && <div className="mt-2 text-sm font-semibold text-amber-700">Dispatch initiated — board now, the vehicle leaves in ≤ {fmtCountdown(group.initiatedAt + state.settings.dispatch.boardingGraceMin * 60000 - now)}</div>}
          {b.rolloverCount > 0 && <div className="mt-1 text-xs text-amber-700">Moved to the next departure ({b.rolloverCount}×) because the previous vehicle left before you boarded.</div>}
        </Card>
      )}

      {trip && (trip.status === 'boarding' || trip.status === 'en_route' || trip.status === 'assigned') && (
        <Card title={trip.status === 'en_route' ? 'Live tracking' : 'Your vehicle'} subtitle={trip.status === 'en_route' ? `ETA ${fmtTime(trip.etaAt!)} · ${Math.round(trip.progress * 100)}% of route` : `At ${station.pickupBay}`} action={<SimTag>Simulated GPS</SimTag>} pad={false}>
          <div className="px-4 pb-4"><FleetMap height={220} vehicles={vehicle ? [vehicle] : []} trips={[trip]} stations={[station]} hotspots={[hotspot]} focusTripId={trip.id} />{trip.status === 'en_route' && <Progress value={trip.progress * 100} className="mt-3" tone="green" />}</div>
        </Card>
      )}

      {vehicle && driver && driverUser && (
        <Card title="Driver & vehicle" action={<Badge tone="green"><ShieldCheck size={12} /> Verified</Badge>}>
          <div className="flex items-center gap-3">
            <Avatar name={driverUser.name} color={driverUser.avatarColor} size={48} />
            <div className="flex-1 min-w-0"><div className="font-semibold">{driverUser.name}</div><div className="text-xs text-slate-500"><Star size={12} className="inline text-amber" /> {(driver.ratingSum / Math.max(1, driver.ratingCount)).toFixed(2)} · {driver.ratingCount} ratings · {driver.yearsExperience} yrs</div><div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Languages size={12} /> {driver.languages.join(', ')}</div></div>
            <a href={`tel:${driverUser.phone}`} className="btn btn-sm btn-secondary"><Phone size={14} /> Call</a>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-mist-100 p-2"><div className="font-bold">{vehicle.id}</div><div className="text-slate-500">Vehicle</div></div><div className="rounded-xl bg-mist-100 p-2"><div className="font-bold">{vehicle.registration}</div><div className="text-slate-500">Registration</div></div><div className="rounded-xl bg-mist-100 p-2"><div className="font-bold">{vehicle.model}</div><div className="text-slate-500">{vehicle.capacity} seats</div></div></div>
          <div className="mt-2 text-[11px] text-slate-500">PSV badge {driver.psvBadgeNo} · Permit & insurance verified by GoMaxi ops · Panic button {vehicle.features.includes('panic_button') ? 'fitted' : 'pending'}</div>
        </Card>
      )}

      {active && (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="danger" onClick={() => setSos(true)}><Siren size={16} /> SOS</Button>
          <Button variant="secondary" onClick={share} disabled={!trip}>{copied ? <Check size={16} /> : <Share2 size={16} />} Share</Button>
          <Button variant="secondary" onClick={() => setReport(true)}><Flag size={16} /> Report</Button>
        </div>
      )}

      <Card title="Trip timeline">
        <ol className="space-y-2">
          {timeline.map((t, i) => <li key={i} className="flex items-center gap-3 text-sm"><span className={`h-2.5 w-2.5 rounded-full ${t.done ? 'bg-go' : 'bg-mist-300'}`} /><span className={`flex-1 ${t.done ? 'text-navy' : 'text-slate-400'}`}>{t.k}</span><span className="font-mono text-xs text-slate-500">{t.at ? fmtTime(t.at) : '—'}</span></li>)}
        </ol>
      </Card>

      <Card title="Payment" action={<SimTag />}>
        <div className="flex items-center justify-between text-sm"><span>{payment?.method.toUpperCase()} · {payment?.gatewayRef}</span><span className="font-bold">{inr(b.fare)}</span></div>
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500"><span>{payment ? fmtDateTime(payment.createdAt) : ''}</span>{payment && <StatusBadge status={payment.status} />}</div>
        {payment?.status === 'refunded' && <div className="mt-1 text-xs text-go">Refund {inr(payment.refundAmount ?? 0)} credited to wallet {payment.refundedAt ? fmtTime(payment.refundedAt) : ''}</div>}
      </Card>

      {b.status === 'completed' && !b.rating && (
        <Card title="Rate your driver">
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}><Star size={28} className={n <= rating ? 'fill-amber text-amber' : 'text-mist-300'} /></button>)}</div>
          <Input className="mt-2" placeholder="Anything to add? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button className="mt-2" disabled={!rating} onClick={rate}>Submit rating</Button>
        </Card>
      )}
      {b.rating && <Card><div className="text-sm">You rated this trip {b.rating}★{b.ratingComment ? ` — “${b.ratingComment}”` : ''}</div></Card>}

      {cancellable && <Button variant="ghost" className="w-full text-coral" onClick={() => setConfirmCancel(true)}><XCircle size={16} /> Cancel booking {initiated ? '(50% refund — dispatch initiated)' : '(full refund)'}</Button>}

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this booking?" footer={<><Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep it</Button><Button variant="danger" onClick={cancel}>Cancel booking</Button></>}>
        <p className="text-sm text-slate-600">{initiated ? 'Dispatch has already been initiated for your vehicle, so 50% of the fare is refunded to your wallet.' : `The full fare of ${inr(b.fare)} will be refunded to your GoMaxi wallet immediately (simulated).`}</p>
      </Modal>
      <Modal open={sos} onClose={() => setSos(false)} title="Send SOS?" footer={<><Button variant="secondary" onClick={() => setSos(false)}>Not now</Button><Button variant="danger" onClick={raiseSos}><Siren size={16} /> Send SOS</Button></>}>
        <p className="text-sm text-slate-600">This alerts the GoMaxi safety desk with your live location, notifies your emergency contacts and asks the driver to stop at the nearest safe point.</p>
        <Callout tone="warn" className="mt-3">Prototype: the escalation is simulated. No real emergency service or contact is called.</Callout>
      </Modal>
      <Modal open={report} onClose={() => setReport(false)} title="Report an issue" footer={<><Button variant="secondary" onClick={() => setReport(false)}>Close</Button><Button onClick={submitReport} disabled={!reportText.trim()}>Submit</Button></>}>
        <textarea className="input min-h-[100px]" placeholder="Describe what happened (driver conduct, vehicle condition, route, overcrowding…)" value={reportText} onChange={(e) => setReportText(e.target.value)} />
      </Modal>
    </div>
  );
}
