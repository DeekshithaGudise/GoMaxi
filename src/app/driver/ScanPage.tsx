import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Keyboard, WifiOff, Wifi, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { useAppState, useDispatch } from '@/domain/store/hooks';
import { useDriver } from './useDriver';
import { Card, Button, Input, Segmented, Callout, EmptyState, Badge, Avatar } from '@/app/shared/ui';
import { QrScanner } from '@/app/shared/qr/QrScanner';
import type { ScanResult } from '@/domain/engine/boarding';
import type { OfflineBoardingQueueItem } from '@/domain/types';
import { fmtTime } from '@/domain/util';

const QKEY = 'gomaxi.offlineQueue';

export function ScanPage() {
  const d = useDriver();
  const state = useAppState((s) => s);
  const dispatch = useDispatch();
  const nav = useNavigate();
  const [mode, setMode] = useState<'camera' | 'manual'>('manual');
  const [manual, setManual] = useState('');
  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState<OfflineBoardingQueueItem[]>(() => { try { return JSON.parse(localStorage.getItem(QKEY) ?? '[]'); } catch { return []; } });
  const [last, setLast] = useState<ScanResult | null>(null);
  const [log, setLog] = useState<ScanResult[]>([]);
  const t = d.current;
  useEffect(() => { try { localStorage.setItem(QKEY, JSON.stringify(queue)); } catch { /* ignore */ } }, [queue]);

  const handle = useCallback(async (raw: string, method: 'qr' | 'manual') => {
    if (!t) return;
    if (offline) {
      const idm = raw.match(/GMB-?\d+/i);
      const bookingId = idm ? idm[0].toUpperCase().replace(/^GMB-?/, 'GMB-') : raw.trim().toUpperCase();
      const item = { bookingId, tripId: t.id, driverId: d.driverId, enteredAt: state.clock.simTime };
      setQueue((q) => (q.some((x) => x.bookingId === bookingId) ? q : [...q, item]));
      setLast({ accepted: true, code: 'ok', message: `Queued offline — ${bookingId} will be verified when connectivity returns`, bookingId });
      return;
    }
    const r = await dispatch({ type: 'boarding.scan', tripId: t.id, driverId: d.driverId, raw, method });
    const res = r.ok ? (r.data as ScanResult) : { accepted: false, code: 'invalid' as const, message: r.error };
    setLast(res); setLog((l) => [res, ...l].slice(0, 20));
    if (navigator.vibrate) navigator.vibrate(res.accepted ? 60 : [40, 40, 40]);
  }, [t, offline, dispatch, d.driverId, state.clock.simTime]);

  const sync = async () => { if (!queue.length) return; const r = await dispatch({ type: 'boarding.syncOffline', items: queue }); if (r.ok) { const res = r.data as ScanResult[]; setLog((l) => [...res, ...l].slice(0, 20)); setLast(res[res.length - 1]); setQueue([]); } };
  useEffect(() => { if (!offline && queue.length) void sync(); }, [offline]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t) return <EmptyState title="No trip to board" body="Scanning is available once you have an accepted trip at the bay." action={<Button variant="secondary" onClick={() => nav('/driver')}>Dashboard</Button>} />;
  const scanningAllowed = t.status === 'boarding';

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex items-center justify-between"><div><div className="label">{t.vehicleId} → {state.hotspots[t.hotspotId].name}</div><h1 className="font-display text-xl font-extrabold">Scan boarding passes</h1></div><Badge tone={scanningAllowed ? 'green' : 'amber'} dot>{t.boardedBookingIds.length}/{t.capacity} boarded</Badge></div>
      {!scanningAllowed && <Callout tone="warn" title={t.status === 'assigned' ? 'Accept the trip first' : 'Boarding closed'}>{t.status === 'assigned' ? 'Scans are only accepted after you accept the assignment.' : `Trip is ${t.status.replace('_', ' ')}.`}</Callout>}
      <div className="flex items-center justify-between"><Segmented value={mode} onChange={setMode} options={[{ value: 'camera', label: <span className="flex items-center gap-1"><Camera size={14} /> Camera</span> }, { value: 'manual', label: <span className="flex items-center gap-1"><Keyboard size={14} /> Manual</span> }]} /><button onClick={() => setOffline(!offline)} className={`chip ${offline ? 'bg-amber-50 text-amber-700' : 'bg-go-50 text-go-600'}`}>{offline ? <WifiOff size={12} /> : <Wifi size={12} />} {offline ? 'Offline mode' : 'Online'}</button></div>

      {mode === 'camera' ? <QrScanner active={mode === 'camera' && scanningAllowed} onScan={(text) => handle(text, 'qr')} /> : (
        <Card title="Manual verification" subtitle="Fallback when the camera is unavailable — type the booking ID printed under the QR">
          <form onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { handle(manual.trim(), 'manual'); setManual(''); } }} className="flex gap-2"><Input placeholder="e.g. GMB-10432 or 10432" value={manual} onChange={(e) => setManual(e.target.value)} className="flex-1" autoFocus /><Button type="submit" disabled={!scanningAllowed && !offline}>Verify</Button></form>
        </Card>
      )}

      {last && (
        <div className={`rounded-2xl border p-4 ${last.accepted ? 'border-go-100 bg-go-50' : 'border-red-100 bg-coral-50'}`}>
          <div className="flex items-start gap-3">{last.accepted ? <CheckCircle2 className="text-go" size={28} /> : <XCircle className="text-coral" size={28} />}<div className="flex-1"><div className="font-display font-extrabold">{last.accepted ? 'Boarding accepted' : 'Boarding rejected'}</div><div className="text-sm">{last.message}</div>{last.passengerName && <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm"><Avatar name={last.passengerName} size={30} /><div><div className="font-semibold">{last.passengerName} {last.womenPriority && <Badge tone="purple" className="ml-1">Priority seat</Badge>}</div><div className="text-xs text-slate-500">{last.passengerPhoneMasked} · to {last.destination} · {last.bookingId}</div></div></div>}</div></div>
        </div>
      )}

      {offline && <Callout tone="warn" title={`Offline queue (${queue.length})`}>Entries are stored on this device and verified through the same rules when you go back online. Duplicates will be rejected. <Button size="sm" variant="secondary" className="ml-2" onClick={() => setOffline(false)}><RefreshCw size={12} /> Reconnect & sync</Button></Callout>}
      {queue.length > 0 && !offline && <Button variant="secondary" onClick={sync}><RefreshCw size={14} /> Sync {queue.length} offline record(s)</Button>}

      <Card title="Scan log" pad={false}><ul className="divide-y divide-mist-200 text-xs">{log.length === 0 && <li className="px-4 py-3 text-slate-500">No scans yet in this session.</li>}{log.map((r, i) => <li key={i} className="flex items-center justify-between px-4 py-2"><span>{r.accepted ? '✅' : '⛔'} {r.bookingId ?? '—'} · {r.passengerName ?? ''}</span><span className="text-slate-500">{r.boardedAt ? fmtTime(r.boardedAt) : r.code}</span></li>)}</ul></Card>
      <Button variant="secondary" className="w-full" onClick={() => nav('/driver/trip')}>Back to trip</Button>
    </div>
  );
}
