import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Smartphone, Car, LayoutDashboard, TrainFront, Presentation, ArrowRight, ShieldCheck, Users, Timer, IndianRupee } from 'lucide-react';
import { useAppState, useDispatch } from '@/domain/store/hooks';
import { useSession } from '@/app/session';
import { Logo, Button, Input, Select, Toggle, Avatar, Badge, useToast } from '@/app/shared/ui';
import { ClockWidget } from '@/app/shared/ClockWidget';
import type { Role, User } from '@/domain/types';

const ROLES: { role: Role; title: string; blurb: string; icon: typeof Smartphone; path: string }[] = [
  { role: 'commuter', title: 'Commuter app', blurb: 'Book a shared seat from your metro station and board with a QR pass.', icon: Smartphone, path: '/commuter' },
  { role: 'driver', title: 'Driver app', blurb: 'Accept assignments, scan passengers, run trips and track earnings.', icon: Car, path: '/driver' },
  { role: 'admin', title: 'Operations admin', blurb: 'Live fleet, pooling engine, hotspot intelligence, finance and compliance.', icon: LayoutDashboard, path: '/admin' },
  { role: 'metro', title: 'Metro authority', blurb: 'Aggregated station analytics and ridership insight — no personal data.', icon: TrainFront, path: '/metro' },
];

export function LoginPage() {
  const users = useAppState((s) => s.users);
  const stations = useAppState((s) => s.stations);
  const drivers = useAppState((s) => s.drivers);
  const commuters = useAppState((s) => s.commuters);
  const vehicles = useAppState((s) => s.vehicles);
  const { login, session, logout } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const dispatch = useDispatch();
  const toast = useToast();
  const [role, setRole] = useState<Role | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', phone: '', gender: 'undisclosed' as User['gender'], homeStationId: 'st-byp', womenPriority: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (userId: string, r: Role) => { login({ userId, role: r }); const next = params.get('next'); nav(next && next.startsWith(`/${r === 'metro' ? 'metro' : r}`) ? next : ROLES.find((x) => x.role === r)!.path); };

  const register = async () => {
    setBusy(true); setError(null);
    const res = await dispatch({ type: 'commuter.register', ...form });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    const u = res.data as User;
    toast({ tone: 'success', title: `Welcome to GoMaxi, ${u.name.split(' ')[0]}!`, body: '₹200 demo wallet credit added.' });
    go(u.id, 'commuter');
  };

  const list = Object.values(users).filter((u) => u.role === role && !u.id.startsWith('usr-h')).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen hero-gradient text-white">
      <div className="mx-auto flex max-w-6xl flex-col px-5 py-6 lg:min-h-screen">
        <header className="flex items-center justify-between">
          <Logo light size={36} tagline />
          <div className="flex items-center gap-2">
            <ClockWidget light compact />
            <Link to="/demo" className="btn btn-sm bg-cyan text-navy hover:brightness-110 font-bold whitespace-nowrap"><Presentation size={14} /> <span className="hidden sm:inline">GoMaxi </span>Live Demo</Link>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-fade-up">
            <Badge tone="cyan" className="bg-cyan/15 text-cyan">Interactive prototype · Bengaluru pilot</Badge>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">Your Metro.<br />Your Last Mile.<br /><span className="text-cyan">Your Way.</span></h1>
            <p className="mt-5 max-w-lg text-base text-white/75">GoMaxi pools metro commuters heading to the same hotspot into shared Maxi Cabs and Tempo Travellers at fixed per-seat fares — using eligible vehicles during the hours they would otherwise sit idle.</p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[{ i: IndianRupee, k: '₹25–45', v: 'fixed per-seat fare' }, { i: Users, k: '80%', v: 'target occupancy' }, { i: Timer, k: '5 min', v: 'max wait timer' }, { i: ShieldCheck, k: 'QR', v: 'verified boarding' }].map(({ i: I, k, v }) => (
                <div key={k} className="rounded-2xl border border-white/10 bg-white/5 p-3"><I size={16} className="text-cyan" /><div className="mt-2 font-display text-xl font-extrabold">{k}</div><div className="text-[11px] text-white/60">{v}</div></div>
              ))}
            </div>
            <p className="mt-6 text-xs text-white/50">All payments, GPS positions, metro volumes and AI-style predictions in this prototype are simulated and clearly labelled. See the README for what is real and what is not.</p>
          </div>

          <div className="animate-fade-up rounded-3xl bg-white p-5 text-navy shadow-2xl sm:p-6" style={{ animationDelay: '80ms' }}>
            {!role ? (
              <>
                <h2 className="font-display text-xl font-extrabold">Choose how to enter</h2>
                <p className="mt-1 text-sm text-slate-500">Demo login — pick a role, then a sample account. Open several tabs to run commuter, driver and admin side by side; they share one live system.</p>
                <div className="mt-4 grid gap-2.5">
                  {ROLES.map(({ role: r, title, blurb, icon: I }) => (
                    <button key={r} onClick={() => setRole(r)} className="group flex items-center gap-3 rounded-2xl border border-mist-200 p-3.5 text-left transition hover:border-electric hover:bg-electric-50/40">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy text-cyan"><I size={20} /></span>
                      <span className="flex-1"><span className="block font-semibold">{title}</span><span className="block text-xs text-slate-500">{blurb}</span></span>
                      <ArrowRight size={16} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-electric" />
                    </button>
                  ))}
                </div>
                {session && <div className="mt-4 flex items-center justify-between rounded-xl bg-mist-100 px-3 py-2 text-xs"><span>Signed in as <b>{users[session.userId]?.name}</b> ({session.role})</span><div className="flex gap-2"><button className="font-semibold text-electric" onClick={() => nav(ROLES.find((x) => x.role === session.role)!.path)}>Continue</button><button className="text-slate-500" onClick={logout}>Sign out</button></div></div>}
              </>
            ) : (
              <>
                <button onClick={() => { setRole(null); setMode('login'); setError(null); }} className="text-xs font-semibold text-electric">← All roles</button>
                <h2 className="mt-2 font-display text-xl font-extrabold">{ROLES.find((x) => x.role === role)!.title}</h2>
                {role === 'commuter' && (
                  <div className="mt-3 inline-flex rounded-xl bg-mist-100 p-1 text-sm">
                    {(['login', 'register'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`rounded-lg px-3 py-1.5 font-semibold ${mode === m ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{m === 'login' ? 'Log in' : 'Register'}</button>)}
                  </div>
                )}
                {mode === 'register' && role === 'commuter' ? (
                  <div className="mt-4 space-y-3">
                    <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Asha Kumar" />
                    <Input label="Mobile number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98450 12345" inputMode="tel" />
                    <div className="grid grid-cols-2 gap-3">
                      <Select label="Gender (optional)" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as User['gender'] })}><option value="undisclosed">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select>
                      <Select label="Usual metro station" value={form.homeStationId} onChange={(e) => setForm({ ...form, homeStationId: e.target.value })}>{Object.values(stations).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
                    </div>
                    <div className="rounded-xl border border-mist-200 p-3"><Toggle checked={form.womenPriority} onChange={(v) => setForm({ ...form, womenPriority: v })} label="Women-priority seating by default" description="Front-row seats are held for passengers who opt in." /></div>
                    {error && <div className="text-sm text-coral">{error}</div>}
                    <Button className="w-full" size="lg" loading={busy} onClick={register}>Create account <ArrowRight size={16} /></Button>
                    <p className="text-[11px] text-slate-500">Demo only: no OTP is sent. Production would verify the number via OTP and store consent per the DPDP Act.</p>
                  </div>
                ) : (
                  <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {list.map((u) => {
                      const d = drivers[u.id];
                      const v = d?.vehicleId ? vehicles[d.vehicleId] : undefined;
                      return (
                        <button key={u.id} onClick={() => go(u.id, role)} className="flex w-full items-center gap-3 rounded-2xl border border-mist-200 p-3 text-left transition hover:border-electric hover:bg-electric-50/40">
                          <Avatar name={u.name} color={u.avatarColor} size={38} />
                          <span className="flex-1 min-w-0"><span className="block truncate font-semibold">{u.name}</span><span className="block text-xs text-slate-500">{d ? `${v?.id} · ${v?.registration} · ${d.availability}` : role === 'commuter' ? `${stations[commuters[u.id]?.homeStationId ?? 'st-byp']?.name ?? ''} · ${u.phone}` : u.email}</span></span>
                          <ArrowRight size={16} className="text-slate-400" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

