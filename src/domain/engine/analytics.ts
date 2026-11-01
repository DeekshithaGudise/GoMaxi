import type { AppState, Vehicle, ScheduleBlock } from '../types';
import { vals } from './ctx';
import { dayStartOf, istParts, round, avg, sum, HOUR } from '../util';
import { vehicleEligibility } from './compliance';
import { stationAffinity } from './demand';

export const today = (state: AppState) => dayStartOf(state.clock.simTime);

export function overviewMetrics(state: AppState) {
  const bookings = vals(state.bookings), trips = vals(state.trips), vehicles = vals(state.vehicles), drivers = vals(state.drivers);
  const completedTrips = trips.filter((t) => t.status === 'completed');
  const gbv = sum(completedTrips.map((t) => t.grossFare));
  const commission = sum(completedTrips.map((t) => t.platformCommission));
  const day = today(state);
  const tToday = completedTrips.filter((t) => (t.completedAt ?? 0) >= day);
  const bToday = bookings.filter((b) => b.createdAt >= day && b.status !== 'payment_failed');
  const servedBookings = bookings.filter((b) => b.status === 'completed');
  return {
    registeredCommuters: vals(state.users).filter((u) => u.role === 'commuter').length,
    activeDrivers: drivers.filter((d) => d.availability !== 'offline').length,
    availableVehicles: vehicles.filter((v) => v.status === 'idle' && vehicleEligibility(v).eligible).length,
    eligibleVehicles: vehicles.filter((v) => vehicleEligibility(v).eligible).length,
    totalVehicles: vehicles.length,
    activeTrips: trips.filter((t) => ['assigned', 'boarding', 'en_route'].includes(t.status)).length,
    enRoute: trips.filter((t) => t.status === 'en_route').length,
    totalBookings: bookings.filter((b) => b.status !== 'payment_failed').length,
    bookingsToday: bToday.length,
    activeBookings: bookings.filter((b) => ['confirmed', 'assigned', 'boarded'].includes(b.status)).length,
    completedTrips: completedTrips.length,
    tripsToday: tToday.length,
    avgOccupancyPct: completedTrips.length ? round(avg(completedTrips.map((t) => (t.boardedBookingIds.length / t.capacity) * 100)), 1) : 0,
    gbv, commission, driverPayouts: sum(completedTrips.map((t) => t.driverPayout)),
    gbvToday: sum(tToday.map((t) => t.grossFare)), commissionToday: sum(tToday.map((t) => t.platformCommission)),
    passengersServed: servedBookings.length,
    // Each shared seat replaces an estimated 0.55 private/solo vehicle trips (autos, bike taxis, cars) — illustrative factor.
    privateTripsReplaced: Math.round(servedBookings.length * 0.55),
    passengerSavings: sum(servedBookings.map((b) => b.soloAutoFare - b.fare)),
    avgFare: servedBookings.length ? round(avg(servedBookings.map((b) => b.fare)), 1) : 0,
    openAlerts: vals(state.alerts).filter((a) => a.status !== 'resolved').length,
  };
}

export function stationAnalytics(state: AppState, stationId: string) {
  const st = state.stations[stationId];
  const bookings = vals(state.bookings).filter((b) => b.stationId === stationId && b.status !== 'payment_failed');
  const completed = bookings.filter((b) => b.status === 'completed');
  const day = today(state);
  const days = [5, 4, 3, 2, 1].map((ago) => {
    const from = day - ago * 86400000, to = from + 86400000;
    const bs = completed.filter((b) => b.createdAt >= from && b.createdAt < to);
    return { label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][istParts(from).day], bookings: bs.length, arrivals: st.dailyExits };
  });
  const byHour: { hour: number; bookings: number; arrivals: number }[] = [];
  for (let h = 6; h <= 21; h++) {
    const profile: Record<number, number> = { 6: 0.01, 7: 0.04, 8: 0.1, 9: 0.16, 10: 0.11, 11: 0.05, 12: 0.03, 13: 0.03, 14: 0.03, 15: 0.03, 16: 0.04, 17: 0.08, 18: 0.13, 19: 0.1, 20: 0.05, 21: 0.01 };
    byHour.push({ hour: h, bookings: completed.filter((b) => istParts(b.createdAt).h === h).length / 5, arrivals: Math.round(st.dailyExits * (profile[h] ?? 0)) });
  }
  const destCounts: Record<string, number> = {};
  for (const b of bookings) destCounts[b.hotspotId] = (destCounts[b.hotspotId] ?? 0) + 1;
  const destinations = Object.entries(destCounts).map(([id, n]) => ({ hotspot: state.hotspots[id], bookings: n, share: bookings.length ? round((n / bookings.length) * 100, 1) : 0 })).sort((a, b) => b.bookings - a.bookings);
  const groups = vals(state.groups).filter((g) => g.stationId === stationId && g.status === 'dispatched' && g.dispatchedAt);
  const waits = groups.flatMap((g) => g.bookingIds.map((id) => state.bookings[id]).filter(Boolean).map((b) => ((g.dispatchedAt ?? b.createdAt) - b.createdAt) / 60000));
  const peak = byHour.reduce((a, b) => (b.bookings > a.bookings ? b : a), byHour[0]);
  const dailyBookings = completed.length / 5;
  const conversion = st.dailyExits ? (dailyBookings / st.dailyExits) * 100 : 0;
  const addressable = Object.values(stationAffinity(stationId)).length ? st.dailyExits * 0.3 : st.dailyExits; // ~30% of exits are last-mile trips (assumption)
  return {
    station: st, bookings: bookings.length, completed: completed.length, dailyBookings: round(dailyBookings, 1), days, byHour, destinations,
    avgWaitMin: waits.length ? round(avg(waits), 1) : 0, peakHour: peak?.hour ?? 9, conversionPct: round(conversion, 2), addressableConversionPct: round(addressable ? (dailyBookings / addressable) * 100 : 0, 2),
    // Ridership uplift: assume 35% of GoMaxi riders would otherwise not have used metro for this leg (illustrative, to be validated by survey)
    ridershipUplift: Math.round(dailyBookings * 0.35),
    bookingsToday: bookings.filter((b) => b.createdAt >= day).length,
    activeNow: bookings.filter((b) => ['confirmed', 'assigned', 'boarded'].includes(b.status)).length,
    revenue: sum(completed.map((b) => b.fare)),
  };
}

const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h + m / 60; };
export function utilisationFor(state: AppState, v: Vehicle) {
  const sched = state.schedules[v.id];
  const blocks: ScheduleBlock[] = sched?.blocks ?? [];
  const hours = (k: ScheduleBlock['kind'][]) => sum(blocks.filter((b) => k.includes(b.kind)).map((b) => hm(b.end) - hm(b.start)));
  const windowStart = 6.5, windowEnd = 20.5;
  const totalWindow = windowEnd - windowStart;
  const committed = hours(['school_commitment']);
  const gomaxi = hours(['gomaxi_feeder', 'anchor_route']);
  const maintenance = hours(['maintenance']);
  const scheduledIdle = totalWindow - committed - gomaxi - maintenance;
  const tripsToday = vals(state.trips).filter((t) => t.vehicleId === v.id && t.status === 'completed' && (t.completedAt ?? 0) >= today(state));
  const revenueToday = sum(tripsToday.map((t) => t.grossFare));
  const allTrips = vals(state.trips).filter((t) => t.vehicleId === v.id && t.status === 'completed');
  return {
    vehicle: v, blocks, totalWindow, committed, gomaxi, maintenance, idle: round(scheduledIdle, 1), revenueHours: round(committed + gomaxi, 1),
    utilisationPct: round(((committed + gomaxi) / totalWindow) * 100, 1), gomaxiSharePct: round((gomaxi / totalWindow) * 100, 1),
    tripsToday: tripsToday.length, revenueToday, lifetimeGbv: sum(allTrips.map((t) => t.grossFare)), lifetimeTrips: allTrips.length,
    baselineUtilisationPct: round((committed / totalWindow) * 100, 1),
  };
}

export function fleetUtilisation(state: AppState) {
  const rows = vals(state.vehicles).map((v) => utilisationFor(state, v));
  return {
    rows,
    totals: {
      available: round(sum(rows.map((r) => r.totalWindow)), 1), committed: round(sum(rows.map((r) => r.committed)), 1), gomaxi: round(sum(rows.map((r) => r.gomaxi)), 1),
      idle: round(sum(rows.map((r) => r.idle)), 1), maintenance: round(sum(rows.map((r) => r.maintenance)), 1),
      utilisationPct: round(avg(rows.map((r) => r.utilisationPct)), 1), baselinePct: round(avg(rows.map((r) => r.baselineUtilisationPct)), 1),
    },
  };
}

export function financialActuals(state: AppState) {
  const trips = vals(state.trips).filter((t) => t.status === 'completed');
  const day = today(state);
  const byVehicle = vals(state.vehicles).map((v) => { const ts = trips.filter((t) => t.vehicleId === v.id); return { vehicle: v, trips: ts.length, gbv: sum(ts.map((t) => t.grossFare)), commission: sum(ts.map((t) => t.platformCommission)), payout: sum(ts.map((t) => t.driverPayout)), occupancy: ts.length ? round(avg(ts.map((t) => (t.boardedBookingIds.length / t.capacity) * 100)), 1) : 0 }; }).sort((a, b) => b.gbv - a.gbv);
  const byStation = vals(state.stations).map((s) => { const ts = trips.filter((t) => t.stationId === s.id); return { station: s, trips: ts.length, gbv: sum(ts.map((t) => t.grossFare)), commission: sum(ts.map((t) => t.platformCommission)), passengers: sum(ts.map((t) => t.boardedBookingIds.length)) }; }).sort((a, b) => b.gbv - a.gbv);
  const days = [5, 4, 3, 2, 1, 0].map((ago) => { const from = day - ago * 86400000, to = from + 86400000; const ts = trips.filter((t) => (t.completedAt ?? 0) >= from && (t.completedAt ?? 0) < to); return { label: ago === 0 ? 'Today' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][istParts(from).day], gbv: sum(ts.map((t) => t.grossFare)), commission: sum(ts.map((t) => t.platformCommission)), payout: sum(ts.map((t) => t.driverPayout)), trips: ts.length }; });
  const payments = vals(state.payments);
  const byMethod = (['upi', 'card', 'wallet'] as const).map((m) => ({ method: m, count: payments.filter((p) => p.method === m && p.status !== 'failed').length, amount: sum(payments.filter((p) => p.method === m && p.status === 'success').map((p) => p.amount)) }));
  const seatsBooked = sum(trips.map((t) => t.boardedBookingIds.length));
  return {
    gbv: sum(trips.map((t) => t.grossFare)), commission: sum(trips.map((t) => t.platformCommission)), payout: sum(trips.map((t) => t.driverPayout)), trips: trips.length,
    avgFare: seatsBooked ? round(sum(trips.map((t) => t.grossFare)) / seatsBooked, 1) : 0, avgOccupancy: trips.length ? round(avg(trips.map((t) => (t.boardedBookingIds.length / t.capacity) * 100)), 1) : 0,
    byVehicle, byStation, days, byMethod, refunds: sum(payments.filter((p) => p.status === 'refunded').map((p) => p.refundAmount ?? 0)), failedPayments: payments.filter((p) => p.status === 'failed').length,
    incentives: sum(vals(state.earnings).map((e) => e.incentive)),
  };
}

export function driverStats(state: AppState, driverId: string) {
  const d = state.drivers[driverId];
  const day = today(state);
  const earnings = vals(state.earnings).filter((e) => e.driverId === driverId);
  const todayE = earnings.filter((e) => e.createdAt >= day);
  const trips = vals(state.trips).filter((t) => t.driverId === driverId);
  const completedToday = trips.filter((t) => t.status === 'completed' && (t.completedAt ?? 0) >= day);
  const current = trips.find((t) => ['assigned', 'boarding', 'en_route'].includes(t.status));
  const upcoming = trips.filter((t) => t.status === 'scheduled' || (t.kind === 'anchor' && t.status === 'assigned' && t.scheduledDepartureAt && t.scheduledDepartureAt > state.clock.simTime)).sort((a, b) => (a.scheduledDepartureAt ?? 0) - (b.scheduledDepartureAt ?? 0));
  const hoursToday = d.shiftStart ? (state.clock.simTime - d.shiftStart) / HOUR : 0;
  return {
    driver: d, user: state.users[driverId], vehicle: d.vehicleId ? state.vehicles[d.vehicleId] : undefined,
    todayEarnings: sum(todayE.map((e) => e.payout + e.incentive)), todayIncentives: sum(todayE.map((e) => e.incentive)), todayGbv: sum(todayE.map((e) => e.grossFare)), todayCommission: sum(todayE.map((e) => e.commission)),
    weekEarnings: sum(earnings.filter((e) => e.createdAt >= day - 6 * 86400000).map((e) => e.payout + e.incentive)), lifetimeEarnings: sum(earnings.map((e) => e.payout + e.incentive)),
    completedToday: completedToday.length, completedTotal: trips.filter((t) => t.status === 'completed').length, current, upcoming, rating: d.ratingCount ? round(d.ratingSum / d.ratingCount, 2) : 0,
    hoursToday: round(hoursToday, 1), history: trips.filter((t) => t.status === 'completed').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    occupancyToday: completedToday.length ? round(avg(completedToday.map((t) => (t.boardedBookingIds.length / t.capacity) * 100)), 0) : 0,
  };
}
