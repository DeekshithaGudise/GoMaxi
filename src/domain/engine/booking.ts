import type { AppState, Booking, Payment, PoolingGroup, Trip } from '../types';
import { nextId, put, patch, emit, now, vals, ACTIVE_BOOKING, EngineError } from './ctx';
import { processPayment, refundPayment, type PaymentInput } from './payments';
import { findCompatibleGroup, openGroup, addBookingToGroup, tryAssignVehicle } from './pooling';
import { closeEmptyGroup } from './dispatch';
import { fareRule, soloAutoFare, bikeTaxiFare } from '../seed/geo';
import { MIN, makeToken, mulberry32 } from '../util';

export interface CreateBookingInput {
  commuterId: string; stationId: string; hotspotId: string; payment: PaymentInput; womenPriority?: boolean; simulated?: boolean; anchorTripId?: string;
}
export interface CreateBookingResult { ok: boolean; booking: Booking; payment: Payment; group?: PoolingGroup; trip?: Trip; error?: string }

export function activeBookingFor(state: AppState, commuterId: string): Booking | undefined {
  return vals(state.bookings).find((b) => b.commuterId === commuterId && ACTIVE_BOOKING.has(b.status));
}

export function createBooking(state: AppState, input: CreateBookingInput): CreateBookingResult {
  const { commuterId, stationId, hotspotId } = input;
  if (!state.commuters[commuterId]) throw new EngineError('not_found', 'Commuter not found');
  if (!state.stations[stationId]) throw new EngineError('not_found', 'Station not found');
  if (!state.hotspots[hotspotId]) throw new EngineError('not_found', 'Destination not found');
  if (stationId === hotspotId) throw new EngineError('invalid', 'Origin and destination must differ');
  const existing = activeBookingFor(state, commuterId);
  if (existing) throw new EngineError('duplicate', `You already have an active booking (${existing.id}). Complete or cancel it first.`);

  const anchor = input.anchorTripId ? state.trips[input.anchorTripId] : undefined;
  if (input.anchorTripId && (!anchor || anchor.kind !== 'anchor' || !['scheduled', 'assigned', 'boarding'].includes(anchor.status))) throw new EngineError('invalid', 'That scheduled departure is no longer open');
  if (anchor && anchor.bookingIds.length >= anchor.capacity) throw new EngineError('full', 'That departure is full');

  const rule = fareRule(stationId, hotspotId);
  const fare = anchor && anchor.routeId ? state.anchorRoutes[anchor.routeId].fare : rule.fare;
  const rng = mulberry32((state.counters.booking ?? 1) * 7919 + 13);
  const id = nextId(state, 'booking', 'GMB');
  const t = now(state);
  const booking: Booking = {
    id, commuterId, stationId, hotspotId, status: 'pending_payment', fare, soloAutoFare: soloAutoFare(rule.distanceKm), bikeTaxiFare: bikeTaxiFare(rule.distanceKm),
    womenPriority: input.womenPriority ?? state.commuters[commuterId].womenPriorityDefault, qrToken: makeToken(rng), createdAt: t,
    expiresAt: t + state.settings.dispatch.bookingExpiryMin * MIN, simulated: !!input.simulated, rolloverCount: 0, anchorDepartureId: anchor?.id,
  };
  put(state, 'bookings', booking);
  const payment = processPayment(state, id, commuterId, fare, input.payment, rng);
  if (payment.status !== 'success') {
    const failed = patch(state, 'bookings', id, { status: 'payment_failed', paymentId: payment.id });
    return { ok: false, booking: failed, payment, error: payment.failureReason };
  }
  let confirmed = patch(state, 'bookings', id, { status: 'confirmed', paymentId: payment.id });
  emit(state, 'booking', `Booking ${id} confirmed: ${state.users[commuterId].name} ${state.stations[stationId].name} → ${state.hotspots[hotspotId].name} (₹${fare})`, { bookingId: id, stationId, hotspotId }, booking.simulated);

  if (anchor) {
    patch(state, 'trips', anchor.id, { bookingIds: [...anchor.bookingIds, id] });
    confirmed = patch(state, 'bookings', id, { status: 'assigned', tripId: anchor.id, vehicleId: anchor.vehicleId });
    return { ok: true, booking: confirmed, payment, trip: state.trips[anchor.id] };
  }
  const group = findCompatibleGroup(state, stationId, hotspotId) ?? openGroup(state, stationId, hotspotId, booking.simulated);
  addBookingToGroup(state, group.id, id);
  const trip = tryAssignVehicle(state, group.id, booking.simulated) ?? (state.groups[group.id].tripId ? state.trips[state.groups[group.id].tripId!] : undefined);
  return { ok: true, booking: state.bookings[id], payment, group: state.groups[group.id], trip };
}

export function cancelBooking(state: AppState, bookingId: string, reason = 'Cancelled by passenger') {
  const b = state.bookings[bookingId];
  if (!b) throw new EngineError('not_found', 'Booking not found');
  if (!(b.status === 'confirmed' || b.status === 'assigned')) throw new EngineError('invalid', `Booking cannot be cancelled in status "${b.status}"`);
  const g = b.groupId ? state.groups[b.groupId] : undefined;
  const initiated = !!g?.initiatedAt;
  patch(state, 'bookings', bookingId, { status: 'cancelled', cancelledAt: now(state) });
  if (b.tripId) { const trip = state.trips[b.tripId]; if (trip) patch(state, 'trips', b.tripId, { bookingIds: trip.bookingIds.filter((x) => x !== bookingId) }); }
  const refund = b.paymentId ? refundPayment(state, b.paymentId, initiated ? 0.5 : 1, initiated ? 'Cancelled after dispatch initiated (50% refund policy)' : reason) : undefined;
  emit(state, 'booking', `Booking ${bookingId} cancelled — ${reason}`, { bookingId }, b.simulated);
  if (g && g.status === 'forming') {
    const remaining = g.bookingIds.filter((id) => ACTIVE_BOOKING.has(state.bookings[id]?.status));
    if (remaining.length === 0) closeEmptyGroup(state, g.id);
  }
  return { booking: state.bookings[bookingId], refund };
}

export function rateBooking(state: AppState, bookingId: string, rating: number, comment?: string) {
  const b = state.bookings[bookingId];
  if (!b || b.status !== 'completed') throw new EngineError('invalid', 'Only completed trips can be rated');
  if (b.rating) throw new EngineError('invalid', 'Already rated');
  const r = Math.max(1, Math.min(5, Math.round(rating)));
  patch(state, 'bookings', bookingId, { rating: r, ratingComment: comment });
  const trip = b.tripId ? state.trips[b.tripId] : undefined;
  if (trip) { const d = state.drivers[trip.driverId]; patch(state, 'drivers', d.id, { ratingSum: d.ratingSum + r, ratingCount: d.ratingCount + 1 }); }
  emit(state, 'booking', `${state.users[b.commuterId].name} rated trip ${b.tripId} ${r}★`, { bookingId, tripId: b.tripId });
}

/** Expire bookings that never got a vehicle within the expiry window; refund in full. */
export function expireBookings(state: AppState) {
  const t = now(state);
  for (const b of vals(state.bookings)) {
    if (b.status === 'confirmed' && t > b.expiresAt) {
      patch(state, 'bookings', b.id, { status: 'expired', cancelledAt: t });
      if (b.paymentId) refundPayment(state, b.paymentId, 1, 'No vehicle available within the booking window');
      emit(state, 'booking', `Booking ${b.id} expired — no departure available in time; full refund issued`, { bookingId: b.id }, b.simulated);
      const g = b.groupId ? state.groups[b.groupId] : undefined;
      if (g && g.status === 'forming' && g.bookingIds.every((id) => !ACTIVE_BOOKING.has(state.bookings[id]?.status))) closeEmptyGroup(state, g.id);
    }
  }
}
