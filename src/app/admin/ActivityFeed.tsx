import { useAppState } from '@/domain/store/hooks';
import { fmtTime } from '@/domain/util';
import type { ActivityEvent } from '@/domain/types';

const dot: Record<ActivityEvent['category'], string> = { booking: 'bg-electric', pooling: 'bg-cyan', dispatch: 'bg-amber', boarding: 'bg-go', trip: 'bg-navy', payment: 'bg-purple-500', safety: 'bg-coral', system: 'bg-slate-400', driver: 'bg-sky-500' };

export function ActivityFeed({ limit = 40, categories, height = 420, sinceAt }: { limit?: number; categories?: ActivityEvent['category'][]; height?: number | string; sinceAt?: number }) {
  const activity = useAppState((s) => s.activity);
  const list = activity.filter((e) => (!categories || categories.includes(e.category)) && (!sinceAt || e.at >= sinceAt)).slice(-limit).reverse();
  return (
    <div className="overflow-y-auto pr-1" style={{ maxHeight: height }}>
      {list.length === 0 && <div className="py-8 text-center text-sm text-slate-500">Waiting for activity…</div>}
      <ul className="space-y-1.5">
        {list.map((e) => (
          <li key={e.id} className="flex gap-2.5 rounded-xl px-2 py-1.5 text-sm animate-slide-in hover:bg-mist-50">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[e.category]}`} />
            <span className="w-[72px] shrink-0 font-mono text-xs text-slate-500 leading-5">{fmtTime(e.at)}</span>
            <span className="text-navy leading-5">{e.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
