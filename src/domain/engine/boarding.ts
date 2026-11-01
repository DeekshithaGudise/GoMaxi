import type { AppState, BoardingRecord, OfflineBoardingQueueItem } from '../types';
import { nextId, put, patch, emit, now } from './ctx';
import { fmtTime } from '../util';

export const QR_PREFIX = 'GOMAXI';
export const qrPayload = (bookingId: string, token: string) => `${QR_PREFIX}|${bookingId}|${token}`;

export function parseScan(raw: string): { bookingId: string; token?: string } | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (s.startsWith(QR_PREFIX + '|')) { const [, bookingId, token] = s.split('|'); return bookingId ? { bookingId: bookingId.toUpperCase(), token } : undefined; }
  const m = s.toUpperCase().match(/GMB-?\d+/);
  if (m) return { bookingId: m[0].replace('GMB', 'GMB-').replace('--', '-') };
  if (/^\d{3,}$/.test(s)) return { bookingId: `GMB-${s}` };
  return undefined;
}

export interface ScanResult {
  accepted: boolean; code: 'ok' | 'unknown' | 'token_mismatch' | 'wrong_trip' | 'already_boarded' | 'not_active' | 'trip_not_boarding' | 'capacity' | 'invalid';
  message: string; bookingId?: string; passengerName?: string; passengerPhoneMasked?: string; womenPriority?: boolean; destination?: string; boardedAt?: number; record?: BoardingRecord;
}

export function validateAndBoard(state: AppState, args: { tripId: string; driverId: string; raw: string; method: BoardingRecord['method']; scannedAt?: number; dryRun?: boolean }): ScanResult {
  const parsed = parseScan(args.raw);
  const t = args.scannedAt ?? now(state);
  const trip = state.trips[args.tripId];
  const fail = (code: ScanResult['code'], message: string, bookingId?: string): ScanResult => {
    if (!args.dryRun && trip && bookingId && state.bookings[bookingId]) {
      const rec: BoardingRecord = { id: nextId(state, 'boarding', 'BRD'), bookingId, tripId: trip.id, vehicleId: trip.vehicleId, driverId: args.driverId, method: args.method, scannedAt: t, syncedAt: args.method === 'offline_sync' ? now(state) : undefined, result: 'rejected', reason: message };
      put(state, 'boardingRecords', rec);
    }
    return { accepted: false, code, message, bookingId };
  };
  if (!parsed) return fail('invalid', 'Could not read a GoMaxi booking from this code');
  const b = state.bookings[parsed.bookingId];
  if (!b) return fail('unknown', `No booking ${parsed.bookingId} exists`);
  const passenger = state.users[b.commuterId];
  const base = { bookingId: b.id, passengerName: passenger?.name, passengerPhoneMasked: passenger ? passenger.phone.replace(/(\+91 \d{5}) \d{3}(\d{2})/, '$1 ***$2') : undefined, womenPriority: b.womenPriority, destination: state.hotspots[b.hotspotId]?.name };
  if (parsed.token && parsed.token !== b.qrToken) return { ...fail('token_mismatch', 'QR signature does not match this booking — possible tampered or stale code', b.id), ...base };
  if (!trip) return { ...fail('trip_not_boarding', 'Trip not found'), ...base };
  if (trip.status !== 'boarding') return { ...fail('trip_not_boarding', trip.status === 'assigned' ? 'Accept the trip before scanning passengers' : `Trip is ${trip.status.replace('_', ' ')}; boarding is closed`, b.id), ...base };
  if (b.status === 'boarded') return { ...fail('already_boarded', `Already boarded at ${fmtTime(b.boardedAt ?? t)} — duplicate scan blocked`, b.id), ...base, boardedAt: b.boardedAt };
  if (b.status === 'completed') return { ...fail('not_active', 'This booking was already completed', b.id), ...base };
  if (b.status === 'cancelled' || b.status === 'expired' || b.status === 'no_show' || b.status === 'payment_failed') return { ...fail('not_active', `Booking is ${b.status.replace('_', ' ')}; passenger must rebook`, b.id), ...base };
  if (b.tripId !== trip.id) {
    const other = b.vehicleId ? `assigned to ${b.vehicleId}` : 'not yet assigned to a vehicle';
    return { ...fail('wrong_trip', `This booking is ${other}, not ${trip.vehicleId}. Direct the passenger to the correct bay.`, b.id), ...base };
  }
  if (trip.boardedBookingIds.length >= trip.capacity) return { ...fail('capacity', `Vehicle at full capacity (${trip.capacity})`, b.id), ...base };
  if (args.dryRun) return { accepted: true, code: 'ok', message: 'Valid boarding pass', ...base };
  patch(state, 'bookings', b.id, { status: 'boarded', boardedAt: t, qrUsedAt: t });
  patch(state, 'trips', trip.id, { boardedBookingIds: [...trip.boardedBookingIds, b.id] });
  const rec: BoardingRecord = { id: nextId(state, 'boarding', 'BRD'), bookingId: b.id, tripId: trip.id, vehicleId: trip.vehicleId, driverId: args.driverId, method: args.method, scannedAt: t, syncedAt: args.method === 'offline_sync' ? now(state) : undefined, result: 'accepted' };
  put(state, 'boardingRecords', rec);
  const count = trip.boardedBookingIds.length + 1;
  emit(state, 'boarding', `${passenger.name} boarded ${trip.vehicleId} (${args.method === 'qr' ? 'QR verified' : args.method === 'manual' ? 'manual ID check' : 'offline record synced'}) — ${count}/${trip.capacity} on board`, { bookingId: b.id, tripId: trip.id, vehicleId: trip.vehicleId }, b.simulated);
  return { accepted: true, code: 'ok', message: `Boarded — seat ${count} of ${trip.capacity}`, ...base, boardedAt: t, record: rec };
}

/** Replays an offline queue through the same validator; duplicates are rejected, never double-boarded. */
export function syncOfflineQueue(state: AppState, items: OfflineBoardingQueueItem[]): ScanResult[] {
  const results = items.map((it) => validateAndBoard(state, { tripId: it.tripId, driverId: it.driverId, raw: it.bookingId, method: 'offline_sync', scannedAt: it.enteredAt }));
  emit(state, 'boarding', `Offline boarding queue synced: ${results.filter((r) => r.accepted).length} accepted, ${results.filter((r) => !r.accepted).length} rejected`, {});
  return results;
}
