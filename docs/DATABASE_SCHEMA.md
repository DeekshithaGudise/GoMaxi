# Database schema

The prototype keeps its entities in normalised in-memory maps (`src/domain/types.ts → AppState`). The production
target is PostgreSQL (Supabase) using the DDL in `supabase/schema.sql`. Both share the same shapes and ids.

## Entity relationship summary

```
users ─1:1─ commuters ─1:N─ bookings ─N:1─ pooling_groups ─1:1─ trips ─N:1─ vehicles ─N:1─ operators
  │                           │  1:1 payments                     │              │ 1:N vehicle_compliance
  └─1:1─ drivers ─1:1─ vehicles│  1:N boarding_records             │ 1:N driver_earnings
                               └─ 0:1 safety_alerts                └─ N:1 anchor_routes (kind = anchor)
stations ─N:M─ hotspots (fare_rules)        vehicles ─1:N─ vehicle_schedules
```

| Entity | Key fields | Notes |
|---|---|---|
| users | id, role, name, phone | roles: commuter, driver, admin, metro |
| commuters | user_id, home_station_id, women_priority_default, wallet_balance | wallet is a simulated balance |
| drivers | user_id, vehicle_id, licence, PSV badge, police/medical status, training, availability, rating | eligibility gate |
| vehicles | id (GM-xxx), registration, capacity, operator_id, status, position | status drives dispatch |
| vehicle_compliance | vehicle_id + key, status, valid_till | six keys block dispatch |
| operators | id, type | school transport, corporate shuttle, independent, tour |
| stations / hotspots | id, position, illustrative demand inputs | metro exit volumes are assumptions |
| fare_rules | station × hotspot, fare, distance, duration, waypoints | fixed per-seat fares |
| anchor_routes | window, frequency, stops, fare, vehicles | off-peak scheduled mode |
| pooling_groups | station, hotspot, deadline, threshold, status, vehicle, trip | the pooling unit |
| trips | kind, vehicle, driver, status, boarded ids, fare split | pooled or anchor |
| bookings | commuter, station, hotspot, group, trip, status, qr_token, fare | one active per commuter |
| payments | booking, method, status, gateway_ref, refund | simulated gateway |
| boarding_records | booking, trip, method, result | unique accepted record per booking |
| safety_alerts | type, severity, status, escalation steps | simulated escalation |
| driver_earnings | trip, payout, commission, incentive | written at completion |
| dispatch_decisions | decision, passengers, capacity, rationale | audit log |
| settings | dispatch / finance / demand weights | editable in admin |

## Validation rules implemented in the engine
* Booking: station ≠ hotspot, commuter exists, no other active booking, payment success before confirmation.
* Group: seats ≤ capacity, bookings unique, window open.
* Trip: boarded ⊆ booked ≤ capacity; departure only from `boarding`; completion only from `en_route`.
* Vehicle: no dispatch unless all blocking compliance items are `verified` and the driver is eligible.
* Payment: refund only of a successful payment; wallet cannot go negative.
* Boarding: a booking is accepted once; token must match when present; trip must be boarding.
