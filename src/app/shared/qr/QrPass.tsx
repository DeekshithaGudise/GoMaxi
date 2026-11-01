import { QRCodeSVG } from 'qrcode.react';
import { qrPayload } from '@/domain/engine/boarding';
import type { Booking } from '@/domain/types';

export function QrPass({ booking, size = 200, used = false }: { booking: Booking; size?: number; used?: boolean }) {
  return (
    <div className="relative inline-flex flex-col items-center">
      <div className={`rounded-2xl bg-white p-3 shadow-card ring-1 ring-mist-200 ${used ? 'opacity-40 grayscale' : ''}`}>
        <QRCodeSVG value={qrPayload(booking.id, booking.qrToken)} size={size} level="M" fgColor="#10243A" bgColor="#FFFFFF" includeMargin={false} imageSettings={{ src: '/favicon.svg', height: Math.round(size * 0.16), width: Math.round(size * 0.16), excavate: true }} />
      </div>
      {used && <div className="absolute inset-0 flex items-center justify-center"><span className="rotate-[-12deg] rounded-lg border-2 border-go bg-white/90 px-3 py-1 font-display text-lg font-extrabold text-go">BOARDED</span></div>}
      <div className="mt-2 font-mono text-xs text-slate-500">{booking.id} · {booking.qrToken}</div>
    </div>
  );
}
