import { Link } from 'react-router-dom';
import { Users, Car, Activity, Ticket, Percent, IndianRupee, Leaf, Siren, Bus } from 'lucide-react';
import { useDerived, useAppState } from '@/domain/store/hooks';
import { overviewMetrics, financialActuals } from '@/domain/engine/analytics';
import { Card, Stat, PageTitle, StatusBadge, SimTag, Badge, Callout } from '@/app/shared/ui';
import { Bars, Donut } from '@/app/shared/charts';
import { ActivityFeed } from './ActivityFeed';
import { inr, inrCompact, fmtTime } from '@/domain/util';

export function OverviewPage({ mode }: { mode: 'admin' | 'metro' }) {
  const m = useDerived(overviewMetrics);
  const fin = useDerived(financialActuals);
  const state = useAppState((s) => s);
  const active = Object.values(state.trips).filter((t) => ['assigned', 'boarding', 'en_route'].includes(t.status)).sort((a, b) => b.createdAt - a.createdAt);
  const metro = mode === 'metro';
  return (
    <div className="space-y-5 animate-fade-up">
      <PageTitle title={metro ? 'Network overview' : 'Operations overview'} subtitle={metro ? 'Aggregated feeder-network performance. No personal passenger data is shown in this view.' : 'Everything below is computed live from the same bookings, trips and payments the commuter and driver apps write to.'} action={<Link to={`/${mode}/${metro ? 'stations' : 'simulation'}`} className="btn btn-md btn-primary">{metro ? 'Station analytics' : 'Open live simulation'}</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Registered commuters" value={m.registeredCommuters} icon={<Users size={16} />} sub={`${m.activeBookings} active bookings now`} />
        <Stat label="Active drivers" value={m.activeDrivers} icon={<Car size={16} />} sub={`${Object.keys(state.drivers).length} onboarded`} tone="blue" />
        <Stat label="Available vehicles" value={`${m.availableVehicles}/${m.eligibleVehicles}`} icon={<Bus size={16} />} sub={`${m.totalVehicles - m.eligibleVehicles} blocked by compliance`} tone="cyan" />
        <Stat label="Active trips" value={m.activeTrips} icon={<Activity size={16} />} sub={`${m.enRoute} en route`} tone="green" />
        <Stat label="Total bookings" value={m.totalBookings} icon={<Ticket size={16} />} sub={`${m.bookingsToday} today`} />
        <Stat label="Average occupancy" value={`${m.avgOccupancyPct}%`} icon={<Percent size={16} />} sub={`target ${state.settings.dispatch.targetOccupancyPct}%`} tone={m.avgOccupancyPct >= 75 ? 'green' : 'amber'} />
        <Stat label="Gross booking value" value={inrCompact(m.gbv)} icon={<IndianRupee size={16} />} sub={`${inr(m.gbvToday)} today`} />
        <Stat label="Platform commission" value={inrCompact(m.commission)} icon={<IndianRupee size={16} />} sub={`${inr(m.commissionToday)} today · ${state.settings.finance.commissionPct}%`} tone="blue" />
        <Stat label="Private trips replaced" value={m.privateTripsReplaced.toLocaleString('en-IN')} icon={<Leaf size={16} />} sub={<span>est. 0.55 per seat <SimTag>Estimate</SimTag></span>} tone="green" />
        <Stat label="Open safety alerts" value={m.openAlerts} icon={<Siren size={16} />} tone={m.openAlerts ? 'red' : 'navy'} sub={m.openAlerts ? 'needs attention' : 'all clear'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Daily gross booking value" subtitle="Completed trips · last 5 days + today" action={<SimTag>Sample history + live</SimTag>}>
          <Bars data={fin.days} x="label" series={[{ key: 'payout', name: 'Driver payout', color: '#2563EB' }, { key: 'commission', name: 'GoMaxi commission', color: '#20C4D8' }]} stacked height={240} format={(v) => inrCompact(v)} />
        </Card>
        <Card title="Where fares go" subtitle="Split of all completed GBV">
          <Donut data={[{ name: 'Driver payout', value: fin.payout, color: '#2563EB' }, { name: 'GoMaxi commission', value: fin.commission, color: '#20C4D8' }]} format={(v) => inr(v)} center={<div><div className="font-display text-xl font-extrabold">{inrCompact(fin.gbv)}</div><div className="text-[10px] text-slate-500">GBV</div></div>} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Active trips" subtitle="Live from the dispatch engine" pad={false}>
          {active.length === 0 ? <div className="p-6 text-sm text-slate-500">No active trips right now. Book a ride in the commuter app or start the live simulation.</div> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="px-4 py-2">Trip</th><th className="px-2 py-2">Vehicle</th>{!metro && <th className="px-2 py-2">Driver</th>}<th className="px-2 py-2">Route</th><th className="px-2 py-2">Load</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">ETA</th></tr></thead>
              <tbody>{active.map((t) => <tr key={t.id} className="border-t border-mist-200"><td className="px-4 py-2 font-mono text-xs">{t.id}</td><td className="px-2 py-2 font-semibold">{t.vehicleId}</td>{!metro && <td className="px-2 py-2">{state.users[t.driverId].name}</td>}<td className="px-2 py-2">{state.stations[t.stationId].name} → {state.hotspots[t.hotspotId].name}</td><td className="px-2 py-2">{t.boardedBookingIds.length}/{t.capacity} <span className="text-slate-400">({t.bookingIds.length} booked)</span></td><td className="px-2 py-2"><StatusBadge status={t.status} /></td><td className="px-2 py-2 font-mono text-xs">{t.etaAt ? fmtTime(t.etaAt) : '—'}</td></tr>)}</tbody></table></div>
          )}
        </Card>
        <Card title="Live activity" subtitle="Bookings · pooling · dispatch · boarding"><ActivityFeed height={360} /></Card>
      </div>

      {metro && <Callout tone="info" title="Data-minimisation note">The metro authority view shows station-level aggregates only. Passenger identities, phone numbers and individual bookings are visible only to GoMaxi operations under the roles defined in the architecture.</Callout>}
      <div className="flex flex-wrap gap-2 text-xs text-slate-500"><Badge tone="amber">Simulated GPS</Badge><Badge tone="amber">Simulated payments</Badge><Badge tone="amber">Rule-based demand model</Badge><span>— no live metro, payment or telematics API is connected in this prototype.</span></div>
    </div>
  );
}
