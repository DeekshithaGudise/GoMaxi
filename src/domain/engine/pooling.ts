import type { AppState, PoolingGroup, Trip, Vehicle } from '../types';
import { nextId, put, patch, emit, logDecision, now, vals, ACTIVE_BOOKING } from './ctx';
import { dispatchable } from './compliance';
import { fareRule } from '../seed/geo';
import { MIN, round } from '../util';

export const thresholdFor = (capacity: number, targetPct: number) => Math.max(1, Math.ceil(capacity * (targetPct / 100)));

export function activeBookingsOf(state: AppState, group: PoolingGroup) {
  return group.bookingIds.map((id) => state.bookings[id]).filter((b) => b && ACTIVE_BOOKING.has(b.status));
}

/** Pooling compatibility: same origin, same destination hotspot, group still forming, seats left, departure window still open. */
export function findCompatibleGroup(state: AppState, stationId: string, hotspotId: string): PoolingGroup | undefined {
  const t = now(state);
  return vals(state.groups)
    .filter((g) => g.status === 'forming' && g.stationId === stationId && g.hotspotId === hotspotId && !g.initiatedAt && g.deadline > t && activeBookingsOf(state, g).length < g.capacity)
    .sort((a, b) => a.openedAt - b.openedAt)[0];
}

export function openGroup(state: AppState, stationId: string, hotspotId: string, simulated = false): PoolingGroup {
  const { defaultCapacity, targetOccupancyPct, maxWaitMin } = state.settings.dispatch;
  const g: PoolingGroup = {
    id: nextId(state, 'group', 'GRP'), stationId, hotspotId, bookingIds: [], status: 'forming', openedAt: now(state), deadline: now(state) + maxWaitMin * MIN,
    capacity: defaultCapacity, threshold: thresholdFor(defaultCapacity, targetOccupancyPct), rollovers: 0,
  };
  put(state, 'groups', g);
  emit(state, 'pooling', `New pooling group ${g.id} opened: ${state.stations[stationId].name} → ${state.hotspots[hotspotId].name} (departs by ${maxWaitMin} min or at ${g.threshold} passengers)`, { groupId: g.id, stationId, hotspotId }, simulated);
  return g;
}

export function addBookingToGroup(state: AppState, groupId: string, bookingId: string) {
  const g = state.groups[groupId];
  if (g.bookingIds.includes(bookingId)) return g; // never assign a passenger twice
  const updated = patch(state, 'groups', groupId, { bookingIds: [...g.bookingIds, bookingId] });
  const n = activeBookingsOf(state, updated).length;
  const b = state.bookings[bookingId];
  patch(state, 'bookings', bookingId, { groupId, ...(g.tripId ? { tripId: g.tripId, vehicleId: g.vehicleId, status: 'assigned' as const } : {}) });
  if (g.tripId) patch(state, 'trips', g.tripId, { bookingIds: [...state.trips[g.tripId].bookingIds.filter((x) => x !== bookingId), bookingId] });
  emit(state, 'pooling', `${n} passenger${n === 1 ? '' : 's'} grouped for ${state.hotspots[g.hotspotId].name} (${n}/${g.capacity}, ${round((n / g.capacity) * 100)}% of capacity)`, { groupId, hotspotId: g.hotspotId, bookingId }, b?.simulated);
  return updated;
}

/** Rank eligible vehicles at a station: compliant + idle + available driver, prefer higher rating then fewer trips today. */
export function candidateVehicles(state: AppState, stationId: string): Vehicle[] {
  const dayStart = now(state) - ((now(state) + 5.5 * 3600000) % 86400000);
  const tripsToday = (vid: string) => vals(state.trips).filter((t) => t.vehicleId === vid && t.createdAt >= dayStart).length;
  return vals(state.vehicles)
    .filter((v) => dispatchable(state, v, stationId).eligible)
    .sort((a, b) => {
      const da = state.drivers[a.driverId!], db = state.drivers[b.driverId!];
      const ra = da.ratingCount ? da.ratingSum / da.ratingCount : 0, rb = db.ratingCount ? db.ratingSum / db.ratingCount : 0;
      return tripsToday(a.id) - tripsToday(b.id) || rb - ra;
    });
}

/** Assign the best eligible vehicle to a forming group; creates the trip awaiting driver acceptance. */
export function tryAssignVehicle(state: AppState, groupId: string, simulated = false): Trip | undefined {
  const g = state.groups[groupId];
  if (!g || g.status !== 'forming' || g.vehicleId) return undefined;
  const [v] = candidateVehicles(state, g.stationId);
  const active = activeBookingsOf(state, g);
  if (!v) {
    if (!state.dispatchLog.some((d) => d.groupId === groupId && d.decision === 'no_vehicle' && now(state) - d.at < 2 * MIN))
      logDecision(state, { groupId, decision: 'no_vehicle', passengers: active.length, capacity: g.capacity, occupancyPct: round((active.length / g.capacity) * 100, 1), rationale: 'No compliant idle vehicle with an available driver at this station; holding group.' });
    return undefined;
  }
  const rule = fareRule(g.stationId, g.hotspotId);
  const trip: Trip = {
    id: nextId(state, 'trip', 'TRP'), kind: 'pooled', groupId, vehicleId: v.id, driverId: v.driverId!, stationId: g.stationId, hotspotId: g.hotspotId, status: 'assigned',
    bookingIds: active.map((b) => b.id), boardedBookingIds: [], capacity: v.capacity, createdAt: now(state), progress: 0, position: v.position, distanceKm: rule.distanceKm,
    grossFare: 0, platformCommission: 0, driverPayout: 0, rejectedByDriverIds: [], acceptDeadline: now(state) + 45_000,
  };
  put(state, 'trips', trip);
  const threshold = thresholdFor(v.capacity, state.settings.dispatch.targetOccupancyPct);
  patch(state, 'groups', groupId, { vehicleId: v.id, tripId: trip.id, capacity: v.capacity, threshold });
  patch(state, 'vehicles', v.id, { status: 'assigned' });
  patch(state, 'drivers', v.driverId!, { availability: 'busy' });
  for (const b of active) patch(state, 'bookings', b.id, { status: 'assigned', tripId: trip.id, vehicleId: v.id });
  logDecision(state, { groupId, tripId: trip.id, vehicleId: v.id, decision: 'assign_vehicle', passengers: active.length, capacity: v.capacity, occupancyPct: round((active.length / v.capacity) * 100, 1), rationale: `Vehicle ${v.id} (${state.users[v.driverId!].name}) compliant, idle at ${state.stations[g.stationId].name}; fewest trips today among eligible.` });
  emit(state, 'dispatch', `Vehicle ${v.id} assigned to ${state.hotspots[g.hotspotId].name} group — driver ${state.users[v.driverId!].name} notified`, { groupId, tripId: trip.id, vehicleId: v.id, driverId: v.driverId }, simulated);
  return trip;
}

export function acceptTrip(state: AppState, tripId: string, auto = false) {
  const t = state.trips[tripId];
  if (!t || t.status !== 'assigned') return t;
  patch(state, 'trips', tripId, { status: 'boarding', acceptedAt: now(state) });
  patch(state, 'vehicles', t.vehicleId, { status: 'boarding' });
  emit(state, 'driver', `${state.users[t.driverId].name} ${auto ? 'auto-accepted' : 'accepted'} trip ${tripId} — ${t.vehicleId} at ${state.stations[t.stationId].pickupBay}, boarding open`, { tripId, vehicleId: t.vehicleId, driverId: t.driverId });
  return state.trips[tripId];
}

export function rejectTrip(state: AppState, tripId: string, reason = 'Driver declined') {
  const t = state.trips[tripId];
  if (!t || t.status !== 'assigned') return;
  patch(state, 'trips', tripId, { status: 'cancelled', rejectedByDriverIds: [...t.rejectedByDriverIds, t.driverId] });
  patch(state, 'vehicles', t.vehicleId, { status: 'idle' });
  // Driver who rejects goes offline for the group's purposes (cooldown) — prevents immediate reassignment loop.
  patch(state, 'drivers', t.driverId, { availability: 'offline' });
  if (t.groupId) {
    patch(state, 'groups', t.groupId, { vehicleId: undefined, tripId: undefined });
    for (const bid of state.groups[t.groupId].bookingIds) { const b = state.bookings[bid]; if (b && b.status === 'assigned') patch(state, 'bookings', bid, { status: 'confirmed', tripId: undefined, vehicleId: undefined }); }
  }
  emit(state, 'driver', `${state.users[t.driverId].name} declined trip ${tripId} (${reason}); driver set offline, re-assigning group`, { tripId, driverId: t.driverId });
  if (t.groupId) tryAssignVehicle(state, t.groupId);
}
