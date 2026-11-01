import type { Driver, Vehicle, AppState } from '../types';

export const BLOCKING_VEHICLE_KEYS = ['registration', 'contract_carriage_permit', 'insurance', 'fitness', 'puc', 'road_tax'];

export interface EligibilityResult { eligible: boolean; reasons: string[] }

export function vehicleEligibility(v: Vehicle): EligibilityResult {
  const reasons: string[] = [];
  for (const key of BLOCKING_VEHICLE_KEYS) {
    const item = v.compliance.find((c) => c.key === key);
    if (!item) reasons.push(`Missing compliance record: ${key}`);
    else if (item.status !== 'verified') reasons.push(`${item.label}: ${item.status}`);
  }
  return { eligible: reasons.length === 0, reasons };
}

export function driverEligibility(d: Driver, nowIso: string): EligibilityResult {
  const reasons: string[] = [];
  if (d.licenceValidTill < nowIso) reasons.push('Driving licence expired');
  if (d.psvBadgeValidTill < nowIso) reasons.push('PSV badge expired');
  if (d.policeVerification !== 'verified') reasons.push(`Police verification: ${d.policeVerification}`);
  if (d.medicalFitness !== 'verified') reasons.push(`Medical fitness: ${d.medicalFitness}`);
  if (!d.trainingCompleted) reasons.push('Safety & conduct training not completed');
  return { eligible: reasons.length === 0, reasons };
}

export function isoDate(simTime: number): string {
  return new Date(simTime + 5.5 * 3600000).toISOString().slice(0, 10);
}

/** A vehicle is dispatchable only when vehicle AND its driver are compliant, driver is available and vehicle idle at the station. */
export function dispatchable(state: AppState, v: Vehicle, stationId: string): EligibilityResult {
  const reasons: string[] = [];
  const ve = vehicleEligibility(v);
  reasons.push(...ve.reasons);
  if (!v.driverId) reasons.push('No driver assigned');
  const d = v.driverId ? state.drivers[v.driverId] : undefined;
  if (d) {
    const de = driverEligibility(d, isoDate(state.clock.simTime));
    reasons.push(...de.reasons);
    if (d.availability !== 'available') reasons.push(`Driver ${d.availability}`);
  }
  if (v.status !== 'idle') reasons.push(`Vehicle ${v.status}`);
  if (v.currentStationId !== stationId) reasons.push('Vehicle not at this station');
  return { eligible: reasons.length === 0, reasons };
}
