import type { FinanceAssumptions } from '../types';
import { round } from '../util';

export const DEFAULT_FINANCE: FinanceAssumptions = {
  vehicles: 10, tripsPerHour: 2, operatingHours: 5.5, occupancyPct: 80, averageFare: 25, commissionPct: 15,
  driverIncentivePct: 2, paymentFeePct: 1.8, opexPerVehiclePerDay: 150, fixedMonthlyCost: 150000, maintenancePerTrip: 0,
  corporateContractsMonthly: 0, stations: 5, workingDaysPerMonth: 26,
};

export const FINANCE_SCENARIOS: Record<'conservative' | 'base' | 'optimistic', Partial<FinanceAssumptions> & { label: string; blurb: string }> = {
  conservative: { label: 'Conservative', blurb: 'Slower ramp: 8 vehicles, 60% occupancy, 1.5 trips/hour, higher opex, no B2B revenue.', vehicles: 8, occupancyPct: 60, tripsPerHour: 1.5, operatingHours: 5, averageFare: 25, commissionPct: 15, opexPerVehiclePerDay: 200, fixedMonthlyCost: 175000, corporateContractsMonthly: 0 },
  base: { label: 'Base case', blurb: 'Pilot plan: 10 vehicles, 80% occupancy, 2 trips/hour, 5.5 operating hours, lean 3-person team. Contribution-positive, not yet covering fixed cost — that needs scale or B2B.', ...DEFAULT_FINANCE },
  optimistic: { label: 'Optimistic', blurb: 'Scaled network: 40 vehicles across 8 stations, 85% occupancy, 2.5 trips/hour, 18% take rate, ₹3L/month corporate shuttle contracts.', vehicles: 40, occupancyPct: 85, tripsPerHour: 2.5, operatingHours: 6.5, averageFare: 27, commissionPct: 18, opexPerVehiclePerDay: 200, fixedMonthlyCost: 500000, corporateContractsMonthly: 300000, stations: 8 },
};

/** Split a single fare according to the platform commission. */
export function splitFare(gross: number, commissionPct: number) {
  const commission = round(gross * (commissionPct / 100), 2);
  return { gross, commission, payout: round(gross - commission, 2) };
}

export interface UnitEconomics {
  seatsPerTrip: number;
  gbvPerTrip: number;
  commissionPerTrip: number;
  driverPayoutPerTrip: number;
  tripsPerVehiclePerDay: number;
  gbvPerVehiclePerDay: number;
  revenuePerVehiclePerDay: number;   // platform commission per vehicle per day
  driverEarningsPerVehiclePerDay: number;
  gbvPerDay: number;
  gbvPerStationPerDay: number;
  revenuePerStationPerDay: number;
  gbvPerMonth: number;
  commissionPerMonth: number;
  incentivesPerMonth: number;
  paymentFeesPerMonth: number;
  maintenancePerMonth: number;
  variableOpexPerMonth: number;
  fixedCostPerMonth: number;
  corporateRevenuePerMonth: number;
  netRevenuePerMonth: number;        // commission + corporate - incentives - payment fees
  contributionMarginPerMonth: number; // net revenue - variable opex - maintenance
  contributionMarginPct: number;      // of GBV
  ebitdaPerMonth: number;             // contribution - fixed
  breakEvenTripsPerMonth: number;     // trips needed for contribution to cover fixed cost
  breakEvenTripsPerVehiclePerDay: number;
  breakEvenOccupancyPct: number;      // occupancy needed at current trip volume to cover all costs
  contributionPerTrip: number;
  driverPayoutPerMonth: number;
  tripsPerMonth: number;
}

export function computeUnitEconomics(a: FinanceAssumptions): UnitEconomics {
  const capacity = 12;
  const seatsPerTrip = capacity * (a.occupancyPct / 100);
  const gbvPerTrip = seatsPerTrip * a.averageFare;
  const commissionPerTrip = gbvPerTrip * (a.commissionPct / 100);
  const driverPayoutPerTrip = gbvPerTrip - commissionPerTrip;
  const tripsPerVehiclePerDay = a.tripsPerHour * a.operatingHours;
  const gbvPerVehiclePerDay = gbvPerTrip * tripsPerVehiclePerDay;
  const revenuePerVehiclePerDay = commissionPerTrip * tripsPerVehiclePerDay;
  const driverEarningsPerVehiclePerDay = driverPayoutPerTrip * tripsPerVehiclePerDay;
  const gbvPerDay = gbvPerVehiclePerDay * a.vehicles;
  const tripsPerDay = tripsPerVehiclePerDay * a.vehicles;
  const tripsPerMonth = tripsPerDay * a.workingDaysPerMonth;
  const gbvPerMonth = gbvPerDay * a.workingDaysPerMonth;
  const commissionPerMonth = gbvPerMonth * (a.commissionPct / 100);
  const incentivesPerMonth = gbvPerMonth * (a.driverIncentivePct / 100);
  const paymentFeesPerMonth = gbvPerMonth * (a.paymentFeePct / 100);
  const maintenancePerMonth = a.maintenancePerTrip * tripsPerMonth;
  const variableOpexPerMonth = a.opexPerVehiclePerDay * a.vehicles * a.workingDaysPerMonth;
  const corporateRevenuePerMonth = a.corporateContractsMonthly;
  const netRevenuePerMonth = commissionPerMonth + corporateRevenuePerMonth - incentivesPerMonth - paymentFeesPerMonth;
  const contributionMarginPerMonth = netRevenuePerMonth - variableOpexPerMonth - maintenancePerMonth;
  const contributionMarginPct = gbvPerMonth > 0 ? (contributionMarginPerMonth / gbvPerMonth) * 100 : 0;
  const ebitdaPerMonth = contributionMarginPerMonth - a.fixedMonthlyCost;
  // per-trip contribution excluding vehicle-day opex (which is per vehicle-day, not per trip)
  const contributionPerTrip = gbvPerTrip * ((a.commissionPct - a.driverIncentivePct - a.paymentFeePct) / 100) - a.maintenancePerTrip;
  const monthlyFixedLike = a.fixedMonthlyCost + variableOpexPerMonth - corporateRevenuePerMonth;
  const breakEvenTripsPerMonth = contributionPerTrip > 0 ? monthlyFixedLike / contributionPerTrip : Infinity;
  const breakEvenTripsPerVehiclePerDay = isFinite(breakEvenTripsPerMonth) ? breakEvenTripsPerMonth / (a.vehicles * a.workingDaysPerMonth) : Infinity;
  // occupancy needed at the planned trip count: total costs / (trips × capacity × fare × net take rate)
  const netTake = (a.commissionPct - a.driverIncentivePct - a.paymentFeePct) / 100;
  const denom = tripsPerMonth * capacity * a.averageFare * netTake;
  const breakEvenOccupancyPct = denom > 0 ? ((monthlyFixedLike + maintenancePerMonth) / denom) * 100 : Infinity;
  return {
    seatsPerTrip, gbvPerTrip, commissionPerTrip, driverPayoutPerTrip, tripsPerVehiclePerDay, gbvPerVehiclePerDay, revenuePerVehiclePerDay,
    driverEarningsPerVehiclePerDay, gbvPerDay, gbvPerStationPerDay: gbvPerDay / Math.max(1, a.stations), revenuePerStationPerDay: (revenuePerVehiclePerDay * a.vehicles) / Math.max(1, a.stations),
    gbvPerMonth, commissionPerMonth, incentivesPerMonth, paymentFeesPerMonth, maintenancePerMonth, variableOpexPerMonth, fixedCostPerMonth: a.fixedMonthlyCost,
    corporateRevenuePerMonth, netRevenuePerMonth, contributionMarginPerMonth, contributionMarginPct, ebitdaPerMonth, breakEvenTripsPerMonth, breakEvenTripsPerVehiclePerDay,
    breakEvenOccupancyPct, contributionPerTrip, driverPayoutPerMonth: gbvPerMonth - commissionPerMonth + incentivesPerMonth, tripsPerMonth,
  };
}
