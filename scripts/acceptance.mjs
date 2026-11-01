/**
 * GoMaxi acceptance walkthrough (Section 17 of the brief), driven with Playwright against a running server.
 * Usage: BASE=http://127.0.0.1:4173 node scripts/acceptance.mjs
 * Three tabs in one browser context = commuter, driver and admin sharing one live engine.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
// Playwright may be installed globally (e.g. /opt/node-tools) rather than in node_modules.
const req = createRequire(import.meta.url);
const pwPath = ['playwright', '/opt/node-tools/node_modules/playwright', process.env.PLAYWRIGHT_PATH].filter(Boolean).find((p) => { try { req.resolve(p); return true; } catch { return false; } });
if (!pwPath) { console.error('Playwright not found. Install with: npm i -D playwright && npx playwright install chromium'); process.exit(2); }
const { chromium } = req(pwPath);

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = process.env.OUT || 'e2e-output';
fs.mkdirSync(OUT, { recursive: true });
const steps = [];
const ok = (name, cond, detail = '') => { steps.push({ name, pass: !!cond, detail }); console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); if (!cond) process.exitCode = 1; };
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
const state = (page) => page.evaluate(() => window.gomaxi.getState());

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
ctx.setDefaultTimeout(15000);
const errors = [];
const wire = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };

// ---------- 1–6: Commuter ----------
const commuter = await ctx.newPage({ viewport: { width: 414, height: 896 } });
wire(commuter);
await commuter.goto(`${BASE}/`);
await commuter.evaluate(() => localStorage.removeItem('gomaxi.state.v1'));
await commuter.reload();
await commuter.getByText('Commuter app').click();
await commuter.getByText('Ananya Rao').click();
await commuter.waitForURL(/\/commuter/);
await commuter.getByText(/where to today/).waitFor();
ok('1–2. Open GoMaxi and log in as commuter', true);
await shot(commuter, '01-commuter-home');
await commuter.getByRole('button', { name: /^Book/ }).first().click();
await commuter.waitForURL(/\/commuter\/book/);
await commuter.getByText('Bagmane Tech Park').first().click();
ok('3–4. Select metro station (Baiyappanahalli) and destination (Bagmane)', await commuter.getByText(/Baiyappanahalli → Bagmane Tech Park/).isVisible());
await shot(commuter, '02-commuter-ride');
await commuter.getByRole('button', { name: /^Pay ₹.*UPI/ }).click();
await commuter.getByText('Seat confirmed').waitFor();
const qrCount = await commuter.locator('svg[height="200"]').count();
ok('5–6. Book a shared ride and receive a unique QR boarding pass', qrCount >= 1);
await shot(commuter, '03-commuter-qr');
let st = await state(commuter);
const booking = Object.values(st.bookings).find((b) => b.commuterId === 'usr-c01' && ['assigned', 'confirmed'].includes(b.status));
ok('   Booking exists in shared state with a vehicle assigned', !!booking && booking.status === 'assigned', booking ? `${booking.id} → ${booking.vehicleId}` : 'missing');
const trip = Object.values(st.trips).find((t) => t.id === booking.tripId);
await commuter.getByRole('button', { name: /Track my ride/ }).click();
await commuter.waitForURL(/\/commuter\/booking\//);
await shot(commuter, '04-commuter-booking');

// ---------- 7–10: Driver ----------
const driver = await ctx.newPage({ viewport: { width: 414, height: 896 } });
wire(driver);
await driver.goto(`${BASE}/login`);
await driver.getByText('Driver app').click();
await driver.getByText(st.users[trip.driverId].name).click();
await driver.waitForURL(/\/driver/);
ok('7. Log in as the assigned driver', true, st.users[trip.driverId].name);
await driver.goto(`${BASE}/driver/trip`);
await driver.getByText(/New trip assignment|Boarding at the bay/).first().waitFor();
await shot(driver, '05a-driver-assignment');
const acceptBtn = driver.getByRole('button', { name: /Accept/ });
if (await acceptBtn.isVisible().catch(() => false)) await acceptBtn.click();
await driver.getByText(/Boarding at the bay/).waitFor();
await shot(driver, '05-driver-trip');
await driver.goto(`${BASE}/driver/scan`);
await driver.getByPlaceholder(/GMB-/).fill(booking.id);
await driver.getByRole('button', { name: 'Verify' }).click();
await driver.getByText('Boarding accepted').waitFor();
ok('8–9. Scan/validate the QR (manual fallback) and mark passenger boarded', true);
await driver.getByPlaceholder(/GMB-/).fill(booking.id);
await driver.getByRole('button', { name: 'Verify' }).click();
await driver.getByText(/duplicate scan blocked/).waitFor();
ok('   Duplicate scan is rejected', true);
await shot(driver, '06-driver-scan');
st = await state(driver);
ok('   Commuter tab reflects boarded status', st.bookings[booking.id].status === 'boarded');
await commuter.bringToFront();
await commuter.getByText('BOARDED', { exact: true }).waitFor();
await shot(commuter, '07-commuter-boarded');
await driver.goto(`${BASE}/driver/trip`);
await driver.getByRole('button', { name: /Start trip/ }).click();
await driver.getByText(/En route/).first().waitFor();
await shot(driver, '08-driver-enroute');
await commuter.getByText('Live tracking').waitFor();
await shot(commuter, '09-commuter-tracking');
await driver.getByRole('button', { name: /End trip/ }).click();
await driver.getByText(/No active assignment/).waitFor();
st = await state(driver);
ok('10. Start and complete a simulated trip', st.trips[trip.id].status === 'completed' && st.bookings[booking.id].status === 'completed');
await driver.goto(`${BASE}/driver/earnings`);
await shot(driver, '10-driver-earnings');
await commuter.getByText('Trip completed').waitFor();
await commuter.getByLabel('5 stars').click();
await commuter.getByRole('button', { name: /Submit rating/ }).click();
await commuter.getByText(/You rated this trip 5/).waitFor();
ok('    Commuter receives completion and rates the driver', true);
await shot(commuter, '11-commuter-complete');

// ---------- 11–16: Admin ----------
const admin = await ctx.newPage({ viewport: { width: 1440, height: 900 } });
wire(admin);
await admin.goto(`${BASE}/login`);
await admin.getByText('Operations admin').click();
await admin.getByText('Operations Control (Admin)').click();
await admin.waitForURL(/\/admin/);
await admin.getByText('Operations overview').first().waitFor();
await shot(admin, '12-admin-overview');
const feed = await admin.getByText(new RegExp(`Trip ${trip.id} completed`)).count();
ok('11–12. Admin dashboard shows the booking and trip', feed > 0, `activity feed mentions ${trip.id}`);
await admin.goto(`${BASE}/admin/dispatch`);
await admin.getByText('Dispatch decision log').waitFor();
ok('    Dispatch log records the trip', (await admin.getByText(trip.id).count()) > 0);
await shot(admin, '13-admin-dispatch');
await admin.goto(`${BASE}/admin/utilisation`);
await admin.getByText(/Utilisation with GoMaxi/).waitFor();
ok('13. View vehicle utilisation', true);
await shot(admin, '14-admin-utilisation');
await admin.goto(`${BASE}/admin/hotspots`);
await admin.getByText(/Score breakdown/).waitFor();
ok('14. View hotspot demand', true);
await shot(admin, '15-admin-hotspots');
await admin.goto(`${BASE}/admin/finance`);
const before = await admin.locator('text=Commission per trip').locator('..').locator('..').innerText();
const slider = admin.getByLabel('Platform commission');
await slider.focus();
for (let k = 0; k < 5; k++) await admin.keyboard.press('ArrowRight');
await admin.waitForTimeout(400);
const after = await admin.locator('text=Commission per trip').locator('..').locator('..').innerText();
ok('15–16. Change business assumptions and see financials update', before !== after, `${before.split('\n')[1]} → ${after.split('\n')[1]}`);
await shot(admin, '16-admin-finance');
await admin.goto(`${BASE}/admin/fleet`);
await admin.waitForTimeout(800);
await shot(admin, '17-admin-fleet');
await admin.goto(`${BASE}/admin/compliance`);
await shot(admin, '18-admin-compliance');
await admin.goto(`${BASE}/admin/safety`);
await shot(admin, '19-admin-safety');

// ---------- 17: Simulation ----------
await admin.goto(`${BASE}/admin/simulation`);
await admin.getByRole('button', { name: /START LIVE SIMULATION/ }).click();
await admin.getByText(/Running/).first().waitFor();
await admin.evaluate(() => window.gomaxi.dispatch({ type: 'clock.setSpeed', speed: 60 }));
await admin.waitForTimeout(6000);
await shot(admin, '20-admin-simulation-running');
await admin.waitForFunction(() => window.gomaxi.getState().simulation.status === 'finished', null, { timeout: 120000 });
st = await state(admin);
ok('17. Run a complete peak-hour simulation', st.simulation.stats.bookings >= 30 && st.simulation.stats.completed >= 24, JSON.stringify(st.simulation.stats));
await shot(admin, '21-admin-simulation-finished');
await admin.evaluate(() => window.gomaxi.dispatch({ type: 'clock.setSpeed', speed: 1 }));

// ---------- 18: Demo mode ----------
await admin.goto(`${BASE}/demo`);
for (let i = 0; i < 6; i++) { await admin.waitForTimeout(500); await shot(admin, `22-demo-step-${i + 1}`); if (i < 5) await admin.getByRole('button', { name: /Next/ }).click(); }
ok('18. Judge demo mode walks through six steps', true);

// Metro authority view
await admin.goto(`${BASE}/login`);
await admin.evaluate(() => sessionStorage.clear());
await admin.reload();
await admin.getByText('Metro authority').click();
await admin.getByText('Metro Authority Analyst').click();
await admin.waitForURL(/\/metro/);
await admin.goto(`${BASE}/metro/stations`);
await admin.waitForTimeout(800);
await shot(admin, '23-metro-stations');
ok('    Metro authority view loads station analytics', await admin.getByText(/Metro station analytics/).isVisible());

const realErrors = errors.filter((e) => !/tile\.openstreetmap|net::ERR|Failed to load resource|favicon/.test(e));
ok('No runtime errors in any tab', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
fs.writeFileSync(`${OUT}/acceptance-report.json`, JSON.stringify({ at: new Date().toISOString(), steps, errors: realErrors }, null, 2));
console.log(`\n${steps.filter((s) => s.pass).length}/${steps.length} checks passed`);
await browser.close();
