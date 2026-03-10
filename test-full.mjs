const BASE = 'https://api-gateway-production-75e4.up.railway.app';

// Register
const email = `test${Date.now()}@example.com`;
const reg = await (await fetch(`${BASE}/auth/register`, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email, password: 'TestPass123', firstName: 'Alice', lastName: 'Smith', tenantName: 'Acme' + Date.now()})
})).json();
console.log('Register:', reg.success ? 'OK' : JSON.stringify(reg));

// Login
const login = await (await fetch(`${BASE}/auth/login`, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email, password: 'TestPass123'})
})).json();
const tok = login.data?.accessToken;
console.log('Login:', tok ? 'OK' : 'FAILED');
if (!tok) process.exit(1);

const H = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok};

// Create 2 accounts
const a1 = await (await fetch(`${BASE}/accounts`, { method: 'POST', headers: H, body: JSON.stringify({name: 'Alice Wallet', currency: 'USD', type: 'wallet'}) })).json();
const a2 = await (await fetch(`${BASE}/accounts`, { method: 'POST', headers: H, body: JSON.stringify({name: 'Bob Wallet', currency: 'USD', type: 'wallet'}) })).json();
console.log('Account 1:', a1.data?.id ? 'OK id=' + a1.data.id.slice(0,8) : JSON.stringify(a1));
console.log('Account 2:', a2.data?.id ? 'OK id=' + a2.data.id.slice(0,8) : JSON.stringify(a2));

const aid1 = a1.data?.id, aid2 = a2.data?.id;
if (!aid1 || !aid2) process.exit(1);

// Deposit $1000 to account 1
const dep = await (await fetch(`${BASE}/accounts/${aid1}/deposit`, { method: 'POST', headers: H, body: JSON.stringify({amount: '1000.00', description: 'Initial funding'}) })).json();
console.log('Deposit $1000:', dep.data?.newBalance ? 'OK balance=' + dep.data.newBalance : JSON.stringify(dep));

// Transfer $250 from account 1 to account 2
const tx = await (await fetch(`${BASE}/transactions`, { method: 'POST', headers: H, body: JSON.stringify({
  sourceAccountId: aid1, destinationAccountId: aid2,
  amount: '250.00', currency: 'USD',
  idempotencyKey: 'test-tx-' + Date.now(), description: 'Test transfer'
}) })).json();
console.log('Transfer $250:', tx.data?.transaction?.id ? 'OK id=' + tx.data.transaction.id.slice(0,8) + ' status=' + tx.data.transaction.status : JSON.stringify(tx));

// List accounts with balances
const accounts = await (await fetch(`${BASE}/accounts`, { headers: H })).json();
console.log('Accounts after transfer:');
for (const a of accounts.data || []) {
  if (a.id === aid1 || a.id === aid2) console.log(' ', a.name, '→ balance', a.balance);
}

// List transactions
const txList = await (await fetch(`${BASE}/transactions`, { headers: H })).json();
console.log('Transactions:', txList.data?.items?.length ?? JSON.stringify(txList), 'items');

// Demo seed
const demo = await (await fetch(`${BASE}/demo/seed`, { method: 'POST', headers: H })).json();
console.log('Demo seed:', demo.success ? 'OK' : JSON.stringify(demo));

// Fraud alerts
const alerts = await (await fetch(`${BASE}/fraud-alerts`, { headers: H })).json();
console.log('Fraud alerts:', alerts.data?.length ?? JSON.stringify(alerts));
