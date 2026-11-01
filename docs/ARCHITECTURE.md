# GoMaxi — Technical Architecture

## 1. Shape of the system

GoMaxi is a single React + TypeScript application that contains four role-based front-ends and one shared
domain engine. The engine is the prototype's "backend": every screen reads from it and writes to it through a
command API, so a booking created in the commuter app is the same record the driver scans and the admin
dashboard counts.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Browser tab(s)                                                              │
│                                                                              │
│  Commuter app   Driver app   Admin dashboard   Metro view   Judge demo       │
│   (mobile)       (mobile)      (desktop)        (desktop)    (presentation)  │
│        │             │              │               │             │          │
│        └─────────────┴──────┬───────┴───────────────┴─────────────┘          │
│                             ▼                                                │
│                 React hooks (useAppState / useDispatch)                      │
│                             │  commands              snapshots               │
│                             ▼                                                │
│   ┌─────────────────────── Store (leader tab) ────────────────────────┐      │
│   │  execute(Command)  →  engine modules  →  immutable AppState        │      │
│   │  tick(): simulated clock → pooling/dispatch → trips → simulation   │      │
│   │  persistence: localStorage (2 s)   sync: BroadcastChannel          │      │
│   └────────────────────────────────────────────────────────────────────┘      │
│   Follower tabs forward commands to the leader and render its snapshots.     │
└──────────────────────────────────────────────────────────────────────────────┘
```

* **One engine, many tabs.** The Web Locks API elects exactly one tab as *leader*. It runs the clock, applies
  commands and persists state. Other tabs are *followers*: they post commands over a `BroadcastChannel`, the
  leader applies them and broadcasts a new snapshot. Opening the commuter, driver and admin apps in three tabs
  therefore behaves like three clients of one server.
* **Why not a real server?** The brief requires the demo to work without third-party credentials or network.
  The command API (`src/domain/engine/commands.ts`) and the relational entity model (`supabase/schema.sql`)
  are designed so the `Store` class can be swapped for an HTTP + realtime client without touching the apps.

## 2. Directory map

```
src/
  domain/
    types.ts                 Entities (users, commuters, drivers, vehicles, stations, hotspots, fare rules,
                             anchor routes, bookings, pooling groups, trips, payments, boarding records,
                             safety alerts, earnings, schedules, dispatch decisions, activity, settings)
    util.ts                  Deterministic PRNG, IST time helpers, geo (haversine, polyline interpolation)
    seed/                    Bengaluru data: 5 stations, 8 hotspots, 40 fare rules, 4 operators,
                             10 vehicles, 10 drivers, 20 named + 60 anonymised commuters, schedules, routes,
                             compliance checklist (from research)
    store/
      initialState.ts        Builds the state incl. a deterministic 5-day booking/trip/payment history
      store.ts               Leader/follower store, persistence, tick loop
      hooks.ts               React bindings
    engine/
      ctx.ts                 Copy-on-write entity helpers, id generation, activity + decision logs
      compliance.ts          Vehicle and driver eligibility gates
      payments.ts            Simulated gateway (success / failure / refund)
      pooling.ts             Group compatibility, vehicle ranking/assignment, driver accept/reject
      dispatch.ts            Threshold / timeout / under-filled policy, departure, movement, completion
      booking.ts             Create / cancel / rate / expire
      boarding.ts            QR payload, validation, duplicate prevention, offline sync
      anchor.ts              Scheduled anchor-route departures
      safety.ts              SOS, deviation, incident reports, trip sharing, safe-drop policy
      simulation.ts          Deterministic peak-hour scenario generator + reset
      demand.ts              Rule-based hotspot demand scoring + hourly forecast profile
      finance.ts             Unit economics calculator and scenarios
      analytics.ts           Overview, station, utilisation, financial actuals, driver stats
      tick.ts                Clock advance + periodic processes
      commands.ts            The command union and executor (the "API")
  app/
    auth/LoginPage.tsx       Role + persona selection, commuter registration
    commuter/                Home, booking wizard, boarding pass/tracking, trips & payments, safety/profile
    driver/                  Dashboard, trip control, QR scanner (camera / manual / offline), earnings
    admin/                   Overview, simulation, fleet map, pooling & dispatch, hotspots, stations,
                             drivers & vehicles, compliance, finance, utilisation, routes, safety, settings
    demo/DemoApp.tsx         Six-step judge presentation
    shared/                  UI kit, clock widget, Leaflet map, Recharts wrappers, QR components
```

## 3. Core algorithms

### Pooling
A booking joins the oldest *forming* group with the same station and hotspot whose departure window is still
open, whose dispatch has not been initiated and which has seats left. Otherwise a new group opens with
`deadline = now + maxWait` and `threshold = ⌈capacity × targetOccupancy⌉`.

### Vehicle assignment
Candidates are vehicles that pass `dispatchable()`: all blocking compliance items verified (RC, contract
carriage permit, insurance, fitness, PUC, road tax), driver eligible (licence, PSV badge, police verification,
medical, training), driver `available`, vehicle `idle` and physically at the station. Ranking: fewest trips
today, then higher rating. The assigned trip starts as `assigned` (driver has 45 s to accept or it
auto-accepts), then `boarding`.

### Dispatch (every tick)
1. **Threshold** — booked passengers ≥ threshold → *dispatch initiated*; boarding grace starts.
2. **Timeout** — deadline passed: if passengers ≥ viable floor → initiate; else apply the configured
   under-filled policy (extend the window up to twice, then dispatch anyway under the no-strand rule, or cancel
   with refund, depending on the policy).
3. **Departure** — all booked passengers boarded, or grace expired with ≥1 boarded, or the driver starts the
   trip. Un-boarded passengers are moved to a fresh group (rollover) and the vehicle leaves.
4. Every step writes a `DispatchDecision` with a human-readable rationale.

Invariants enforced in code and tests: capacity never exceeded, a commuter never holds two active bookings,
unavailable drivers and non-compliant vehicles are never assigned, expired bookings are refunded, a QR can be
accepted once.

### Boarding
QR payload: `GOMAXI|<bookingId>|<token>`. Validation order: parse → booking exists → token matches → trip is
`boarding` → booking belongs to this trip → not already boarded/finished → capacity. Manual entry accepts a
booking ID without the token (an operational fallback, logged as `manual`). Offline queue items replay through
the same validator with `method = offline_sync`, so duplicates are rejected on sync.

### Simulation
`sim.start` schedules N arrivals with a seeded PRNG, repositions/parks vehicles to match the requested count and
sets the clock. Each tick spawns arrivals as *real* bookings (via `createBooking`) and auto-scans simulated
passengers once they "reach the bay". Everything else is the ordinary engine. `sim.reset` removes only the
scenario's records.

## 4. Time
All timestamps are simulated epoch milliseconds on a demo day (Mon 2 Nov 2026, IST). The clock advances in
real time × speed (1×–60×) and can be paused. Tests drive it with `store.advance(ms)`.

## 5. Security notes (prototype vs production)
* QR tokens are random strings, not signatures. Production: HMAC(id, commuter, trip, exp) with a server secret,
  rotated per trip; the driver app verifies online or with a short-lived offline key.
* Demo login is persona selection. Production: OTP login, JWT with role claims, RLS as sketched in the schema.
* Driver sees passenger name and a masked phone only; the metro role never sees personal data.
* No real payment, telematics, SMS or emergency integration exists in this build.
