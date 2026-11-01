# GoMaxi — Demo guide (3–5 minutes)

## Before you start
* `npm run dev` (or `npm run preview` after `npm run build`). Open the URL in Chrome.
* Optional: open three tabs side by side — commuter (phone width), driver (phone width), admin (full width).
* The simulated clock starts at 08:55 on the demo day. If you want to begin clean, Admin → Settings →
  *Reset all data to seed*.

## Script

**0. Login page (15 s).** "Four apps, one live system." Point at the clock in the header: it is shared by every
tab, and we can speed it up so a 5-minute pooling timer takes seconds.

**1. GoMaxi Live Demo → Step 1 — The problem (30 s).** Fare bars: solo auto ₹65, bike taxi ₹40, GoMaxi ₹20 for
Baiyappanahalli → Bagmane Tech Park. Two demand peaks a day; a dedicated fleet sits idle in between.

**2. Step 2 — The solution (30 s).** Animated pooling: 10 commuters into one 12-seat vehicle; the five-step
trip lifecycle. The "Groups forming right now" card is live.

**3. Step 3 — The supply model (30 s).** GM-101's day: school run → GoMaxi feeder → anchor route → school run
→ evening feeder. 28.6 % utilisation becomes 89.3 % with zero new vehicles. Stress the eligibility caveat.

**4. Step 4 — Live operations (60–90 s).** Press **START LIVE SIMULATION**, set speed 20× or 60×. Narrate the
activity feed: "09:02 booking received… 11 passengers grouped… occupancy 91 % — dispatch initiated… boarded…
departed… trip completed, driver earned ₹…". Point at the pooling board: threshold dispatch on Whitefield,
timeout dispatch on the smaller ITPL/Bagmane groups, vehicles returning and being reused.

**5. Step 5 — The economics (30 s).** ₹300 → ₹45 / ₹255. Drag occupancy or commission; break-even trips and
occupancy update instantly. Be candid: at 10 vehicles the pilot is contribution-positive but needs scale or B2B
contracts to cover fixed costs — that is what the optimistic scenario shows.

**6. Step 6 — The impact (20 s).** Simulated totals: commuters served, utilisation, savings, private trips
avoided, commission, driver earnings. Then the 12-month plan.

## If a judge asks "is it really connected?"
* Commuter tab: book a ride (Ananya Rao → Bagmane). Show the QR.
* Driver tab: log in as the driver named on the pass, Accept, Scan → type the booking ID → accepted; scan again
  → duplicate blocked. Start trip, End trip.
* Admin tab: Operations overview activity feed shows the trip; Pooling & dispatch shows the decision log;
  Financials → Prototype actuals includes the fare; Driver earnings show the payout.
* Compliance: Drivers & vehicles → GM-109 is blocked (permit pending, driver checks). Mark everything verified
  and watch it become dispatchable; try a booking from Trinity before and after.

## If a judge asks "what is fake?"
Payments, GPS, metro exit counts, office headcounts, the demand model and emergency escalation are simulated
or illustrative, and the UI labels each of them. Pooling, dispatch, QR validation, compliance gates and the
finance arithmetic are real code with tests (`npm test`).

## Keyboard
Demo mode: ← / → to move between steps. Esc closes dialogs.
