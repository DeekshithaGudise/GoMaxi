import { useAppState } from '@/domain/store/hooks';
import { Card, PageTitle, StatusBadge, Progress, Badge, SimTag } from '@/app/shared/ui';
import { activeBookingsOf } from '@/domain/engine/pooling';
import { fmtCountdown, fmtTime } from '@/domain/util';
import { useNow } from '@/domain/store/hooks';

const label: Record<string, string> = { assign_vehicle: 'Vehicle assigned', dispatch_threshold: 'Dispatch · threshold', dispatch_timeout: 'Dispatch · timeout', dispatch_manual: 'Dispatch · driver start', hold_underfilled: 'Hold (under-filled)', rollover: 'Rollover to next window', cancel_refund: 'Cancelled & refunded', no_vehicle: 'No eligible vehicle', depart_anchor: 'Anchor departure' };
const tone = (d: string) => (d.startsWith('dispatch') || d === 'depart_anchor' ? 'green' : d === 'assign_vehicle' ? 'blue' : d === 'cancel_refund' || d === 'no_vehicle' ? 'red' : 'amber');

export function DispatchPage() {
  const state = useAppState((s) => s);
  const now = useNow();
  const forming = Object.values(state.groups).filter((g) => g.status === 'forming').sort((a, b) => a.openedAt - b.openedAt);
  const s = state.settings.dispatch;
  return (
    <div className="space-y-4 animate-fade-up">
      <PageTitle title="Pooling & dispatch engine" subtitle={`Rules in force: capacity ${s.defaultCapacity} · target occupancy ${s.targetOccupancyPct}% (threshold ${Math.ceil(s.defaultCapacity * s.targetOccupancyPct / 100)}) · max wait ${s.maxWaitMin} min · boarding grace ${s.boardingGraceMin} min · under-filled policy: ${s.underfilledPolicy.replace(/_/g, ' ')} (floor ${s.minViablePassengers})`} action={<SimTag>Live</SimTag>} />
      <Card title={`Forming groups (${forming.length})`} subtitle="Compatible passengers = same station + same hotspot + open departure window + seats left">
        {forming.length === 0 && <div className="text-sm text-slate-500">No groups forming. Each new booking either joins a compatible forming group or opens one.</div>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {forming.map((g) => { const n = activeBookingsOf(state, g).length; const boarded = activeBookingsOf(state, g).filter((b) => b.status === 'boarded').length; const t = g.tripId ? state.trips[g.tripId] : undefined; return (
            <div key={g.id} className="rounded-2xl border border-mist-200 p-3">
              <div className="flex items-center justify-between"><div className="font-semibold">{state.stations[g.stationId].name} → {state.hotspots[g.hotspotId].name}</div><Badge tone={g.initiatedAt ? 'green' : 'blue'} dot>{g.initiatedAt ? 'dispatch initiated' : 'forming'}</Badge></div>
              <div className="mt-1 text-xs text-slate-500">{g.id} · opened {fmtTime(g.openedAt)} · {g.vehicleId ? `${g.vehicleId} (${t?.status.replace('_', ' ')})` : 'awaiting vehicle'}{g.rollovers ? ` · ${g.rollovers} extension(s)` : ''}</div>
              <div className="mt-2 flex items-end justify-between"><div className="font-display text-2xl font-extrabold">{n}<span className="text-sm text-slate-400">/{g.capacity}</span></div><div className="text-right text-xs">{g.initiatedAt ? <span className="text-amber-700">leaves ≤ {fmtCountdown(g.initiatedAt + s.boardingGraceMin * 60000 - now)}</span> : <>timer <span className="font-mono font-bold text-electric">{fmtCountdown(g.deadline - now)}</span></>}<br />{boarded} boarded</div></div>
              <Progress value={n} max={g.capacity} className="mt-1.5" tone={n >= g.threshold ? 'green' : 'blue'} />
              <div className="mt-1 text-[11px] text-slate-500">Threshold {g.threshold} ({Math.round((n / g.capacity) * 100)}% now)</div>
            </div>); })}
        </div>
      </Card>
      <Card title="Dispatch decision log" subtitle="Every decision the engine takes is recorded with its rationale" pad={false}>
        <div className="max-h-[520px] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-white"><tr className="text-left text-xs text-slate-500"><th className="px-4 py-2">Time</th><th className="px-2 py-2">Decision</th><th className="px-2 py-2">Group / Trip</th><th className="px-2 py-2">Vehicle</th><th className="px-2 py-2">Load</th><th className="px-2 py-2">Rationale</th></tr></thead>
          <tbody>{[...state.dispatchLog].reverse().slice(0, 150).map((d) => <tr key={d.id} className="border-t border-mist-200 align-top"><td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{fmtTime(d.at)}</td><td className="px-2 py-2"><Badge tone={tone(d.decision)}>{label[d.decision] ?? d.decision}</Badge></td><td className="px-2 py-2 font-mono text-xs">{d.groupId}{d.tripId ? ` / ${d.tripId}` : ''}</td><td className="px-2 py-2">{d.vehicleId ?? '—'}</td><td className="px-2 py-2 whitespace-nowrap">{d.passengers}/{d.capacity} · {d.occupancyPct}%</td><td className="px-2 py-2 text-xs text-slate-600">{d.rationale}</td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Trips" subtitle="Most recent 40" pad={false}>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="px-4 py-2">Trip</th><th className="px-2 py-2">Kind</th><th className="px-2 py-2">Route</th><th className="px-2 py-2">Vehicle</th><th className="px-2 py-2">Boarded</th><th className="px-2 py-2">Departed</th><th className="px-2 py-2">Status</th></tr></thead>
          <tbody>{Object.values(state.trips).sort((a, b) => b.createdAt - a.createdAt).slice(0, 40).map((t) => <tr key={t.id} className="border-t border-mist-200"><td className="px-4 py-2 font-mono text-xs">{t.id}</td><td className="px-2 py-2">{t.kind}</td><td className="px-2 py-2">{state.stations[t.stationId].name} → {state.hotspots[t.hotspotId].name}</td><td className="px-2 py-2">{t.vehicleId}</td><td className="px-2 py-2">{t.boardedBookingIds.length}/{t.capacity}</td><td className="px-2 py-2 font-mono text-xs">{t.departedAt ? fmtTime(t.departedAt) : '—'}</td><td className="px-2 py-2"><StatusBadge status={t.status} /></td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}
