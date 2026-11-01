import type { AppState, Hotspot, DemandWeights } from '../types';
import { vals } from './ctx';
import { istParts, round, clamp, dayStartOf, HOUR, avg } from '../util';

/**
 * DEMAND PREDICTION PROTOTYPE — transparent, rule-based scoring. This is NOT a trained ML model.
 * Each hotspot gets six normalised features (0..1); the weighted sum is the demand score (0..100).
 * Weights are configurable in Admin → Settings, and every component is shown in the UI.
 */
export interface HotspotDemand {
  hotspot: Hotspot;
  score: number;
  features: Record<keyof DemandWeights, number>;
  contributions: Record<keyof DemandWeights, number>;
  estimatedHourlyDemand: number;
  activeBookings: number;
  bookingsToday: number;
  recommendedVehicles: number;
  avgOccupancyPct: number;
  expectedRevenuePerHour: number;
  trend: { label: string; bookings: number }[];
  peakHours: { hour: number; bookings: number }[];
  hourlyForecast: { hour: number; demand: number }[];
}

const STATION_AFFINITY: Record<string, Record<string, number>> = {
  'st-byp': { 'hs-whf': 0.34, 'hs-itpl': 0.2, 'hs-bag': 0.22, 'hs-hoo': 0.1, 'hs-orr': 0.1, 'hs-man': 0.04 },
  'st-krp': { 'hs-whf': 0.3, 'hs-itpl': 0.25, 'hs-hoo': 0.2, 'hs-orr': 0.15, 'hs-bag': 0.1 },
  'st-ind': { 'hs-bag': 0.25, 'hs-orr': 0.35, 'hs-hsr': 0.2, 'hs-whf': 0.1, 'hs-man': 0.1 },
  'st-mgr': { 'hs-man': 0.35, 'hs-orr': 0.25, 'hs-ecy': 0.2, 'hs-hsr': 0.12, 'hs-bag': 0.08 },
  'st-tri': { 'hs-orr': 0.35, 'hs-bag': 0.25, 'hs-man': 0.2, 'hs-hsr': 0.2 },
};
export const stationAffinity = (stationId: string) => STATION_AFFINITY[stationId] ?? {};

/** Typical weekday demand profile (share of daily demand per hour) — illustrative. */
export const HOURLY_PROFILE: Record<number, number> = { 6: 0.01, 7: 0.04, 8: 0.1, 9: 0.16, 10: 0.11, 11: 0.05, 12: 0.03, 13: 0.03, 14: 0.03, 15: 0.03, 16: 0.04, 17: 0.08, 18: 0.13, 19: 0.1, 20: 0.05, 21: 0.01 };

function shiftAlignment(h: Hotspot, simTime: number): number {
  const { h: hh, m } = istParts(simTime);
  const mins = hh * 60 + m;
  let best = 0;
  for (const s of h.shiftTimings) { const [sh, sm] = s.split(':').map(Number); const d = Math.abs(mins - (sh * 60 + sm)); best = Math.max(best, clamp(1 - d / 90, 0, 1)); }
  return best;
}

export function computeHotspotDemand(state: AppState, conversionRate = 0.025): HotspotDemand[] {
  const t = state.clock.simTime;
  const day = dayStartOf(t);
  const w = state.settings.demandWeights;
  const hotspots = vals(state.hotspots);
  const bookings = vals(state.bookings);
  const hist = (h: Hotspot) => bookings.filter((b) => b.hotspotId === h.id && b.createdAt < day && b.createdAt >= day - 5 * 86400000 && b.status === 'completed').length;
  const exits = (h: Hotspot) => vals(state.stations).reduce((a, s) => a + (STATION_AFFINITY[s.id]?.[h.id] ?? 0) * s.peakExitPerHour, 0);
  const raw = hotspots.map((h) => ({ h, hist: hist(h), exits: exits(h), head: h.officeHeadcount, shift: shiftAlignment(h, t), res: h.residentialDensity, gap: 1 - h.transitAvailability }));
  const max = (k: 'hist' | 'exits' | 'head') => Math.max(1, ...raw.map((r) => r[k]));
  const wsum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const cap = state.settings.dispatch.defaultCapacity, occ = state.settings.finance.occupancyPct / 100, tph = state.settings.finance.tripsPerHour;
  return raw.map((r) => {
    const features = { historicalBookings: r.hist / max('hist'), metroExits: r.exits / max('exits'), officeHeadcount: r.head / max('head'), shiftAlignment: r.shift, residentialDensity: r.res, transitGap: r.gap };
    const contributions = Object.fromEntries((Object.keys(features) as (keyof DemandWeights)[]).map((k) => [k, round((features[k] * w[k] / wsum) * 100, 1)])) as Record<keyof DemandWeights, number>;
    const score = round(Object.values(contributions).reduce((a, b) => a + b, 0), 1);
    const { h: hour } = istParts(t);
    const profile = HOURLY_PROFILE[hour] ?? 0.01;
    const estimatedHourlyDemand = Math.round(r.exits * conversionRate * (0.6 + 0.8 * r.shift) * (profile / 0.16 + 0.3) * (0.6 + 0.4 * r.gap));
    const active = bookings.filter((b) => b.hotspotId === r.h.id && ['confirmed', 'assigned', 'boarded'].includes(b.status)).length;
    const today = bookings.filter((b) => b.hotspotId === r.h.id && b.createdAt >= day && b.status !== 'payment_failed').length;
    const completedTrips = vals(state.trips).filter((x) => x.hotspotId === r.h.id && x.status === 'completed');
    const avgOcc = completedTrips.length ? avg(completedTrips.map((x) => (x.boardedBookingIds.length / x.capacity) * 100)) : 0;
    const fares = state.fareRules.filter((f) => f.hotspotId === r.h.id);
    const avgFare = fares.length ? avg(fares.map((f) => f.fare)) : 25;
    const trend = [5, 4, 3, 2, 1].map((ago) => ({ label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][istParts(day - ago * 86400000).day === 0 ? 6 : istParts(day - ago * 86400000).day - 1], bookings: bookings.filter((b) => b.hotspotId === r.h.id && b.createdAt >= day - ago * 86400000 && b.createdAt < day - (ago - 1) * 86400000 && b.status === 'completed').length }));
    const byHour: Record<number, number> = {};
    for (const b of bookings) if (b.hotspotId === r.h.id && b.status === 'completed') { const hh = istParts(b.createdAt).h; byHour[hh] = (byHour[hh] ?? 0) + 1; }
    const peakHours = Object.entries(byHour).map(([hh, n]) => ({ hour: Number(hh), bookings: n })).sort((a, b) => a.hour - b.hour);
    const dailyDemand = r.exits * conversionRate * 10 * (0.6 + 0.4 * r.gap);
    const hourlyForecast = Object.entries(HOURLY_PROFILE).map(([hh, p]) => ({ hour: Number(hh), demand: Math.round(dailyDemand * p) }));
    return {
      hotspot: r.h, score, features, contributions, estimatedHourlyDemand, activeBookings: active, bookingsToday: today,
      recommendedVehicles: Math.max(1, Math.ceil(Math.max(estimatedHourlyDemand, active) / Math.max(1, cap * occ * tph))), avgOccupancyPct: round(avgOcc, 1),
      expectedRevenuePerHour: Math.round(estimatedHourlyDemand * avgFare), trend, peakHours, hourlyForecast,
    };
  }).sort((a, b) => b.score - a.score);
}

export function predictedDemandAt(state: AppState, hotspotId: string, hour: number): number {
  const d = computeHotspotDemand(state).find((x) => x.hotspot.id === hotspotId);
  return d?.hourlyForecast.find((f) => f.hour === hour)?.demand ?? 0;
}
export { HOUR };
