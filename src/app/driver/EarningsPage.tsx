import { useAppState } from '@/domain/store/hooks';
import { useDriver } from './useDriver';
import { Card, Stat, EmptyState, SimTag, Badge } from '@/app/shared/ui';
import { Bars } from '@/app/shared/charts';
import { inr, fmtDateTime, istParts, dayStartOf } from '@/domain/util';

export function EarningsPage() {
  const d = useDriver();
  const state = useAppState((s) => s);
  const earnings = Object.values(state.earnings).filter((e) => e.driverId === d.driverId);
  const day = dayStartOf(state.clock.simTime);
  const days = [6, 5, 4, 3, 2, 1, 0].map((ago) => { const from = day - ago * 86400000; const es = earnings.filter((e) => e.createdAt >= from && e.createdAt < from + 86400000); return { day: ago === 0 ? 'Today' : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][istParts(from).day], payout: es.reduce((a, e) => a + e.payout, 0), incentive: es.reduce((a, e) => a + e.incentive, 0) }; });
  return (
    <div className="animate-fade-up space-y-4">
      <h1 className="font-display text-xl font-extrabold">Earnings</h1>
      <div className="grid grid-cols-2 gap-3"><Stat label="Today" value={inr(d.todayEarnings)} sub={`GBV ${inr(d.todayGbv)} · GoMaxi ${inr(d.todayCommission)}`} tone="green" /><Stat label="Last 7 days" value={inr(d.weekEarnings)} sub={`${inr(d.lifetimeEarnings)} lifetime`} tone="blue" /></div>
      <Card title="Daily payout" subtitle="Driver share + occupancy incentives" action={<SimTag>Sample data</SimTag>}><Bars data={days} x="day" series={[{ key: 'payout', name: 'Payout', color: '#2563EB' }, { key: 'incentive', name: 'Incentive', color: '#16A36A' }]} stacked height={180} format={(v) => inr(v)} /></Card>
      <Card title="Completed trips" pad={false}>
        {d.history.length === 0 ? <div className="p-4"><EmptyState title="No completed trips yet" /></div> : (
          <ul className="divide-y divide-mist-200">{d.history.slice(0, 30).map((t) => { const e = earnings.find((x) => x.tripId === t.id); return <li key={t.id} className="px-4 py-3 text-sm"><div className="flex items-center justify-between"><span className="font-semibold">{state.stations[t.stationId].name} → {state.hotspots[t.hotspotId].name}</span><span className="font-bold text-go">{inr((e?.payout ?? t.driverPayout) + (e?.incentive ?? 0))}</span></div><div className="mt-0.5 flex items-center justify-between text-xs text-slate-500"><span>{fmtDateTime(t.completedAt!)} · {t.boardedBookingIds.length}/{t.capacity} pax</span><Badge tone={t.boardedBookingIds.length / t.capacity >= 0.8 ? 'green' : 'slate'}>{Math.round((t.boardedBookingIds.length / t.capacity) * 100)}% full</Badge></div></li>; })}</ul>
        )}
      </Card>
    </div>
  );
}
