# Testing

## Unit / engine tests — `npm test`
`src/domain/__tests__/engine.test.ts` (Vitest, 25 tests, ~2 s) covers:

* Booking creation with unique QR tokens; payment success, card/UPI/wallet failure paths; retry after failure.
* One active booking per commuter; cancellation with full refund and vehicle release; no cancellation after boarding.
* Pooling compatibility (same station + hotspot); threshold dispatch at 10/12 with correct fare split;
  timeout dispatch with viable under-filled load; trip completion and driver earnings.
* Capacity never exceeded (13th passenger opens a new group).
* Compliance gates: non-compliant vehicle and ineligible driver are never assigned; verifying permit, police
  check, training and badge renewal makes the vehicle dispatchable.
* Offline driver never assigned; coming online unblocks the group; driver rejection triggers reassignment.
* Booking expiry with refund; rollover of un-boarded passengers at departure.
* QR: accept once, duplicate blocked, tampered token / unknown booking / wrong vehicle rejected, no scanning
  before acceptance, offline queue sync without double boarding.
* Safety: SOS alert lifecycle; late-night safe-drop policy applied at departure.
* Finance: pitch arithmetic (₹300 → ₹45/₹255; ₹600/₹90/₹510 per hour) and internal consistency.
* Cross-dashboard consistency: one commuter booking flows to driver stats, overview metrics, financial actuals
  and hotspot demand with identical numbers.
* Live simulation: deterministic (same seed → same stats), every passenger delivered or refunded, capacity and
  compliance invariants hold, reset clears scenario data.

## Browser acceptance — `npm run e2e`
`scripts/acceptance.mjs` drives Chromium (Playwright) through the 18 acceptance criteria with three tabs
(commuter, driver, admin) sharing one engine, and captures screenshots to `e2e-output/`. Run
`npm run build && npm run preview` first. Latest run: 19/19 checks passed.

## Secondary flows — `npm run e2e:secondary`
`scripts/secondary-flows.mjs` covers registration, simulated payment failure and wallet payment, cancellation with
refund and vehicle release, SOS → admin resolution, public live-trip share page, offline scan queue sync without
double boarding, anchor-route departure generation and booking, and live dispatch-settings changes. Latest run:
15/15 checks passed.

## Manual test notes
* Camera scanning needs a real device with a camera and a secure origin; in headless or desktop runs use the
  manual booking-ID fallback and the offline queue toggle.
* Multi-tab behaviour: close the leader tab and another tab takes over within a second (Web Locks).
