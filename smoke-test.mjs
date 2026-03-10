const BASE = 'https://api-gateway-production-75e4.up.railway.app';

// Test 1: Wrong password → should show clear error
const badLogin = await (await fetch(`${BASE}/auth/login`, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: 'nobody@test.com', password: 'wrongpass'})
})).json();
console.log('1. Wrong password error:', badLogin.error?.message); // should say "Invalid credentials"

// Test 2: Register + login + analytics summary
const email = `smoke${Date.now()}@test.com`;
await fetch(`${BASE}/auth/register`, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email, password: 'TestPass123', firstName: 'Smoke', lastName: 'Test', tenantName: 'SmokeTest' + Date.now()})
});
const login = await (await fetch(`${BASE}/auth/login`, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email, password: 'TestPass123'})
})).json();
const tok = login.data?.accessToken;
console.log('2. Login:', tok ? 'OK' : 'FAILED');

// Test 3: Analytics summary (should return 0s, not error)
const summary = await (await fetch(`https://analytics-service-production-7454.up.railway.app/analytics/summary`, {
  headers: {'Authorization': 'Bearer ' + tok}
})).json();
console.log('3. Analytics summary:', summary.success ? `OK (volume=${summary.data.totalVolume}, count=${summary.data.transactionCount})` : JSON.stringify(summary));

// Test 4: Demo seed → then analytics should show data
const seed = await (await fetch(`${BASE}/demo/seed`, {
  method: 'POST', headers: {'Authorization': 'Bearer ' + tok}
})).json();
console.log('4. Demo seed:', seed.success ? 'OK' : JSON.stringify(seed));

// Test 5: Analytics after seed
await new Promise(r => setTimeout(r, 1000));
const summary2 = await (await fetch(`https://analytics-service-production-7454.up.railway.app/analytics/summary`, {
  headers: {'Authorization': 'Bearer ' + tok}
})).json();
console.log('5. Analytics after seed:', summary2.success ? `volume=$${parseFloat(summary2.data.totalVolume).toLocaleString()}, txCount=${summary2.data.transactionCount}` : JSON.stringify(summary2));

// Test 6: Fraud alert from $15k transaction in demo seed
const fraudAlerts = await (await fetch(`${BASE}/fraud-alerts`, {
  headers: {'Authorization': 'Bearer ' + tok}
})).json();
console.log('6. Fraud alerts after seed:', fraudAlerts.data?.length, 'alerts');
if (fraudAlerts.data?.length > 0) {
  console.log('   Rules triggered:', fraudAlerts.data[0].rules_triggered || fraudAlerts.data[0].rulesTriggered);
}

// Test 7: Volume chart data
const volume = await (await fetch(`https://analytics-service-production-7454.up.railway.app/analytics/volume?period=7d`, {
  headers: {'Authorization': 'Bearer ' + tok}
})).json();
console.log('7. Volume chart data points:', volume.data?.length, volume.data?.length > 0 ? `first=${JSON.stringify(volume.data[0])}` : '(empty)');
