import type { AppState } from '../types';
import { evaluateGroups, advanceTrips } from './dispatch';
import { expireBookings } from './booking';
import { scheduleAnchorDepartures } from './anchor';
import { tickSimulation } from './simulation';
import { vals, emit, patch } from './ctx';
import { acceptTrip } from './pooling';
import { raiseAlert } from './safety';
import { mulberry32 } from '../util';

/** Advance the simulated clock by `realDeltaMs` of wall time and run all periodic processes. */
export function tick(state: AppState, realDeltaMs: number) {
  if (!state.clock.running) return;
  const step = Math.min(realDeltaMs * state.clock.speed, 10 * 60_000); // never jump more than 10 sim-minutes per tick
  state.clock = { ...state.clock, simTime: state.clock.simTime + step };
  runProcesses(state);
}

export function runProcesses(state: AppState) {
  // Driver acceptance timeout for anchor trips (pooled ones handled in evaluateGroups)
  for (const t of vals(state.trips)) if (t.kind === 'anchor' && t.status === 'assigned' && t.acceptDeadline && state.clock.simTime >= t.acceptDeadline && !t.acceptedAt) { acceptTrip(state, t.id, true); patch(state, 'trips', t.id, { status: 'assigned', acceptedAt: state.clock.simTime }); }
  tickSimulation(state);
  evaluateGroups(state);
  advanceTrips(state);
  expireBookings(state);
  scheduleAnchorDepartures(state);
  // Simulated route-deviation detector: deterministic, rare, only during simulation runs.
  if (state.simulation.status === 'running') {
    for (const t of vals(state.trips)) {
      if (t.status === 'en_route' && !t.deviationAlert && t.progress > 0.4 && t.progress < 0.45) {
        const r = mulberry32(Number(t.id.replace(/\D/g, '')) || 1)();
        if (r < 0.12 && !vals(state.alerts).some((a) => a.tripId === t.id && a.type === 'route_deviation')) raiseAlert(state, { type: 'route_deviation', tripId: t.id, message: `${t.vehicleId} deviated from planned corridor (simulated detector)`, severity: 'high' });
      }
    }
  }
  // Shift start bookkeeping
  for (const d of vals(state.drivers)) if (d.availability !== 'offline' && !d.shiftStart) patch(state, 'drivers', d.id, { shiftStart: state.clock.simTime });
  void emit;
}
