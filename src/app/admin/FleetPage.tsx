import { useState } from 'react';
import { useAppState, useDispatch } from '@/domain/store/hooks';
import { Card, PageTitle, StatusBadge, Badge, Button, Modal, SimTag, Callout } from '@/app/shared/ui';
import { FleetMap } from '@/app/shared/map/FleetMap';
import { fmtTime } from '@/domain/util';
import { vehicleEligibility } from '@/domain/engine/compliance';
import type { Vehicle } from '@/domain/types';

export function FleetPage({ mode }: { mode: 'admin' | 'metro' }) {
  const state = useAppState((s) => s);
  const dispatch = useDispatch();
  const [sel, setSel] = useState<Vehicle | null>(null);
  const vehicles = Object.values(state.vehicles);
  const trips = Object.values(state.trips).filter((t) => ['assigned', 'boarding', 'en_route'].includes(t.status));
  const tripOf = (v: Vehicle) => trips.find((t) => t.vehicleId === v.id);
  const selected = sel ? state.vehicles[sel.id] : null;
  const selTrip = selected ? tripOf(selected) : undefined;
  return (
    <div className="space-y-4 animate-fade-up">
      <PageTitle title="Live fleet" subtitle="Every vehicle's position, assignment and load. Positions are simulated along planned corridors." action={<SimTag>Simulated GPS</SimTag>} />
      <FleetMap height={460} vehicles={vehicles} trips={trips} stations={Object.values(state.stations)} hotspots={Object.values(state.hotspots)} onVehicleClick={(v) => setSel(v)} />
      <Card pad={false} title="Fleet status" subtitle={`${vehicles.filter((v) => v.status === 'idle').length} idle · ${vehicles.filter((v) => v.status === 'boarding' || v.status === 'assigned').length} boarding · ${vehicles.filter((v) => v.status === 'on_trip').length} on trip · ${vehicles.filter((v) => v.status === 'returning').length} returning`}>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="px-4 py-2">Vehicle</th>{mode === 'admin' && <th className="px-2 py-2">Driver</th>}<th className="px-2 py-2">Location</th><th className="px-2 py-2">Destination</th><th className="px-2 py-2">Passengers</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">ETA</th><th className="px-2 py-2">Eligible</th></tr></thead>
          <tbody>{vehicles.map((v) => { const t = tripOf(v); const e = vehicleEligibility(v); return (
            <tr key={v.id} className="cursor-pointer border-t border-mist-200 hover:bg-mist-50" onClick={() => setSel(v)}>
              <td className="px-4 py-2"><div className="font-semibold">{v.id}</div><div className="text-xs text-slate-500">{v.registration} · {v.capacity} seats</div></td>
              {mode === 'admin' && <td className="px-2 py-2">{v.driverId ? state.users[v.driverId].name : '—'}</td>}
              <td className="px-2 py-2 text-xs">{v.currentStationId ? `${state.stations[v.currentStationId].name} Metro` : t ? `${Math.round(t.progress * 100)}% en route` : v.status === 'returning' ? 'Returning' : `${v.position.lat.toFixed(4)}, ${v.position.lng.toFixed(4)}`}</td>
              <td className="px-2 py-2">{t ? state.hotspots[t.hotspotId].name : '—'}</td>
              <td className="px-2 py-2">{t ? `${t.boardedBookingIds.length}/${t.capacity}` : `0/${v.capacity}`}</td>
              <td className="px-2 py-2"><StatusBadge status={v.status} /></td>
              <td className="px-2 py-2 font-mono text-xs">{t?.etaAt ? fmtTime(t.etaAt) : v.availableFrom ? `back ${fmtTime(v.availableFrom)}` : '—'}</td>
              <td className="px-2 py-2">{e.eligible ? <Badge tone="green">Yes</Badge> : <Badge tone="red">No</Badge>}</td>
            </tr>); })}</tbody></table></div>
      </Card>
      <Modal open={!!selected} onClose={() => setSel(null)} title={selected ? `${selected.id} · ${selected.registration}` : ''} size="lg">
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Info k="Model" v={`${selected.model} (${selected.capacity})`} /><Info k="Operator" v={state.operators[selected.operatorId].name} /><Info k="Driver" v={selected.driverId ? state.users[selected.driverId].name : '—'} /><Info k="Status" v={<StatusBadge status={selected.status} />} /><Info k="Home station" v={state.stations[selected.homeStationId].name} /><Info k="Odometer" v={`${selected.odometerKm.toLocaleString('en-IN')} km`} /><Info k="Features" v={selected.features.join(', ')} /><Info k="Position" v={`${selected.position.lat.toFixed(4)}, ${selected.position.lng.toFixed(4)}`} /></div>
            {selTrip && <Callout tone="info" title={`Trip ${selTrip.id}`}>{state.stations[selTrip.stationId].name} → {state.hotspots[selTrip.hotspotId].name} · {selTrip.boardedBookingIds.length}/{selTrip.capacity} boarded · {selTrip.status.replace('_', ' ')}{selTrip.etaAt ? ` · ETA ${fmtTime(selTrip.etaAt)}` : ''}</Callout>}
            <div><div className="label mb-1">Compliance</div><div className="grid gap-1 sm:grid-cols-2">{selected.compliance.map((c) => <div key={c.key} className="flex items-center justify-between rounded-lg bg-mist-100 px-3 py-1.5 text-xs"><span>{c.label}{c.validTill ? <span className="text-slate-400"> · till {c.validTill}</span> : ''}</span><StatusBadge status={c.status} /></div>)}</div>{!vehicleEligibility(selected).eligible && <div className="mt-2 text-xs text-coral">Not dispatchable: {vehicleEligibility(selected).reasons.join('; ')}</div>}</div>
            <div><div className="label mb-1">Schedule today</div><div className="flex h-6 overflow-hidden rounded-lg">{state.schedules[selected.id]?.blocks.map((b, i) => { const [sh, sm] = b.start.split(':').map(Number); const [eh, em] = b.end.split(':').map(Number); const w = ((eh + em / 60) - (sh + sm / 60)) / 14 * 100; return <div key={i} title={`${b.start}–${b.end} ${b.label}`} className={`${{ school_commitment: 'bg-slate-400', gomaxi_feeder: 'bg-electric', anchor_route: 'bg-cyan', idle: 'bg-mist-300', maintenance: 'bg-amber' }[b.kind]} text-[9px] text-white flex items-center justify-center`} style={{ width: `${w}%` }}>{w > 12 ? b.kind.replace('_', ' ') : ''}</div>; })}</div><div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>06:30</span><span>20:30</span></div></div>
            {mode === 'admin' && !selTrip && <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'admin.setVehicleStatus', vehicleId: selected.id, status: selected.status === 'off_duty' ? 'idle' : 'off_duty' })}>{selected.status === 'off_duty' ? 'Bring into service' : 'Take off duty'}</Button></div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
const Info = ({ k, v }: { k: string; v: React.ReactNode }) => <div><div className="label">{k}</div><div className="mt-0.5 font-medium">{v}</div></div>;
