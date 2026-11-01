/** Secondary flows not covered by acceptance.mjs: registration, wallet/failed payments, cancellation + refund,
 *  SOS → admin safety desk, live trip sharing, offline scan queue sync, anchor-route booking. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const pwPath = ['playwright', '/opt/node-tools/node_modules/playwright'].find((p) => { try { req.resolve(p); return true; } catch { return false; } });
const { chromium } = req(pwPath);
const BASE = process.env.BASE || 'http://127.0.0.1:4173'; const OUT = process.env.OUT || 'e2e-output';
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, total = 0;
const ok = (n, c, d = '') => { total++; if (c) pass++; console.log(`${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); if (!c) process.exitCode = 1; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
ctx.setDefaultTimeout(15000);
const errors = []; const wire = (p) => p.on('pageerror', (e) => errors.push(e.message));
const st = (p) => p.evaluate(() => window.gomaxi.getState());

// Registration + wallet payment + failure toggle
const c = await ctx.newPage(); wire(c);
await c.goto(`${BASE}/`); await c.evaluate(() => localStorage.removeItem('gomaxi.state.v1')); await c.reload();
await c.getByText('Commuter app').click(); await c.getByRole('button', { name: 'Register' }).click();
await c.getByPlaceholder(/Asha Kumar/).fill('Test Rider'); await c.getByPlaceholder(/98450 12345/).fill('9876543210');
await c.getByRole('button', { name: /Create account/ }).click(); await c.waitForURL(/\/commuter/);
await c.getByText(/Test, where to today/).waitFor();
ok('Registration creates a commuter and logs in', true);
await c.goto(`${BASE}/commuter/book?station=st-byp&hotspot=hs-whf`);
await c.getByRole('button', { name: /Choose card, wallet/ }).click();
await c.getByRole('switch').click(); // simulate failure
await c.getByRole('button', { name: /^Pay ₹/ }).click();
await c.getByText('Payment failed').waitFor();
ok('Simulated gateway failure shows the failure path', true);
await c.getByRole('switch').click(); // off
await c.getByText(/Wallet/).click();
await c.getByRole('button', { name: /^Pay ₹/ }).click();
await c.getByText('Seat confirmed').waitFor();
let s = await st(c);
const me = Object.values(s.users).find((u) => u.name === 'Test Rider');
let b = Object.values(s.bookings).find((x) => x.commuterId === me.id && x.status === 'assigned');
ok('Wallet payment succeeds and debits the wallet', !!b && s.commuters[me.id].walletBalance === 200 - b.fare, `balance ${s.commuters[me.id].walletBalance}`);
ok('Failed payment recorded in history', Object.values(s.payments).some((p) => p.commuterId === me.id && p.status === 'failed'));

// Cancel + refund
await c.goto(`${BASE}/commuter/booking/${b.id}`);
await c.getByRole('button', { name: /Cancel booking/ }).click();
await c.getByRole('dialog').getByRole('button', { name: 'Cancel booking' }).click();
await c.getByText('Booking cancelled').first().waitFor();
s = await st(c);
ok('Cancellation refunds the wallet in full and releases the vehicle', s.bookings[b.id].status === 'cancelled' && s.commuters[me.id].walletBalance === 200 && s.vehicles[b.vehicleId].status === 'idle');

// New booking → SOS + share
await c.goto(`${BASE}/commuter/book?station=st-byp&hotspot=hs-bag`);
await c.getByRole('button', { name: /^Pay ₹.*UPI/ }).click();
await c.getByText('Seat confirmed').waitFor();
await c.getByRole('button', { name: /Track my ride/ }).click();
await c.getByRole('button', { name: 'SOS' }).click();
await c.getByRole('dialog').getByRole('button', { name: /Send SOS/ }).click();
s = await st(c);
const alert = Object.values(s.alerts).find((a) => a.type === 'sos' && a.raisedByUserId === me.id);
ok('SOS creates a critical alert with simulated escalation steps', !!alert && alert.severity === 'critical' && alert.escalation.length >= 4);
await c.getByRole('button', { name: /Share/ }).click();
await c.waitForTimeout(500);
s = await st(c);
b = Object.values(s.bookings).find((x) => x.commuterId === me.id && x.status === 'assigned');
const token = s.trips[b.tripId].shareToken;
ok('Share generates a live-trip token', !!token);
const share = await ctx.newPage(); wire(share);
await share.goto(`${BASE}/share/${token}`);
await share.getByText('Live trip').waitFor();
ok('Public share page renders the trip without login', await share.getByText(new RegExp(b.vehicleId)).first().isVisible());

// Admin: alert visible and resolvable
const a = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// NOTE: a separate context doesn't share the engine; use the same context instead
const adminPage = await ctx.newPage(); wire(adminPage); await adminPage.setViewportSize({ width: 1440, height: 900 });
await adminPage.goto(`${BASE}/login`); await adminPage.evaluate(() => sessionStorage.clear()); await adminPage.reload();
await adminPage.getByText('Operations admin').click(); await adminPage.getByText('Operations Control (Admin)').click();
await adminPage.goto(`${BASE}/admin/safety`);
await adminPage.getByText('SOS', { exact: true }).first().waitFor();
await adminPage.getByRole('button', { name: 'Resolve' }).first().click();
await adminPage.getByPlaceholder('What was done?').fill('Spoke to passenger; false alarm');
await adminPage.getByRole('button', { name: /Mark resolved/ }).click();
await adminPage.waitForTimeout(400);
s = await st(adminPage);
ok('Admin resolves the SOS from the safety desk', s.alerts[alert.id].status === 'resolved');
await adminPage.screenshot({ path: `${OUT}/x-safety-resolved.png` });

// Driver offline queue sync
const trip = s.trips[b.tripId];
const d = await ctx.newPage(); wire(d);
await d.goto(`${BASE}/login`); await d.evaluate(() => sessionStorage.clear()); await d.reload();
await d.getByText('Driver app').click(); await d.getByText(s.users[trip.driverId].name).click();
await d.goto(`${BASE}/driver/trip`);
await d.getByText(/New trip assignment|Boarding at the bay/).first().waitFor();
const acc = d.getByRole('button', { name: /Accept/ }); if (await acc.isVisible().catch(() => false)) await acc.click();
await d.getByText(/Boarding at the bay/).waitFor();
await d.goto(`${BASE}/driver/scan`);
await d.getByText('Online').click(); // go offline
await d.getByPlaceholder(/GMB-/).fill(b.id); await d.getByRole('button', { name: 'Verify' }).click();
await d.getByText(/Queued offline/).waitFor();
s = await st(d);
ok('Offline mode queues the scan locally without boarding', s.bookings[b.id].status === 'assigned');
await d.getByRole('button', { name: /Reconnect & sync/ }).click();
await d.waitForTimeout(600);
s = await st(d);
ok('Reconnecting syncs the queue and boards the passenger once', s.bookings[b.id].status === 'boarded' && Object.values(s.boardingRecords).filter((r) => r.bookingId === b.id && r.result === 'accepted').length === 1);
await d.screenshot({ path: `${OUT}/x-driver-offline-sync.png` });
await d.goto(`${BASE}/driver/trip`); await d.getByRole('button', { name: /Start trip/ }).click(); await d.getByRole('button', { name: /End trip/ }).click(); await d.getByText(/No active assignment/).waitFor();

// Anchor route booking: jump the clock to 10:50 so the 11:00 Whitefield Connector departure exists
await adminPage.evaluate(() => window.gomaxi.dispatch({ type: 'clock.jump', minutes: 115 }));
await adminPage.waitForTimeout(800);
s = await st(adminPage);
const dep = Object.values(s.trips).find((t) => t.kind === 'anchor' && t.routeId === 'rt-whf-itpl' && ['assigned', 'boarding'].includes(t.status));
ok('Anchor route departure is generated 15 min before its slot', !!dep, dep ? `${dep.id} ${dep.vehicleId}` : 'none');
if (dep) {
  await c.goto(`${BASE}/commuter`);
  await c.getByText(/Whitefield Connector/).waitFor();
  await c.getByText(/Whitefield Connector/).click();
  await c.getByText('Scheduled departure').waitFor();
  await c.getByRole('button', { name: /^Pay ₹.*UPI/ }).click();
  await c.getByText('Seat confirmed').waitFor();
  s = await st(c);
  const ab = Object.values(s.bookings).find((x) => x.commuterId === me.id && x.anchorDepartureId === dep.id);
  ok('Commuter books a seat on the scheduled anchor departure', !!ab && s.trips[dep.id].bookingIds.includes(ab.id) && ab.fare === 35);
  await c.screenshot({ path: `${OUT}/x-anchor-booked.png` });
}
// Driver rejection → reassignment; dispatch settings change applies
await adminPage.goto(`${BASE}/admin/settings`);
await adminPage.getByLabel('Maximum waiting time').focus(); await adminPage.keyboard.press('ArrowLeft'); await adminPage.waitForTimeout(300);
s = await st(adminPage);
ok('Dispatch settings change applies instantly', s.settings.dispatch.maxWaitMin === 4, `maxWait=${s.settings.dispatch.maxWaitMin}`);

const real = errors.filter((e) => !/tile\.openstreetmap|net::ERR|Failed to load resource/.test(e));
ok('No runtime errors', real.length === 0, real.slice(0, 2).join(' | '));
console.log(`\n${pass}/${total} secondary checks passed`);
await a.close(); await browser.close();
