import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Play, Flag, ScanLine, MapPin, Users, Clock3, Navigation, Moon } from 'lucide-react';
import { useAppState, useDispatch, useNow } from '@/domain/store/hooks';
import { useDriver } from './useDriver';
import { Card, Button, Badge, StatusBadge, Progress, EmptyState, Callout, Modal, useToast, Avatar, SimTag } from '@/app/shared/ui';
import { FleetMap } from '@/app/shared/map/FleetMap';
import { fmtCountdown, fmtTime, inr, istParts } from '@/domain/util';
import { fareRule } from '@/domain/seed/geo';
import { splitFare } from '@/domain/engine/finance';

export function TripPage() {
  const d = useDriver();
  const state = useAppState((s) => s);
  const now = useNow();
  const dispatch = useDispatch();
  const toast = useToast();
  const nav = useNavigate();
  const [reject, setReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = d.current;
  if (!t) return <EmptyState icon={<Navigation size={28} />} title="No active assignment" body={d.driver.availability === 'offline' ? 'Go online from the dashboard to receive trip assignments.' : 'You are online. Assignments appear here as soon as a pooling group at your station needs a vehicle.'} action={<Button variant="secondary" onClick={() => nav('/driver')}>Back to dashboard</Button>} />;
  const group = t.groupId ? state.groups[t.groupId] : undefined;
  const station = state.stations[t.stationId], hotspot = state.hotspots[t.hotspotId];
  const rule = fareRule(t.stationId, t.hotspotId);
  const booked = t.bookingIds.map((id) => state.bookings[id]).filter(Boolean);
  const boarded = booked.filter((b) => b.status === 'boarded');
  const waiting = booked.filter((b) => b.status === 'assigned');
  const estGross = boarded.reduce((a, b) => a + b.fare, 0);
  const split = splitFare(estGross, state.settings.finance.commissionPct);
  const night = istParts(now).h >= Number(state.settings.dispatch.nightSafeDropFrom.split(':')[0]);
  const run = async (cmd: Parameters<typeof dispatch>[0], okMsg: string) => { setBusy(true); const r = await dispatch(cmd); setBusy(false); if (r.ok) toast({ tone: 'success', title: okMsg }); else toast({ tone: 'danger', title: r.error }); return r.ok; };

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex items-center justify-between"><div><div className="label">{t.id}{t.kind === 'anchor' ? ' · Anchor route' : ''}</div><h1 className="font-display text-xl font-extrabold">{station.name} → {hotspot.name}</h1></div><StatusBadge status={t.status} /></div>

      {t.status === 'assigned' && (
        <Card className="border-electric/40 ring-2 ring-electric/15" title="New trip assignment" subtitle={t.acceptDeadline ? `Auto-accepts in ${fmtCountdown(t.acceptDeadline - now)}` : undefined}>
          <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-mist-100 p-2"><Users size={14} className="mx-auto text-electric" /><div className="mt-1 font-bold">{booked.length}/{t.capacity}</div><div className="text-slate-500">booked</div></div><div className="rounded-xl bg-mist-100 p-2"><MapPin size={14} className="mx-auto text-electric" /><div className="mt-1 font-bold">{rule.distanceKm} km</div><div className="text-slate-500">~{rule.durationMin} min</div></div><div className="rounded-xl bg-mist-100 p-2"><Clock3 size={14} className="mx-auto text-electric" /><div className="mt-1 font-bold">{t.scheduledDepartureAt ? fmtTime(t.scheduledDepartureAt) : group ? fmtCountdown(group.deadline - now) : '—'}</div><div className="text-slate-500">{t.scheduledDepartureAt ? 'departs' : 'max wait'}</div></div></div>
          <div className="mt-3 text-sm">Pickup at <b>{station.pickupBay}</b>. Est. payout at full load: <b>{inr(splitFare(t.capacity * rule.fare, state.settings.finance.commissionPct).payout)}</b>.</div>
          <div className="mt-3 grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setReject(true)}><X size={16} /> Decline</Button><Button variant="success" loading={busy} onClick={() => run({ type: 'driver.acceptTrip', tripId: t.id }, 'Trip accepted — proceed to the bay')}><Check size={16} /> Accept</Button></div>
        </Card>
      )}

      {t.status === 'boarding' && (
        <Card title="Boarding at the bay" subtitle={station.pickupBay} action={<SimTag>Live</SimTag>}>
          <div className="flex items-end justify-between"><div><div className="font-display text-3xl font-extrabold">{boarded.length}<span className="text-base text-slate-400">/{t.capacity}</span></div><div className="text-xs text-slate-500">boarded · {waiting.length} booked, not yet scanned</div></div><div className="text-right text-xs text-slate-500">{group && !group.initiatedAt && <>Dispatch when <b>{group.threshold}</b> booked<br />or in <b className="font-mono text-electric">{fmtCountdown(group.deadline - now)}</b></>}{group?.initiatedAt && <span className="font-semibold text-amber-700">Dispatch initiated · leaving in ≤ {fmtCountdown(group.initiatedAt + state.settings.dispatch.boardingGraceMin * 60000 - now)}</span>}{t.scheduledDepartureAt && <>Departs <b>{fmtTime(t.scheduledDepartureAt)}</b></>}</div></div>
          <Progress value={boarded.length} max={t.capacity} className="mt-2" tone={group && boarded.length >= group.threshold ? 'green' : 'blue'} />
          <div className="mt-3 grid grid-cols-2 gap-2"><Button onClick={() => nav('/driver/scan')}><ScanLine size={16} /> Scan passengers</Button><Button variant="success" loading={busy} disabled={boarded.length === 0} onClick={() => run({ type: 'driver.startTrip', tripId: t.id }, 'Trip started')}><Play size={16} /> Start trip</Button></div>
          {boarded.length === 0 && <div className="mt-2 text-[11px] text-slate-500">Start is enabled once at least one passenger has boarded. The vehicle also departs automatically when the threshold or the timer is reached.</div>}
        </Card>
      )}

      {t.status === 'en_route' && (
        <Card title="En route" subtitle={`ETA ${fmtTime(t.etaAt!)} · ${Math.round(t.progress * 100)}% complete`} action={<SimTag>Simulated GPS</SimTag>}>
          <Progress value={t.progress * 100} tone="green" />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-mist-100 p-2"><div className="font-bold">{boarded.length}</div><div className="text-slate-500">on board</div></div><div className="rounded-xl bg-mist-100 p-2"><div className="font-bold">{inr(t.grossFare)}</div><div className="text-slate-500">gross fare</div></div><div className="rounded-xl bg-go-50 p-2"><div className="font-bold text-go">{inr(t.driverPayout)}</div><div className="text-slate-500">your payout</div></div></div>
          {t.deviationAlert && <Callout tone="danger" className="mt-3" title="Route deviation flagged">Operations has been alerted. Return to the planned corridor or confirm the reason with ops.</Callout>}
          <Button variant="dark" className="mt-3 w-full" loading={busy} onClick={() => run({ type: 'driver.endTrip', tripId: t.id }, `Trip completed — ${inr(t.driverPayout)} added to earnings`)}><Flag size={16} /> End trip at {hotspot.name}</Button>
        </Card>
      )}

      {night && <Callout tone="warn" title={<span className="flex items-center gap-1"><Moon size={14} /> Safe-drop protocol active (after {state.settings.dispatch.nightSafeDropFrom})</span>}>Drop each passenger at a lit, populated point only. Confirm every drop in-app; no passenger is left at an isolated location.</Callout>}

      <Card title="Route" pad={false}><div className="p-4"><FleetMap height={220} vehicles={d.vehicle ? [d.vehicle] : []} trips={[t]} stations={[station]} hotspots={[hotspot]} focusTripId={t.id} />{t.routeStops && t.routeStops.length > 1 && <div className="mt-2 text-xs text-slate-500">Stops: {t.routeStops.map((h) => state.hotspots[h].name).join(' → ')}</div>}</div></Card>

      <Card title={`Passengers (${booked.length})`} subtitle="Verify identity against the name on the pass">
        {booked.length === 0 && <div className="text-sm text-slate-500">No bookings yet.</div>}
        <ul className="divide-y divide-mist-200">{booked.map((b) => { const u = state.users[b.commuterId]; return <li key={b.id} className="flex items-center gap-3 py-2"><Avatar name={u.name} color={u.avatarColor} size={34} /><div className="flex-1 min-w-0"><div className="truncate text-sm font-semibold">{u.name} {b.womenPriority && <Badge tone="purple" className="ml-1">Priority seat</Badge>}</div><div className="font-mono text-[11px] text-slate-500">{b.id} · {inr(b.fare)}</div></div><StatusBadge status={b.status} /></li>; })}</ul>
        {boarded.length > 0 && <div className="mt-3 rounded-xl bg-mist-100 px-3 py-2 text-xs">Current load: gross {inr(estGross)} → you {inr(split.payout)} · GoMaxi {inr(split.commission)}</div>}
      </Card>

      <Modal open={reject} onClose={() => setReject(false)} title="Decline this assignment?" footer={<><Button variant="secondary" onClick={() => setReject(false)}>Keep</Button><Button variant="danger" onClick={async () => { setReject(false); await run({ type: 'driver.rejectTrip', tripId: t.id, reason: 'Driver declined' }, 'Assignment declined — you are now offline'); }}>Decline</Button></>}><p className="text-sm text-slate-600">The group will be re-assigned to another vehicle and you will be set offline until you choose to go online again.</p></Modal>
    </div>
  );
}
