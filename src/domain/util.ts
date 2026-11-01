import type { LatLng, Millis } from './types';

/** Deterministic PRNG (mulberry32) so simulations are repeatable. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function rngFromState(state: number) { return mulberry32(state); }

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const IST_OFFSET_MS = 5.5 * HOUR;

/** Demo day anchor: 2026-11-02 (Monday) 00:00 IST, expressed in epoch ms. */
export const DEMO_DAY_START: Millis = Date.UTC(2026, 10, 2, 0, 0, 0) - IST_OFFSET_MS;

export function timeAt(hhmm: string, dayStart: Millis = DEMO_DAY_START): Millis {
  const [h, m] = hhmm.split(':').map(Number);
  return dayStart + h * HOUR + m * MIN;
}

export function dayStartOf(t: Millis): Millis {
  const ist = t + IST_OFFSET_MS;
  return ist - (ist % (24 * HOUR)) - IST_OFFSET_MS;
}

export function istParts(t: Millis) {
  const d = new Date(t + IST_OFFSET_MS);
  return { h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), day: d.getUTCDay(), date: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
}

export function fmtTime(t: Millis, withSeconds = false): string {
  const { h, m, s } = istParts(t);
  const hh = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hh}:${String(m).padStart(2, '0')}${withSeconds ? ':' + String(s).padStart(2, '0') : ''} ${ampm}`;
}
export function fmtTime24(t: Millis): string {
  const { h, m } = istParts(t);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function fmtDate(t: Millis): string {
  const { date, month, year } = istParts(t);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date} ${months[month]} ${year}`;
}
export function fmtDateTime(t: Millis): string { return `${fmtDate(t)}, ${fmtTime(t)}`; }
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtDuration(ms: number): string {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const inr = (n: number, decimals = 0) =>
  '₹' + (Math.round(n * 10 ** decimals) / 10 ** decimals).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
export const inrCompact = (n: number) => {
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return inr(n);
};
export const pct = (n: number, d = 0) => `${n.toFixed(d)}%`;
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** Haversine distance in km */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a: LatLng, b: LatLng): number {
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Interpolate along a polyline by fraction 0..1 of total length. */
export function pointAlong(points: LatLng[], fraction: number): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  if (points.length === 1 || fraction <= 0) return points[0];
  if (fraction >= 1) return points[points.length - 1];
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) { const d = distanceKm(points[i - 1], points[i]); segs.push(d); total += d; }
  let target = fraction * total;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const f = segs[i] === 0 ? 0 : target / segs[i];
      return { lat: points[i].lat + (points[i + 1].lat - points[i].lat) * f, lng: points[i].lng + (points[i + 1].lng - points[i].lng) * f };
    }
    target -= segs[i];
  }
  return points[points.length - 1];
}

export function polylineKm(points: LatLng[]): number {
  let t = 0; for (let i = 1; i < points.length; i++) t += distanceKm(points[i - 1], points[i]); return t;
}

export function pad(n: number, w = 4) { return String(n).padStart(w, '0'); }

export function uniq<T>(xs: T[]): T[] { return Array.from(new Set(xs)); }
export function sum(xs: number[]): number { return xs.reduce((a, b) => a + b, 0); }
export function avg(xs: number[]): number { return xs.length ? sum(xs) / xs.length : 0; }
export function groupBy<T, K extends string | number>(xs: T[], key: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of xs) { const k = key(x); (out[k] ||= []).push(x); }
  return out;
}

/** Pretend-random, readable token used in QR payloads (not cryptographic — see docs/ARCHITECTURE.md). */
export function makeToken(rng: () => number, len = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(rng() * alphabet.length)];
  return s;
}

export const initials = (name: string) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
