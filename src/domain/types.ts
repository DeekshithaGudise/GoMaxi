/**
 * GoMaxi domain model.
 * All four apps (commuter, driver, admin, metro authority) read and mutate this single state
 * through the command API in `engine/commands.ts`. Entities are stored in normalised maps keyed by id,
 * mirroring the relational schema in `supabase/schema.sql`.
 */

export type ID = string;
export type Millis = number; // simulated epoch milliseconds

export type Role = 'commuter' | 'driver' | 'admin' | 'metro';

export interface LatLng { lat: number; lng: number }

export interface User {
  id: ID;
  role: Role;
  name: string;
  phone: string;
  email?: string;
  gender?: 'female' | 'male' | 'other' | 'undisclosed';
  avatarColor: string;
  createdAt: Millis;
}

export interface Commuter {
  id: ID; // same as user id
  userId: ID;
  homeStationId: ID;
  preferredHotspotId?: ID;
  womenPriorityDefault: boolean;
  emergencyContacts: { name: string; phone: string; relation: string }[];
  walletBalance: number; // simulated wallet (₹)
  totalSavings: number; // derived at booking time vs solo auto
}

export type ComplianceStatus = 'verified' | 'pending' | 'expired' | 'rejected' | 'not_applicable';

export interface ComplianceItem {
  key: string;        // e.g. 'contract_carriage_permit'
  label: string;
  status: ComplianceStatus;
  reference?: string; // document / permit number (illustrative)
  validTill?: string; // ISO date
  note?: string;
}

export interface Operator {
  id: ID;
  name: string;
  type: 'school_transport' | 'corporate_shuttle' | 'independent' | 'tour_operator';
  contact: string;
  vehicleIds: ID[];
  note: string;
}

export type VehicleStatus = 'idle' | 'assigned' | 'boarding' | 'on_trip' | 'returning' | 'off_duty' | 'committed';

export interface Vehicle {
  id: ID;            // GM-101
  registration: string;
  type: 'maxi_cab' | 'tempo_traveller';
  model: string;
  capacity: number;  // passenger seats excluding driver
  operatorId: ID;
  driverId?: ID;
  homeStationId: ID;
  currentStationId?: ID; // null while on trip
  status: VehicleStatus;
  position: LatLng;
  heading: number;
  compliance: ComplianceItem[];
  features: string[]; // 'gps', 'panic_button', 'cctv', 'first_aid', 'speed_governor'
  availableFrom?: Millis; // when a returning vehicle becomes idle again
  odometerKm: number;
}

export type DriverAvailability = 'available' | 'busy' | 'offline';

export interface Driver {
  id: ID; // same as user id
  userId: ID;
  vehicleId?: ID;
  licenceNo: string;
  licenceValidTill: string;
  psvBadgeNo: string;
  psvBadgeValidTill: string;
  policeVerification: ComplianceStatus;
  medicalFitness: ComplianceStatus;
  trainingCompleted: boolean;
  yearsExperience: number;
  languages: string[];
  availability: DriverAvailability;
  shiftStart?: Millis;
  ratingSum: number;
  ratingCount: number;
  commissionPct: number; // driver-specific override of platform commission? (we store the platform % globally; this is driver's incentive tier)
  incentiveTier: 'bronze' | 'silver' | 'gold';
}

export interface Station {
  id: ID;
  name: string;
  line: 'Purple' | 'Green' | 'Blue' | 'Yellow';
  position: LatLng;
  pickupBay: string;
  dailyExits: number;          // illustrative metro exit volume per weekday (assumption)
  peakExitPerHour: number;     // illustrative
  feederCoverage: 'low' | 'medium' | 'high';
}

export type HotspotType = 'tech_park' | 'commercial' | 'residential' | 'mixed';

export interface Hotspot {
  id: ID;
  name: string;
  type: HotspotType;
  position: LatLng;
  officeHeadcount: number;     // illustrative
  residentialDensity: number;  // 0–1 illustrative
  shiftTimings: string[];      // e.g. ['09:00', '18:00']
  transitAvailability: number; // 0–1 (1 = well-served, lowers GoMaxi demand)
  description: string;
}

export interface FareRule {
  stationId: ID;
  hotspotId: ID;
  fare: number;        // fixed per-seat fare ₹
  distanceKm: number;
  durationMin: number; // typical trip duration in sim minutes
  returnMin: number;   // vehicle return time to station
  waypoints: LatLng[]; // station → ... → hotspot
}

export interface AnchorRoute {
  id: ID;
  name: string;
  originStationId: ID;
  stopHotspotIds: ID[]; // ordered stops, last is destination
  frequencyMin: number;
  windowStart: string; // 'HH:MM'
  windowEnd: string;
  capacity: number;
  fare: number;
  vehicleIds: ID[];
  active: boolean;
}

export type BookingStatus =
  | 'pending_payment' | 'confirmed' | 'assigned' | 'boarded' | 'completed'
  | 'cancelled' | 'expired' | 'no_show' | 'payment_failed';

export interface Booking {
  id: ID; // GMB-xxxxx
  commuterId: ID;
  stationId: ID;
  hotspotId: ID;
  groupId?: ID;
  tripId?: ID;
  vehicleId?: ID;
  status: BookingStatus;
  fare: number;
  soloAutoFare: number;
  bikeTaxiFare: number;
  womenPriority: boolean;
  paymentId?: ID;
  qrToken: string;           // unique signed-looking token embedded in QR
  qrUsedAt?: Millis;
  createdAt: Millis;
  expiresAt: Millis;         // if not assigned by this time, it expires
  boardedAt?: Millis;
  completedAt?: Millis;
  cancelledAt?: Millis;
  rating?: number;
  ratingComment?: string;
  simulated: boolean;        // created by the simulation engine (not a human user)
  anchorDepartureId?: ID;    // if booked on a scheduled anchor route departure
  simBayAt?: Millis;         // simulated passengers: when they reach the pickup bay (auto-scan after this)
  rolloverCount: number;     // moved to a later departure this many times
}

export type GroupStatus = 'forming' | 'dispatched' | 'cancelled' | 'rolled_over';

export interface PoolingGroup {
  id: ID; // GRP-xxx
  stationId: ID;
  hotspotId: ID;
  bookingIds: ID[];
  status: GroupStatus;
  vehicleId?: ID;
  tripId?: ID;
  openedAt: Millis;
  deadline: Millis;          // openedAt + maxWait
  capacity: number;          // capacity of assigned vehicle (or default)
  threshold: number;         // dispatch threshold passengers
  dispatchedAt?: Millis;
  dispatchReason?: 'threshold' | 'timeout' | 'manual' | 'anchor_schedule';
  initiatedAt?: Millis;      // dispatch initiated (boarding grace starts)
  initiatedReason?: 'threshold' | 'timeout' | 'manual';
  rollovers: number;         // how many times the deadline was extended
}

export type TripStatus = 'scheduled' | 'assigned' | 'boarding' | 'en_route' | 'completed' | 'cancelled';

export interface Trip {
  id: ID; // TRP-xxx
  kind: 'pooled' | 'anchor';
  groupId?: ID;
  routeId?: ID;              // anchor route id
  vehicleId: ID;
  driverId: ID;
  stationId: ID;
  hotspotId: ID;
  status: TripStatus;
  bookingIds: ID[];
  boardedBookingIds: ID[];
  capacity: number;
  createdAt: Millis;
  acceptedAt?: Millis;
  scheduledDepartureAt?: Millis;
  departedAt?: Millis;
  etaAt?: Millis;
  completedAt?: Millis;
  progress: number;          // 0..1 along route
  position: LatLng;
  distanceKm: number;
  grossFare: number;         // sum of fares of boarded passengers (set at departure/completion)
  platformCommission: number;
  driverPayout: number;
  deviationAlert?: boolean;
  shareToken?: string;
  rejectedByDriverIds: ID[];
  acceptDeadline?: Millis;   // auto-accept if driver doesn't respond
  routeStops?: ID[];         // anchor trips: ordered hotspot stops
  returnEtaAt?: Millis;      // vehicle back at station
}

export type PaymentMethod = 'upi' | 'card' | 'wallet';
export type PaymentStatus = 'success' | 'failed' | 'refunded' | 'pending';

export interface Payment {
  id: ID; // PAY-xxx
  bookingId: ID;
  commuterId: ID;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  gatewayRef: string;        // simulated reference
  failureReason?: string;
  createdAt: Millis;
  refundedAt?: Millis;
  refundAmount?: number;
  simulated: true;
}

export interface BoardingRecord {
  id: ID;
  bookingId: ID;
  tripId: ID;
  vehicleId: ID;
  driverId: ID;
  method: 'qr' | 'manual' | 'offline_sync';
  scannedAt: Millis;
  syncedAt?: Millis;
  result: 'accepted' | 'rejected';
  reason?: string;
}

export type AlertType = 'sos' | 'route_deviation' | 'incident_report' | 'late_night_drop' | 'driver_report';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface SafetyAlert {
  id: ID;
  type: AlertType;
  status: AlertStatus;
  severity: 'low' | 'medium' | 'high' | 'critical';
  raisedByUserId?: ID;
  tripId?: ID;
  vehicleId?: ID;
  driverId?: ID;
  bookingId?: ID;
  message: string;
  position?: LatLng;
  createdAt: Millis;
  acknowledgedAt?: Millis;
  resolvedAt?: Millis;
  resolutionNote?: string;
  escalation: string[];      // simulated escalation steps with timestamps
}

export interface DriverEarning {
  id: ID;
  driverId: ID;
  tripId: ID;
  grossFare: number;
  commission: number;
  payout: number;
  incentive: number;
  createdAt: Millis;
}

export type ScheduleBlockKind = 'school_commitment' | 'gomaxi_feeder' | 'anchor_route' | 'idle' | 'maintenance';

export interface ScheduleBlock {
  start: string; // 'HH:MM'
  end: string;
  kind: ScheduleBlockKind;
  label: string;
}

export interface VehicleSchedule {
  vehicleId: ID;
  blocks: ScheduleBlock[];
}

export interface DispatchDecision {
  id: ID;
  at: Millis;
  groupId: ID;
  tripId?: ID;
  vehicleId?: ID;
  decision: 'assign_vehicle' | 'dispatch_threshold' | 'dispatch_timeout' | 'dispatch_manual' | 'hold_underfilled' | 'rollover' | 'cancel_refund' | 'no_vehicle' | 'depart_anchor';
  passengers: number;
  capacity: number;
  occupancyPct: number;
  rationale: string;
}

export interface ActivityEvent {
  id: ID;
  at: Millis;
  category: 'booking' | 'pooling' | 'dispatch' | 'boarding' | 'trip' | 'payment' | 'safety' | 'system' | 'driver';
  message: string;
  refs?: Partial<Record<'bookingId' | 'tripId' | 'groupId' | 'vehicleId' | 'driverId' | 'stationId' | 'hotspotId', ID>>;
  simulated?: boolean;
}

export interface DispatchSettings {
  defaultCapacity: number;
  targetOccupancyPct: number;     // 80
  maxWaitMin: number;             // 5
  minViablePassengers: number;    // underfilled dispatch floor after timeout
  underfilledPolicy: 'dispatch_if_viable' | 'rollover' | 'cancel_refund';
  boardingGraceMin: number;       // minutes to wait at bay after threshold before departing
  bookingExpiryMin: number;       // booking expires if never assigned
  allowDriverEarlyDeparture: boolean;
  nightSafeDropFrom: string;      // '20:00'
}

export interface FinanceAssumptions {
  vehicles: number;
  tripsPerHour: number;
  operatingHours: number;
  occupancyPct: number;
  averageFare: number;
  commissionPct: number;
  driverIncentivePct: number;     // of GBV paid as incentive on top
  paymentFeePct: number;          // of GBV
  opexPerVehiclePerDay: number;   // ₹ (ops, support, insurance top-up, tech)
  fixedMonthlyCost: number;       // ₹ (team, office, tech infra)
  maintenancePerTrip: number;     // ₹ (if GoMaxi bears any)
  corporateContractsMonthly: number; // ₹ additional B2B revenue
  stations: number;
  workingDaysPerMonth: number;
}

export interface DemandWeights {
  historicalBookings: number;
  metroExits: number;
  officeHeadcount: number;
  shiftAlignment: number;
  residentialDensity: number;
  transitGap: number;
}

export interface SimulationParams {
  stationId: ID;
  primaryHotspotId: ID;
  demand: number;             // commuters in the scenario
  vehicles: number;           // vehicles available at the station
  startTime: string;          // 'HH:MM'
  arrivalWindowMin: number;   // over how many sim-minutes the demand arrives
  hotspotMix: number;         // 0..1 share going to primary hotspot
  seed: number;
}

export interface SimulationState {
  status: 'idle' | 'running' | 'paused' | 'finished';
  params: SimulationParams;
  scheduledArrivals: { at: Millis; commuterIdx: number; hotspotId: ID; womenPriority: boolean }[];
  nextArrivalIdx: number;
  startedAt?: Millis;
  finishedAt?: Millis;
  spawnedBookingIds: ID[];
  rngState: number;
  stats: { arrivals: number; bookings: number; dispatches: number; boarded: number; completed: number };
}

export interface Clock {
  simTime: Millis;
  speed: number;         // sim seconds per real second
  running: boolean;
  lastTickReal?: number; // performance.now of last tick (leader only)
}

export interface Session {
  userId: ID;
  role: Role;
}

export interface OfflineBoardingQueueItem {
  bookingId: string;
  tripId: ID;
  driverId: ID;
  enteredAt: Millis;
}

export interface AppState {
  version: number;
  seedVersion: string;
  clock: Clock;
  users: Record<ID, User>;
  commuters: Record<ID, Commuter>;
  drivers: Record<ID, Driver>;
  operators: Record<ID, Operator>;
  vehicles: Record<ID, Vehicle>;
  stations: Record<ID, Station>;
  hotspots: Record<ID, Hotspot>;
  fareRules: FareRule[];
  anchorRoutes: Record<ID, AnchorRoute>;
  bookings: Record<ID, Booking>;
  groups: Record<ID, PoolingGroup>;
  trips: Record<ID, Trip>;
  payments: Record<ID, Payment>;
  boardingRecords: Record<ID, BoardingRecord>;
  alerts: Record<ID, SafetyAlert>;
  earnings: Record<ID, DriverEarning>;
  schedules: Record<ID, VehicleSchedule>;
  dispatchLog: DispatchDecision[];
  activity: ActivityEvent[];
  settings: {
    dispatch: DispatchSettings;
    finance: FinanceAssumptions;
    demandWeights: DemandWeights;
  };
  simulation: SimulationState;
  counters: Record<string, number>;
}
