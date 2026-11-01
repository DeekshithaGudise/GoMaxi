import { useState } from 'react';
import { useDerived, useAppState } from '@/domain/store/hooks';
import { fleetUtilisation } from '@/domain/engine/analytics';
import { Card, PageTitle, Stat, Callout, SimTag, Badge } from '@/app/shared/ui';
import { Bars } from '@/app/shared/charts';
import { inr } from '@/domain/util';

const COLORS: Record<string, string> = { school_commitment: '#64748B', gomaxi_feeder: '#2563EB', anchor_route: '#20C4D8', idle: '#D2DBE8', maintenance: '#F59E0B' };
const LABEL: Record<string, string> = { school_commitment: 'Existing commitment', gomaxi_feeder: 'GoMaxi feeder', anchor_route: 'Anchor route', idle: 'Idle', maintenance: 'Maintenance' };
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h + m / 60; };

export function UtilisationPage() {
  const u = useDerived(fleetUtilisation);
  const state = useAppState((s) => s);
  const [sel, setSel] = useState(u.rows[0]?.vehicle.id);
  const row = u.rows.find((r) => r.vehicle.id === sel) ?? u.rows[0];
  return (
    <div className="space-y-4 animate-fade-up">
      <PageTitle title="Vehicle utilisation" subtitle="The asset-light thesis: eligible vehicles earn during the hours they would otherwise sit idle." action={<SimTag>Illustrative operating windows</SimTag>} />
      <Callout tone="warn" title="Operating windows require verification per operator">Schedules below are illustrative. School-commitment vehicles must hold the right permit for fare-paying passengers before any GoMaxi window is activated — see Compliance.</Callout>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Available vehicle-hours / day" value={u.totals.available} sub="06:30–20:30 × fleet" />
        <Stat label="Existing commitments" value={u.totals.committed} sub="school / corporate runs" />
        <Stat label="GoMaxi allocated hours" value={u.totals.gomaxi} sub="feeder + anchor routes" tone="blue" />
        <Stat label="Idle hours" value={u.totals.idle} sub={`+ ${u.totals.maintenance} h maintenance`} tone="amber" />
        <Stat label="Utilisation with GoMaxi" value={`${u.totals.utilisationPct}%`} sub={`vs ${u.totals.baselinePct}% baseline`} tone="green" />
        <Stat label="Revenue-generating hours" value={(u.totals.committed + u.totals.gomaxi).toFixed(1)} sub="per day across fleet" tone="cyan" />
      </div>
      <Card title="Daily timeline by vehicle" subtitle="Click a row to inspect" pad={false}>
        <div className="px-4 pt-3 flex flex-wrap gap-3 text-xs">{Object.entries(LABEL).map(([k, l]) => <span key={k} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[k] }} />{l}</span>)}</div>
        <div className="overflow-x-auto p-4"><div className="min-w-[640px] space-y-1.5">
          <div className="ml-28 flex justify-between text-[10px] text-slate-400">{['06:30', '08:30', '10:30', '12:30', '14:30', '16:30', '18:30', '20:30'].map((t) => <span key={t}>{t}</span>)}</div>
          {u.rows.map((r) => <button key={r.vehicle.id} onClick={() => setSel(r.vehicle.id)} className={`flex w-full items-center gap-2 rounded-lg p-1 text-left ${sel === r.vehicle.id ? 'bg-electric-50' : 'hover:bg-mist-50'}`}><div className="w-24 shrink-0 text-xs"><div className="font-semibold">{r.vehicle.id}</div><div className="text-slate-500">{r.utilisationPct}% util</div></div><div className="flex h-7 flex-1 overflow-hidden rounded-md">{r.blocks.map((b, i) => <div key={i} title={`${b.start}–${b.end} ${b.label}`} style={{ width: `${((hm(b.end) - hm(b.start)) / 14) * 100}%`, background: COLORS[b.kind] }} className="flex items-center justify-center text-[9px] font-semibold text-white">{hm(b.end) - hm(b.start) >= 2 ? LABEL[b.kind] : ''}</div>)}</div></button>)}
        </div></div>
      </Card>
      {row && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2" title={`${row.vehicle.id} · ${row.vehicle.registration}`} subtitle={`${state.operators[row.vehicle.operatorId].name} · ${row.vehicle.model}`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><M k="Window" v={`${row.totalWindow} h`} /><M k="Committed" v={`${row.committed} h`} /><M k="GoMaxi" v={`${row.gomaxi} h`} /><M k="Idle" v={`${row.idle} h`} /><M k="Baseline utilisation" v={`${row.baselineUtilisationPct}%`} /><M k="With GoMaxi" v={`${row.utilisationPct}%`} /><M k="Trips today" v={`${row.tripsToday} · ${inr(row.revenueToday)}`} /><M k="Lifetime (prototype)" v={`${row.lifetimeTrips} trips · ${inr(row.lifetimeGbv)}`} /></div>
            <ul className="mt-4 space-y-1.5">{row.blocks.map((b, i) => <li key={i} className="flex items-center gap-3 text-sm"><span className="w-28 font-mono text-xs text-slate-500">{b.start}–{b.end}</span><span className="h-3 w-3 rounded-sm" style={{ background: COLORS[b.kind] }} /><span className="flex-1">{b.label}</span><Badge tone={b.kind === 'gomaxi_feeder' || b.kind === 'anchor_route' ? 'blue' : b.kind === 'school_commitment' ? 'slate' : 'amber'}>{(hm(b.end) - hm(b.start)).toFixed(1)} h</Badge></li>)}</ul>
            <div className="mt-3 text-xs text-slate-500">{state.operators[row.vehicle.operatorId].note}</div>
          </Card>
          <Card title="Hours per vehicle" subtitle="Committed vs GoMaxi vs idle"><Bars data={u.rows.map((r) => ({ v: r.vehicle.id.replace('GM-', ''), committed: r.committed, gomaxi: r.gomaxi, idle: r.idle }))} x="v" series={[{ key: 'committed', name: 'Committed', color: '#64748B' }, { key: 'gomaxi', name: 'GoMaxi', color: '#2563EB' }, { key: 'idle', name: 'Idle', color: '#D2DBE8' }]} stacked height={300} /></Card>
        </div>
      )}
    </div>
  );
}
const M = ({ k, v }: { k: string; v: string }) => <div className="rounded-xl bg-mist-100 p-3"><div className="label">{k}</div><div className="mt-0.5 font-display text-base font-extrabold">{v}</div></div>;
