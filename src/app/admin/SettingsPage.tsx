import { useState } from 'react';
import { useAppState, useDispatch } from '@/domain/store/hooks';
import { Card, PageTitle, Slider, Select, Toggle, Button, Callout, Modal, useToast, Input } from '@/app/shared/ui';
import { hardReset } from '@/domain/store/store';
import type { DispatchSettings } from '@/domain/types';

export function SettingsPage() {
  const s = useAppState((st) => st.settings.dispatch);
  const dispatch = useDispatch();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const set = (changes: Partial<DispatchSettings>) => dispatch({ type: 'admin.updateDispatch', changes });
  const threshold = Math.ceil(s.defaultCapacity * s.targetOccupancyPct / 100);
  return (
    <div className="space-y-4 animate-fade-up">
      <PageTitle title="Settings" subtitle="Dispatch parameters apply to every new pooling group immediately. All apps and tabs see the change." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Dispatch parameters" subtitle={`Current threshold: ${threshold} of ${s.defaultCapacity} seats`}>
          <div className="space-y-4">
            <Slider label="Default vehicle capacity" value={s.defaultCapacity} min={6} max={20} onChange={(v) => set({ defaultCapacity: v })} format={(v) => `${v} seats`} hint="Per-vehicle capacity overrides this when a vehicle is assigned." />
            <Slider label="Target occupancy" value={s.targetOccupancyPct} min={40} max={100} step={5} onChange={(v) => set({ targetOccupancyPct: v })} format={(v) => `${v}%`} hint={`Dispatch is initiated when ⌈capacity × target⌉ = ${threshold} passengers have booked.`} />
            <Slider label="Maximum waiting time" value={s.maxWaitMin} min={1} max={15} onChange={(v) => set({ maxWaitMin: v })} format={(v) => `${v} min`} hint="The group departs when this timer expires, even if under-filled (subject to the policy below)." />
            <Slider label="Boarding grace after dispatch initiated" value={s.boardingGraceMin} min={0.5} max={5} step={0.5} onChange={(v) => set({ boardingGraceMin: v })} format={(v) => `${v} min`} />
            <Slider label="Minimum viable passengers (under-filled floor)" value={s.minViablePassengers} min={1} max={8} onChange={(v) => set({ minViablePassengers: v })} />
            <Select label="Under-filled policy after timeout" value={s.underfilledPolicy} onChange={(e) => set({ underfilledPolicy: e.target.value as DispatchSettings['underfilledPolicy'] })}><option value="dispatch_if_viable">Dispatch if ≥ floor; else offer next departure (max 2), then dispatch anyway (no-strand rule)</option><option value="rollover">Dispatch if ≥ floor; else offer next departure (max 2), then cancel with full refund</option><option value="cancel_refund">Dispatch if ≥ floor; else cancel immediately with full refund</option></Select>
            <Slider label="Booking expiry (no vehicle found)" value={s.bookingExpiryMin} min={5} max={60} step={5} onChange={(v) => set({ bookingExpiryMin: v })} format={(v) => `${v} min`} />
            <Toggle checked={s.allowDriverEarlyDeparture} onChange={(v) => set({ allowDriverEarlyDeparture: v })} label="Allow drivers to start below threshold" description="When off, drivers can only start once the threshold or timer is reached." />
            <Input label="Safe-drop protocol starts at" type="time" value={s.nightSafeDropFrom} onChange={(e) => set({ nightSafeDropFrom: e.target.value })} />
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Data" subtitle="The prototype persists to this browser (localStorage) and syncs across open tabs.">
            <Callout tone="info">One tab acts as the engine “server” (leader); other tabs forward commands to it. Closing the leader hands over automatically.</Callout>
            <div className="mt-3 flex gap-2"><Button variant="danger" onClick={() => setConfirm(true)}>Reset all data to seed</Button></div>
          </Card>
          <Card title="Integration readiness" subtitle="What becomes real in production">
            <ul className="space-y-1.5 text-sm text-slate-600">
              <li>• <b>Payments:</b> Razorpay orders/capture/refund behind <code>processPayment()</code>.</li>
              <li>• <b>Telematics:</b> AIS-140 VLT feed replaces route interpolation in <code>advanceTrips()</code>.</li>
              <li>• <b>Metro volumes:</b> BMRCL gate-exit counts replace the illustrative station assumptions.</li>
              <li>• <b>Backend:</b> the command API maps 1:1 to Postgres tables in <code>supabase/schema.sql</code>.</li>
            </ul>
          </Card>
        </div>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Reset all data?" footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" onClick={async () => { await dispatch({ type: 'data.resetAll' }); hardReset(); setConfirm(false); toast({ tone: 'success', title: 'Data reset to seed' }); }}>Reset</Button></>}><p className="text-sm text-slate-600">All bookings, trips, payments and alerts created in this browser are removed and the seed data is restored. Sample history is regenerated.</p></Modal>
    </div>
  );
}
