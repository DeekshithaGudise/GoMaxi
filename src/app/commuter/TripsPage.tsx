import { useNavigate } from 'react-router-dom';
import { Receipt, History } from 'lucide-react';
import { useState } from 'react';
import { useAppState } from '@/domain/store/hooks';
import { useCommuter } from './useCommuter';
import { Card, StatusBadge, EmptyState, Segmented, SimTag, Button } from '@/app/shared/ui';
import { fmtDateTime, inr } from '@/domain/util';

export function TripsPage() {
  const { mine, userId } = useCommuter();
  const state = useAppState((s) => s);
  const nav = useNavigate();
  const [tab, setTab] = useState<'trips' | 'payments'>('trips');
  const payments = Object.values(state.payments).filter((p) => p.commuterId === userId).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex items-center justify-between"><h1 className="font-display text-xl font-extrabold">My trips</h1><Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'trips', label: 'Bookings' }, { value: 'payments', label: 'Payments' }]} /></div>
      {tab === 'trips' ? (
        mine.length === 0 ? <EmptyState icon={<History size={28} />} title="No trips yet" body="Book your first shared ride from a metro station." action={<Button onClick={() => nav('/commuter/book')}>Book a ride</Button>} /> : (
          <div className="space-y-2">
            {mine.map((b) => (
              <button key={b.id} onClick={() => nav(`/commuter/booking/${b.id}`)} className="card card-pad w-full text-left hover:border-electric">
                <div className="flex items-center justify-between gap-2"><div className="font-semibold">{state.stations[b.stationId].name} → {state.hotspots[b.hotspotId].name}</div><StatusBadge status={b.status} /></div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500"><span>{fmtDateTime(b.createdAt)} · {b.id}{b.vehicleId ? ` · ${b.vehicleId}` : ''}</span><span className="font-bold text-navy">{inr(b.fare)}</span></div>
                {b.status === 'completed' && <div className="mt-1 text-xs text-go">Saved {inr(b.soloAutoFare - b.fare)} vs solo auto{b.rating ? ` · rated ${b.rating}★` : ''}</div>}
              </button>
            ))}
          </div>
        )
      ) : (
        payments.length === 0 ? <EmptyState icon={<Receipt size={28} />} title="No payments yet" /> : (
          <Card pad={false} title="Transaction history" action={<SimTag />}>
            <ul className="divide-y divide-mist-200">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div><div className="font-semibold">{p.method.toUpperCase()} · {p.bookingId}</div><div className="text-xs text-slate-500">{fmtDateTime(p.createdAt)} · {p.gatewayRef}{p.failureReason ? ` · ${p.failureReason}` : ''}</div></div>
                  <div className="text-right"><div className={`font-bold ${p.status === 'failed' ? 'text-slate-400 line-through' : ''}`}>{inr(p.amount)}</div><StatusBadge status={p.status} />{p.status === 'refunded' && <div className="text-[10px] text-go">+{inr(p.refundAmount ?? 0)} wallet</div>}</div>
                </li>
              ))}
            </ul>
          </Card>
        )
      )}
    </div>
  );
}
