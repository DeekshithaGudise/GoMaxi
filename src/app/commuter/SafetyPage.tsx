import { useState } from 'react';
import { Siren, UserPlus, Trash2, ShieldCheck, Wallet } from 'lucide-react';
import { useDispatch, useAppState } from '@/domain/store/hooks';
import { useCommuter } from './useCommuter';
import { Card, Button, Input, Toggle, Callout, Modal, useToast, Badge, Select } from '@/app/shared/ui';
import { inr } from '@/domain/util';

export function SafetyPage() {
  const { user, commuter, active, userId } = useCommuter();
  const stations = useAppState((s) => s.stations);
  const settings = useAppState((s) => s.settings.dispatch);
  const dispatch = useDispatch();
  const toast = useToast();
  const [contact, setContact] = useState({ name: '', phone: '', relation: 'Family' });
  const [sos, setSos] = useState(false);
  const addContact = async () => { if (!contact.name || !contact.phone) return; await dispatch({ type: 'commuter.update', commuterId: userId, changes: { emergencyContacts: [...commuter.emergencyContacts, contact] } }); setContact({ name: '', phone: '', relation: 'Family' }); toast({ tone: 'success', title: 'Emergency contact added' }); };
  const removeContact = (i: number) => dispatch({ type: 'commuter.update', commuterId: userId, changes: { emergencyContacts: commuter.emergencyContacts.filter((_, j) => j !== i) } });
  const raise = async () => { await dispatch({ type: 'safety.sos', userId, bookingId: active?.id, tripId: active?.tripId }); setSos(false); toast({ tone: 'danger', title: 'SOS sent to safety desk (simulated)' }); };
  return (
    <div className="animate-fade-up space-y-4">
      <h1 className="font-display text-xl font-extrabold">Safety & profile</h1>
      <Card className="bg-navy text-white hero-gradient">
        <div className="flex items-center gap-3"><Siren size={22} className="text-cyan" /><div className="flex-1"><div className="font-display font-extrabold">Emergency SOS</div><div className="text-xs text-white/70">Alerts the GoMaxi safety desk and your contacts with your live location.</div></div><Button variant="danger" onClick={() => setSos(true)}>SOS</Button></div>
      </Card>
      <Card title="Emergency contacts" subtitle="Notified (simulated) when you press SOS or share a trip">
        {commuter.emergencyContacts.length === 0 && <div className="text-sm text-slate-500">No contacts yet.</div>}
        <ul className="space-y-2">{commuter.emergencyContacts.map((c, i) => <li key={i} className="flex items-center justify-between rounded-xl bg-mist-100 px-3 py-2 text-sm"><span><b>{c.name}</b> · {c.phone} <Badge tone="slate" className="ml-1">{c.relation}</Badge></span><button onClick={() => removeContact(i)} className="text-slate-400 hover:text-coral" aria-label="Remove"><Trash2 size={16} /></button></li>)}</ul>
        <div className="mt-3 grid grid-cols-2 gap-2"><Input placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /><Input placeholder="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} inputMode="tel" /><Select value={contact.relation} onChange={(e) => setContact({ ...contact, relation: e.target.value })}><option>Family</option><option>Friend</option><option>Colleague</option></Select><Button variant="secondary" onClick={addContact}><UserPlus size={16} /> Add</Button></div>
      </Card>
      <Card title="Preferences">
        <Toggle checked={commuter.womenPriorityDefault} onChange={(v) => dispatch({ type: 'commuter.update', commuterId: userId, changes: { womenPriorityDefault: v } })} label="Women-priority seating by default" description="Applied to every new booking; you can change it per ride." />
        <div className="mt-3"><Select label="Usual metro station" value={commuter.homeStationId} onChange={(e) => dispatch({ type: 'commuter.update', commuterId: userId, changes: { homeStationId: e.target.value } })}>{Object.values(stations).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
      </Card>
      <Card title="Account">
        <div className="text-sm"><b>{user.name}</b> · {user.phone}</div>
        <div className="mt-2 flex items-center justify-between rounded-xl bg-electric-50 px-3 py-2 text-sm"><span className="flex items-center gap-2"><Wallet size={16} className="text-electric" /> Wallet balance (simulated)</span><b>{inr(commuter.walletBalance)}</b></div>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => dispatch({ type: 'commuter.update', commuterId: userId, changes: { walletBalance: commuter.walletBalance + 200 } }).then(() => toast({ tone: 'success', title: '₹200 added to wallet (simulated top-up)' }))}>Top up ₹200</Button>
      </Card>
      <Callout tone="info" title="Passenger protection policy"><ShieldCheck size={14} className="inline mr-1" />Verified drivers · live trip sharing · route-deviation monitoring · no isolated drops after {settings.nightSafeDropFrom} · incident reporting with follow-up. Personal data is used only to run your trip (see privacy notes in README).</Callout>
      <Modal open={sos} onClose={() => setSos(false)} title="Send SOS?" footer={<><Button variant="secondary" onClick={() => setSos(false)}>Cancel</Button><Button variant="danger" onClick={raise}>Send SOS</Button></>}><p className="text-sm text-slate-600">Simulated escalation only — no real emergency service is contacted in this prototype.</p></Modal>
    </div>
  );
}
