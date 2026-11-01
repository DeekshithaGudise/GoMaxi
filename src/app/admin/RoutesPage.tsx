import { useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useAppState, useDispatch } from '@/domain/store/hooks';
import { Card, PageTitle, Button, Input, Select, Toggle, Modal, StatusBadge, Badge, useToast, Callout } from '@/app/shared/ui';
import { fmtTime, inr, timeAt, dayStartOf, MIN } from '@/domain/util';
import type { AnchorRoute } from '@/domain/types';

const blank = (): AnchorRoute => ({ id: '', name: '', originStationId: 'st-byp', stopHotspotIds: ['hs-whf'], frequencyMin: 30, windowStart: '11:00', windowEnd: '14:00', capacity: 12, fare: 35, vehicleIds: [], active: true });

export function RoutesPage() {
  const state = useAppState((s) => s);
  const dispatch = useDispatch();
  const toast = useToast();
  const [edit, setEdit] = useState<AnchorRoute | null>(null);
  const routes = Object.values(state.anchorRoutes);
  const day = dayStartOf(state.clock.simTime);
  const save = async () => { if (!edit) return; const r = await dispatch({ type: 'admin.upsertRoute', route: edit }); if (r.ok) { toast({ tone: 'success', title: 'Route saved' }); setEdit(null); } else toast({ tone: 'danger', title: r.error }); };
  const slots = (r: AnchorRoute) => { const out: number[] = []; for (let t = timeAt(r.windowStart, day); t <= timeAt(r.windowEnd, day); t += r.frequencyMin * MIN) out.push(t); return out; };
  return (
    <div className="space-y-4 animate-fade-up">
      <PageTitle title="Anchor routes" subtitle="Off-peak mode: after the morning peak, vehicles run scheduled corridors between stations, tech parks and residential clusters." action={<Button onClick={() => setEdit(blank())}><Plus size={16} /> New route</Button>} />
      <Callout tone="info">Departures are generated 15 minutes before each slot, boarding opens 10 minutes before, and the vehicle departs on time with whoever has boarded. Commuters can book seats on these departures from the app. Slots without an eligible vehicle are skipped and logged.</Callout>
      <div className="grid gap-4 xl:grid-cols-2">
        {routes.map((r) => { const trips = Object.values(state.trips).filter((t) => t.kind === 'anchor' && t.routeId === r.id && (t.scheduledDepartureAt ?? 0) >= day).sort((a, b) => (a.scheduledDepartureAt ?? 0) - (b.scheduledDepartureAt ?? 0)); return (
          <Card key={r.id} title={<span className="flex items-center gap-2">{r.name}{!r.active && <Badge tone="amber">inactive</Badge>}</span>} subtitle={`${state.stations[r.originStationId].name} → ${r.stopHotspotIds.map((h) => state.hotspots[h].name).join(' → ')}`} action={<div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEdit({ ...r })}><Pencil size={14} /></Button><Button size="sm" variant="ghost" className="text-coral" onClick={() => dispatch({ type: 'admin.deleteRoute', routeId: r.id })}><Trash2 size={14} /></Button></div>}>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><div className="rounded-lg bg-mist-100 p-2"><div className="label">Window</div><div className="font-semibold">{r.windowStart}–{r.windowEnd}</div></div><div className="rounded-lg bg-mist-100 p-2"><div className="label">Frequency</div><div className="font-semibold">every {r.frequencyMin} min</div></div><div className="rounded-lg bg-mist-100 p-2"><div className="label">Fare · capacity</div><div className="font-semibold">{inr(r.fare)} · {r.capacity}</div></div><div className="rounded-lg bg-mist-100 p-2"><div className="label">Vehicles</div><div className="font-semibold">{r.vehicleIds.join(', ') || '—'}</div></div></div>
            <div className="mt-3"><div className="label mb-1">Today's schedule</div><div className="flex flex-wrap gap-1.5">{slots(r).map((s) => { const t = trips.find((x) => x.scheduledDepartureAt === s); return <span key={s} className={`rounded-lg px-2 py-1 text-xs font-mono ${t ? (t.status === 'completed' ? 'bg-go-50 text-go-600' : t.status === 'cancelled' ? 'bg-coral-50 text-coral line-through' : 'bg-electric-50 text-electric-700') : 'bg-mist-100 text-slate-500'}`} title={t ? `${t.id} ${t.vehicleId} ${t.status}` : 'not yet generated'}>{fmtTime(s)}{t ? ` · ${t.vehicleId} · ${t.bookingIds.length}/${t.capacity}` : ''}</span>; })}</div></div>
            {trips.length > 0 && <div className="mt-3 space-y-1">{trips.map((t) => <div key={t.id} className="flex items-center justify-between rounded-lg border border-mist-200 px-2 py-1.5 text-xs"><span>{fmtTime(t.scheduledDepartureAt!)} · {t.vehicleId} · {state.users[t.driverId].name} · {t.boardedBookingIds.length}/{t.capacity} boarded</span><StatusBadge status={t.status} /></div>)}</div>}
          </Card>); })}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit route' : 'New anchor route'} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save route</Button></>}>
        {edit && (
          <div className="space-y-3">
            <Input label="Route name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Whitefield Connector" />
            <Select label="Starting station" value={edit.originStationId} onChange={(e) => setEdit({ ...edit, originStationId: e.target.value })}>{Object.values(state.stations).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <div><div className="label mb-1">Stops (in order; last = destination)</div><div className="flex flex-wrap gap-1.5">{Object.values(state.hotspots).map((h) => { const i = edit.stopHotspotIds.indexOf(h.id); return <button key={h.id} onClick={() => setEdit({ ...edit, stopHotspotIds: i >= 0 ? edit.stopHotspotIds.filter((x) => x !== h.id) : [...edit.stopHotspotIds, h.id] })} className={`chip ${i >= 0 ? 'bg-electric text-white' : 'bg-mist-100 text-slate-600'}`}>{i >= 0 ? `${i + 1}. ` : ''}{h.name}</button>; })}</div></div>
            <div className="grid grid-cols-2 gap-3"><Input label="Window start" type="time" value={edit.windowStart} onChange={(e) => setEdit({ ...edit, windowStart: e.target.value })} /><Input label="Window end" type="time" value={edit.windowEnd} onChange={(e) => setEdit({ ...edit, windowEnd: e.target.value })} /><Input label="Frequency (min)" type="number" value={edit.frequencyMin} onChange={(e) => setEdit({ ...edit, frequencyMin: Math.max(5, Number(e.target.value)) })} /><Input label="Fare (₹)" type="number" value={edit.fare} onChange={(e) => setEdit({ ...edit, fare: Math.max(5, Number(e.target.value)) })} /><Input label="Capacity" type="number" value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: Math.max(1, Number(e.target.value)) })} /></div>
            <div><div className="label mb-1">Vehicle assignment (eligible, compliant vehicles only are dispatched)</div><div className="flex flex-wrap gap-1.5">{Object.values(state.vehicles).map((v) => <button key={v.id} onClick={() => setEdit({ ...edit, vehicleIds: edit.vehicleIds.includes(v.id) ? edit.vehicleIds.filter((x) => x !== v.id) : [...edit.vehicleIds, v.id] })} className={`chip ${edit.vehicleIds.includes(v.id) ? 'bg-navy text-white' : 'bg-mist-100 text-slate-600'}`}>{v.id}</button>)}</div></div>
            <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Active" description="Inactive routes generate no departures." />
          </div>
        )}
      </Modal>
    </div>
  );
}
