import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, createContext, useContext, useCallback, useMemo } from 'react';
import { X, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { initials } from '@/domain/util';
export { Logo, LogoMark } from './Logo';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'dark';
export function Button({ variant = 'primary', size = 'md', className = '', loading, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button className={`btn btn-${size} btn-${variant} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ children, className = '', title, subtitle, action, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={`card ${pad ? 'card-pad' : ''} ${className}`}>
      {(title || action) && (
        <header className={`flex items-start justify-between gap-3 ${pad ? 'mb-3' : 'p-4 pb-0 mb-3'}`}>
          <div>{title && <h3 className="font-display font-bold text-navy text-base leading-tight">{title}</h3>}{subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}</div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const tones: Record<string, string> = {
  blue: 'bg-electric-50 text-electric-700', cyan: 'bg-cyan-50 text-cyan-600', green: 'bg-go-50 text-go-600', amber: 'bg-amber-50 text-amber-700', red: 'bg-coral-50 text-coral', slate: 'bg-mist-100 text-slate-600', navy: 'bg-navy text-white', purple: 'bg-purple-50 text-purple-700',
};
export function Badge({ tone = 'slate', children, className = '', dot }: { tone?: keyof typeof tones; children: ReactNode; className?: string; dot?: boolean }) {
  return <span className={`chip ${tones[tone]} ${className}`}>{dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{children}</span>;
}

export function statusTone(status: string): keyof typeof tones {
  if (['completed', 'success', 'verified', 'available', 'idle', 'resolved', 'boarded', 'en_route', 'active'].includes(status)) return 'green';
  if (['assigned', 'boarding', 'confirmed', 'acknowledged', 'busy', 'on_trip', 'returning', 'scheduled', 'forming'].includes(status)) return 'blue';
  if (['pending', 'pending_payment', 'open', 'paused', 'committed', 'off_duty', 'offline'].includes(status)) return 'amber';
  if (['failed', 'cancelled', 'expired', 'rejected', 'payment_failed', 'no_show', 'refunded', 'critical'].includes(status)) return 'red';
  return 'slate';
}
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={statusTone(status)} dot>{status.replace(/_/g, ' ')}</Badge>;

export function Stat({ label, value, sub, tone = 'navy', icon, className = '' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'navy' | 'blue' | 'cyan' | 'green' | 'amber' | 'red'; icon?: ReactNode; className?: string }) {
  const color = { navy: 'text-navy', blue: 'text-electric', cyan: 'text-cyan-600', green: 'text-go', amber: 'text-amber-600', red: 'text-coral' }[tone];
  return (
    <div className={`card card-pad animate-fade-up ${className}`}>
      <div className="flex items-start justify-between gap-2"><div className="label">{label}</div>{icon && <div className={`${color} opacity-80`}>{icon}</div>}</div>
      <div className={`mt-1.5 font-display text-2xl font-extrabold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Input({ label, hint, error, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label mb-1.5 block">{label}</span>}
      <input className={`input ${error ? 'border-coral focus:ring-coral/30' : ''}`} {...rest} />
      {error ? <span className="mt-1 block text-xs text-coral">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
export function Select({ label, className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label mb-1.5 block">{label}</span>}
      <select className="input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8" {...rest}>{children}</select>
    </label>
  );
}
export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 text-left" role="switch" aria-checked={checked}>
      <span><span className="block text-sm font-semibold text-navy">{label}</span>{description && <span className="block text-xs text-slate-500">{description}</span>}</span>
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? 'bg-electric' : 'bg-mist-300'}`}><span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} /></span>
    </button>
  );
}
export function Slider({ label, value, min, max, step = 1, onChange, format = (v) => String(v), hint }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; hint?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between"><span className="text-sm font-semibold text-navy">{label}</span><span className="font-mono text-sm text-electric">{format(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-electric" aria-label={label} />
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}
export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-xl bg-mist-100 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={`rounded-lg font-semibold transition ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} ${value === o.value ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-navy'}`}>{o.label}</button>
      ))}
    </div>
  );
}
export function Progress({ value, max = 100, tone = 'blue', className = '', height = 'h-2' }: { value: number; max?: number; tone?: 'blue' | 'green' | 'amber' | 'cyan' | 'red'; className?: string; height?: string }) {
  const color = { blue: 'bg-electric', green: 'bg-go', amber: 'bg-amber', cyan: 'bg-cyan', red: 'bg-coral' }[tone];
  return <div className={`w-full overflow-hidden rounded-full bg-mist-200 ${height} ${className}`}><div className={`${height} rounded-full ${color} transition-all duration-700`} style={{ width: `${Math.min(100, Math.max(0, (value / max) * 100))}%` }} /></div>;
}
export function Avatar({ name, color = '#2563EB', size = 40, className = '' }: { name: string; color?: string; size?: number; className?: string }) {
  return <div className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ${className}`} style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>{initials(name)}</div>;
}
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-mist-300 bg-mist-50 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <div className="font-display font-bold text-navy">{title}</div>
      {body && <div className="mt-1 max-w-sm text-sm text-slate-500">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Skeleton({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded-xl bg-mist-200 ${className}`} />; }

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal>
      <div className={`w-full ${w} animate-fade-up rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-mist-200 px-5 py-4"><h3 className="font-display text-lg font-bold text-navy">{title}</h3><button onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-mist-100" aria-label="Close"><X size={18} /></button></div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-mist-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Callout({ tone = 'info', title, children, className = '' }: { tone?: 'info' | 'success' | 'warn' | 'danger'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const map = { info: ['bg-electric-50 text-electric-700 border-electric-100', <Info size={16} key="i" />], success: ['bg-go-50 text-go-600 border-go-100', <CheckCircle2 size={16} key="s" />], warn: ['bg-amber-50 text-amber-800 border-amber-100', <AlertTriangle size={16} key="w" />], danger: ['bg-coral-50 text-coral border-red-100', <XCircle size={16} key="d" />] } as const;
  const [cls, icon] = map[tone];
  return <div className={`flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${cls} ${className}`}><span className="mt-0.5 shrink-0">{icon}</span><div>{title && <div className="font-semibold">{title}</div>}{children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}</div></div>;
}

export function SimTag({ children = 'Simulated' }: { children?: ReactNode }) { return <span className="chip bg-amber-50 text-amber-700 border border-amber-100 text-[10px] uppercase tracking-wide">{children}</span>; }

// ---------- Toasts ----------
interface Toast { id: number; tone: 'info' | 'success' | 'warn' | 'danger'; title: string; body?: string }
const ToastCtx = createContext<{ push: (t: Omit<Toast, 'id'>) => void } | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => { const id = Date.now() + Math.random(); setToasts((x) => [...x, { ...t, id }]); setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4200); }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto w-full max-w-sm animate-slide-in rounded-2xl border px-4 py-3 shadow-card ${{ info: 'bg-white border-mist-200', success: 'bg-go-50 border-go-100', warn: 'bg-amber-50 border-amber-100', danger: 'bg-coral-50 border-red-100' }[t.tone]}`}>
            <div className="text-sm font-semibold text-navy">{t.title}</div>{t.body && <div className="text-xs text-slate-600">{t.body}</div>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() { const c = useContext(ToastCtx); if (!c) throw new Error('ToastProvider missing'); return c.push; }

export function PageTitle({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display text-2xl font-extrabold tracking-tight text-navy">{title}</h1>{subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}</div>{action}</div>;
}
