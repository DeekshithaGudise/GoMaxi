import type { AppState, Booking, BoardingRecord, Commuter, DriverEarning, Payment, Trip, User, PoolingGroup, DispatchSettings, DemandWeights, SimulationParams } from '../types';
import { DEMO_DAY_START, MIN, mulberry32, makeToken, timeAt, HOUR, round } from '../util';
import { STATIONS, HOTSPOTS, FARE_RULES, fareRule, soloAutoFare, bikeTaxiFare } from '../seed/geo';
import { seedCommuters, seedDrivers, seedAdmins, seedVehicles, seedSchedules, OPERATORS, ANCHOR_ROUTES } from '../seed/people';
import { DEFAULT_FINANCE, splitFare } from '../engine/finance';

export const SEED_VERSION = '2026.11.01-r1';
export const STATE_VERSION = 1;

export const DEFAULT_DISPATCH: DispatchSettings = {
  defaultCapacity: 12, targetOccupancyPct: 80, maxWaitMin: 5, minViablePassengers: 3, underfilledPolicy: 'dispatch_if_viable',
  boardingGraceMin: 2, bookingExpiryMin: 30, allowDriverEarlyDeparture: true, nightSafeDropFrom: '20:00',
};
export const DEFAULT_WEIGHTS: DemandWeights = { historicalBookings: 0.3, metroExits: 0.2, officeHeadcount: 0.2, shiftAlignment: 0.1, residentialDensity: 0.1, transitGap: 0.1 };
export const DEFAULT_SIM: SimulationParams = { stationId: 'st-byp', primaryHotspotId: 'hs-whf', demand: 35, vehicles: 5, startTime: '09:00', arrivalWindowMin: 12, hotspotMix: 0.8, seed: 42 };

const HIST_COLORS = ['#64748B', '#475569', '#334155'];
const HIST_FIRST = ['Aarav', 'Ishita', 'Kavya', 'Nikhil', 'Rhea', 'Varun', 'Anjali', 'Dev', 'Tanvi', 'Yash', 'Neha', 'Kiran', 'Sanjana', 'Harsha', 'Pallavi', 'Mohit', 'Swati', 'Ajay', 'Bhavana', 'Chetan'];
const HIST_LAST = ['Nair', 'Shetty', 'Patil', 'Rao', 'Joshi', 'Bhat', 'Reddy', 'Kumar', 'Mishra', 'Pandey', 'Hegde', 'Gowda'];

/** Hotspot affinity per station (illustrative destination distribution). */
const AFFINITY: Record<string, Record<string, number>> = {
  'st-byp': { 'hs-whf': 0.34, 'hs-itpl': 0.2, 'hs-bag': 0.22, 'hs-hoo': 0.1, 'hs-orr': 0.1, 'hs-man': 0.04 },
  'st-krp': { 'hs-whf': 0.3, 'hs-itpl': 0.25, 'hs-hoo': 0.2, 'hs-orr': 0.15, 'hs-bag': 0.1 },
  'st-ind': { 'hs-bag': 0.25, 'hs-orr': 0.35, 'hs-hsr': 0.2, 'hs-whf': 0.1, 'hs-man': 0.1 },
  'st-mgr': { 'hs-man': 0.35, 'hs-orr': 0.25, 'hs-ecy': 0.2, 'hs-hsr': 0.12, 'hs-bag': 0.08 },
  'st-tri': { 'hs-orr': 0.35, 'hs-bag': 0.25, 'hs-man': 0.2, 'hs-hsr': 0.2 },
};
const STATION_TRIPS_PER_DAY: Record<string, number> = { 'st-byp': 9, 'st-krp': 6, 'st-ind': 4, 'st-mgr': 4, 'st-tri': 3 };

export function pickWeighted<T extends string>(weights: Record<T, number>, r: number): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  for (const [k, w] of entries) { acc += w / total; if (r <= acc) return k; }
  return entries[entries.length - 1][0];
}

export function createInitialState(opts: { withHistory?: boolean; startTime?: string } = {}): AppState {
  const { withHistory = true, startTime = '08:55' } = opts;
  const rng = mulberry32(20261101);
  const { users: cUsers, commuters } = seedCommuters();
  const { users: dUsers, drivers } = seedDrivers();
  const vehicles = seedVehicles();
  const admins = seedAdmins();

  // Historical commuter pool (anonymised accounts) so history + simulation don't pollute the named demo accounts.
  const histUsers: User[] = []; const histCommuters: Commuter[] = [];
  for (let i = 0; i < 60; i++) {
    const id = `usr-h${String(i + 1).padStart(2, '0')}`;
    const name = `${HIST_FIRST[i % HIST_FIRST.length]} ${HIST_LAST[Math.floor(i / HIST_FIRST.length) % HIST_LAST.length]}`;
    const female = i % 5 === 0 || i % 5 === 3;
    const st = STATIONS[i % STATIONS.length];
    histUsers.push({ id, role: 'commuter', name, phone: `+91 97400 ${String(10000 + i * 97).slice(0, 5)}`, gender: female ? 'female' : 'male', avatarColor: HIST_COLORS[i % 3], createdAt: DEMO_DAY_START - (40 + i) * 86400000 });
    histCommuters.push({ id, userId: id, homeStationId: st.id, preferredHotspotId: pickWeighted(AFFINITY[st.id], rng()), womenPriorityDefault: female && i % 2 === 0, emergencyContacts: [], walletBalance: 100 + (i % 7) * 50, totalSavings: 0 });
  }

  const state: AppState = {
    version: STATE_VERSION, seedVersion: SEED_VERSION,
    clock: { simTime: timeAt(startTime), speed: 1, running: true },
    users: Object.fromEntries([...cUsers, ...dUsers, ...admins, ...histUsers].map((u) => [u.id, u])),
    commuters: Object.fromEntries([...commuters, ...histCommuters].map((c) => [c.id, c])),
    drivers: Object.fromEntries(drivers.map((d) => [d.id, d])),
    operators: Object.fromEntries(OPERATORS.map((o) => [o.id, o])),
    vehicles: Object.fromEntries(vehicles.map((v) => [v.id, v])),
    stations: Object.fromEntries(STATIONS.map((s) => [s.id, s])),
    hotspots: Object.fromEntries(HOTSPOTS.map((h) => [h.id, h])),
    fareRules: FARE_RULES,
    anchorRoutes: Object.fromEntries(ANCHOR_ROUTES.map((r) => [r.id, r])),
    bookings: {}, groups: {}, trips: {}, payments: {}, boardingRecords: {}, alerts: {}, earnings: {},
    schedules: Object.fromEntries(seedSchedules(vehicles).map((s) => [s.vehicleId, s])),
    dispatchLog: [], activity: [],
    settings: { dispatch: { ...DEFAULT_DISPATCH }, finance: { ...DEFAULT_FINANCE }, demandWeights: { ...DEFAULT_WEIGHTS } },
    simulation: { status: 'idle', params: { ...DEFAULT_SIM }, scheduledArrivals: [], nextArrivalIdx: 0, spawnedBookingIds: [], rngState: 42, stats: { arrivals: 0, bookings: 0, dispatches: 0, boarded: 0, completed: 0, refunded: 0 } },
    counters: { booking: 10000, group: 500, trip: 3000, payment: 70000, boarding: 1, alert: 100, earning: 1, decision: 1, event: 1, user: 1, route: 10 },
  };

  if (withHistory) generateHistory(state, rng, histCommuters.map((c) => c.id));

  // One illustrative resolved safety incident in history + policy note
  state.alerts['ALT-100'] = {
    id: 'ALT-100', type: 'incident_report', status: 'resolved', severity: 'medium', raisedByUserId: 'usr-c07', vehicleId: 'GM-106', driverId: 'usr-d06',
    message: 'Passenger reported vehicle waiting beyond bay time limit and blocking exit. Operator counselled.',
    createdAt: DEMO_DAY_START - 2 * 86400000 + 18.5 * HOUR, acknowledgedAt: DEMO_DAY_START - 2 * 86400000 + 18.6 * HOUR, resolvedAt: DEMO_DAY_START - 86400000 + 10 * HOUR,
    resolutionNote: 'Bay discipline reinforced with operator; no further incidents.', escalation: ['Logged by passenger via app', 'Ops desk acknowledged (6 min)', 'Operator notified', 'Closed after driver briefing'],
  };
  return state;
}

/** Deterministic completed trips over the previous 5 weekdays so analytics reflect real entity data. */
function generateHistory(state: AppState, rng: () => number, pool: string[]) {
  const commission = state.settings.finance.commissionPct;
  const days = [1, 2, 3, 4, 5]; // days ago (Fri, Thu, Wed, Tue, Mon of previous week)
  for (const ago of days) {
    const dayStart = DEMO_DAY_START - ago * 86400000;
    for (const st of STATIONS) {
      const n = STATION_TRIPS_PER_DAY[st.id] + (ago === 5 ? -1 : 0) + (ago === 1 ? 1 : 0);
      const vehiclesHere = Object.values(state.vehicles).filter((v) => v.homeStationId === st.id && v.compliance.every((c) => c.key === 'vlt_panic' || c.key === 'speed_governor' || c.status === 'verified'));
      const fleet = vehiclesHere.length ? vehiclesHere : Object.values(state.vehicles).slice(0, 3);
      for (let i = 0; i < n; i++) {
        const morning = i % 5 !== 2 && i % 5 !== 4; // ~60% morning
        const base = morning ? 9 * HOUR + Math.floor(rng() * 110) * MIN : 17 * HOUR + Math.floor(rng() * 190) * MIN;
        const openedAt = dayStart + base;
        const hotspotId = pickWeighted(AFFINITY[st.id], rng());
        const rule = fareRule(st.id, hotspotId);
        const vehicle = fleet[i % fleet.length];
        const driverId = vehicle.driverId!;
        const pax = 7 + Math.floor(rng() * 6); // 7..12
        const threshold = Math.ceil(vehicle.capacity * 0.8);
        const dispatchReason = pax >= threshold ? 'threshold' : 'timeout';
        const waitMin = dispatchReason === 'threshold' ? 2 + rng() * 2.5 : 5;
        const dispatchedAt = openedAt + waitMin * MIN;
        const departedAt = dispatchedAt + (1 + rng()) * MIN;
        const completedAt = departedAt + rule.durationMin * MIN * (0.9 + rng() * 0.3);
        const tripId = `TRP-${state.counters.trip++}`;
        const groupId = `GRP-${state.counters.group++}`;
        const bookingIds: string[] = [];
        let gross = 0;
        const used = new Set<string>();
        for (let p = 0; p < pax; p++) {
          let cid = pool[Math.floor(rng() * pool.length)];
          let guard = 0; while (used.has(cid) && guard++ < 10) cid = pool[Math.floor(rng() * pool.length)];
          used.add(cid);
          const bId = `GMB-${state.counters.booking++}`;
          const payId = `PAY-${state.counters.payment++}`;
          const createdAt = openedAt + rng() * waitMin * MIN * 0.95;
          const method = (['upi', 'upi', 'upi', 'card', 'wallet'] as const)[Math.floor(rng() * 5)];
          const b: Booking = {
            id: bId, commuterId: cid, stationId: st.id, hotspotId, groupId, tripId, vehicleId: vehicle.id, status: 'completed', fare: rule.fare,
            soloAutoFare: soloAutoFare(rule.distanceKm), bikeTaxiFare: bikeTaxiFare(rule.distanceKm), womenPriority: state.commuters[cid].womenPriorityDefault,
            paymentId: payId, qrToken: makeToken(rng), qrUsedAt: createdAt + 1.5 * MIN, createdAt, expiresAt: createdAt + 20 * MIN, boardedAt: createdAt + 1.5 * MIN, completedAt,
            rating: rng() < 0.7 ? 5 : rng() < 0.6 ? 4 : 3, simulated: true, rolloverCount: 0,
          };
          const pay: Payment = { id: payId, bookingId: bId, commuterId: cid, method, amount: rule.fare, status: 'success', gatewayRef: `SIM${String(Math.floor(rng() * 1e9)).padStart(9, '0')}`, createdAt, simulated: true };
          const br: BoardingRecord = { id: `BRD-${state.counters.boarding++}`, bookingId: bId, tripId, vehicleId: vehicle.id, driverId, method: rng() < 0.9 ? 'qr' : 'manual', scannedAt: b.boardedAt!, result: 'accepted' };
          state.bookings[bId] = b; state.payments[payId] = pay; state.boardingRecords[br.id] = br;
          state.commuters[cid] = { ...state.commuters[cid], totalSavings: round(state.commuters[cid].totalSavings + (b.soloAutoFare - b.fare), 2) };
          bookingIds.push(bId); gross += rule.fare;
          if (b.rating) { const d = state.drivers[driverId]; state.drivers[driverId] = { ...d, ratingSum: d.ratingSum + b.rating, ratingCount: d.ratingCount + 1 }; }
        }
        const split = splitFare(gross, commission);
        const group: PoolingGroup = { id: groupId, stationId: st.id, hotspotId, bookingIds, status: 'dispatched', vehicleId: vehicle.id, tripId, openedAt, deadline: openedAt + 5 * MIN, capacity: vehicle.capacity, threshold, dispatchedAt, dispatchReason, initiatedAt: dispatchedAt, initiatedReason: dispatchReason, rollovers: 0 };
        const trip: Trip = {
          id: tripId, kind: 'pooled', groupId, vehicleId: vehicle.id, driverId, stationId: st.id, hotspotId, status: 'completed', bookingIds, boardedBookingIds: bookingIds, capacity: vehicle.capacity,
          createdAt: openedAt + 20_000, acceptedAt: openedAt + 50_000, departedAt, etaAt: departedAt + rule.durationMin * MIN, completedAt, progress: 1, position: state.hotspots[hotspotId].position,
          distanceKm: rule.distanceKm, grossFare: gross, platformCommission: split.commission, driverPayout: split.payout, rejectedByDriverIds: [],
        };
        state.groups[groupId] = group; state.trips[tripId] = trip;
        const eid = `ERN-${state.counters.earning++}`;
        const incentive = pax >= 10 ? 10 : 0;
        state.earnings[eid] = { id: eid, driverId, tripId, grossFare: gross, commission: split.commission, payout: split.payout, incentive, createdAt: completedAt } as DriverEarning;
        state.dispatchLog.push({ id: `DEC-${state.counters.decision++}`, at: dispatchedAt, groupId, tripId, vehicleId: vehicle.id, decision: dispatchReason === 'threshold' ? 'dispatch_threshold' : 'dispatch_timeout', passengers: pax, capacity: vehicle.capacity, occupancyPct: round((pax / vehicle.capacity) * 100, 1), rationale: dispatchReason === 'threshold' ? `Threshold ${threshold} reached` : `Max wait reached with ${pax} passengers (viable)` });
        state.vehicles[vehicle.id] = { ...state.vehicles[vehicle.id], odometerKm: round(state.vehicles[vehicle.id].odometerKm + rule.distanceKm * 1.8, 1) };
      }
    }
  }
  state.dispatchLog = state.dispatchLog.slice(-400);
}
