import type { AppState, SafetyAlert, AlertType } from '../types';
import { nextId, put, patch, emit, now, vals } from './ctx';
import { fmtTime, makeToken, mulberry32 } from '../util';

/** All escalations are SIMULATED: no real notification, call or emergency service is contacted. */
export function raiseAlert(state: AppState, args: { type: AlertType; raisedByUserId?: string; tripId?: string; bookingId?: string; message: string; severity?: SafetyAlert['severity'] }): SafetyAlert {
  const t = now(state);
  const trip = args.tripId ? state.trips[args.tripId] : undefined;
  const id = nextId(state, 'alert', 'ALT');
  const severity = args.severity ?? (args.type === 'sos' ? 'critical' : args.type === 'route_deviation' ? 'high' : 'medium');
  const escalation = args.type === 'sos'
    ? [`${fmtTime(t)} SOS received — live location pinned`, `${fmtTime(t)} Ops desk alerted (simulated push)`, `${fmtTime(t)} Emergency contacts notified with live trip link (simulated SMS)`, `${fmtTime(t)} Driver prompted to pull over at nearest safe point`, 'Escalation to police helpline 112 would be triggered here (NOT performed in prototype)']
    : args.type === 'route_deviation' ? [`${fmtTime(t)} Deviation > 300 m from planned corridor detected (simulated)`, `${fmtTime(t)} Driver asked to confirm reason`, `${fmtTime(t)} Passengers notified in-app`]
    : [`${fmtTime(t)} Report logged`, `${fmtTime(t)} Assigned to safety desk`];
  const alert: SafetyAlert = {
    id, type: args.type, status: 'open', severity, raisedByUserId: args.raisedByUserId, tripId: args.tripId, bookingId: args.bookingId,
    vehicleId: trip?.vehicleId, driverId: trip?.driverId, message: args.message, position: trip?.position, createdAt: t, escalation,
  };
  put(state, 'alerts', alert);
  if (trip && args.type === 'route_deviation') patch(state, 'trips', trip.id, { deviationAlert: true });
  emit(state, 'safety', `${args.type === 'sos' ? '🆘 SOS' : args.type.replace('_', ' ').toUpperCase()}: ${args.message}${trip ? ` (${trip.vehicleId})` : ''}`, { tripId: args.tripId, vehicleId: trip?.vehicleId, driverId: trip?.driverId, bookingId: args.bookingId });
  return alert;
}

export function acknowledgeAlert(state: AppState, alertId: string) {
  const a = state.alerts[alertId];
  if (!a || a.status !== 'open') return;
  patch(state, 'alerts', alertId, { status: 'acknowledged', acknowledgedAt: now(state), escalation: [...a.escalation, `${fmtTime(now(state))} Acknowledged by operations`] });
}

export function resolveAlert(state: AppState, alertId: string, note: string) {
  const a = state.alerts[alertId];
  if (!a || a.status === 'resolved') return;
  patch(state, 'alerts', alertId, { status: 'resolved', resolvedAt: now(state), resolutionNote: note, acknowledgedAt: a.acknowledgedAt ?? now(state), escalation: [...a.escalation, `${fmtTime(now(state))} Resolved: ${note}`] });
  if (a.tripId && a.type === 'route_deviation' && state.trips[a.tripId]) patch(state, 'trips', a.tripId, { deviationAlert: false });
  emit(state, 'safety', `Alert ${alertId} resolved — ${note}`, { tripId: a.tripId });
}

export function shareTrip(state: AppState, tripId: string): string {
  const trip = state.trips[tripId];
  if (!trip) throw new Error('Trip not found');
  if (trip.shareToken) return trip.shareToken;
  const token = makeToken(mulberry32(tripId.length * 977 + now(state) % 100000), 8);
  patch(state, 'trips', tripId, { shareToken: token });
  emit(state, 'safety', `Live trip link generated for ${tripId} (share with trusted contacts)`, { tripId });
  return token;
}

export const openAlerts = (state: AppState) => vals(state.alerts).filter((a) => a.status !== 'resolved');
