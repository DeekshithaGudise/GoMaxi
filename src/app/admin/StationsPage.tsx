import { useState } from 'react';
import { useDerived, useAppState } from '@/domain/store/hooks';
import { stationAnalytics } from '@/domain/engine/analytics';
import { Card, PageTitle, Stat, Segmented, SimTag, Callout } from '@/app/shared/ui';
import { Bars, Lines, Donut } from '@/app/shared/charts';
import { inr } from '@/domain/util';

export function StationsPage() {
  const stations = useAppState((s) => s.stations);
  const [id, setId] = useState('st-byp');
  const a = useDerived((s) => stationAnalytics(s, id));
  return (
    <div className="space-y-4 animate-fade-up">
      <PageTitle title="Metro station analytics" subtitle="Station-wise feeder performance. Metro exit volumes are illustrative assumptions until BMRCL gate data is connected." action={<Segmented value={id} onChange={setId} options={Object.values(stations).map((s) => ({ value: s.id, label: s.name }))} />} />
      <Callout tone="info" title={`${a.station.name} · ${a.station.line} Line · ${a.station.pickupBay}`}>Feeder coverage today: <b>{a.station.feederCoverage}</b>. Assumed weekday exits: {a.station.dailyExits.toLocaleString('en-IN')} (peak {a.station.peakExitPerHour.toLocaleString('en-IN')}/h) <SimTag>Assumption</SimTag></Callout>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Passenger arrivals / day" value={a.station.dailyExits.toLocaleString('en-IN')} sub="metro exits (assumed)" />
        <Stat label="GoMaxi bookings / day" value={a.dailyBookings} sub={`${a.bookingsToday} today · ${a.activeNow} active`} tone="blue" />
        <Stat label="Conversion rate" value={`${a.conversionPct}%`} sub={`${a.addressableConversionPct}% of last-mile exits`} tone="cyan" />
        <Stat label="Peak demand hour" value={`${a.peakHour}:00`} sub="by bookings" />
        <Stat label="Avg waiting time" value={`${a.avgWaitMin} min`} sub={`cap ${5} min`} tone={a.avgWaitMin <= 5 ? 'green' : 'amber'} />
        <Stat label="Est. ridership uplift" value={`+${a.ridershipUplift}/day`} sub={<span>35% new-to-metro <SimTag>Assumption</SimTag></span>} tone="green" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Arrivals vs GoMaxi bookings by hour" subtitle="Bookings are averaged over the 5-day sample"><Lines data={a.byHour.map((h) => ({ ...h, hour: `${h.hour}:00`, bookings: Math.round(h.bookings * 10) / 10 }))} x="hour" series={[{ key: 'arrivals', name: 'Metro exits (assumed)', color: '#94A3B8' }, { key: 'bookings', name: 'GoMaxi bookings', color: '#2563EB' }]} height={240} /></Card>
        <Card title="Destination distribution" subtitle="Share of bookings from this station"><Donut data={a.destinations.map((d) => ({ name: d.hotspot.name, value: d.bookings }))} height={240} /></Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Daily bookings" subtitle="Completed, last 5 days"><Bars data={a.days} x="label" series={[{ key: 'bookings', name: 'Bookings', color: '#20C4D8' }]} height={200} /></Card>
        <Card title="Destinations" pad={false}><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="px-4 py-2">Hotspot</th><th className="px-2 py-2">Bookings</th><th className="px-2 py-2">Share</th></tr></thead><tbody>{a.destinations.map((d) => <tr key={d.hotspot.id} className="border-t border-mist-200"><td className="px-4 py-2 font-semibold">{d.hotspot.name}</td><td className="px-2 py-2">{d.bookings}</td><td className="px-2 py-2">{d.share}%</td></tr>)}</tbody></table><div className="px-4 py-2 text-xs text-slate-500">Station GBV to date: {inr(a.revenue)}</div></Card>
      </div>
    </div>
  );
}
