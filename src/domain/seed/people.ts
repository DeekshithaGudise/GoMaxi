import type { Commuter, Driver, Operator, User, Vehicle, VehicleSchedule, AnchorRoute, ComplianceItem } from '../types';
import { DEMO_DAY_START } from '../util';
import { stationById } from './geo';

const COLORS = ['#2563EB', '#20C4D8', '#16A36A', '#F59E0B', '#8B5CF6', '#EC4899', '#0EA5E9', '#F97316'];

const commuterSeed: [string, string, 'female' | 'male', string, string, boolean][] = [
  // name, phone suffix, gender, home station, preferred hotspot, women priority
  ['Ananya Rao', '9001', 'female', 'st-byp', 'hs-whf', true],
  ['Rahul Menon', '9002', 'male', 'st-byp', 'hs-whf', false],
  ['Priya Sharma', '9003', 'female', 'st-byp', 'hs-itpl', true],
  ['Karthik Iyer', '9004', 'male', 'st-byp', 'hs-bag', false],
  ['Sneha Kulkarni', '9005', 'female', 'st-krp', 'hs-whf', false],
  ['Arjun Nair', '9006', 'male', 'st-krp', 'hs-itpl', false],
  ['Divya Reddy', '9007', 'female', 'st-ind', 'hs-orr', true],
  ['Vikram Shetty', '9008', 'male', 'st-ind', 'hs-bag', false],
  ['Meera Krishnan', '9009', 'female', 'st-mgr', 'hs-man', true],
  ['Siddharth Jain', '9010', 'male', 'st-mgr', 'hs-ecy', false],
  ['Pooja Hegde', '9011', 'female', 'st-tri', 'hs-orr', false],
  ['Aditya Verma', '9012', 'male', 'st-tri', 'hs-bag', false],
  ['Lakshmi Prasad', '9013', 'female', 'st-byp', 'hs-hoo', true],
  ['Rohan Das', '9014', 'male', 'st-byp', 'hs-whf', false],
  ['Nisha Pillai', '9015', 'female', 'st-krp', 'hs-hoo', false],
  ['Farhan Khan', '9016', 'male', 'st-krp', 'hs-whf', false],
  ['Gayathri S', '9017', 'female', 'st-ind', 'hs-hsr', true],
  ['Manish Gupta', '9018', 'male', 'st-mgr', 'hs-orr', false],
  ['Shruti Bhat', '9019', 'female', 'st-byp', 'hs-itpl', false],
  ['Tarun Agarwal', '9020', 'male', 'st-tri', 'hs-man', false],
];

export function seedCommuters(): { users: User[]; commuters: Commuter[] } {
  const users: User[] = []; const commuters: Commuter[] = [];
  commuterSeed.forEach(([name, ph, gender, home, pref, wp], i) => {
    const id = `usr-c${String(i + 1).padStart(2, '0')}`;
    users.push({ id, role: 'commuter', name, phone: `+91 98450 ${ph}`, email: `${name.split(' ')[0].toLowerCase()}@example.com`, gender, avatarColor: COLORS[i % COLORS.length], createdAt: DEMO_DAY_START - 30 * 86400000 });
    commuters.push({ id, userId: id, homeStationId: home, preferredHotspotId: pref, womenPriorityDefault: wp, emergencyContacts: [{ name: 'Home', phone: '+91 98800 00001', relation: 'Family' }], walletBalance: 250, totalSavings: 0 });
  });
  return { users, commuters };
}

export const OPERATORS: Operator[] = [
  { id: 'op-sun', name: 'Sunrise School Transport Services', type: 'school_transport', contact: 'ops@sunrise-transport.example', vehicleIds: ['GM-101', 'GM-102', 'GM-103', 'GM-104'], note: 'School runs 06:30–08:30 and 14:30–16:30. Vehicles hold contract carriage permits in addition to educational-institution use (illustrative — must be verified per vehicle).' },
  { id: 'op-nam', name: 'Namma Shuttle Operators', type: 'corporate_shuttle', contact: 'fleet@nammashuttle.example', vehicleIds: ['GM-105', 'GM-106', 'GM-107'], note: 'Corporate shuttle operator with idle mid-morning and midday capacity.' },
  { id: 'op-ind', name: 'Ravi Kumar (owner-driver)', type: 'independent', contact: '+91 98860 11111', vehicleIds: ['GM-108', 'GM-109'], note: 'Independent maxi-cab owner-drivers on contract carriage permits.' },
  { id: 'op-tour', name: 'Garden City Tours & Travels', type: 'tour_operator', contact: 'bookings@gctours.example', vehicleIds: ['GM-110'], note: 'Tempo traveller operator; weekday mornings typically idle.' },
];

const c = (key: string, label: string, status: ComplianceItem['status'], reference?: string, validTill?: string, note?: string): ComplianceItem => ({ key, label, status, reference, validTill, note });

function fullCompliance(reg: string, exp = '2027-03-31'): ComplianceItem[] {
  return [
    c('registration', 'Commercial (yellow-board) registration', 'verified', reg, undefined, 'RC verified against VAHAN (illustrative)'),
    c('contract_carriage_permit', 'Contract carriage permit (Maxi Cab)', 'verified', `KA-CC-${reg.slice(-4)}`, exp),
    c('insurance', 'Motor insurance incl. passenger liability', 'verified', `POL-${reg.slice(-4)}-26`, exp),
    c('fitness', 'Fitness certificate (annual)', 'verified', undefined, exp),
    c('puc', 'Pollution Under Control certificate', 'verified', undefined, '2027-01-31'),
    c('road_tax', 'Karnataka road tax paid', 'verified', undefined, exp),
    c('vlt_panic', 'VLT device + panic button (AIS-140)', 'verified', undefined, undefined, 'Nirbhaya framework for public service vehicles'),
    c('speed_governor', 'Speed limiting device', 'verified'),
  ];
}

const vehicleSeed: [string, string, Vehicle['type'], string, number, string, string, string[]][] = [
  // id, registration, type, model, capacity, operator, homeStation, features
  ['GM-101', 'KA 03 AC 4821', 'maxi_cab', 'Force Traveller 3350', 12, 'op-sun', 'st-byp', ['gps', 'panic_button', 'first_aid', 'speed_governor']],
  ['GM-102', 'KA 03 AC 5107', 'maxi_cab', 'Force Traveller 3350', 12, 'op-sun', 'st-byp', ['gps', 'panic_button', 'cctv', 'first_aid', 'speed_governor']],
  ['GM-103', 'KA 53 B 2290', 'tempo_traveller', 'Tata Winger 12S', 12, 'op-sun', 'st-byp', ['gps', 'panic_button', 'first_aid', 'speed_governor']],
  ['GM-104', 'KA 53 B 3344', 'tempo_traveller', 'Tata Winger 12S', 12, 'op-sun', 'st-krp', ['gps', 'panic_button', 'speed_governor']],
  ['GM-105', 'KA 01 AD 7781', 'maxi_cab', 'Force Traveller 3350', 12, 'op-nam', 'st-byp', ['gps', 'panic_button', 'cctv', 'first_aid', 'speed_governor']],
  ['GM-106', 'KA 01 AD 7790', 'maxi_cab', 'Force Traveller 3350', 12, 'op-nam', 'st-ind', ['gps', 'panic_button', 'first_aid', 'speed_governor']],
  ['GM-107', 'KA 05 AF 1206', 'tempo_traveller', 'Force Traveller 3700', 12, 'op-nam', 'st-mgr', ['gps', 'panic_button', 'cctv', 'first_aid', 'speed_governor']],
  ['GM-108', 'KA 51 AB 9012', 'maxi_cab', 'Force Traveller 3350', 12, 'op-ind', 'st-byp', ['gps', 'panic_button', 'speed_governor']],
  ['GM-109', 'KA 51 AB 9344', 'maxi_cab', 'Force Traveller 3350', 12, 'op-ind', 'st-tri', ['gps', 'speed_governor']],
  ['GM-110', 'KA 02 AE 6673', 'tempo_traveller', 'Tata Winger 12S', 12, 'op-tour', 'st-krp', ['gps', 'panic_button', 'first_aid']],
];

export function seedVehicles(): Vehicle[] {
  return vehicleSeed.map(([id, registration, type, model, capacity, operatorId, homeStationId, features], i) => {
    const compliance = fullCompliance(registration);
    // GM-109: permit pending (not eligible). GM-110: insurance expired (not eligible) until admin re-verifies.
    if (id === 'GM-109') { compliance[1] = c('contract_carriage_permit', 'Contract carriage permit (Maxi Cab)', 'pending', undefined, undefined, 'Permit application submitted at RTO Electronic City; awaiting issue.'); compliance[6] = c('vlt_panic', 'VLT device + panic button (AIS-140)', 'pending', undefined, undefined, 'Device installation scheduled.'); }
    if (id === 'GM-110') { compliance[2] = c('insurance', 'Motor insurance incl. passenger liability', 'expired', 'POL-6673-25', '2026-10-15', 'Renewal pending with insurer.'); }
    const st = stationById[homeStationId];
    return {
      id, registration, type, model, capacity, operatorId, driverId: `usr-d${String(i + 1).padStart(2, '0')}`, homeStationId, currentStationId: homeStationId,
      status: 'idle', position: { lat: st.position.lat + 0.0004 * (i % 3), lng: st.position.lng + 0.0004 * (i % 2) }, heading: 90,
      compliance, features, odometerKm: 48000 + i * 6100,
    };
  });
}

const driverSeed: [string, string, number, number, number, Driver['incentiveTier'], string[]][] = [
  // name, phone, yearsExp, ratingSum, ratingCount, tier, languages
  ['Suresh Babu', '77001', 9, 1392, 296, 'gold', ['Kannada', 'Tamil', 'Hindi']],
  ['Manjunath K', '77002', 6, 1178, 251, 'silver', ['Kannada', 'Hindi']],
  ['Ravi Kumar', '77003', 12, 1512, 320, 'gold', ['Kannada', 'Telugu', 'English']],
  ['Prakash Gowda', '77004', 4, 702, 155, 'bronze', ['Kannada', 'Hindi']],
  ['Imran Pasha', '77005', 7, 1033, 221, 'silver', ['Kannada', 'Urdu', 'Hindi', 'English']],
  ['Lokesh N', '77006', 5, 832, 180, 'silver', ['Kannada', 'Tamil']],
  ['Venkatesh R', '77007', 10, 1221, 258, 'gold', ['Kannada', 'Telugu', 'Hindi']],
  ['Basavaraj H', '77008', 8, 977, 210, 'silver', ['Kannada', 'Hindi']],
  ['Shivakumar M', '77009', 3, 410, 92, 'bronze', ['Kannada']],
  ['Nagaraj T', '77010', 6, 745, 162, 'silver', ['Kannada', 'Tamil', 'Hindi']],
];

export function seedDrivers(): { users: User[]; drivers: Driver[] } {
  const users: User[] = []; const drivers: Driver[] = [];
  driverSeed.forEach(([name, ph, yrs, rs, rc, tier, langs], i) => {
    const id = `usr-d${String(i + 1).padStart(2, '0')}`;
    users.push({ id, role: 'driver', name, phone: `+91 98860 ${ph}`, gender: 'male', avatarColor: COLORS[(i + 3) % COLORS.length], createdAt: DEMO_DAY_START - 120 * 86400000 });
    drivers.push({
      id, userId: id, vehicleId: `GM-1${String(i + 1).padStart(2, '0')}`, licenceNo: `KA03 2015${String(1000 + i * 37)}`, licenceValidTill: '2029-06-30',
      psvBadgeNo: `PSV-KA-${String(5100 + i * 11)}`, psvBadgeValidTill: i === 8 ? '2026-09-30' : '2028-12-31',
      policeVerification: i === 8 ? 'pending' : 'verified', medicalFitness: 'verified', trainingCompleted: i !== 8,
      yearsExperience: yrs, languages: langs, availability: i === 9 ? 'offline' : 'available', ratingSum: rs, ratingCount: rc, commissionPct: 15, incentiveTier: tier,
    });
  });
  return { users, drivers };
}

export function seedAdmins(): User[] {
  return [
    { id: 'usr-admin', role: 'admin', name: 'Operations Control (Admin)', phone: '+91 80 4000 0001', email: 'ops@gomaxi.example', gender: 'undisclosed', avatarColor: '#10243A', createdAt: DEMO_DAY_START - 200 * 86400000 },
    { id: 'usr-metro', role: 'metro', name: 'Metro Authority Analyst', phone: '+91 80 2296 0000', email: 'analytics@metro.example', gender: 'undisclosed', avatarColor: '#7C3AED', createdAt: DEMO_DAY_START - 200 * 86400000 },
  ];
}

export function seedSchedules(vehicles: Vehicle[]): VehicleSchedule[] {
  return vehicles.map((v) => {
    const school = v.operatorId === 'op-sun';
    const corporate = v.operatorId === 'op-nam';
    const blocks: VehicleSchedule['blocks'] = [];
    if (school) blocks.push({ start: '06:30', end: '08:30', kind: 'school_commitment', label: 'School morning run (existing commitment)' });
    else if (corporate) blocks.push({ start: '07:00', end: '08:45', kind: 'school_commitment', label: 'Corporate shuttle (existing commitment)' });
    else blocks.push({ start: '06:30', end: '08:30', kind: 'idle', label: 'Idle' });
    blocks.push({ start: school ? '09:00' : '08:45', end: '11:00', kind: 'gomaxi_feeder', label: 'GoMaxi morning feeder' });
    blocks.push({ start: '11:00', end: '14:00', kind: 'anchor_route', label: 'GoMaxi anchor route' });
    if (school) blocks.push({ start: '14:30', end: '16:30', kind: 'school_commitment', label: 'School afternoon run (existing commitment)' });
    else if (corporate) blocks.push({ start: '14:00', end: '16:30', kind: 'idle', label: 'Idle' });
    else blocks.push({ start: '14:00', end: '16:30', kind: v.id === 'GM-108' ? 'maintenance' : 'idle', label: v.id === 'GM-108' ? 'Scheduled maintenance' : 'Idle' });
    blocks.push({ start: '17:00', end: '20:30', kind: 'gomaxi_feeder', label: 'GoMaxi evening feeder' });
    return { vehicleId: v.id, blocks };
  });
}

export const ANCHOR_ROUTES: AnchorRoute[] = [
  { id: 'rt-whf-itpl', name: 'Whitefield Connector', originStationId: 'st-byp', stopHotspotIds: ['hs-whf', 'hs-itpl'], frequencyMin: 30, windowStart: '11:00', windowEnd: '14:00', capacity: 12, fare: 35, vehicleIds: ['GM-101', 'GM-102'], active: true },
  { id: 'rt-orr', name: 'ORR Tech Loop', originStationId: 'st-ind', stopHotspotIds: ['hs-bag', 'hs-orr'], frequencyMin: 30, windowStart: '11:00', windowEnd: '14:00', capacity: 12, fare: 35, vehicleIds: ['GM-106'], active: true },
  { id: 'rt-man', name: 'Manyata Express', originStationId: 'st-mgr', stopHotspotIds: ['hs-man'], frequencyMin: 45, windowStart: '11:15', windowEnd: '13:45', capacity: 12, fare: 45, vehicleIds: ['GM-107'], active: true },
];
