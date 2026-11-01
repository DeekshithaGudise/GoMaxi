-- GoMaxi relational schema (PostgreSQL / Supabase).
-- Mirrors the in-browser entity model in src/domain/types.ts. Not required for the prototype,
-- which runs on a local engine; this is the production target for the same command API.

create extension if not exists "pgcrypto";

create type role_t as enum ('commuter','driver','admin','metro');
create type compliance_status_t as enum ('verified','pending','expired','rejected','not_applicable');
create type vehicle_status_t as enum ('idle','assigned','boarding','on_trip','returning','off_duty','committed');
create type availability_t as enum ('available','busy','offline');
create type booking_status_t as enum ('pending_payment','confirmed','assigned','boarded','completed','cancelled','expired','no_show','payment_failed');
create type group_status_t as enum ('forming','dispatched','cancelled','rolled_over');
create type trip_status_t as enum ('scheduled','assigned','boarding','en_route','completed','cancelled');
create type payment_method_t as enum ('upi','card','wallet');
create type payment_status_t as enum ('success','failed','refunded','pending');
create type alert_type_t as enum ('sos','route_deviation','incident_report','late_night_drop','driver_report');
create type alert_status_t as enum ('open','acknowledged','resolved');

create table users (
  id uuid primary key default gen_random_uuid(),
  role role_t not null,
  name text not null,
  phone text not null unique,
  email text,
  gender text check (gender in ('female','male','other','undisclosed')),
  created_at timestamptz not null default now()
);

create table commuters (
  user_id uuid primary key references users(id) on delete cascade,
  home_station_id text not null,
  preferred_hotspot_id text,
  women_priority_default boolean not null default false,
  emergency_contacts jsonb not null default '[]',
  wallet_balance numeric(10,2) not null default 0 check (wallet_balance >= 0),
  total_savings numeric(10,2) not null default 0
);

create table operators (
  id text primary key,
  name text not null,
  type text not null check (type in ('school_transport','corporate_shuttle','independent','tour_operator')),
  contact text,
  note text
);

create table stations (
  id text primary key,
  name text not null,
  line text not null,
  lat double precision not null,
  lng double precision not null,
  pickup_bay text,
  daily_exits integer,            -- illustrative until BMRCL data is connected
  peak_exit_per_hour integer,
  feeder_coverage text check (feeder_coverage in ('low','medium','high'))
);

create table hotspots (
  id text primary key,
  name text not null,
  type text not null check (type in ('tech_park','commercial','residential','mixed')),
  lat double precision not null,
  lng double precision not null,
  office_headcount integer,
  residential_density numeric(3,2),
  shift_timings text[] not null default '{}',
  transit_availability numeric(3,2),
  description text
);

create table fare_rules (
  station_id text references stations(id),
  hotspot_id text references hotspots(id),
  fare numeric(8,2) not null check (fare > 0),
  distance_km numeric(6,1) not null,
  duration_min integer not null,
  return_min integer not null,
  waypoints jsonb not null,
  primary key (station_id, hotspot_id)
);

create table vehicles (
  id text primary key,                        -- GM-101
  registration text not null unique,
  type text not null check (type in ('maxi_cab','tempo_traveller')),
  model text,
  capacity integer not null check (capacity between 1 and 20),
  operator_id text references operators(id),
  home_station_id text references stations(id),
  current_station_id text references stations(id),
  status vehicle_status_t not null default 'idle',
  lat double precision, lng double precision, heading real,
  features text[] not null default '{}',
  odometer_km numeric(10,1) default 0
);

create table vehicle_compliance (
  vehicle_id text references vehicles(id) on delete cascade,
  key text not null,                          -- registration | contract_carriage_permit | insurance | fitness | puc | road_tax | vlt_panic | speed_governor
  label text not null,
  status compliance_status_t not null default 'pending',
  reference text,
  valid_till date,
  note text,
  verified_by uuid references users(id),
  verified_at timestamptz,
  primary key (vehicle_id, key)
);

create table drivers (
  user_id uuid primary key references users(id) on delete cascade,
  vehicle_id text references vehicles(id),
  licence_no text not null,
  licence_valid_till date not null,
  psv_badge_no text,
  psv_badge_valid_till date,
  police_verification compliance_status_t not null default 'pending',
  medical_fitness compliance_status_t not null default 'pending',
  training_completed boolean not null default false,
  years_experience integer,
  languages text[] not null default '{}',
  availability availability_t not null default 'offline',
  shift_start timestamptz,
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  incentive_tier text not null default 'bronze'
);

create table vehicle_schedules (
  vehicle_id text references vehicles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  kind text not null check (kind in ('school_commitment','gomaxi_feeder','anchor_route','idle','maintenance')),
  label text,
  primary key (vehicle_id, weekday, start_time)
);

create table anchor_routes (
  id text primary key,
  name text not null,
  origin_station_id text references stations(id),
  stop_hotspot_ids text[] not null,
  frequency_min integer not null,
  window_start time not null,
  window_end time not null,
  capacity integer not null,
  fare numeric(8,2) not null,
  vehicle_ids text[] not null default '{}',
  active boolean not null default true
);

create table pooling_groups (
  id text primary key,                        -- GRP-xxx
  station_id text references stations(id),
  hotspot_id text references hotspots(id),
  status group_status_t not null default 'forming',
  vehicle_id text references vehicles(id),
  trip_id text,
  opened_at timestamptz not null,
  deadline timestamptz not null,
  capacity integer not null,
  threshold integer not null,
  initiated_at timestamptz,
  initiated_reason text,
  rollovers integer not null default 0,
  dispatched_at timestamptz,
  dispatch_reason text
);

create table trips (
  id text primary key,                        -- TRP-xxx
  kind text not null check (kind in ('pooled','anchor')),
  group_id text references pooling_groups(id),
  route_id text references anchor_routes(id),
  vehicle_id text not null references vehicles(id),
  driver_id uuid not null references drivers(user_id),
  station_id text references stations(id),
  hotspot_id text references hotspots(id),
  status trip_status_t not null,
  capacity integer not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  scheduled_departure_at timestamptz,
  departed_at timestamptz,
  eta_at timestamptz,
  completed_at timestamptz,
  progress numeric(4,3) not null default 0,
  lat double precision, lng double precision,
  distance_km numeric(6,1),
  gross_fare numeric(10,2) not null default 0,
  platform_commission numeric(10,2) not null default 0,
  driver_payout numeric(10,2) not null default 0,
  deviation_alert boolean not null default false,
  share_token text unique
);
alter table pooling_groups add constraint pooling_groups_trip_fk foreign key (trip_id) references trips(id);

create table bookings (
  id text primary key,                        -- GMB-xxxxx
  commuter_id uuid not null references commuters(user_id),
  station_id text references stations(id),
  hotspot_id text references hotspots(id),
  group_id text references pooling_groups(id),
  trip_id text references trips(id),
  vehicle_id text references vehicles(id),
  status booking_status_t not null,
  fare numeric(8,2) not null,
  solo_auto_fare numeric(8,2),
  bike_taxi_fare numeric(8,2),
  women_priority boolean not null default false,
  qr_token text not null,                     -- production: HMAC of (id, commuter, trip) with server secret
  qr_used_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  boarded_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  rating smallint check (rating between 1 and 5),
  rating_comment text,
  rollover_count integer not null default 0,
  anchor_departure_id text references trips(id),
  unique (id, qr_token)
);
-- One active booking per commuter.
create unique index bookings_one_active_per_commuter on bookings(commuter_id) where status in ('confirmed','assigned','boarded');

create table payments (
  id text primary key,                        -- PAY-xxx
  booking_id text not null references bookings(id),
  commuter_id uuid not null references commuters(user_id),
  method payment_method_t not null,
  amount numeric(8,2) not null,
  status payment_status_t not null,
  gateway_ref text,                           -- Razorpay payment_id in production
  failure_reason text,
  created_at timestamptz not null default now(),
  refunded_at timestamptz,
  refund_amount numeric(8,2)
);

create table boarding_records (
  id text primary key,
  booking_id text not null references bookings(id),
  trip_id text not null references trips(id),
  vehicle_id text not null references vehicles(id),
  driver_id uuid not null references drivers(user_id),
  method text not null check (method in ('qr','manual','offline_sync')),
  scanned_at timestamptz not null,
  synced_at timestamptz,
  result text not null check (result in ('accepted','rejected')),
  reason text
);
-- A booking can be accepted for boarding at most once (duplicate-scan guard at the database level).
create unique index boarding_once on boarding_records(booking_id) where result = 'accepted';

create table safety_alerts (
  id text primary key,
  type alert_type_t not null,
  status alert_status_t not null default 'open',
  severity text not null check (severity in ('low','medium','high','critical')),
  raised_by uuid references users(id),
  trip_id text references trips(id),
  vehicle_id text references vehicles(id),
  driver_id uuid references drivers(user_id),
  booking_id text references bookings(id),
  message text not null,
  lat double precision, lng double precision,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  escalation jsonb not null default '[]'
);

create table driver_earnings (
  id text primary key,
  driver_id uuid not null references drivers(user_id),
  trip_id text not null references trips(id) unique,
  gross_fare numeric(10,2) not null,
  commission numeric(10,2) not null,
  payout numeric(10,2) not null,
  incentive numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table dispatch_decisions (
  id bigserial primary key,
  at timestamptz not null default now(),
  group_id text,
  trip_id text,
  vehicle_id text,
  decision text not null,
  passengers integer not null,
  capacity integer not null,
  occupancy_pct numeric(5,1) not null,
  rationale text not null
);

create table settings (
  key text primary key,                       -- 'dispatch' | 'finance' | 'demand_weights'
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row-level security sketch (Supabase): commuters read their own bookings/payments; drivers read trips assigned
-- to them and bookings on those trips (name + masked phone via a view); admins full access; metro role reads
-- aggregated views only (no access to users/bookings tables directly).
create view metro_station_daily as
  select b.station_id, date_trunc('day', b.created_at) as day, count(*) filter (where b.status = 'completed') as completed_bookings,
         avg(extract(epoch from (g.dispatched_at - b.created_at))/60) as avg_wait_min
  from bookings b left join pooling_groups g on g.id = b.group_id group by 1,2;
