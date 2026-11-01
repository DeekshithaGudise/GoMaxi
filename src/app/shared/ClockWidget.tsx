import { Pause, Play, FastForward } from 'lucide-react';
import { useClock, useDispatch } from '@/domain/store/hooks';
import { fmtTime, fmtDate } from '@/domain/util';

const SPEEDS = [1, 4, 8, 20, 60];
/** Global simulated clock — every app shares it. Speed changes are visible to all tabs. */
export function ClockWidget({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  const clock = useClock();
  const dispatch = useDispatch();
  const next = SPEEDS[(SPEEDS.indexOf(clock.speed) + 1) % SPEEDS.length] ?? 1;
  return (
    <div className={`flex items-center gap-1.5 rounded-xl px-2 py-1 ${light ? 'bg-white/10 text-white' : 'bg-mist-100 text-navy'}`} title="Simulated clock shared by all GoMaxi apps">
      <button onClick={() => dispatch({ type: 'clock.setRunning', running: !clock.running })} className="rounded-lg p-1 hover:bg-black/10" aria-label={clock.running ? 'Pause clock' : 'Resume clock'}>{clock.running ? <Pause size={14} /> : <Play size={14} />}</button>
      <div className="font-mono text-sm tabular-nums leading-none">{fmtTime(clock.simTime, !compact)}</div>
      {!compact && <div className={`hidden text-[10px] sm:block ${light ? 'text-white/60' : 'text-slate-500'}`}>{fmtDate(clock.simTime)}</div>}
      <button onClick={() => dispatch({ type: 'clock.setSpeed', speed: next })} className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-mono text-xs font-bold hover:bg-black/10 ${clock.speed > 1 ? (light ? 'text-cyan' : 'text-electric') : ''}`} aria-label="Change clock speed"><FastForward size={12} />{clock.speed}×</button>
    </div>
  );
}
