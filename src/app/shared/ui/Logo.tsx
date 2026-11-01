export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#10243A" />
      <path d="M14 40c0-10 8-18 18-18s18 8 18 18" fill="none" stroke="#20C4D8" strokeWidth="6" strokeLinecap="round" />
      <circle cx="20" cy="44" r="5" fill="#2563EB" />
      <circle cx="44" cy="44" r="5" fill="#2563EB" />
      <path d="M26 30h12l4 8H22z" fill="#fff" />
    </svg>
  );
}
export function Logo({ size = 32, light = false, tagline = false }: { size?: number; light?: boolean; tagline?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="leading-none">
        <div className={`font-display font-extrabold tracking-tight ${light ? 'text-white' : 'text-navy'}`} style={{ fontSize: size * 0.62 }}>Go<span className="text-cyan">Maxi</span></div>
        {tagline && <div className={`mt-1 text-[10px] font-medium tracking-wide ${light ? 'text-white/70' : 'text-slate-500'}`}>Your Metro. Your Last Mile. Your Way.</div>}
      </div>
    </div>
  );
}
