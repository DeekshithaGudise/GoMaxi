import type { AppState, Payment, PaymentMethod } from '../types';
import { nextId, put, patch, emit, now } from './ctx';
import { round } from '../util';

export interface PaymentInput { method: PaymentMethod; forceFail?: boolean; cardLast4?: string; upiId?: string }

/**
 * SIMULATED payment gateway. No money moves. The interface mirrors what a Razorpay order/capture flow
 * would return so a real provider can be swapped in behind `processPayment`.
 */
export function processPayment(state: AppState, bookingId: string, commuterId: string, amount: number, input: PaymentInput, rng: () => number): Payment {
  const id = nextId(state, 'payment', 'PAY');
  let failureReason: string | undefined;
  if (input.forceFail) failureReason = 'Simulated gateway failure (demo toggle)';
  else if (input.method === 'card' && input.cardLast4 === '0000') failureReason = 'Issuer declined the transaction (test card 0000)';
  else if (input.method === 'upi' && input.upiId?.toLowerCase().endsWith('@fail')) failureReason = 'UPI collect request timed out (test VPA)';
  else if (input.method === 'wallet') {
    const c = state.commuters[commuterId];
    if (!c || c.walletBalance < amount) failureReason = 'Insufficient wallet balance';
  }
  const payment: Payment = {
    id, bookingId, commuterId, method: input.method, amount, status: failureReason ? 'failed' : 'success',
    gatewayRef: `SIM-${input.method.toUpperCase()}-${String(Math.floor(rng() * 1e9)).padStart(9, '0')}`, failureReason, createdAt: now(state), simulated: true,
  };
  put(state, 'payments', payment);
  if (!failureReason && input.method === 'wallet') patch(state, 'commuters', commuterId, { walletBalance: round(state.commuters[commuterId].walletBalance - amount, 2) });
  emit(state, 'payment', failureReason ? `Payment failed for ${bookingId}: ${failureReason}` : `Payment of ₹${amount} received via ${input.method.toUpperCase()} for ${bookingId} (simulated)`, { bookingId });
  return payment;
}

export function refundPayment(state: AppState, paymentId: string, fraction = 1, reason = 'Booking cancelled') {
  const p = state.payments[paymentId];
  if (!p || p.status !== 'success') return undefined;
  const refundAmount = round(p.amount * fraction, 2);
  const updated = patch(state, 'payments', paymentId, { status: 'refunded', refundedAt: now(state), refundAmount });
  if (p.method === 'wallet' || true) {
    // Simulated refunds are credited to the GoMaxi wallet instantly (real refunds to source take 5–7 days).
    const c = state.commuters[p.commuterId];
    if (c) patch(state, 'commuters', c.id, { walletBalance: round(c.walletBalance + refundAmount, 2) });
  }
  emit(state, 'payment', `Refund of ₹${refundAmount} issued to wallet for ${p.bookingId} — ${reason} (simulated)`, { bookingId: p.bookingId });
  return updated;
}
