import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';

/**
 * Camera QR scanner using html5-qrcode. Falls back gracefully when the camera is unavailable
 * (no permission, insecure origin, headless) — the parent shows manual entry in that case.
 */
export function QrScanner({ onScan, active }: { onScan: (text: string) => void; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  useEffect(() => {
    if (!active || !ref.current) return;
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    let cancelled = false;
    setStarting(true); setError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable in this browser/context');
        const { Html5Qrcode } = await import('html5-qrcode');
        const id = 'gomaxi-qr-reader';
        ref.current!.id = id;
        const h = new Html5Qrcode(id, { verbose: false });
        scanner = h;
        await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, (text) => {
          const now = Date.now();
          if (text === lastRef.current.text && now - lastRef.current.at < 2500) return;
          lastRef.current = { text, at: now };
          onScan(text);
        }, () => { /* per-frame decode misses are normal */ });
        if (cancelled) { await h.stop(); h.clear(); }
      } catch (e) {
        setError((e as Error)?.message || 'Camera unavailable');
      } finally { setStarting(false); }
    })();
    return () => { cancelled = true; if (scanner) scanner.stop().then(() => scanner?.clear()).catch(() => undefined); };
  }, [active, onScan]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-navy" style={{ minHeight: 260 }}>
      <div ref={ref} className="h-full w-full [&_video]:!rounded-2xl" />
      {starting && <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm"><Camera className="mr-2 animate-pulse" size={18} /> Starting camera…</div>}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
          <CameraOff size={28} className="text-cyan" />
          <div className="font-semibold">Camera not available</div>
          <div className="text-xs text-white/70">{error}. Use manual verification below — enter the booking ID printed under the passenger's QR code.</div>
        </div>
      )}
    </div>
  );
}
