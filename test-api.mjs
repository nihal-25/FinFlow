const BASE = 'https://api-gateway-production-75e4.up.railway.app';

// Register fresh user
const email = `test${Date.now()}@example.com`;
const regRes = await fetch(`${BASE}/auth/register`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email, password: 'TestPass123', firstName: 'Test', lastName: 'User', tenantName: 'TestOrg' + Date.now()})
});
const reg = await regRes.json();
console.log('Register:', reg.success ? 'OK' : JSON.stringify(reg));

// Login
const loginRes = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email, password: 'TestPass123'})
});
const login = await loginRes.json();
const tok = login.data?.accessToken;
console.log('Login:', tok ? 'OK' : 'FAILED: ' + JSON.stringify(login));
if (!tok) process.exit(1);

// GET /accounts
const getRes = await fetch(`${BASE}/accounts`, {
  headers: {'Authorization': 'Bearer ' + tok}
});
console.log('GET /accounts:', getRes.status, JSON.stringify(await getRes.json()));

// POST /accounts
const postRes = await fetch(`${BASE}/accounts`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok},
  body: JSON.stringify({name: 'My Wallet', currency: 'USD', type: 'wallet'})
});
const acct = await postRes.json();
console.log('POST /accounts:', postRes.status, JSON.stringify(acct));

if (acct.data?.id) {
  // Deposit
  const depRes = await fetch(`${BASE}/accounts/${acct.data.id}/deposit`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok},
    body: JSON.stringify({amount: '500.00', description: 'Initial deposit'})
  });
  console.log('POST deposit:', depRes.status, JSON.stringify(await depRes.json()));
}
