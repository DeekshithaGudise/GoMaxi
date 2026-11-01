import type { AppState, AnchorRoute, Trip } from '../types';
import { nextId, put, patch, emit, logDecision, now, vals } from './ctx';
import { dispatchable } from './compliance';
import { departTrip } from './dispatch';
import { fareRule } from '../seed/geo';
import { dayStartOf, timeAt, MIN } from '../util';

/** Scheduled anchor-route departures for today (generated lazily 15 min before each slot). */
export function scheduleAnchorDepartures(state: AppState) {
  const t = now(state);
  const day = dayStartOf(t);
  for (const route of vals(state.anchorRoutes)) {
    if (!route.active) continue;
    const start = timeAt(route.windowStart, day), end = timeAt(route.windowEnd, day);
    for (let dep = start; dep <= end; dep += route.frequencyMin * MIN) {
      if (dep - t > 15 * MIN || dep < t - 60 * MIN) continue;
      const exists = vals(state.trips).some((x) => x.kind === 'anchor' && x.routeId === route.id && x.scheduledDepartureAt === dep);
      if (exists) continue;
      createAnchorTrip(state, route, dep);
    }
  }
  // lifecycle: scheduled → boarding at T-10 → depart at T → completion handled by advanceTrips
  for (const trip of vals(state.trips)) {
    if (trip.kind !== 'anchor' || !trip.scheduledDepartureAt) continue;
    if (trip.status === 'assigned' && t >= trip.scheduledDepartureAt - 10 * MIN) {
      patch(state, 'trips', trip.id, { status: 'boarding', acceptedAt: t });
      patch(state, 'vehicles', trip.vehicleId, { status: 'boarding' });
      emit(state, 'trip', `Anchor route ${state.anchorRoutes[trip.routeId!]?.name} — ${trip.vehicleId} boarding for ${fmt(state, trip)} departure`, { tripId: trip.id, vehicleId: trip.vehicleId });
    }
    if (trip.status === 'boarding' && t >= trip.scheduledDepartureAt) {
      if (trip.boardedBookingIds.length > 0) departTrip(state, trip.id, 'anchor_schedule');
      else if (t >= trip.scheduledDepartureAt + 5 * MIN) {
        patch(state, 'trips', trip.id, { status: 'cancelled' });
        patch(state, 'vehicles', trip.vehicleId, { status: 'idle' });
        const d = state.drivers[trip.driverId]; if (d.availability === 'busy') patch(state, 'drivers', trip.driverId, { availability: 'available' });
        logDecision(state, { groupId: trip.routeId!, tripId: trip.id, vehicleId: trip.vehicleId, decision: 'cancel_refund', passengers: 0, capacity: trip.capacity, occupancyPct: 0, rationale: 'Scheduled anchor departure had no boarded passengers; slot released.' });
        emit(state, 'trip', `Anchor departure ${trip.id} released — no passengers`, { tripId: trip.id });
      }
    }
  }
}

const fmt = (state: AppState, trip: Trip) => { const d = new Date((trip.scheduledDepartureAt ?? 0) + 5.5 * 3600000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; void state; };

function createAnchorTrip(state: AppState, route: AnchorRoute, dep: number): Trip | undefined {
  const dest = route.stopHotspotIds[route.stopHotspotIds.length - 1];
  const v = route.vehicleIds.map((id) => state.vehicles[id]).find((x) => x && dispatchable(state, x, route.originStationId).eligible);
  if (!v) {
    if (!state.activity.some((e) => e.message.includes(`No eligible vehicle for anchor route ${route.name}`) && now(state) - e.at < 15 * MIN))
      emit(state, 'dispatch', `No eligible vehicle for anchor route ${route.name} slot ${fmtHM(dep)} — slot skipped`, { stationId: route.originStationId });
    return undefined;
  }
  const rule = fareRule(route.originStationId, dest);
  const trip: Trip = {
    id: nextId(state, 'trip', 'TRP'), kind: 'anchor', routeId: route.id, vehicleId: v.id, driverId: v.driverId!, stationId: route.originStationId, hotspotId: dest, status: 'assigned', bookingIds: [], boardedBookingIds: [],
    capacity: Math.min(route.capacity, v.capacity), createdAt: now(state), scheduledDepartureAt: dep, progress: 0, position: v.position, distanceKm: rule.distanceKm, grossFare: 0, platformCommission: 0, driverPayout: 0,
    rejectedByDriverIds: [], routeStops: route.stopHotspotIds, acceptDeadline: now(state) + 45_000,
  };
  put(state, 'trips', trip);
  patch(state, 'vehicles', v.id, { status: 'assigned' });
  patch(state, 'drivers', v.driverId!, { availability: 'busy' });
  emit(state, 'dispatch', `Anchor route ${route.name}: ${v.id} scheduled for ${fmtHM(dep)} departure (${route.stopHotspotIds.map((h) => state.hotspots[h].name).join(' → ')})`, { tripId: trip.id, vehicleId: v.id });
  return trip;
}
const fmtHM = (t: number) => { const d = new Date(t + 5.5 * 3600000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

export function upsertRoute(state: AppState, route: AnchorRoute) { put(state, 'anchorRoutes', route); emit(state, 'system', `Anchor route "${route.name}" saved`, {}); }
export function deleteRoute(state: AppState, id: string) {
  const next = { ...state.anchorRoutes }; delete next[id]; state.anchorRoutes = next;
  emit(state, 'system', `Anchor route ${id} removed`, {});
}
