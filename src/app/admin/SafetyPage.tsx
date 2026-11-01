import { useState } from 'react';
import { Siren, CheckCircle2 } from 'lucide-react';
import { useAppState, useDispatch } from '@/domain/store/hooks';
import { Card, PageTitle, Stat, Badge, Button, StatusBadge, Modal, Input, Callout, useToast, Select } from '@/app/shared/ui';
import { FleetMap } from '@/app/shared/map/FleetMap';
import { fmtDateTime, fmtTime } from '@/domain/util';

export function SafetyPage() {
  const state = useAppState((s) => s);
  const dispatch = useDispatch();
  const toast = useToast();
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [devTrip, setDevTrip] = useState('');
  const alerts = Object.values(state.alerts).sort((a, b) => b.createdAt - a.createdAt);
  const open = alerts.filter((a) => a.status !== 'resolved');
  const enRoute = Object.values(state.trips).filter((t) => t.status === 'en_route');
  const sev = (s: string) => (s === 'critical' ? 'red' : s === 'high' ? 'amber' : s === 'medium' ? 'blue' : 'slate') as 'red' | 'amber' | 'blue' | 'slate';
  const resolve = async () => { if (!resolveId) return; await dispatch({ type: 'safety.resolve', alertId: resolveId, note: note || 'Resolved by operations' }); setResolveId(null); setNote(''); toast({ tone: 'success', title: 'Alert resolved' }); };
  return (
    <div className="space-y-4 animate-fade-up">
      <PageTitle title="Safety desk" subtitle="SOS, route deviations, incident reports and the late-night safe-drop policy." action={<Badge tone={open.length ? 'red' : 'green'} dot>{open.length} open</Badge>} />
      <Callout tone="warn" title="Simulated escalation">Alerts here are real records created by the apps, but no SMS, call or emergency service is triggered. In production the SOS path would notify the ops desk, emergency contacts and, where mandated, the 112 ERSS integration.</Callout>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Open alerts" value={open.length} tone={open.length ? 'red' : 'green'} /><Stat label="SOS (all time)" value={alerts.filter((a) => a.type === 'sos').length} /><Stat label="Route deviations" value={alerts.filter((a) => a.type === 'route_deviation').length} /><Stat label="Median acknowledge time" value={(() => { const xs = alerts.filter((a) => a.acknowledgedAt).map((a) => (a.acknowledgedAt! - a.createdAt) / 60000).sort((x, y) => x - y); return xs.length ? `${xs[Math.floor(xs.length / 2)].toFixed(1)} min` : '—'; })()} tone="blue" /></div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {alerts.length === 0 && <Card><div className="text-sm text-slate-500">No alerts recorded.</div></Card>}
          {alerts.map((a) => (
            <Card key={a.id} className={a.status === 'open' && a.severity === 'critical' ? 'border-coral ring-2 ring-coral/20' : ''}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-3">{a.type === 'sos' ? <Siren className="text-coral" /> : <CheckCircle2 className={a.status === 'resolved' ? 'text-go' : 'text-amber'} />}<div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{a.type.replace(/_/g, ' ').toUpperCase()}</span><Badge tone={sev(a.severity)}>{a.severity}</Badge><StatusBadge status={a.status} /></div><div className="mt-0.5 text-sm">{a.message}</div><div className="mt-1 text-xs text-slate-500">{a.id} · {fmtDateTime(a.createdAt)}{a.raisedByUserId ? ` · raised by ${state.users[a.raisedByUserId]?.name}` : ''}{a.vehicleId ? ` · ${a.vehicleId} (${state.vehicles[a.vehicleId]?.registration})` : ''}{a.driverId ? ` · driver ${state.users[a.driverId]?.name}` : ''}</div></div></div>
                <div className="flex gap-2">{a.status === 'open' && <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'safety.acknowledge', alertId: a.id })}>Acknowledge</Button>}{a.status !== 'resolved' && <Button size="sm" onClick={() => setResolveId(a.id)}>Resolve</Button>}</div>
              </div>
              <ol className="mt-3 space-y-1 border-l-2 border-mist-200 pl-3 text-xs text-slate-600">{a.escalation.map((e, i) => <li key={i}>{e}</li>)}</ol>
              {a.resolutionNote && <div className="mt-2 rounded-lg bg-go-50 px-3 py-2 text-xs text-go-600">Resolution ({a.resolvedAt ? fmtTime(a.resolvedAt) : ''}): {a.resolutionNote}</div>}
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card title="Alert locations" pad={false}><div className="p-3"><FleetMap height={260} vehicles={Object.values(state.vehicles).filter((v) => open.some((a) => a.vehicleId === v.id))} trips={Object.values(state.trips).filter((t) => open.some((a) => a.tripId === t.id))} stations={Object.values(state.stations)} hotspots={[]} fit={false} /></div></Card>
          <Card title="Simulate route deviation" subtitle="Demonstrates the deviation detector on an en-route trip"><Select value={devTrip} onChange={(e) => setDevTrip(e.target.value)}><option value="">Select en-route trip…</option>{enRoute.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.vehicleId} → {state.hotspots[t.hotspotId].name}</option>)}</Select><Button className="mt-2" variant="secondary" disabled={!devTrip} onClick={async () => { const r = await dispatch({ type: 'safety.deviation', tripId: devTrip }); if (r.ok) toast({ tone: 'warn', title: 'Deviation alert raised' }); else toast({ tone: 'danger', title: r.error }); }}>Trigger deviation alert</Button>{enRoute.length === 0 && <div className="mt-2 text-xs text-slate-500">No trips en route right now.</div>}</Card>
          <Card title="Operating policy"><ul className="space-y-1.5 text-sm text-slate-600"><li>• No passenger is dropped at an isolated location after <b>{state.settings.dispatch.nightSafeDropFrom}</b>; drivers confirm each drop at a lit, populated point.</li><li>• Verified drivers only (PSV badge, police verification, training).</li><li>• Live trip sharing and SOS on every booking; women-priority seating on request.</li><li>• Route deviation &gt; 300 m from corridor raises a high-severity alert.</li><li>• Incident reports are acknowledged within 10 minutes and closed with a written resolution.</li></ul></Card>
        </div>
      </div>
      <Modal open={!!resolveId} onClose={() => setResolveId(null)} title="Resolve alert" footer={<><Button variant="secondary" onClick={() => setResolveId(null)}>Cancel</Button><Button onClick={resolve}>Mark resolved</Button></>}><Input label="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done?" /></Modal>
    </div>
  );
}
