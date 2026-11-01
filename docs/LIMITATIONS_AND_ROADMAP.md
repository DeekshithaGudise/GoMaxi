# Known limitations and future roadmap

## Known limitations (this prototype)

**Platform**
* No server. The engine runs in the browser (leader tab) and persists to `localStorage`. Data is per browser
  profile; two different laptops do not share state. Clearing site data resets to the seed.
* Demo authentication (persona selection), no OTP, no JWT, no rate limiting.
* QR tokens are random strings, not signed. See `docs/ARCHITECTURE.md` §5 for the production design.
* Camera QR scanning requires HTTPS or `localhost` and a device camera; otherwise use manual verification.
* OpenStreetMap tiles are loaded live; offline, the map background is blank but vehicles and routes still render.

**Domain simplifications**
* Vehicle movement is interpolated along a synthetic 4-point corridor at an assumed average speed; it is not
  routed on the road network and ignores traffic.
* Vehicles are assigned only when idle at the origin station; there is no cross-station rebalancing or
  pre-assignment of returning vehicles. In the default scenario this is why a late pooling group can wait for a
  vehicle to return.
* Fares are a distance band table; no surge, passes, concessions or GST handling.
* Anchor routes are modelled as origin → final stop for timing; intermediate stops are listed but not timed
  individually.
* Women-priority seating is recorded and shown to the driver but seats are not physically allocated.
* Incentives are a flat % of GBV when the occupancy target is met; no weekly schemes.
* The demand model is a transparent weighted score, not a trained predictor. Metro exit volumes, office
  headcounts and the 0.55 "private trips replaced per seat" factor are assumptions.
* Financial model is illustrative and excludes taxes, working capital, insurance claims and CAC.
* Sample history is synthetic (generated deterministically) so that dashboards are populated.

**Regulatory (see `docs/REGULATORY_RESEARCH.md`)**
* GoMaxi is **not** licensed. The per-seat pooled model on fixed corridors may be treated as stage carriage for
  maxi cabs; school vehicles cannot carry fare-paying passengers under institution permits; a Karnataka
  aggregator licence is required and its coverage of 12-seat vehicles is unconfirmed. The prototype enforces
  document gates but cannot resolve these legal questions.

## Roadmap

**Phase 1 — Production foundations (0–3 months)**
* Supabase/PostgreSQL backend from `supabase/schema.sql`; command API as edge functions; realtime channels
  replace `BroadcastChannel`; row-level security per role.
* OTP login, signed QR tokens, audit logs, DPDP-aligned consent and retention.
* Razorpay (or another licensed PA/PG) behind `processPayment`, with webhooks and reconciliation.
* AIS-140 VLT ingestion for real positions and panic-button events; route adherence from map-matched GPS.

**Phase 2 — Operations pilot (3–6 months)**
* Legal opinion + regulatory engagement; launch wedge via B2B whole-vehicle contracts while the per-seat
  question is settled; aggregator licence application.
* 2 stations, 10 verified vehicles, 2 operators; bay agreements with the metro operator; station exit-count
  feed to replace assumptions.
* Driver onboarding workflow with document OCR and VAHAN/Sarathi checks where APIs permit.
* Dispatch improvements: cross-station rebalancing, pre-assignment of returning vehicles, demand-aware holding.

**Phase 3 — Network (6–12 months)**
* 8 stations, 25–40 vehicles, evening women-only pooled departures, corporate shuttle contracts.
* Real demand forecasting trained on ridership; dynamic anchor-route timetables.
* Metro authority data-sharing dashboard; integration with metro ticketing/pass for bundled fares.
