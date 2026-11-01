import type { AppState, AnchorRoute, ComplianceStatus, DispatchSettings, FinanceAssumptions, DemandWeights, SimulationParams, OfflineBoardingQueueItem, User, Commuter, Driver, Vehicle } from '../types';
import { createBooking, cancelBooking, rateBooking, type CreateBookingInput } from './booking';
import { validateAndBoard, syncOfflineQueue } from './boarding';
import { acceptTrip, rejectTrip } from './pooling';
import { manualDepart, completeTrip } from './dispatch';
import { raiseAlert, acknowledgeAlert, resolveAlert, shareTrip } from './safety';
import { startSimulation, pauseSimulation, resumeSimulation, resetSimulation } from './simulation';
import { upsertRoute, deleteRoute } from './anchor';
import { emit, patch, put, nextId, EngineError, now } from './ctx';
import { runProcesses } from './tick';
import { createInitialState } from '../store/initialState';

export type Command =
  | { type: 'booking.create'; input: CreateBookingInput }
  | { type: 'booking.cancel'; bookingId: string }
  | { type: 'booking.rate'; bookingId: string; rating: number; comment?: string }
  | { type: 'boarding.scan'; tripId: string; driverId: string; raw: string; method: 'qr' | 'manual'; dryRun?: boolean }
  | { type: 'boarding.syncOffline'; items: OfflineBoardingQueueItem[] }
  | { type: 'driver.setAvailability'; driverId: string; availability: Driver['availability'] }
  | { type: 'driver.acceptTrip'; tripId: string }
  | { type: 'driver.rejectTrip'; tripId: string; reason?: string }
  | { type: 'driver.startTrip'; tripId: string }
  | { type: 'driver.endTrip'; tripId: string }
  | { type: 'safety.sos'; userId: string; tripId?: string; bookingId?: string; message?: string }
  | { type: 'safety.report'; userId: string; tripId?: string; bookingId?: string; message: string; kind?: 'incident_report' | 'driver_report' }
  | { type: 'safety.deviation'; tripId: string }
  | { type: 'safety.acknowledge'; alertId: string }
  | { type: 'safety.resolve'; alertId: string; note: string }
  | { type: 'safety.shareTrip'; tripId: string }
  | { type: 'commuter.register'; name: string; phone: string; gender?: User['gender']; homeStationId: string; womenPriority?: boolean }
  | { type: 'commuter.update'; commuterId: string; changes: Partial<Commuter> }
  | { type: 'admin.updateDispatch'; changes: Partial<DispatchSettings> }
  | { type: 'admin.updateFinance'; changes: Partial<FinanceAssumptions> }
  | { type: 'admin.updateWeights'; changes: Partial<DemandWeights> }
  | { type: 'admin.setCompliance'; vehicleId: string; key: string; status: ComplianceStatus; note?: string }
  | { type: 'admin.setDriverCheck'; driverId: string; field: 'policeVerification' | 'medicalFitness'; status: ComplianceStatus }
  | { type: 'admin.setDriverTraining'; driverId: string; completed: boolean }
  | { type: 'admin.renewDriverDocument'; driverId: string; field: 'psvBadgeValidTill' | 'licenceValidTill'; validTill: string }
  | { type: 'admin.setVehicleStatus'; vehicleId: string; status: Vehicle['status'] }
  | { type: 'admin.upsertRoute'; route: AnchorRoute }
  | { type: 'admin.deleteRoute'; routeId: string }
  | { type: 'sim.start'; params: SimulationParams }
  | { type: 'sim.pause' } | { type: 'sim.resume' } | { type: 'sim.reset' }
  | { type: 'clock.setSpeed'; speed: number }
  | { type: 'clock.setRunning'; running: boolean }
  | { type: 'clock.jump'; minutes: number }
  | { type: 'data.resetAll' };

export type CommandResult = { ok: true; data?: unknown } | { ok: false; error: string; code?: string };

/** Executes a command against the state (mutating). Returns a serialisable result. */
export function execute(state: AppState, cmd: Command): CommandResult {
  try {
    const data = run(state, cmd);
    return { ok: true, data };
  } catch (e) {
    const err = e as Error & { code?: string };
    return { ok: false, error: err.message || 'Command failed', code: err.code };
  }
}

function run(state: AppState, cmd: Command): unknown {
  switch (cmd.type) {
    case 'booking.create': return createBooking(state, cmd.input);
    case 'booking.cancel': return cancelBooking(state, cmd.bookingId);
    case 'booking.rate': return rateBooking(state, cmd.bookingId, cmd.rating, cmd.comment);
    case 'boarding.scan': return validateAndBoard(state, { tripId: cmd.tripId, driverId: cmd.driverId, raw: cmd.raw, method: cmd.method, dryRun: cmd.dryRun });
    case 'boarding.syncOffline': return syncOfflineQueue(state, cmd.items);
    case 'driver.setAvailability': {
      const d = state.drivers[cmd.driverId]; if (!d) throw new EngineError('not_found', 'Driver not found');
      if (cmd.availability === 'offline' && Object.values(state.trips).some((t) => t.driverId === d.id && ['boarding', 'en_route'].includes(t.status))) throw new EngineError('invalid', 'Finish the current trip before going offline');
      patch(state, 'drivers', d.id, { availability: cmd.availability, shiftStart: cmd.availability === 'offline' ? undefined : d.shiftStart ?? now(state) });
      emit(state, 'driver', `${state.users[d.id].name} is now ${cmd.availability}`, { driverId: d.id });
      runProcesses(state); // newly available driver may unblock a waiting group
      return state.drivers[d.id];
    }
    case 'driver.acceptTrip': { const t = state.trips[cmd.tripId]; if (!t) throw new EngineError('not_found', 'Trip not found'); if (t.status !== 'assigned') throw new EngineError('invalid', `Trip is already ${t.status}`); return acceptTrip(state, cmd.tripId); }
    case 'driver.rejectTrip': return rejectTrip(state, cmd.tripId, cmd.reason);
    case 'driver.startTrip': manualDepart(state, cmd.tripId); return state.trips[cmd.tripId];
    case 'driver.endTrip': completeTrip(state, cmd.tripId, false); return state.trips[cmd.tripId];
    case 'safety.sos': return raiseAlert(state, { type: 'sos', raisedByUserId: cmd.userId, tripId: cmd.tripId, bookingId: cmd.bookingId, message: cmd.message ?? `SOS raised by ${state.users[cmd.userId]?.name ?? 'user'}` });
    case 'safety.report': return raiseAlert(state, { type: cmd.kind ?? 'incident_report', raisedByUserId: cmd.userId, tripId: cmd.tripId, bookingId: cmd.bookingId, message: cmd.message, severity: 'medium' });
    case 'safety.deviation': { const t = state.trips[cmd.tripId]; if (!t || t.status !== 'en_route') throw new EngineError('invalid', 'Deviation can only be simulated on an en-route trip'); return raiseAlert(state, { type: 'route_deviation', tripId: cmd.tripId, message: `${t.vehicleId} deviated from planned corridor (simulated by operations)`, severity: 'high' }); }
    case 'safety.acknowledge': return acknowledgeAlert(state, cmd.alertId);
    case 'safety.resolve': return resolveAlert(state, cmd.alertId, cmd.note);
    case 'safety.shareTrip': return shareTrip(state, cmd.tripId);
    case 'commuter.register': {
      const name = cmd.name.trim(); if (name.length < 2) throw new EngineError('invalid', 'Please enter your name');
      const phone = cmd.phone.replace(/\s+/g, ''); if (!/^\+?\d{10,13}$/.test(phone)) throw new EngineError('invalid', 'Enter a valid mobile number');
      if (Object.values(state.users).some((u) => u.phone.replace(/\s+/g, '') === phone)) throw new EngineError('duplicate', 'An account with this number already exists — log in instead');
      if (!state.stations[cmd.homeStationId]) throw new EngineError('invalid', 'Pick your usual metro station');
      const id = nextId(state, 'user', 'usr-n');
      const user: User = { id, role: 'commuter', name, phone: phone.startsWith('+') ? phone : `+91 ${phone}`, gender: cmd.gender ?? 'undisclosed', avatarColor: '#2563EB', createdAt: now(state) };
      put(state, 'users', user);
      put(state, 'commuters', { id, userId: id, homeStationId: cmd.homeStationId, womenPriorityDefault: !!cmd.womenPriority, emergencyContacts: [], walletBalance: 200, totalSavings: 0 });
      emit(state, 'booking', `New commuter registered: ${name} (home station ${state.stations[cmd.homeStationId].name}) — ₹200 welcome wallet credit`, { stationId: cmd.homeStationId });
      return user;
    }
    case 'commuter.update': return patch(state, 'commuters', cmd.commuterId, cmd.changes);
    case 'admin.updateDispatch': { state.settings = { ...state.settings, dispatch: { ...state.settings.dispatch, ...cmd.changes } }; emit(state, 'system', `Dispatch parameters updated: ${Object.entries(cmd.changes).map(([k, v]) => `${k}=${v}`).join(', ')}`, {}); return state.settings.dispatch; }
    case 'admin.updateFinance': { state.settings = { ...state.settings, finance: { ...state.settings.finance, ...cmd.changes } }; return state.settings.finance; }
    case 'admin.updateWeights': { state.settings = { ...state.settings, demandWeights: { ...state.settings.demandWeights, ...cmd.changes } }; return state.settings.demandWeights; }
    case 'admin.setCompliance': {
      const v = state.vehicles[cmd.vehicleId]; if (!v) throw new EngineError('not_found', 'Vehicle not found');
      const compliance = v.compliance.map((c) => (c.key === cmd.key ? { ...c, status: cmd.status, note: cmd.note ?? c.note, validTill: cmd.status === 'verified' && !c.validTill ? '2027-03-31' : c.validTill } : c));
      patch(state, 'vehicles', v.id, { compliance });
      emit(state, 'system', `Compliance: ${v.id} ${cmd.key.replace(/_/g, ' ')} marked ${cmd.status}`, { vehicleId: v.id });
      runProcesses(state);
      return state.vehicles[v.id];
    }
    case 'admin.setDriverCheck': { patch(state, 'drivers', cmd.driverId, { [cmd.field]: cmd.status } as Partial<Driver>); emit(state, 'system', `Driver ${state.users[cmd.driverId].name}: ${cmd.field} → ${cmd.status}`, { driverId: cmd.driverId }); return state.drivers[cmd.driverId]; }
    case 'admin.renewDriverDocument': { patch(state, 'drivers', cmd.driverId, { [cmd.field]: cmd.validTill } as Partial<Driver>); emit(state, 'system', `Driver ${state.users[cmd.driverId].name}: ${cmd.field === 'psvBadgeValidTill' ? 'PSV badge' : 'licence'} renewed till ${cmd.validTill}`, { driverId: cmd.driverId }); runProcesses(state); return state.drivers[cmd.driverId]; }
    case 'admin.setDriverTraining': { patch(state, 'drivers', cmd.driverId, { trainingCompleted: cmd.completed }); return state.drivers[cmd.driverId]; }
    case 'admin.setVehicleStatus': {
      const v = state.vehicles[cmd.vehicleId]; if (!v) throw new EngineError('not_found', 'Vehicle not found');
      if (['assigned', 'boarding', 'on_trip'].includes(v.status)) throw new EngineError('invalid', 'Vehicle is on an active assignment');
      patch(state, 'vehicles', v.id, { status: cmd.status, currentStationId: cmd.status === 'idle' ? v.currentStationId ?? v.homeStationId : v.currentStationId });
      emit(state, 'system', `${v.id} set to ${cmd.status.replace('_', ' ')}`, { vehicleId: v.id }); runProcesses(state); return state.vehicles[v.id];
    }
    case 'admin.upsertRoute': { if (!cmd.route.name.trim()) throw new EngineError('invalid', 'Route needs a name'); if (!cmd.route.stopHotspotIds.length) throw new EngineError('invalid', 'Add at least one stop'); upsertRoute(state, { ...cmd.route, id: cmd.route.id || nextId(state, 'route', 'rt') }); return state.anchorRoutes; }
    case 'admin.deleteRoute': deleteRoute(state, cmd.routeId); return undefined;
    case 'sim.start': startSimulation(state, cmd.params); return state.simulation;
    case 'sim.pause': pauseSimulation(state); return state.simulation;
    case 'sim.resume': resumeSimulation(state); return state.simulation;
    case 'sim.reset': resetSimulation(state); return state.simulation;
    case 'clock.setSpeed': state.clock = { ...state.clock, speed: Math.max(0.25, Math.min(120, cmd.speed)) }; return state.clock;
    case 'clock.setRunning': state.clock = { ...state.clock, running: cmd.running }; if (state.simulation.status === 'running' && !cmd.running) state.simulation = { ...state.simulation, status: 'paused' }; if (state.simulation.status === 'paused' && cmd.running) state.simulation = { ...state.simulation, status: 'running' }; return state.clock;
    case 'clock.jump': { state.clock = { ...state.clock, simTime: state.clock.simTime + cmd.minutes * 60_000 }; runProcesses(state); return state.clock; }
    case 'data.resetAll': { const fresh = createInitialState(); Object.assign(state, fresh); emit(state, 'system', 'All data reset to seed', {}); return undefined; }
  }
}
