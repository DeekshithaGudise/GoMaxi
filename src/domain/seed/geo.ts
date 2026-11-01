import type { Hotspot, Station, FareRule, LatLng } from '../types';
import { distanceKm, round } from '../util';

export const STATIONS: Station[] = [
  { id: 'st-byp', name: 'Baiyappanahalli', line: 'Purple', position: { lat: 12.9908, lng: 77.6527 }, pickupBay: 'Bay A, Exit 2 (Old Madras Road side)', dailyExits: 42000, peakExitPerHour: 5200, feederCoverage: 'medium' },
  { id: 'st-ind', name: 'Indiranagar', line: 'Purple', position: { lat: 12.9784, lng: 77.6386 }, pickupBay: 'Bay B, Exit 1 (100 Ft Road)', dailyExits: 31000, peakExitPerHour: 3600, feederCoverage: 'high' },
  { id: 'st-mgr', name: 'MG Road', line: 'Purple', position: { lat: 12.9756, lng: 77.6068 }, pickupBay: 'Bay C, Exit 3 (Boulevard)', dailyExits: 38000, peakExitPerHour: 4100, feederCoverage: 'high' },
  { id: 'st-tri', name: 'Trinity', line: 'Purple', position: { lat: 12.973, lng: 77.617 }, pickupBay: 'Bay A, Exit 1 (Trinity Circle)', dailyExits: 19000, peakExitPerHour: 2300, feederCoverage: 'medium' },
  { id: 'st-krp', name: 'KR Puram', line: 'Purple', position: { lat: 12.9999, lng: 77.677 }, pickupBay: 'Bay D, Exit 2 (Tin Factory side)', dailyExits: 36000, peakExitPerHour: 4800, feederCoverage: 'low' },
];

export const HOTSPOTS: Hotspot[] = [
  { id: 'hs-whf', name: 'Whitefield', type: 'tech_park', position: { lat: 12.9698, lng: 77.75 }, officeHeadcount: 180000, residentialDensity: 0.55, shiftTimings: ['09:00', '18:30'], transitAvailability: 0.45, description: 'Large IT corridor: EPIP Zone, Prestige Shantiniketan, Brigade Tech Gardens.' },
  { id: 'hs-itpl', name: 'ITPL', type: 'tech_park', position: { lat: 12.985, lng: 77.736 }, officeHeadcount: 95000, residentialDensity: 0.3, shiftTimings: ['09:00', '18:00', '21:00'], transitAvailability: 0.5, description: 'International Tech Park Bengaluru campus and surrounding SEZ blocks.' },
  { id: 'hs-bag', name: 'Bagmane Tech Park', type: 'tech_park', position: { lat: 12.979, lng: 77.661 }, officeHeadcount: 60000, residentialDensity: 0.4, shiftTimings: ['09:30', '18:30'], transitAvailability: 0.55, description: 'CV Raman Nagar campus, 2.5 km from Baiyappanahalli: classic last-mile gap.' },
  { id: 'hs-orr', name: 'Outer Ring Road', type: 'tech_park', position: { lat: 12.9352, lng: 77.6956 }, officeHeadcount: 250000, residentialDensity: 0.5, shiftTimings: ['09:00', '18:00'], transitAvailability: 0.35, description: 'Marathahalli–Bellandur ORR stretch: Ecospace, Embassy Tech Village, Cessna.' },
  { id: 'hs-man', name: 'Manyata Tech Park', type: 'tech_park', position: { lat: 13.045, lng: 77.62 }, officeHeadcount: 120000, residentialDensity: 0.45, shiftTimings: ['08:30', '18:00'], transitAvailability: 0.4, description: 'Embassy Manyata Business Park, Nagawara.' },
  { id: 'hs-ecy', name: 'Electronic City', type: 'tech_park', position: { lat: 12.8452, lng: 77.6602 }, officeHeadcount: 200000, residentialDensity: 0.35, shiftTimings: ['08:30', '17:30', '20:30'], transitAvailability: 0.5, description: 'Phase 1 & 2 industrial-IT hub; Yellow Line opens strong feeder demand.' },
  { id: 'hs-hsr', name: 'HSR Layout', type: 'residential', position: { lat: 12.9116, lng: 77.6389 }, officeHeadcount: 25000, residentialDensity: 0.85, shiftTimings: ['10:00', '19:00'], transitAvailability: 0.5, description: 'Dense residential sectors with start-up offices; strong evening reverse flow.' },
  { id: 'hs-hoo', name: 'Hoodi Residential Cluster', type: 'residential', position: { lat: 12.9916, lng: 77.716 }, officeHeadcount: 15000, residentialDensity: 0.9, shiftTimings: ['09:00', '18:30'], transitAvailability: 0.3, description: 'Gated communities around Hoodi Circle and Seegehalli.' },
];

export const stationById = Object.fromEntries(STATIONS.map((s) => [s.id, s]));
export const hotspotById = Object.fromEntries(HOTSPOTS.map((h) => [h.id, h]));

/** Fixed per-seat fare table. Fares are illustrative; see docs for the pricing rationale. */
function fareFor(km: number): number {
  if (km <= 3.5) return 20;
  if (km <= 6) return 25;
  if (km <= 9) return 30;
  if (km <= 12) return 35;
  if (km <= 16) return 40;
  if (km <= 20) return 50;
  return 60;
}
export const soloAutoFare = (km: number) => Math.round(Math.max(60, 30 + km * 16) / 5) * 5;
export const bikeTaxiFare = (km: number) => Math.round(Math.max(40, 20 + km * 9) / 5) * 5;

/** Build a plausible road-ish path by bending the straight line through two offset waypoints. */
function waypointsBetween(a: LatLng, b: LatLng, key: string): LatLng[] {
  let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const sign = h % 2 === 0 ? 1 : -1;
  const mag = 0.004 + (h % 7) * 0.0007;
  const dx = b.lng - a.lng, dy = b.lat - a.lat;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * sign, ny = (dx / len) * sign;
  const p1 = { lat: a.lat + dy * 0.33 + ny * mag, lng: a.lng + dx * 0.33 + nx * mag };
  const p2 = { lat: a.lat + dy * 0.66 + ny * mag * 0.6, lng: a.lng + dx * 0.66 + nx * mag * 0.6 };
  return [a, p1, p2, b];
}

export const FARE_RULES: FareRule[] = STATIONS.flatMap((s) =>
  HOTSPOTS.map((h) => {
    const straight = distanceKm(s.position, h.position);
    const km = round(straight * 1.3, 1); // road factor
    const speedKmh = km < 6 ? 16 : km < 12 ? 20 : 24; // Bengaluru peak-hour averages (illustrative)
    const durationMin = Math.max(8, Math.round((km / speedKmh) * 60));
    return {
      stationId: s.id, hotspotId: h.id, fare: fareFor(km), distanceKm: km, durationMin,
      returnMin: Math.round(durationMin * 0.8), waypoints: waypointsBetween(s.position, h.position, s.id + h.id),
    };
  }),
);

export function fareRule(stationId: string, hotspotId: string): FareRule {
  const r = FARE_RULES.find((f) => f.stationId === stationId && f.hotspotId === hotspotId);
  if (!r) throw new Error(`No fare rule for ${stationId} → ${hotspotId}`);
  return r;
}
