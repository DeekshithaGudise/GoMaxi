import { useState } from 'react';
import { Brain, TrendingUp, Clock3, Bus } from 'lucide-react';
import { useDerived, useAppState, useDispatch } from '@/domain/store/hooks';
import { computeHotspotDemand } from '@/domain/engine/demand';
import { Card, PageTitle, Badge, Progress, Slider, Callout, SimTag, Button } from '@/app/shared/ui';
import { Bars, Lines } from '@/app/shared/charts';
import { inr } from '@/domain/util';
import type { DemandWeights } from '@/domain/types';
import { DEFAULT_WEIGHTS } from '@/domain/store/initialState';

const FEATURE_LABEL: Record<keyof DemandWeights, string> = { historicalBookings: 'Historical bookings (5 days)', metroExits: 'Metro exit volume (station affinity)', officeHeadcount: 'Nearby office headcount', shiftAlignment: 'Corporate shift timing (now)', residentialDensity: 'Residential density', transitGap: 'Existing transit gap' };

export function HotspotsPage({ mode }: { mode: 'admin' | 'metro' }) {
  const demand = useDerived((s) => computeHotspotDemand(s));
  const weights = useAppState((s) => s.settings.demandWeights);
  const dispatch = useDispatch();
  const [selId, setSelId] = useState<string>(demand[0]?.hotspot.id);
  const sel = demand.find((d) => d.hotspot.id === selId) ?? demand[0];
  return (
    <div className="space-y-4 animate-fade-up">
      <PageTitle title="Hotspot demand intelligence" subtitle="Where commuters are heading, how many vehicles each cluster needs, and why." action={<SimTag>Demand prediction prototype · rule-based</SimTag>} />
      <Callout tone="warn" title="Transparent scoring, not a trained model"><Brain size={14} className="inline mr-1" />Each hotspot's score is a weighted sum of six normalised features computed from the prototype's own data plus illustrative inputs (office headcount, metro exits). Weights are editable below and every contribution is shown. A production system would replace this with a model trained on real ridership.</Callout>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {demand.map((d, i) => (
          <button key={d.hotspot.id} onClick={() => setSelId(d.hotspot.id)} className={`card card-pad text-left transition hover:border-electric ${sel?.hotspot.id === d.hotspot.id ? 'border-electric ring-2 ring-electric/15' : ''}`}>
            <div className="flex items-start justify-between"><div><div className="text-[10px] font-bold text-slate-400">#{i + 1}</div><div className="font-display font-bold">{d.hotspot.name}</div></div><Badge tone={d.score > 60 ? 'red' : d.score > 40 ? 'amber' : 'blue'}>{d.score} score</Badge></div>
            <Progress value={d.score} className="mt-2" tone={d.score > 60 ? 'red' : d.score > 40 ? 'amber' : 'blue'} />
            <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px]"><div><div className="font-bold">{d.estimatedHourlyDemand}</div><div className="text-slate-500">est. pax/h</div></div><div><div className="font-bold">{d.activeBookings}</div><div className="text-slate-500">booking now</div></div><div><div className="font-bold">{d.recommendedVehicles}</div><div className="text-slate-500">vehicles</div></div></div>
          </button>
        ))}
      </div>
      {sel && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2" title={sel.hotspot.name} subtitle={sel.hotspot.description}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini k="Estimated demand" v={`${sel.estimatedHourlyDemand}/h`} sub="commuters this hour" />
              <Mini k="Bookings today" v={String(sel.bookingsToday)} sub={`${sel.activeBookings} active now`} />
              <Mini k="Recommended vehicles" v={String(sel.recommendedVehicles)} sub="for current demand" />
              <Mini k="Expected revenue" v={`${inr(sel.expectedRevenuePerHour)}/h`} sub="GBV at est. demand" />
              <Mini k="Avg occupancy" v={`${sel.avgOccupancyPct}%`} sub="completed trips" />
              <Mini k="Peak timings" v={sel.hotspot.shiftTimings.join(' · ')} sub="shift starts/ends" />
              <Mini k="Office headcount" v={sel.hotspot.officeHeadcount.toLocaleString('en-IN')} sub="illustrative" />
              <Mini k="Transit availability" v={`${Math.round(sel.hotspot.transitAvailability * 100)}%`} sub="1 − gap" />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><div className="label mb-1 flex items-center gap-1"><TrendingUp size={12} /> 5-day booking trend</div><Bars data={sel.trend} x="label" series={[{ key: 'bookings', name: 'Completed bookings', color: '#2563EB' }]} height={170} /></div>
              <div><div className="label mb-1 flex items-center gap-1"><Clock3 size={12} /> Predicted hourly demand profile</div><Lines data={sel.hourlyForecast.map((f) => ({ ...f, actual: sel.peakHours.find((p) => p.hour === f.hour)?.bookings ?? 0 }))} x="hour" series={[{ key: 'demand', name: 'Predicted (rule-based)', color: '#20C4D8' }, { key: 'actual', name: 'Observed bookings (all days)', color: '#2563EB', dashed: true }]} height={170} /></div>
            </div>
          </Card>
          <Card title="Score breakdown" subtitle="Feature value × weight = contribution">
            <ul className="space-y-2">
              {(Object.keys(sel.features) as (keyof DemandWeights)[]).map((k) => <li key={k}><div className="flex justify-between text-xs"><span>{FEATURE_LABEL[k]}</span><span className="font-mono">{(sel.features[k] * 100).toFixed(0)} × {weights[k].toFixed(2)} = <b>{sel.contributions[k]}</b></span></div><Progress value={sel.contributions[k]} max={40} height="h-1.5" className="mt-1" /></li>)}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-mist-200 pt-2 text-sm"><span className="font-semibold">Demand score</span><span className="font-display text-xl font-extrabold">{sel.score}</span></div>
            <div className="mt-2 text-[11px] text-slate-500"><Bus size={11} className="inline" /> Vehicles = ⌈max(est. demand, active bookings) ÷ (capacity × occupancy × trips/h)⌉</div>
          </Card>
        </div>
      )}
      {mode === 'admin' && (
        <Card title="Model weights" subtitle="Adjust and watch the ranking change instantly" action={<Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'admin.updateWeights', changes: DEFAULT_WEIGHTS })}>Reset</Button>}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(Object.keys(weights) as (keyof DemandWeights)[]).map((k) => <Slider key={k} label={FEATURE_LABEL[k]} value={weights[k]} min={0} max={1} step={0.05} onChange={(v) => dispatch({ type: 'admin.updateWeights', changes: { [k]: v } })} format={(v) => v.toFixed(2)} />)}</div>
        </Card>
      )}
    </div>
  );
}
const Mini = ({ k, v, sub }: { k: string; v: string; sub?: string }) => <div className="rounded-xl bg-mist-100 p-3"><div className="label">{k}</div><div className="mt-0.5 font-display text-lg font-extrabold">{v}</div>{sub && <div className="text-[11px] text-slate-500">{sub}</div>}</div>;
