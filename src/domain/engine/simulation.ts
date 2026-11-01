import type { AppState, SimulationParams } from '../types';
import { emit, now, vals, patch, ACTIVE_BOOKING } from './ctx';
import { createBooking, activeBookingFor } from './booking';
import { validateAndBoard } from './boarding';
import { mulberry32, timeAt, dayStartOf, MIN } from '../util';
import { pickWeighted } from '../store/initialState';

const AFFINITY_FALLBACK: Record<string, number> = { 'hs-itpl': 0.45, 'hs-bag': 0.35, 'hs-orr': 0.2 };

export function startSimulation(state: AppState, params: SimulationParams) {
  const rng = mulberry32(params.seed);
  const day = dayStartOf(now(state));
  const startAt = timeAt(params.startTime, day);
  // Arrivals: Poisson-ish arrivals over the window, front-loaded like a metro train disgorging passengers.
  const arrivals: AppState['simulation']['scheduledArrivals'] = [];
  const pool = vals(state.commuters).filter((c) => c.id.startsWith('usr-h'));
  for (let i = 0; i < params.demand; i++) {
    const u = rng();
    const frac = Math.pow(u, 1.35); // front-loaded
    const burst = Math.floor(rng() * 4) * 0.02;
    const at = startAt + Math.round((frac + burst) * params.arrivalWindowMin * MIN);
    const hotspotId = rng() < params.hotspotMix ? params.primaryHotspotId : pickWeighted(AFFINITY_FALLBACK, rng());
    const commuterIdx = Math.floor(rng() * pool.length);
    arrivals.push({ at, commuterIdx, hotspotId, womenPriority: rng() < 0.3 });
  }
  arrivals.sort((a, b) => a.at - b.at);
  // Vehicle availability: ensure exactly `params.vehicles` eligible vehicles idle at the station.
  const here = vals(state.vehicles).filter((v) => v.currentStationId === params.stationId && v.status === 'idle');
  const eligibleHere = here.filter((v) => v.compliance.every((c) => !['registration', 'contract_carriage_permit', 'insurance', 'fitness', 'puc', 'road_tax'].includes(c.key) || c.status === 'verified'));
  let count = eligibleHere.length;
  if (count > params.vehicles) {
    for (const v of eligibleHere.slice(params.vehicles)) { patch(state, 'vehicles', v.id, { status: 'off_duty' }); count--; }
  } else if (count < params.vehicles) {
    const elsewhere = vals(state.vehicles).filter((v) => v.currentStationId !== params.stationId && v.status === 'idle' && v.driverId && state.drivers[v.driverId].availability === 'available');
    for (const v of elsewhere) {
      if (count >= params.vehicles) break;
      patch(state, 'vehicles', v.id, { currentStationId: params.stationId, position: state.stations[params.stationId].position });
      emit(state, 'system', `${v.id} repositioned to ${state.stations[params.stationId].name} for the scenario`, { vehicleId: v.id }, true);
      count++;
    }
  }
  for (const d of vals(state.drivers)) if (d.availability === 'offline' && d.vehicleId && state.vehicles[d.vehicleId]?.currentStationId === params.stationId && state.vehicles[d.vehicleId].status === 'idle' && d.id !== 'usr-d09') patch(state, 'drivers', d.id, { availability: 'available' });
  state.clock = { ...state.clock, simTime: startAt, running: true, speed: state.clock.speed < 4 ? 8 : state.clock.speed };
  state.simulation = { status: 'running', params, scheduledArrivals: arrivals, nextArrivalIdx: 0, startedAt: startAt, spawnedBookingIds: [], rngState: params.seed, stats: { arrivals: 0, bookings: 0, dispatches: 0, boarded: 0, completed: 0 } };
  emit(state, 'system', `LIVE SIMULATION started: ${params.demand} commuters arriving at ${state.stations[params.stationId].name} from ${params.startTime}, ${count} vehicles available, ${Math.round(params.hotspotMix * 100)}% heading to ${state.hotspots[params.primaryHotspotId].name}`, { stationId: params.stationId }, true);
}

export function pauseSimulation(state: AppState) { if (state.simulation.status === 'running') { state.simulation = { ...state.simulation, status: 'paused' }; state.clock = { ...state.clock, running: false }; emit(state, 'system', 'Simulation paused', {}, true); } }
export function resumeSimulation(state: AppState) { if (state.simulation.status === 'paused') { state.simulation = { ...state.simulation, status: 'running' }; state.clock = { ...state.clock, running: true }; emit(state, 'system', 'Simulation resumed', {}, true); } }

/** Per-tick: spawn arrivals as real bookings, then auto-board simulated passengers once they reach the bay. */
export function tickSimulation(state: AppState) {
  const sim = state.simulation;
  if (sim.status !== 'running') return;
  const t = now(state);
  const pool = vals(state.commuters).filter((c) => c.id.startsWith('usr-h'));
  let idx = sim.nextArrivalIdx;
  const spawned = [...sim.spawnedBookingIds];
  const stats = { ...sim.stats };
  const rng = mulberry32(sim.rngState + idx * 31);
  while (idx < sim.scheduledArrivals.length && sim.scheduledArrivals[idx].at <= t) {
    const a = sim.scheduledArrivals[idx];
    let c = pool[a.commuterIdx];
    if (activeBookingFor(state, c.id)) c = pool.find((x) => !activeBookingFor(state, x.id)) ?? c;
    stats.arrivals++;
    if (!activeBookingFor(state, c.id)) {
      const method = (['upi', 'upi', 'upi', 'card', 'wallet'] as const)[Math.floor(rng() * 5)];
      const forceFail = rng() < 0.04;
      let res = createBooking(state, { commuterId: c.id, stationId: sim.params.stationId, hotspotId: a.hotspotId, payment: { method, forceFail }, womenPriority: a.womenPriority, simulated: true });
      if (!res.ok) { emit(state, 'payment', `${state.users[c.id].name} retried payment via UPI`, { bookingId: res.booking.id }, true); res = createBooking(state, { commuterId: c.id, stationId: sim.params.stationId, hotspotId: a.hotspotId, payment: { method: 'upi' }, womenPriority: a.womenPriority, simulated: true }); }
      if (res.ok) {
        stats.bookings++;
        spawned.push(res.booking.id);
        patch(state, 'bookings', res.booking.id, { simBayAt: t + (20 + rng() * 80) * 1000 });
      }
    }
    idx++;
  }
  // auto-board simulated passengers whose trip is boarding and who have reached the bay
  for (const bid of spawned) {
    const b = state.bookings[bid];
    if (!b || b.status !== 'assigned' || !b.tripId || !b.simBayAt || b.simBayAt > t) continue;
    const trip = state.trips[b.tripId];
    if (!trip || trip.status !== 'boarding') continue;
    const r = validateAndBoard(state, { tripId: trip.id, driverId: trip.driverId, raw: `GOMAXI|${b.id}|${b.qrToken}`, method: 'qr' });
    if (r.accepted) stats.boarded++;
  }
  stats.dispatches = state.dispatchLog.filter((d) => sim.startedAt && d.at >= sim.startedAt && d.decision.startsWith('dispatch')).length;
  stats.completed = spawned.filter((id) => state.bookings[id]?.status === 'completed').length;
  const allDone = idx >= sim.scheduledArrivals.length && spawned.length > 0 && spawned.every((id) => !ACTIVE_BOOKING.has(state.bookings[id]?.status)) && !vals(state.vehicles).some((v) => v.status === 'returning' || v.status === 'on_trip');
  state.simulation = { ...sim, nextArrivalIdx: idx, spawnedBookingIds: spawned, stats, rngState: sim.rngState, ...(allDone ? { status: 'finished' as const, finishedAt: t } : {}) };
  if (allDone) emit(state, 'system', `Simulation complete: ${stats.bookings} bookings, ${stats.dispatches} dispatches, ${stats.completed} passengers delivered`, {}, true);
}

/** Removes everything the simulation created, restores vehicles, and resets the clock to the scenario start. */
export function resetSimulation(state: AppState) {
  const sim = state.simulation;
  const startedAt = sim.startedAt ?? now(state);
  const simBookingIds = new Set(vals(state.bookings).filter((b) => b.simulated && b.createdAt >= startedAt).map((b) => b.id));
  const touchedGroups = new Set<string>(); const touchedTrips = new Set<string>();
  for (const id of simBookingIds) {
    const b = state.bookings[id];
    if (b.groupId) touchedGroups.add(b.groupId);
    if (b.tripId) touchedTrips.add(b.tripId);
    if (b.paymentId) { const p = { ...state.payments }; delete p[b.paymentId]; state.payments = p; }
  }
  state.bookings = Object.fromEntries(Object.entries(state.bookings).filter(([id]) => !simBookingIds.has(id)));
  state.boardingRecords = Object.fromEntries(Object.entries(state.boardingRecords).filter(([, r]) => !simBookingIds.has(r.bookingId)));
  for (const gid of touchedGroups) {
    const g = state.groups[gid]; if (!g) continue;
    const rest = g.bookingIds.filter((id) => !simBookingIds.has(id));
    if (rest.length === 0) { if (g.tripId) touchedTrips.add(g.tripId); const gs = { ...state.groups }; delete gs[gid]; state.groups = gs; }
    else patch(state, 'groups', gid, { bookingIds: rest });
  }
  for (const tid of touchedTrips) {
    const tr = state.trips[tid]; if (!tr) continue;
    const rest = tr.bookingIds.filter((id) => !simBookingIds.has(id));
    const restBoarded = tr.boardedBookingIds.filter((id) => !simBookingIds.has(id));
    if (rest.length === 0 && restBoarded.length === 0) {
      const ts = { ...state.trips }; delete ts[tid]; state.trips = ts;
      state.earnings = Object.fromEntries(Object.entries(state.earnings).filter(([, e]) => e.tripId !== tid));
      state.alerts = Object.fromEntries(Object.entries(state.alerts).filter(([, a]) => a.tripId !== tid));
      const v = state.vehicles[tr.vehicleId];
      if (v) patch(state, 'vehicles', tr.vehicleId, { status: v.status === 'off_duty' ? 'off_duty' : 'idle', currentStationId: v.homeStationId, position: state.stations[v.homeStationId].position, availableFrom: undefined });
      const d = state.drivers[tr.driverId]; if (d && d.availability === 'busy') patch(state, 'drivers', tr.driverId, { availability: 'available' });
    } else patch(state, 'trips', tid, { bookingIds: rest, boardedBookingIds: restBoarded });
  }
  // vehicles parked off-duty / repositioned by the scenario go home
  for (const v of vals(state.vehicles)) {
    if (v.status === 'off_duty' || (v.status === 'idle' && v.currentStationId !== v.homeStationId)) patch(state, 'vehicles', v.id, { status: 'idle', currentStationId: v.homeStationId, position: state.stations[v.homeStationId].position });
  }
  state.dispatchLog = state.dispatchLog.filter((d) => d.at < startedAt);
  state.activity = state.activity.filter((e) => !(e.simulated && e.at >= startedAt));
  state.clock = { ...state.clock, simTime: timeAt(sim.params.startTime, dayStartOf(startedAt)) - MIN, running: true };
  state.simulation = { status: 'idle', params: sim.params, scheduledArrivals: [], nextArrivalIdx: 0, spawnedBookingIds: [], rngState: sim.params.seed, stats: { arrivals: 0, bookings: 0, dispatches: 0, boarded: 0, completed: 0 } };
  emit(state, 'system', 'Simulation reset — scenario data cleared, fleet returned to stations', {});
}
