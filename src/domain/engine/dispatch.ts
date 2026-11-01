import type { AppState, Trip } from '../types';
import { patch, emit, logDecision, now, vals, nextId, put } from './ctx';
import { activeBookingsOf, tryAssignVehicle, openGroup, addBookingToGroup, acceptTrip } from './pooling';
import { refundPayment } from './payments';
import { splitFare } from './finance';
import { fareRule } from '../seed/geo';
import { MIN, pointAlong, bearing, round, istParts, clamp } from '../util';

const occ = (n: number, cap: number) => round((n / cap) * 100, 1);

/** Called every tick: evaluates forming groups against threshold and timeout rules. */
export function evaluateGroups(state: AppState) {
  const t = now(state);
  const s = state.settings.dispatch;
  for (const g0 of vals(state.groups)) {
    if (g0.status !== 'forming') continue;
    let g = g0;
    const active = activeBookingsOf(state, g);
    const isSim = active.length > 0 && active.every((b) => b.simulated);

    // Everyone cancelled → close group and release vehicle.
    if (active.length === 0 && g.bookingIds.length > 0) { closeEmptyGroup(state, g.id); continue; }
    if (active.length === 0) continue;

    // Need a vehicle?
    if (!g.vehicleId) {
      tryAssignVehicle(state, g.id, isSim);
      g = state.groups[g.id];
      if (!g.vehicleId && t >= g.deadline) {
        patch(state, 'groups', g.id, { deadline: t + s.maxWaitMin * MIN, rollovers: g.rollovers + 1 });
        emit(state, 'dispatch', `No eligible vehicle for ${state.hotspots[g.hotspotId].name} group — departure window extended by ${s.maxWaitMin} min`, { groupId: g.id }, isSim);
        continue;
      }
      if (!g.vehicleId) continue;
    }

    const trip = g.tripId ? state.trips[g.tripId] : undefined;
    if (!trip) continue;
    // Auto-accept if driver hasn't responded (simulated drivers always auto-accept).
    if (trip.status === 'assigned' && trip.acceptDeadline && t >= trip.acceptDeadline) acceptTrip(state, trip.id, true);
    if (state.trips[trip.id].status !== 'boarding') continue;

    const n = active.length;
    const boarded = active.filter((b) => b.status === 'boarded').length;

    if (!g.initiatedAt) {
      if (n >= g.threshold) {
        patch(state, 'groups', g.id, { initiatedAt: t, initiatedReason: 'threshold' });
        logDecision(state, { groupId: g.id, tripId: trip.id, vehicleId: g.vehicleId, decision: 'dispatch_threshold', passengers: n, capacity: g.capacity, occupancyPct: occ(n, g.capacity), rationale: `Occupancy ${occ(n, g.capacity)}% ≥ target ${s.targetOccupancyPct}% (${g.threshold}/${g.capacity}). Boarding grace ${s.boardingGraceMin} min.` });
        emit(state, 'dispatch', `Occupancy reached ${occ(n, g.capacity)}% — dispatch initiated for ${g.vehicleId} → ${state.hotspots[g.hotspotId].name}`, { groupId: g.id, tripId: trip.id, vehicleId: g.vehicleId }, isSim);
      } else if (t >= g.deadline) {
        if (n >= s.minViablePassengers || s.underfilledPolicy === 'dispatch_if_viable' && n >= s.minViablePassengers) {
          patch(state, 'groups', g.id, { initiatedAt: t, initiatedReason: 'timeout' });
          logDecision(state, { groupId: g.id, tripId: trip.id, vehicleId: g.vehicleId, decision: 'dispatch_timeout', passengers: n, capacity: g.capacity, occupancyPct: occ(n, g.capacity), rationale: `Max wait ${s.maxWaitMin} min reached with ${n} passengers (≥ viable floor ${s.minViablePassengers}); dispatching under-filled.` });
          emit(state, 'dispatch', `Max wait reached — dispatching ${g.vehicleId} with ${n}/${g.capacity} passengers (${occ(n, g.capacity)}%)`, { groupId: g.id, tripId: trip.id, vehicleId: g.vehicleId }, isSim);
        } else if (s.underfilledPolicy === 'cancel_refund' || g.rollovers >= 2) {
          logDecision(state, { groupId: g.id, tripId: trip.id, vehicleId: g.vehicleId, decision: 'cancel_refund', passengers: n, capacity: g.capacity, occupancyPct: occ(n, g.capacity), rationale: `Under-filled (${n} < ${s.minViablePassengers}) after ${g.rollovers} extension(s); cancelling with full refund.` });
          cancelGroupWithRefund(state, g.id, 'Not enough passengers for a viable departure');
        } else {
          // rollover / hold: extend window once more, keep vehicle
          patch(state, 'groups', g.id, { deadline: t + s.maxWaitMin * MIN, rollovers: g.rollovers + 1 });
          logDecision(state, { groupId: g.id, tripId: trip.id, vehicleId: g.vehicleId, decision: s.underfilledPolicy === 'rollover' ? 'rollover' : 'hold_underfilled', passengers: n, capacity: g.capacity, occupancyPct: occ(n, g.capacity), rationale: `Under-filled (${n} < ${s.minViablePassengers}); offering next departure window (+${s.maxWaitMin} min).` });
          emit(state, 'dispatch', `Group for ${state.hotspots[g.hotspotId].name} under-filled (${n}) — next departure offered in ${s.maxWaitMin} min`, { groupId: g.id }, isSim);
        }
      }
    }
    g = state.groups[g.id];
    if (g.initiatedAt && state.trips[trip.id].status === 'boarding') {
      const graceOver = t >= g.initiatedAt + s.boardingGraceMin * MIN;
      if ((boarded >= n && boarded > 0) || (graceOver && boarded > 0)) departTrip(state, trip.id, g.initiatedReason ?? 'threshold');
      else if (graceOver && boarded === 0) {
        // nobody turned up at the bay within grace: extend once, then cancel.
        if (g.rollovers < 2) { patch(state, 'groups', g.id, { initiatedAt: undefined, deadline: t + s.maxWaitMin * MIN, rollovers: g.rollovers + 1 }); emit(state, 'dispatch', `No passengers boarded ${g.vehicleId} within grace — holding for next window`, { groupId: g.id }, isSim); }
        else cancelGroupWithRefund(state, g.id, 'No passengers boarded');
      }
    }
  }
}

export function closeEmptyGroup(state: AppState, groupId: string) {
  const g = state.groups[groupId];
  patch(state, 'groups', groupId, { status: 'cancelled' });
  if (g.tripId) {
    const trip = state.trips[g.tripId];
    if (trip && (trip.status === 'assigned' || trip.status === 'boarding')) {
      patch(state, 'trips', trip.id, { status: 'cancelled' });
      releaseVehicle(state, trip.vehicleId, trip.driverId, trip.stationId);
    }
  }
  emit(state, 'pooling', `Group ${groupId} closed — all bookings cancelled`, { groupId });
}

export function cancelGroupWithRefund(state: AppState, groupId: string, reason: string) {
  const g = state.groups[groupId];
  for (const b of activeBookingsOf(state, g)) {
    patch(state, 'bookings', b.id, { status: 'cancelled', cancelledAt: now(state) });
    if (b.paymentId) refundPayment(state, b.paymentId, 1, reason);
  }
  closeEmptyGroup(state, groupId);
}

export function releaseVehicle(state: AppState, vehicleId: string, driverId: string, stationId: string) {
  const v = state.vehicles[vehicleId];
  patch(state, 'vehicles', vehicleId, { status: v.status === 'off_duty' ? 'off_duty' : 'idle', currentStationId: stationId, position: state.stations[stationId].position, availableFrom: undefined });
  const d = state.drivers[driverId];
  if (d && d.availability === 'busy') patch(state, 'drivers', driverId, { availability: 'available' });
}

/** Depart: trip goes en route with whoever has boarded; un-boarded bookings roll over to a fresh group. */
export function departTrip(state: AppState, tripId: string, reason: 'threshold' | 'timeout' | 'manual' | 'anchor_schedule') {
  const trip = state.trips[tripId];
  if (!trip || trip.status !== 'boarding') return;
  const t = now(state);
  const rule = trip.kind === 'anchor' && trip.routeStops?.length ? fareRule(trip.stationId, trip.routeStops[trip.routeStops.length - 1]) : fareRule(trip.stationId, trip.hotspotId);
  const boarded = trip.boardedBookingIds.map((id) => state.bookings[id]).filter(Boolean);
  const unboarded = trip.bookingIds.filter((id) => !trip.boardedBookingIds.includes(id)).map((id) => state.bookings[id]).filter((b) => b && (b.status === 'assigned' || b.status === 'confirmed'));
  const gross = boarded.reduce((a, b) => a + b.fare, 0);
  const split = splitFare(gross, state.settings.finance.commissionPct);
  const etaAt = t + rule.durationMin * MIN;
  patch(state, 'trips', tripId, { status: 'en_route', departedAt: t, etaAt, grossFare: gross, platformCommission: split.commission, driverPayout: split.payout, progress: 0, bookingIds: boarded.map((b) => b.id), returnEtaAt: etaAt + rule.returnMin * MIN });
  patch(state, 'vehicles', trip.vehicleId, { status: 'on_trip', currentStationId: undefined });
  if (trip.groupId) patch(state, 'groups', trip.groupId, { status: 'dispatched', dispatchedAt: t, dispatchReason: reason, bookingIds: boarded.map((b) => b.id) });
  const sim = boarded.length > 0 && boarded.every((b) => b.simulated);
  logDecision(state, { groupId: trip.groupId ?? trip.routeId ?? '-', tripId, vehicleId: trip.vehicleId, decision: reason === 'manual' ? 'dispatch_manual' : reason === 'anchor_schedule' ? 'depart_anchor' : reason === 'threshold' ? 'dispatch_threshold' : 'dispatch_timeout', passengers: boarded.length, capacity: trip.capacity, occupancyPct: occ(boarded.length, trip.capacity), rationale: `Departed with ${boarded.length}/${trip.capacity} boarded (${reason}). GBV ₹${gross}, commission ₹${split.commission}, driver ₹${split.payout}.` });
  emit(state, 'trip', `${trip.vehicleId} departed for ${state.hotspots[trip.hotspotId].name} with ${boarded.length} passenger${boarded.length === 1 ? '' : 's'} — ETA ${rule.durationMin} min`, { tripId, vehicleId: trip.vehicleId, hotspotId: trip.hotspotId }, sim);
  // Late-night safe-drop policy
  const { h } = istParts(t);
  const [nh] = state.settings.dispatch.nightSafeDropFrom.split(':').map(Number);
  if (h >= nh) {
    const id = nextId(state, 'alert', 'ALT');
    put(state, 'alerts', { id, type: 'late_night_drop', status: 'acknowledged', severity: 'low', tripId, vehicleId: trip.vehicleId, driverId: trip.driverId, message: `Safe-drop protocol active for ${trip.vehicleId}: after ${state.settings.dispatch.nightSafeDropFrom} no passenger is dropped at an isolated point; driver confirms each drop at a lit, populated location.`, createdAt: t, acknowledgedAt: t, escalation: ['Policy auto-applied at departure', 'Driver checklist shown in app'] });
  }
  // Roll over un-boarded passengers to a new group (same station/hotspot)
  if (unboarded.length && trip.groupId) {
    const ng = openGroup(state, trip.stationId, trip.hotspotId, unboarded.every((b) => b.simulated));
    for (const b of unboarded) {
      patch(state, 'bookings', b.id, { status: 'confirmed', tripId: undefined, vehicleId: undefined, rolloverCount: b.rolloverCount + 1 });
      addBookingToGroup(state, ng.id, b.id);
    }
    emit(state, 'pooling', `${unboarded.length} passenger${unboarded.length === 1 ? '' : 's'} not yet at the bay moved to next departure (${ng.id})`, { groupId: ng.id }, unboarded.every((b) => b.simulated));
    tryAssignVehicle(state, ng.id);
  }
}

/** Driver manually starts the trip (early departure) — allowed once at least one passenger boarded. */
export function manualDepart(state: AppState, tripId: string) {
  const trip = state.trips[tripId];
  if (!trip || trip.status !== 'boarding') throw new Error('Trip is not in boarding state');
  if (trip.boardedBookingIds.length === 0) throw new Error('No passengers have boarded yet');
  const g = trip.groupId ? state.groups[trip.groupId] : undefined;
  const reached = g ? trip.boardedBookingIds.length >= g.threshold : true;
  if (!reached && !state.settings.dispatch.allowDriverEarlyDeparture) throw new Error('Early departure disabled by operations; wait for threshold or timer');
  departTrip(state, tripId, reached ? 'threshold' : 'manual');
}

/** Move en-route vehicles and complete trips when they arrive. */
export function advanceTrips(state: AppState) {
  const t = now(state);
  for (const trip of vals(state.trips)) {
    if (trip.status === 'en_route' && trip.departedAt && trip.etaAt) {
      const rule = trip.kind === 'anchor' && trip.routeStops?.length ? fareRule(trip.stationId, trip.routeStops[trip.routeStops.length - 1]) : fareRule(trip.stationId, trip.hotspotId);
      const progress = clamp((t - trip.departedAt) / (trip.etaAt - trip.departedAt), 0, 1);
      const pos = pointAlong(rule.waypoints, progress);
      const prev = trip.position;
      patch(state, 'trips', trip.id, { progress, position: pos });
      patch(state, 'vehicles', trip.vehicleId, { position: pos, heading: bearing(prev, pos) || state.vehicles[trip.vehicleId].heading });
      if (progress >= 1) completeTrip(state, trip.id, true);
    }
  }
  // Returning vehicles: animate back and release when due
  for (const v of vals(state.vehicles)) {
    if (v.status === 'returning' && v.availableFrom) {
      const trip = vals(state.trips).filter((x) => x.vehicleId === v.id && x.status === 'completed').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];
      if (trip && trip.completedAt) {
        const rule = fareRule(trip.stationId, trip.hotspotId);
        const f = clamp((t - trip.completedAt) / (v.availableFrom - trip.completedAt), 0, 1);
        const pos = pointAlong([...rule.waypoints].reverse(), f);
        patch(state, 'vehicles', v.id, { position: pos, heading: bearing(v.position, pos) || v.heading });
        if (t >= v.availableFrom) { releaseVehicle(state, v.id, v.driverId!, trip.stationId); emit(state, 'trip', `${v.id} back at ${state.stations[trip.stationId].name} and available`, { vehicleId: v.id, stationId: trip.stationId }, true); }
      } else if (t >= v.availableFrom) releaseVehicle(state, v.id, v.driverId!, v.homeStationId);
    }
  }
}

export function completeTrip(state: AppState, tripId: string, auto = false) {
  const trip = state.trips[tripId];
  if (!trip || trip.status !== 'en_route') throw new Error('Trip is not en route');
  const t = now(state);
  const rule = fareRule(trip.stationId, trip.hotspotId);
  const dest = state.hotspots[trip.hotspotId].position;
  patch(state, 'trips', tripId, { status: 'completed', completedAt: t, progress: 1, position: dest });
  for (const bid of trip.boardedBookingIds) {
    const b = state.bookings[bid]; if (!b) continue;
    patch(state, 'bookings', bid, { status: 'completed', completedAt: t });
    const c = state.commuters[b.commuterId];
    if (c) patch(state, 'commuters', c.id, { totalSavings: round(c.totalSavings + (b.soloAutoFare - b.fare), 2) });
  }
  const incentive = trip.boardedBookingIds.length >= Math.ceil(trip.capacity * (state.settings.dispatch.targetOccupancyPct / 100)) ? round(trip.grossFare * (state.settings.finance.driverIncentivePct / 100), 2) : 0;
  const eid = nextId(state, 'earning', 'ERN');
  put(state, 'earnings', { id: eid, driverId: trip.driverId, tripId, grossFare: trip.grossFare, commission: trip.platformCommission, payout: trip.driverPayout, incentive, createdAt: t });
  patch(state, 'vehicles', trip.vehicleId, { status: 'returning', position: dest, availableFrom: t + rule.returnMin * MIN, odometerKm: round(state.vehicles[trip.vehicleId].odometerKm + rule.distanceKm, 1) });
  const sim = trip.boardedBookingIds.every((id) => state.bookings[id]?.simulated);
  emit(state, 'trip', `Trip ${tripId} completed at ${state.hotspots[trip.hotspotId].name}${auto ? '' : ' (driver ended trip)'} — ${trip.boardedBookingIds.length} passengers, driver earned ₹${trip.driverPayout}${incentive ? ` + ₹${incentive} incentive` : ''}, GoMaxi ₹${trip.platformCommission}`, { tripId, vehicleId: trip.vehicleId, driverId: trip.driverId }, sim);
}

export function tripFor(state: AppState, tripId: string): Trip | undefined { return state.trips[tripId]; }
