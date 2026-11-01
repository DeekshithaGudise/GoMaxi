import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../store/store';
import { createInitialState } from '../store/initialState';
import { computeUnitEconomics, DEFAULT_FINANCE, splitFare } from '../engine/finance';
import { overviewMetrics, financialActuals, driverStats } from '../engine/analytics';
import { computeHotspotDemand } from '../engine/demand';
import { vehicleEligibility } from '../engine/compliance';
import { qrPayload } from '../engine/boarding';
import type { AppState, Booking, Trip } from '../types';
import type { CreateBookingResult } from '../engine/booking';
import { MIN } from '../util';

const mk = () => new Store(createInitialState({ withHistory: true }));
const book = (store: Store, commuterId: string, hotspotId = 'hs-whf', stationId = 'st-byp', extra: Record<string, unknown> = {}) => {
  const r = store.apply({ type: 'booking.create', input: { commuterId, stationId, hotspotId, payment: { method: 'upi' }, ...extra } });
  if (!r.ok) throw new Error(r.error);
  return r.data as CreateBookingResult;
};
const pool = (s: AppState) => Object.keys(s.commuters).filter((id) => id.startsWith('usr-h'));

describe('booking & payments', () => {
  let store: Store;
  beforeEach(() => { store = mk(); });

  it('creates a confirmed booking with a unique QR token and a successful simulated payment', () => {
    const r = book(store, 'usr-c01');
    expect(r.ok).toBe(true);
    expect(r.booking.status).toBe('assigned'); // vehicle available at Baiyappanahalli → assigned immediately
    expect(r.payment.status).toBe('success');
    expect(r.booking.qrToken).toHaveLength(10);
    const r2 = book(store, 'usr-c02');
    expect(r2.booking.qrToken).not.toBe(r.booking.qrToken);
    expect(r2.booking.id).not.toBe(r.booking.id);
  });

  it('records payment failure and leaves no active booking', () => {
    const r = store.apply({ type: 'booking.create', input: { commuterId: 'usr-c01', stationId: 'st-byp', hotspotId: 'hs-whf', payment: { method: 'card', cardLast4: '0000' } } });
    expect(r.ok).toBe(true);
    const d = r.data as CreateBookingResult;
    expect(d.ok).toBe(false);
    expect(d.payment.status).toBe('failed');
    expect(d.booking.status).toBe('payment_failed');
    // can retry
    const again = book(store, 'usr-c01');
    expect(again.booking.status).toBe('assigned');
  });

  it('wallet payment fails on insufficient balance', () => {
    store.apply({ type: 'commuter.update', commuterId: 'usr-c03', changes: { walletBalance: 5 } });
    const r = store.apply({ type: 'booking.create', input: { commuterId: 'usr-c03', stationId: 'st-byp', hotspotId: 'hs-whf', payment: { method: 'wallet' } } });
    expect((r.data as CreateBookingResult).ok).toBe(false);
  });

  it('prevents a passenger from holding two active bookings', () => {
    book(store, 'usr-c01');
    const r = store.apply({ type: 'booking.create', input: { commuterId: 'usr-c01', stationId: 'st-byp', hotspotId: 'hs-whf', payment: { method: 'upi' } } });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe('duplicate');
  });

  it('cancels an eligible booking with a full refund to wallet before dispatch', () => {
    const r = book(store, 'usr-c01');
    const before = store.getState().commuters['usr-c01'].walletBalance;
    const c = store.apply({ type: 'booking.cancel', bookingId: r.booking.id });
    expect(c.ok).toBe(true);
    const s = store.getState();
    expect(s.bookings[r.booking.id].status).toBe('cancelled');
    expect(s.payments[r.payment.id].status).toBe('refunded');
    expect(s.commuters['usr-c01'].walletBalance).toBe(before + r.booking.fare);
    // group closed, vehicle released
    expect(s.groups[r.group!.id].status).toBe('cancelled');
    expect(s.vehicles[r.trip!.vehicleId].status).toBe('idle');
  });

  it('refuses to cancel a boarded booking', () => {
    const r = book(store, 'usr-c01');
    store.advance(50_000); // auto-accept
    const scan = store.apply({ type: 'boarding.scan', tripId: r.trip!.id, driverId: r.trip!.driverId, raw: qrPayload(r.booking.id, r.booking.qrToken), method: 'qr' });
    expect((scan.data as { accepted: boolean }).accepted).toBe(true);
    const c = store.apply({ type: 'booking.cancel', bookingId: r.booking.id });
    expect(c.ok).toBe(false);
  });
});

describe('pooling & dispatch', () => {
  let store: Store;
  beforeEach(() => { store = mk(); });

  it('groups compatible passengers (same station + hotspot) into one group and keeps others separate', () => {
    const a = book(store, 'usr-c01', 'hs-whf');
    const b = book(store, 'usr-c02', 'hs-whf');
    const c = book(store, 'usr-c03', 'hs-itpl');
    expect(a.group!.id).toBe(b.group!.id);
    expect(c.group!.id).not.toBe(a.group!.id);
    expect(store.getState().groups[a.group!.id].bookingIds).toHaveLength(2);
  });

  it('dispatches when the occupancy threshold is reached (10 of 12)', () => {
    const ids = pool(store.getState()).slice(0, 10);
    let groupId = '';
    for (const id of ids) groupId = book(store, id).group!.id;
    store.advance(50_000); // accept
    store.advance(1000);
    const g = store.getState().groups[groupId];
    expect(g.threshold).toBe(10);
    expect(g.initiatedReason).toBe('threshold');
    const trip = store.getState().trips[g.tripId!];
    // board everyone then it departs
    for (const bid of g.bookingIds) store.apply({ type: 'boarding.scan', tripId: trip.id, driverId: trip.driverId, raw: bid, method: 'manual' });
    store.advance(1000);
    const t2 = store.getState().trips[trip.id];
    expect(t2.status).toBe('en_route');
    expect(t2.boardedBookingIds).toHaveLength(10);
    const fare = store.getState().bookings[g.bookingIds[0]].fare;
    expect(t2.grossFare).toBe(10 * fare);
    expect(t2.platformCommission).toBe(splitFare(10 * fare, 15).commission);
    expect(t2.driverPayout).toBe(splitFare(10 * fare, 15).payout);
    expect(store.getState().dispatchLog.some((d) => d.groupId === groupId && d.decision === 'dispatch_threshold')).toBe(true);
  });

  it('dispatches on timeout with a viable under-filled load, and completes the trip with earnings', () => {
    const ids = pool(store.getState()).slice(0, 5);
    let groupId = '';
    for (const id of ids) groupId = book(store, id).group!.id;
    store.advance(50_000);
    const trip = store.getState().trips[store.getState().groups[groupId].tripId!];
    for (const bid of ids.map((_, i) => store.getState().groups[groupId].bookingIds[i])) store.apply({ type: 'boarding.scan', tripId: trip.id, driverId: trip.driverId, raw: bid, method: 'manual' });
    expect(store.getState().trips[trip.id].status).toBe('boarding');
    store.advance(5 * MIN); // past 5-minute max wait
    const g = store.getState().groups[groupId];
    expect(g.initiatedReason).toBe('timeout');
    expect(store.getState().trips[trip.id].status).toBe('en_route');
    store.advance(60 * MIN); // trip completes
    const done = store.getState().trips[trip.id];
    expect(done.status).toBe('completed');
    const earning = Object.values(store.getState().earnings).find((e) => e.tripId === trip.id)!;
    expect(earning.payout).toBe(done.driverPayout);
    expect(Object.values(store.getState().bookings).filter((b) => b.tripId === trip.id).every((b) => b.status === 'completed')).toBe(true);
  });

  it('never exceeds vehicle capacity — the 13th passenger opens a new group', () => {
    const ids = pool(store.getState()).slice(0, 13);
    const groups = new Set(ids.map((id) => book(store, id).group!.id));
    expect(groups.size).toBe(2);
    for (const gid of groups) expect(store.getState().groups[gid].bookingIds.length).toBeLessThanOrEqual(12);
  });

  it('does not assign non-compliant vehicles or unavailable drivers', () => {
    const s = store.getState();
    expect(vehicleEligibility(s.vehicles['GM-109']).eligible).toBe(false);
    expect(vehicleEligibility(s.vehicles['GM-110']).eligible).toBe(false);
    // Trinity has only GM-109 (permit pending) → booking waits without vehicle
    const r = book(store, 'usr-c11', 'hs-orr', 'st-tri');
    expect(r.trip).toBeUndefined();
    expect(r.booking.status).toBe('confirmed');
    expect(store.getState().dispatchLog.some((d) => d.decision === 'no_vehicle')).toBe(true);
    // verifying the permit alone is not enough: its driver still fails police verification + training
    store.apply({ type: 'admin.setCompliance', vehicleId: 'GM-109', key: 'contract_carriage_permit', status: 'verified' });
    store.advance(600);
    expect(store.getState().bookings[r.booking.id].status).toBe('confirmed');
    store.apply({ type: 'admin.setDriverCheck', driverId: 'usr-d09', field: 'policeVerification', status: 'verified' });
    store.apply({ type: 'admin.setDriverTraining', driverId: 'usr-d09', completed: true });
    store.advance(600);
    expect(store.getState().bookings[r.booking.id].status).toBe('confirmed'); // PSV badge expired 2026-09-30
    store.apply({ type: 'admin.renewDriverDocument', driverId: 'usr-d09', field: 'psvBadgeValidTill', validTill: '2028-12-31' });
    store.advance(600);
    expect(store.getState().bookings[r.booking.id].status).toBe('assigned');
    expect(store.getState().bookings[r.booking.id].vehicleId).toBe('GM-109');
  });

  it('offline driver is never assigned; coming online unblocks the group', () => {
    // KR Puram: GM-104 (driver d04 available) and GM-110 (insurance expired). Take d04 offline.
    store.apply({ type: 'driver.setAvailability', driverId: 'usr-d04', availability: 'offline' });
    const r = book(store, 'usr-c05', 'hs-whf', 'st-krp');
    expect(r.trip).toBeUndefined();
    store.apply({ type: 'driver.setAvailability', driverId: 'usr-d04', availability: 'available' });
    expect(store.getState().bookings[r.booking.id].vehicleId).toBe('GM-104');
  });

  it('driver rejection re-assigns the group to another vehicle', () => {
    const r = book(store, 'usr-c01');
    const first = r.trip!;
    store.apply({ type: 'driver.rejectTrip', tripId: first.id, reason: 'test' });
    const s = store.getState();
    expect(s.trips[first.id].status).toBe('cancelled');
    const g = s.groups[r.group!.id];
    expect(g.vehicleId).toBeDefined();
    expect(g.vehicleId).not.toBe(first.vehicleId);
  });

  it('expires a booking that never gets a vehicle and refunds it', () => {
    const r = book(store, 'usr-c11', 'hs-orr', 'st-tri');
    store.advance(35 * MIN);
    const s = store.getState();
    expect(s.bookings[r.booking.id].status).toBe('expired');
    expect(s.payments[r.payment.id].status).toBe('refunded');
  });

  it('un-boarded passengers roll over to the next departure when the vehicle leaves', () => {
    const ids = pool(store.getState()).slice(0, 6);
    let groupId = '';
    for (const id of ids) groupId = book(store, id).group!.id;
    store.advance(50_000);
    const g = store.getState().groups[groupId];
    const trip = store.getState().trips[g.tripId!];
    // only 4 board
    for (const bid of g.bookingIds.slice(0, 4)) store.apply({ type: 'boarding.scan', tripId: trip.id, driverId: trip.driverId, raw: bid, method: 'manual' });
    store.apply({ type: 'driver.startTrip', tripId: trip.id });
    const s = store.getState();
    expect(s.trips[trip.id].status).toBe('en_route');
    const left = g.bookingIds.slice(4).map((id) => s.bookings[id]);
    expect(left.every((b) => b.rolloverCount === 1 && b.groupId !== groupId)).toBe(true);
  });
});

describe('QR boarding', () => {
  let store: Store; let r: CreateBookingResult; let trip: Trip;
  beforeEach(() => { store = mk(); r = book(store, 'usr-c01'); store.advance(50_000); trip = store.getState().trips[r.trip!.id]; });
  const scan = (raw: string, t = trip) => store.apply({ type: 'boarding.scan', tripId: t.id, driverId: t.driverId, raw, method: 'qr' }).data as { accepted: boolean; code: string };

  it('accepts a valid QR once and blocks the duplicate', () => {
    expect(scan(qrPayload(r.booking.id, r.booking.qrToken)).accepted).toBe(true);
    const dup = scan(qrPayload(r.booking.id, r.booking.qrToken));
    expect(dup.accepted).toBe(false);
    expect(dup.code).toBe('already_boarded');
    expect(store.getState().trips[trip.id].boardedBookingIds).toHaveLength(1);
    expect(Object.values(store.getState().boardingRecords).filter((b) => b.bookingId === r.booking.id)).toHaveLength(2);
  });
  it('rejects tampered tokens, unknown bookings and wrong vehicles', () => {
    expect(scan(qrPayload(r.booking.id, 'WRONGTOKEN')).code).toBe('token_mismatch');
    expect(scan('GMB-1').code).toBe('unknown');
    const other = book(store, 'usr-c03', 'hs-itpl');
    store.advance(50_000);
    expect(scan(qrPayload(other.booking.id, other.booking.qrToken)).code).toBe('wrong_trip');
  });
  it('blocks scanning before the driver accepts', () => {
    const s2 = mk(); const b2 = book(s2, 'usr-c01');
    const res = s2.apply({ type: 'boarding.scan', tripId: b2.trip!.id, driverId: b2.trip!.driverId, raw: b2.booking.id, method: 'manual' }).data as { code: string };
    expect(res.code).toBe('trip_not_boarding');
  });
  it('syncs an offline manual queue without double-boarding', () => {
    const items = [{ bookingId: r.booking.id, tripId: trip.id, driverId: trip.driverId, enteredAt: store.getState().clock.simTime - 60000 }, { bookingId: r.booking.id, tripId: trip.id, driverId: trip.driverId, enteredAt: store.getState().clock.simTime - 30000 }];
    const res = store.apply({ type: 'boarding.syncOffline', items }).data as { accepted: boolean }[];
    expect(res.map((x) => x.accepted)).toEqual([true, false]);
    expect(store.getState().bookings[r.booking.id].status).toBe('boarded');
  });
});

describe('safety', () => {
  it('SOS creates a critical alert tied to the trip, which ops can resolve', () => {
    const store = mk(); const r = book(store, 'usr-c01');
    const a = store.apply({ type: 'safety.sos', userId: 'usr-c01', tripId: r.trip!.id, bookingId: r.booking.id }).data as { id: string; severity: string };
    expect(a.severity).toBe('critical');
    expect(overviewMetrics(store.getState()).openAlerts).toBe(1);
    store.apply({ type: 'safety.resolve', alertId: a.id, note: 'False alarm confirmed with passenger' });
    expect(store.getState().alerts[a.id].status).toBe('resolved');
  });
  it('applies the late-night safe-drop policy at departure after 20:00', () => {
    const store = new Store(createInitialState({ withHistory: false, startTime: '20:15' }));
    const r = book(store, 'usr-c01'); store.advance(50_000);
    store.apply({ type: 'boarding.scan', tripId: r.trip!.id, driverId: r.trip!.driverId, raw: r.booking.id, method: 'manual' });
    store.apply({ type: 'driver.startTrip', tripId: r.trip!.id });
    expect(Object.values(store.getState().alerts).some((a) => a.type === 'late_night_drop' && a.tripId === r.trip!.id)).toBe(true);
  });
});

describe('finance model', () => {
  it('matches the pitch numbers: 12 × ₹25 = ₹300; 15% → ₹45 / ₹255; 2 trips/h → ₹600 / ₹90 / ₹510', () => {
    expect(splitFare(300, 15)).toEqual({ gross: 300, commission: 45, payout: 255 });
    const full = computeUnitEconomics({ ...DEFAULT_FINANCE, occupancyPct: 100, tripsPerHour: 2, operatingHours: 1, vehicles: 1 });
    expect(full.gbvPerTrip).toBe(300);
    expect(full.commissionPerTrip).toBe(45);
    expect(full.driverPayoutPerTrip).toBe(255);
    expect(full.gbvPerVehiclePerDay).toBe(600);
    expect(full.revenuePerVehiclePerDay).toBe(90);
    expect(full.driverEarningsPerVehiclePerDay).toBe(510);
  });
  it('is internally consistent at base case', () => {
    const u = computeUnitEconomics(DEFAULT_FINANCE);
    expect(u.gbvPerTrip).toBeCloseTo(240);
    expect(u.commissionPerMonth + u.driverPayoutPerMonth - u.incentivesPerMonth).toBeCloseTo(u.gbvPerMonth);
    expect(u.contributionMarginPerMonth).toBeCloseTo(u.netRevenuePerMonth - u.variableOpexPerMonth - u.maintenancePerMonth);
    expect(u.ebitdaPerMonth).toBeCloseTo(u.contributionMarginPerMonth - u.fixedCostPerMonth);
    expect(u.breakEvenTripsPerMonth).toBeGreaterThan(0);
  });
});

describe('cross-dashboard consistency', () => {
  it('a booking created in the commuter flow is visible to driver, admin overview and finance actuals with the same numbers', () => {
    const store = mk();
    const before = overviewMetrics(store.getState());
    const r = book(store, 'usr-c01');
    store.advance(50_000);
    const d = driverStats(store.getState(), r.trip!.driverId);
    expect(d.current?.id).toBe(r.trip!.id);
    store.apply({ type: 'boarding.scan', tripId: r.trip!.id, driverId: r.trip!.driverId, raw: r.booking.id, method: 'manual' });
    store.apply({ type: 'driver.startTrip', tripId: r.trip!.id });
    store.apply({ type: 'driver.endTrip', tripId: r.trip!.id });
    const s = store.getState();
    const after = overviewMetrics(s);
    expect(after.totalBookings).toBe(before.totalBookings + 1);
    expect(after.completedTrips).toBe(before.completedTrips + 1);
    expect(after.gbv).toBeCloseTo(before.gbv + r.booking.fare);
    expect(after.commission).toBeCloseTo(before.commission + splitFare(r.booking.fare, 15).commission);
    const fin = financialActuals(s);
    expect(fin.gbv).toBeCloseTo(after.gbv);
    expect(fin.commission + fin.payout).toBeCloseTo(fin.gbv);
    const d2 = driverStats(s, r.trip!.driverId);
    expect(d2.todayEarnings).toBeCloseTo(splitFare(r.booking.fare, 15).payout);
    const demand = computeHotspotDemand(s);
    expect(demand.find((x) => x.hotspot.id === 'hs-whf')!.bookingsToday).toBeGreaterThanOrEqual(1);
    // metrics derived from entities: GBV equals sum of completed booking fares
    const sumFares = Object.values(s.bookings).filter((b: Booking) => b.status === 'completed').reduce((a, b) => a + b.fare, 0);
    expect(after.gbv).toBeCloseTo(sumFares);
  });
});

describe('live simulation', () => {
  it('runs the Baiyappanahalli 09:00 scenario deterministically to completion', () => {
    const run = () => {
      const store = mk();
      store.apply({ type: 'sim.start', params: { stationId: 'st-byp', primaryHotspotId: 'hs-whf', demand: 35, vehicles: 5, startTime: '09:00', arrivalWindowMin: 12, hotspotMix: 0.75, seed: 42 } });
      for (let i = 0; i < 600 && store.getState().simulation.status !== 'finished'; i++) store.advance(10_000); // 10s real × speed 8 = 80 sim-seconds per step
      return store.getState();
    };
    const a = run(); const b = run();
    expect(a.simulation.status).toBe('finished');
    expect(a.simulation.stats.bookings).toBeGreaterThanOrEqual(30);
    expect(a.simulation.stats.completed + a.simulation.stats.refunded).toBe(a.simulation.stats.bookings); // every passenger is either delivered or refunded
    expect(a.simulation.stats.completed).toBeGreaterThanOrEqual(Math.floor(a.simulation.stats.bookings * 0.85));
    const spawned = a.simulation.spawnedBookingIds.map((id) => a.bookings[id]);
    expect(spawned.every((b) => ['completed', 'cancelled', 'expired'].includes(b.status))).toBe(true);
    expect(a.simulation.stats).toEqual(b.simulation.stats);
    const simTrips = Object.values(a.trips).filter((t) => t.departedAt && t.departedAt >= a.simulation.startedAt!);
    expect(simTrips.every((t) => t.boardedBookingIds.length <= t.capacity)).toBe(true);
    expect(simTrips.some((t) => t.boardedBookingIds.length >= 10)).toBe(true);
    expect(a.vehicles['GM-109'].status).not.toBe('on_trip');
    // reset clears scenario data
    const store = new Store(a);
    store.apply({ type: 'sim.reset' });
    expect(store.getState().simulation.status).toBe('idle');
    expect(Object.values(store.getState().bookings).filter((x) => x.simulated && x.createdAt >= a.simulation.startedAt!)).toHaveLength(0);
  });
});
