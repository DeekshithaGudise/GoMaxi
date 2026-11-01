import { useState } from 'react';
import { useAppState, useDispatch, useDerived } from '@/domain/store/hooks';
import { computeUnitEconomics, FINANCE_SCENARIOS, DEFAULT_FINANCE } from '@/domain/engine/finance';
import { financialActuals } from '@/domain/engine/analytics';
import { Card, PageTitle, Stat, Slider, Segmented, Callout, SimTag, Button, Badge } from '@/app/shared/ui';
import { Bars, Donut } from '@/app/shared/charts';
import { inr, inrCompact } from '@/domain/util';
import type { FinanceAssumptions } from '@/domain/types';

type Scn = keyof typeof FINANCE_SCENARIOS;
export function FinancePage() {
  const a = useAppState((s) => s.settings.finance);
  const dispatch = useDispatch();
  const actual = useDerived(financialActuals);
  const [scn, setScn] = useState<Scn | 'custom'>('base');
  const [tab, setTab] = useState<'model' | 'actuals'>('model');
  const u = computeUnitEconomics(a);
  const set = (changes: Partial<FinanceAssumptions>) => { setScn('custom'); dispatch({ type: 'admin.updateFinance', changes }); };
  const applyScenario = (k: Scn) => { setScn(k); const { label, blurb, ...vals } = FINANCE_SCENARIOS[k]; void label; void blurb; dispatch({ type: 'admin.updateFinance', changes: { ...DEFAULT_FINANCE, ...vals } }); };
  const compare = (Object.keys(FINANCE_SCENARIOS) as Scn[]).map((k) => { const { label, blurb, ...vals } = FINANCE_SCENARIOS[k]; void blurb; const e = computeUnitEconomics({ ...DEFAULT_FINANCE, ...vals }); return { label, gbv: Math.round(e.gbvPerMonth), commission: Math.round(e.commissionPerMonth), contribution: Math.round(e.contributionMarginPerMonth), ebitda: Math.round(e.ebitdaPerMonth) }; });
  return (
    <div className="space-y-4 animate-fade-up">
      <PageTitle title="Financial analytics" subtitle="Interactive unit economics (illustrative assumptions) alongside actuals computed from completed trips in this prototype." action={<Segmented value={tab} onChange={setTab} options={[{ value: 'model', label: 'Unit economics model' }, { value: 'actuals', label: 'Prototype actuals' }]} />} />
      {tab === 'model' ? (<>
        <Callout tone="warn" title="Illustrative, not validated">Every input below is an assumption for planning. Nothing here is audited financial data. Change any slider and all outputs recompute.</Callout>
        <div className="flex flex-wrap items-center gap-2"><span className="label">Scenario</span>{(Object.keys(FINANCE_SCENARIOS) as Scn[]).map((k) => <Button key={k} size="sm" variant={scn === k ? 'primary' : 'secondary'} onClick={() => applyScenario(k)}>{FINANCE_SCENARIOS[k].label}</Button>)}{scn === 'custom' && <Badge tone="amber">Custom</Badge>}<span className="text-xs text-slate-500">{scn !== 'custom' ? FINANCE_SCENARIOS[scn].blurb : 'Your own assumptions'}</span></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="GBV per trip" value={inr(u.gbvPerTrip)} sub={`${u.seatsPerTrip.toFixed(1)} seats × ${inr(a.averageFare)}`} />
          <Stat label="Commission per trip" value={inr(u.commissionPerTrip)} sub={`driver gets ${inr(u.driverPayoutPerTrip)}`} tone="blue" />
          <Stat label="Revenue / vehicle / day" value={inr(u.revenuePerVehiclePerDay)} sub={`GBV ${inr(u.gbvPerVehiclePerDay)} · ${u.tripsPerVehiclePerDay.toFixed(1)} trips`} tone="cyan" />
          <Stat label="Revenue / station / day" value={inr(u.revenuePerStationPerDay)} sub={`GBV ${inr(u.gbvPerStationPerDay)}`} />
          <Stat label="Monthly GBV" value={inrCompact(u.gbvPerMonth)} sub={`${Math.round(u.tripsPerMonth).toLocaleString('en-IN')} trips`} />
          <Stat label="Monthly net revenue" value={inrCompact(u.netRevenuePerMonth)} sub="commission + B2B − incentives − PG fees" tone="blue" />
          <Stat label="Operating expenses" value={inrCompact(u.variableOpexPerMonth + u.fixedCostPerMonth + u.maintenancePerMonth)} sub={`${inrCompact(u.variableOpexPerMonth)} variable + ${inrCompact(u.fixedCostPerMonth)} fixed`} tone="amber" />
          <Stat label="Contribution margin" value={inrCompact(u.contributionMarginPerMonth)} sub={`${u.contributionMarginPct.toFixed(1)}% of GBV`} tone={u.contributionMarginPerMonth >= 0 ? 'green' : 'red'} />
          <Stat label="Break-even trips" value={isFinite(u.breakEvenTripsPerMonth) ? Math.ceil(u.breakEvenTripsPerMonth).toLocaleString('en-IN') : '∞'} sub={isFinite(u.breakEvenTripsPerVehiclePerDay) ? `${u.breakEvenTripsPerVehiclePerDay.toFixed(1)} per vehicle per day` : 'take rate too low'} />
          <Stat label="Break-even occupancy" value={isFinite(u.breakEvenOccupancyPct) ? `${u.breakEvenOccupancyPct.toFixed(0)}%` : '∞'} sub={`at ${u.tripsPerVehiclePerDay.toFixed(1)} trips/vehicle/day`} tone={u.breakEvenOccupancyPct <= a.occupancyPct ? 'green' : 'red'} />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2" title="Adjustable assumptions">
            <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
              <Slider label="Vehicles" value={a.vehicles} min={1} max={100} onChange={(v) => set({ vehicles: v })} />
              <Slider label="Trips per hour per vehicle" value={a.tripsPerHour} min={0.5} max={4} step={0.25} onChange={(v) => set({ tripsPerHour: v })} />
              <Slider label="Operating hours per day (GoMaxi windows)" value={a.operatingHours} min={1} max={12} step={0.5} onChange={(v) => set({ operatingHours: v })} format={(v) => `${v} h`} />
              <Slider label="Occupancy" value={a.occupancyPct} min={30} max={100} step={5} onChange={(v) => set({ occupancyPct: v })} format={(v) => `${v}%`} />
              <Slider label="Average fare" value={a.averageFare} min={15} max={60} onChange={(v) => set({ averageFare: v })} format={(v) => inr(v)} />
              <Slider label="Platform commission" value={a.commissionPct} min={5} max={30} onChange={(v) => set({ commissionPct: v })} format={(v) => `${v}%`} />
              <Slider label="Driver incentives (% of GBV)" value={a.driverIncentivePct} min={0} max={10} step={0.5} onChange={(v) => set({ driverIncentivePct: v })} format={(v) => `${v}%`} />
              <Slider label="Payment processing fee" value={a.paymentFeePct} min={0} max={3} step={0.1} onChange={(v) => set({ paymentFeePct: v })} format={(v) => `${v}%`} />
              <Slider label="Opex per vehicle per day" value={a.opexPerVehiclePerDay} min={0} max={1500} step={25} onChange={(v) => set({ opexPerVehiclePerDay: v })} format={(v) => inr(v)} hint="Bay staff, support, insurance top-up, SIM/telematics" />
              <Slider label="Fixed monthly cost" value={a.fixedMonthlyCost} min={0} max={3000000} step={25000} onChange={(v) => set({ fixedMonthlyCost: v })} format={(v) => inrCompact(v)} hint="Team, tech, office, compliance" />
              <Slider label="Maintenance borne by GoMaxi per trip" value={a.maintenancePerTrip} min={0} max={50} onChange={(v) => set({ maintenancePerTrip: v })} format={(v) => inr(v)} />
              <Slider label="Corporate contracts (monthly)" value={a.corporateContractsMonthly} min={0} max={2000000} step={20000} onChange={(v) => set({ corporateContractsMonthly: v })} format={(v) => inrCompact(v)} />
              <Slider label="Stations served" value={a.stations} min={1} max={30} onChange={(v) => set({ stations: v })} />
              <Slider label="Working days per month" value={a.workingDaysPerMonth} min={20} max={30} onChange={(v) => set({ workingDaysPerMonth: v })} />
            </div>
          </Card>
          <div className="space-y-4">
            <Card title="Fare split per trip" subtitle={`${u.seatsPerTrip.toFixed(1)} seats × ${inr(a.averageFare)}`}><Donut data={[{ name: 'Driver payout', value: u.driverPayoutPerTrip, color: '#2563EB' }, { name: 'GoMaxi commission', value: u.commissionPerTrip, color: '#20C4D8' }]} height={200} format={(v) => inr(v)} center={<div className="font-display text-lg font-extrabold">{inr(u.gbvPerTrip)}</div>} /></Card>
            <Card title="Monthly P&L bridge" subtitle="Illustrative">
              <ul className="text-sm">{[['Gross booking value', u.gbvPerMonth], ['− Driver payouts', -(u.gbvPerMonth - u.commissionPerMonth)], ['= Platform commission', u.commissionPerMonth], ['+ Corporate contracts', u.corporateRevenuePerMonth], ['− Driver incentives', -u.incentivesPerMonth], ['− Payment fees', -u.paymentFeesPerMonth], ['= Net revenue', u.netRevenuePerMonth], ['− Variable opex', -u.variableOpexPerMonth], ['− Maintenance', -u.maintenancePerMonth], ['= Contribution margin', u.contributionMarginPerMonth], ['− Fixed costs', -u.fixedCostPerMonth], ['= EBITDA (illustrative)', u.ebitdaPerMonth]].map(([k, v], i) => <li key={i} className={`flex justify-between py-1 ${String(k).startsWith('=') ? 'border-t border-mist-200 font-semibold' : 'text-slate-600'}`}><span>{k as string}</span><span className={`font-mono ${(v as number) < 0 && String(k).startsWith('=') ? 'text-coral' : ''}`}>{inrCompact(v as number)}</span></li>)}</ul>
            </Card>
          </div>
        </div>
        <Card title="Scenario comparison (monthly)" subtitle="Conservative · Base · Optimistic at their preset assumptions"><Bars data={compare} x="label" series={[{ key: 'gbv', name: 'GBV' }, { key: 'commission', name: 'Commission' }, { key: 'contribution', name: 'Contribution' }, { key: 'ebitda', name: 'EBITDA' }]} height={240} format={(v) => inrCompact(v)} /></Card>
      </>) : (<>
        <Callout tone="info" title="Computed from entities">These figures sum the completed trips, bookings and payments in the prototype (5-day sample history plus everything created live). They match the operations overview and driver earnings exactly. <SimTag>Sample + live</SimTag></Callout>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><Stat label="Gross booking value" value={inrCompact(actual.gbv)} /><Stat label="Platform commission" value={inrCompact(actual.commission)} tone="blue" /><Stat label="Driver payouts" value={inrCompact(actual.payout)} sub={`+ ${inr(actual.incentives)} incentives`} tone="cyan" /><Stat label="Average fare" value={inr(actual.avgFare)} /><Stat label="Average occupancy" value={`${actual.avgOccupancy}%`} tone="green" /><Stat label="Refunds / failed" value={inr(actual.refunds)} sub={`${actual.failedPayments} failed payments`} tone="amber" /></div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Revenue per vehicle" pad={false}><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="px-4 py-2">Vehicle</th><th className="px-2 py-2">Trips</th><th className="px-2 py-2">GBV</th><th className="px-2 py-2">Commission</th><th className="px-2 py-2">Payout</th><th className="px-2 py-2">Occ.</th></tr></thead><tbody>{actual.byVehicle.map((r) => <tr key={r.vehicle.id} className="border-t border-mist-200"><td className="px-4 py-2 font-semibold">{r.vehicle.id}</td><td className="px-2 py-2">{r.trips}</td><td className="px-2 py-2">{inr(r.gbv)}</td><td className="px-2 py-2">{inr(r.commission)}</td><td className="px-2 py-2">{inr(r.payout)}</td><td className="px-2 py-2">{r.occupancy}%</td></tr>)}</tbody></table></Card>
          <Card title="Revenue per station" pad={false}><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="px-4 py-2">Station</th><th className="px-2 py-2">Trips</th><th className="px-2 py-2">Passengers</th><th className="px-2 py-2">GBV</th><th className="px-2 py-2">Commission</th></tr></thead><tbody>{actual.byStation.map((r) => <tr key={r.station.id} className="border-t border-mist-200"><td className="px-4 py-2 font-semibold">{r.station.name}</td><td className="px-2 py-2">{r.trips}</td><td className="px-2 py-2">{r.passengers}</td><td className="px-2 py-2">{inr(r.gbv)}</td><td className="px-2 py-2">{inr(r.commission)}</td></tr>)}</tbody></table></Card>
          <Card title="Daily GBV split"><Bars data={actual.days} x="label" series={[{ key: 'payout', name: 'Driver payout' }, { key: 'commission', name: 'Commission', color: '#20C4D8' }]} stacked height={220} format={(v) => inrCompact(v)} /></Card>
          <Card title="Payment methods (simulated gateway)"><Donut data={actual.byMethod.map((m) => ({ name: m.method.toUpperCase(), value: m.amount }))} height={220} format={(v) => inr(v)} /></Card>
        </div>
      </>)}
    </div>
  );
}
