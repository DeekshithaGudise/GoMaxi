import { useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import checklist from '@/domain/seed/compliance-checklist.json';
import { useAppState } from '@/domain/store/hooks';
import { Card, PageTitle, Badge, Segmented, Callout, StatusBadge, Stat } from '@/app/shared/ui';
import { vehicleEligibility, driverEligibility, isoDate } from '@/domain/engine/compliance';

interface Item { id: string; category: string; requirement: string; authority: string; classification: 'verified' | 'legal_interpretation' | 'assumption' | 'risk'; sourceUrl: string | null; notes: string; blocksDispatch: boolean }
const items = checklist as Item[];
const CL: Record<Item['classification'], { label: string; tone: 'green' | 'blue' | 'amber' | 'red' }> = { verified: { label: 'Verified requirement', tone: 'green' }, legal_interpretation: { label: 'Needs legal interpretation', tone: 'blue' }, assumption: { label: 'Assumption — confirm', tone: 'amber' }, risk: { label: 'Regulatory risk', tone: 'red' } };

export function CompliancePage({ mode }: { mode: 'admin' | 'metro' }) {
  const state = useAppState((s) => s);
  const [cat, setCat] = useState<'all' | string>('all');
  const cats = ['all', ...Array.from(new Set(items.map((i) => i.category)))];
  const list = items.filter((i) => cat === 'all' || i.category === cat);
  const today = isoDate(state.clock.simTime);
  const vehicles = Object.values(state.vehicles); const drivers = Object.values(state.drivers);
  const vOk = vehicles.filter((v) => vehicleEligibility(v).eligible).length, dOk = drivers.filter((d) => driverEligibility(d, today).eligible).length;
  return (
    <div className="space-y-4 animate-fade-up">
      <PageTitle title="Regulatory compliance" subtitle="Checklist distilled from docs/REGULATORY_RESEARCH.md (Karnataka / MoRTH). Items marked “blocks dispatch” are enforced by the engine per vehicle and driver." />
      <Callout tone="danger" title="GoMaxi is not authorised to operate yet"><ShieldCheck size={14} className="inline mr-1" />Key open questions: (1) per-seat pooled fares on fixed corridors may be treated as stage carriage rather than contract carriage for maxi cabs; (2) educational-institution buses cannot carry fare-paying passengers without re-classification; (3) a Karnataka aggregator licence is required and its coverage of 12-seat maxi cabs is unconfirmed. The prototype models compliance gates; it does not claim approvals.</Callout>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Checklist items" value={items.length} sub={`${items.filter((i) => i.blocksDispatch).length} enforced at dispatch`} /><Stat label="Verified requirements" value={items.filter((i) => i.classification === 'verified').length} tone="green" sub="official source found" /><Stat label="Vehicles dispatch-ready" value={`${vOk}/${vehicles.length}`} tone={vOk === vehicles.length ? 'green' : 'amber'} sub="permit · insurance · fitness · PUC · tax · RC" /><Stat label="Drivers dispatch-ready" value={`${dOk}/${drivers.length}`} tone={dOk === drivers.length ? 'green' : 'amber'} sub="DL · PSV badge · police · medical · training" /></div>
      <div className="flex flex-wrap items-center gap-2"><Segmented value={cat} onChange={setCat} options={cats.map((c) => ({ value: c, label: c === 'all' ? 'All' : c.replace('-', ' ') }))} /><div className="flex flex-wrap gap-1.5 text-xs">{(Object.keys(CL) as Item['classification'][]).map((k) => <Badge key={k} tone={CL[k].tone}>{CL[k].label}</Badge>)}</div></div>
      <Card pad={false}>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="px-4 py-2">Requirement</th><th className="px-2 py-2">Authority</th><th className="px-2 py-2">Classification</th><th className="px-2 py-2">Dispatch gate</th><th className="px-2 py-2">Source</th></tr></thead>
          <tbody>{list.map((i) => <tr key={i.id} className="border-t border-mist-200 align-top"><td className="px-4 py-2"><div className="font-semibold">{i.requirement}</div><div className="mt-0.5 text-xs text-slate-500">{i.notes}</div><Badge tone="slate" className="mt-1">{i.category}</Badge></td><td className="px-2 py-2 text-xs">{i.authority}</td><td className="px-2 py-2"><Badge tone={CL[i.classification].tone}>{CL[i.classification].label}</Badge></td><td className="px-2 py-2">{i.blocksDispatch ? <Badge tone="navy">Blocks dispatch</Badge> : <span className="text-xs text-slate-400">Platform-level</span>}</td><td className="px-2 py-2">{i.sourceUrl ? <a href={i.sourceUrl} target="_blank" rel="noreferrer" className="text-electric inline-flex items-center gap-1 text-xs">link <ExternalLink size={11} /></a> : <span className="text-xs text-slate-400">—</span>}</td></tr>)}</tbody></table></div>
      </Card>
      {mode === 'admin' && (
        <Card title="Per-vehicle gate status" subtitle="Live view of the engine's eligibility check" pad={false}>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="px-4 py-2">Vehicle</th>{['registration', 'contract_carriage_permit', 'insurance', 'fitness', 'puc', 'road_tax', 'vlt_panic', 'speed_governor'].map((k) => <th key={k} className="px-2 py-2">{k.replace(/_/g, ' ')}</th>)}<th className="px-2 py-2">Driver</th><th className="px-2 py-2">Result</th></tr></thead>
            <tbody>{vehicles.map((v) => { const d = v.driverId ? state.drivers[v.driverId] : undefined; const de = d ? driverEligibility(d, today) : { eligible: false, reasons: ['no driver'] }; const ve = vehicleEligibility(v); return <tr key={v.id} className="border-t border-mist-200"><td className="px-4 py-2 font-semibold">{v.id}</td>{['registration', 'contract_carriage_permit', 'insurance', 'fitness', 'puc', 'road_tax', 'vlt_panic', 'speed_governor'].map((k) => <td key={k} className="px-2 py-2"><StatusBadge status={v.compliance.find((c) => c.key === k)?.status ?? 'pending'} /></td>)}<td className="px-2 py-2">{de.eligible ? <Badge tone="green">ok</Badge> : <Badge tone="red" className="max-w-[160px] whitespace-normal">{de.reasons.join('; ')}</Badge>}</td><td className="px-2 py-2">{ve.eligible && de.eligible ? <Badge tone="green">Dispatchable</Badge> : <Badge tone="red">Blocked</Badge>}</td></tr>; })}</tbody></table></div>
        </Card>
      )}
      <div className="text-xs text-slate-500">Full research with sources and classifications: <code>docs/REGULATORY_RESEARCH.md</code>. Advisory items (VLT/panic button, speed governor) are tracked but not yet hard gates in the prototype; Karnataka treats AIS-140 as a fitness precondition, so production should promote them.</div>
    </div>
  );
}
