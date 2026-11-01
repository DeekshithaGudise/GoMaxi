import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Presentation, Smartphone, Car, LayoutDashboard, TrainFront, Layers, RotateCcw, ExternalLink } from 'lucide-react';
import { Logo, Button, Callout, Badge } from '@/app/shared/ui';
import { useDispatch } from '@/domain/store/hooks';
import { hardReset } from '@/domain/store/store';

const base = () => `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`;
const openTab = (path: string) => window.open(`${base()}${path}`, '_blank', 'noopener');

/** One-click launch pad for demos: every button logs you straight into the right app. */
export default function LaunchPage() {
  const dispatch = useDispatch();
  const [resetting, setResetting] = useState(false);
  const reset = async () => { setResetting(true); await dispatch({ type: 'data.resetAll' }); hardReset(); setResetting(false); };
  const tiles = [
    { to: '/demo', icon: Presentation, title: 'Judge demo', body: '6-step guided presentation, 3–5 minutes. Start here for a pitch.', tone: 'bg-cyan text-navy' },
    { to: '/login?as=usr-c01', icon: Smartphone, title: 'Commuter app', body: 'Logged in as Ananya Rao. Book a seat and get a QR pass.', tone: 'bg-electric text-white' },
    { to: '/login?as=usr-d01', icon: Car, title: 'Driver app', body: 'Logged in as Suresh Babu (GM-101). Accept, scan, start and end trips.', tone: 'bg-navy text-white' },
    { to: '/login?as=usr-admin', icon: LayoutDashboard, title: 'Operations admin', body: 'Live fleet, pooling engine, simulation, finance, compliance.', tone: 'bg-go text-white' },
    { to: '/login?as=usr-metro', icon: TrainFront, title: 'Metro authority view', body: 'Station analytics and aggregates only.', tone: 'bg-purple-600 text-white' },
  ];
  return (
    <div className="min-h-screen hero-gradient text-white">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3"><Logo light size={36} tagline /><Badge tone="cyan" className="bg-cyan/15 text-cyan">Launch pad</Badge></div>
        <h1 className="mt-8 font-display text-3xl font-extrabold sm:text-4xl">Pick what to open. Each button logs you in automatically.</h1>
        <p className="mt-2 max-w-2xl text-white/75">All apps share one live system in this browser: a booking made in the commuter tab appears in the driver and admin tabs instantly.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map(({ to, icon: I, title, body, tone }) => (
            <Link key={to} to={to} className="group rounded-3xl bg-white p-5 text-navy shadow-2xl transition hover:-translate-y-0.5">
              <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}><I size={20} /></span>
              <div className="mt-3 font-display text-lg font-extrabold">{title}</div>
              <div className="mt-1 text-sm text-slate-600">{body}</div>
              <div className="mt-3 text-xs font-semibold text-electric">Open →</div>
            </Link>
          ))}
          <button onClick={() => { openTab('/login?as=usr-c01'); openTab('/login?as=usr-d01'); openTab('/login?as=usr-admin'); }} className="rounded-3xl border-2 border-dashed border-white/30 p-5 text-left transition hover:bg-white/5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><Layers size={20} className="text-cyan" /></span>
            <div className="mt-3 font-display text-lg font-extrabold">Open the 3-tab walkthrough</div>
            <div className="mt-1 text-sm text-white/70">Opens commuter, driver and admin in three new tabs (allow pop-ups once). Book → scan → complete → see it in admin.</div>
            <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-cyan"><ExternalLink size={12} /> Opens new tabs</div>
          </button>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto]">
          <Callout tone="info" title="60-second script" className="bg-white/10 border-white/10 text-white [&_*]:text-white">
            1. Commuter: Book → Bagmane Tech Park → Pay. 2. Driver: Trip → Accept → Scan → type the booking ID → Start trip → End trip. 3. Admin: Operations overview shows it; open Live simulation and press START, set 20×. Use the clock speed control (top right) anywhere to skip waiting.
          </Callout>
          <div className="flex flex-col justify-center gap-2">
            <Button variant="secondary" loading={resetting} onClick={reset}><RotateCcw size={16} /> Reset demo data</Button>
            <Link to="/" className="text-center text-xs text-white/60 hover:text-white">Full login page</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
