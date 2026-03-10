# FinFlow — Production Financial Transaction Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Deployed on Railway](https://img.shields.io/badge/Backend-Railway-0B0D0E?logo=railway&logoColor=white)](https://railway.app/)
[![Deployed on Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com/)

> A production-grade, event-driven fintech platform demonstrating senior-level distributed systems architecture. Five microservices, PostgreSQL double-entry ledger, Redis distributed locking, real-time fraud detection, Kafka event streaming, and a live React dashboard — all running in production.

---

## Live Demo

| Service | URL |
|---|---|
| **Dashboard** | **https://frontend-phi-six-93.vercel.app** |
| API Gateway | https://api-gateway-production-75e4.up.railway.app |
| Analytics / WebSocket | https://analytics-service-production-7454.up.railway.app |

**Quick start — use the pre-seeded account or register your own:**

| Field | Value |
|---|---|
| Email | `demo@finflow.dev` |
| Password | `Demo1234!` |

Log in with these credentials (demo data already loaded) — or register a new account and click **Load Demo Data** in the sidebar to instantly create wallets and transactions that trigger all 4 fraud detection rules.

---

## What This Demonstrates

This project is purpose-built to show how a real fintech backend is architected — not a tutorial CRUD app. Every design decision mirrors what you'd find at Stripe, Monzo, or Wise:

| Problem | Solution |
|---|---|
| Balance corruption under concurrency | Double-entry ledger with DB-enforced immutability — no mutable balance column |
| Duplicate charges on network retry | Idempotency keys — retries return original response without re-executing |
| Race conditions across service instances | Redis `SETNX` distributed locks acquired before every DB transaction |
| Fraud detection without service coupling | Kafka event stream — fraud-service consumes independently |
| XSS-safe token storage | JWT in Zustand memory; refresh token in httpOnly cookie |
| Session survival across page refresh | Silent `/auth/refresh` on mount via `AuthInitializer` |
| External deposits preserving double-entry | Reserve accounts — deposits debit a system reserve, never create money from nothing |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         React Dashboard                             │
│         React 18 · Vite · Tailwind · React Query · Socket.io       │
│   Auth · Accounts · Send Money · Transactions · Fraud · Settings   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS + WebSocket
┌──────────────────────────────▼──────────────────────────────────────┐
│                      API Gateway  :3001                             │
│   JWT auth · httpOnly refresh cookies · API key auth (SHA-256)     │
│   RBAC · Rate limiting (Redis sliding window) · Correlation IDs    │
│   Reverse proxy → Transaction Service · Analytics Service          │
└───────────────┬──────────────────────────────────┬──────────────────┘
                │                                  │
  ┌─────────────▼──────────────┐     ┌─────────────▼──────────────┐
  │   Transaction Service :3002│     │   Analytics Service :3005  │
  │                            │     │                            │
  │  Double-entry ledger       │     │  Redis stat aggregates     │
  │  Idempotency table         │     │  PostgreSQL time-series    │
  │  Distributed Redis locks   │     │  Socket.io real-time push  │
  │  Reserve account deposits  │     │                            │
  └──────────────┬─────────────┘     └──────────────┬─────────────┘
                 │ Kafka produce                     │ Kafka consume
                 │                                   │
┌────────────────▼───────────────────────────────────▼───────────────┐
│                          Apache Kafka                              │
│  transactions.created · transactions.completed · transactions.failed│
│  fraud.alerts · notifications.email · notifications.webhook        │
└───────────────┬──────────────────────────────┬─────────────────────┘
                │ consume                      │ consume
  ┌─────────────▼──────────────┐  ┌────────────▼───────────────┐
  │      Fraud Service         │  │   Notification Service     │
  │                            │  │                            │
  │  Velocity (Redis INCR)     │  │  Webhook delivery          │
  │  Amount anomaly (PG agg)   │  │  HMAC-SHA256 signatures    │
  │  Large transaction         │  │  Retry with backoff        │
  │  Round-tripping (PG query) │  │                            │
  └────────────────────────────┘  └────────────────────────────┘

              PostgreSQL 15                    Redis 7
              ─────────────                    ───────
              10 SQL migrations                Distributed locks
              Immutable ledger (RULE)          Rate limit counters
              Idempotency keys                 Token blacklist
              Fraud alerts + audit log         Analytics cache
                                               Velocity counters
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Language | TypeScript 5.9 — `strict` + `exactOptionalPropertyTypes` | Compile-time safety across all services and shared packages |
| Runtime | Node.js 20 | LTS, V8 async I/O |
| Framework | Express 4 | Minimal overhead, full control, no magic abstractions |
| Database | PostgreSQL 15 | ACID is non-negotiable for financial ledgers |
| Cache / Locks | Redis 7 | Sub-millisecond `SETNX` locks, atomic `INCR` for rate limiting |
| Message Bus | Apache Kafka | Durable replayable log — events survive consumer downtime |
| Auth | JWT (15 min) + httpOnly refresh cookie (7 d) | XSS-safe in-memory storage with transparent session restoration |
| API Keys | SHA-256 hash, `ff_live_` prefix | Machine credentials, raw key shown exactly once |
| Real-time | Socket.io | WebSocket with JWT auth at connect time |
| Frontend | React 18, Vite, Tailwind CSS, React Query v5, Zustand | Fast HMR, declarative server state, zero-boilerplate state |
| Validation | Zod | Schema-first, full TypeScript inference |
| Monorepo | npm workspaces | Native tooling, zero added configuration |

---

## Repository Structure

```
finflow/
├── apps/
│   ├── api-gateway/           # JWT auth, RBAC, rate limiting, reverse proxy
│   ├── transaction-service/   # Accounts, ledger, idempotency, webhooks, demo seed
│   ├── fraud-service/         # Kafka consumer → 4-rule fraud engine
│   ├── notification-service/  # Kafka consumer → webhook delivery with HMAC signing
│   └── analytics-service/     # Redis aggregates + Socket.io real-time push
├── packages/
│   ├── types/                 # Shared interfaces: Transaction, Account, FraudAlert, KafkaEvent…
│   ├── database/              # pg pool, query helpers, migration runner, 10 SQL migrations
│   ├── redis/                 # ioredis client, SETNX locks, sliding-window rate limiter
│   └── kafka/                 # KafkaJS producer/consumer factory with SASL support
├── frontend/                  # React dashboard — 7 pages
│   └── src/
│       ├── pages/             # Login, Register, Dashboard, Accounts, Send, Transactions, Fraud, Settings
│       ├── stores/            # Zustand auth store (in-memory JWT — XSS-safe)
│       ├── hooks/             # useWebSocket — Socket.io connection + live event handlers
│       └── lib/               # Axios with JWT attach + 401 auto-refresh interceptor
├── docker-compose.yml         # PostgreSQL, Redis, Kafka, Zookeeper, Kafka UI
└── tsconfig.base.json         # Shared TS config extended by all 9 projects
```

---

## What To Test (and What's Happening Under the Hood)

### 1 — Register a new tenant

**Dashboard:** https://frontend-phi-six-93.vercel.app/register

Fill in company name, name, email, and password.

**What happens:**
- API Gateway validates the request against a Zod schema
- A `tenants` row is created — every downstream record is scoped by `tenant_id` (full multi-tenancy)
- A `users` row is created with `role = admin` and a bcrypt-hashed password
- JWT access token (15-min TTL) is issued and stored in Zustand memory — never `localStorage`
- Refresh token (7-day TTL) is set as an httpOnly cookie — JavaScript cannot read it

```bash
curl -s -X POST https://api-gateway-production-75e4.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Acme Corp",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@acme.com",
    "password": "SecurePass123"
  }' | jq .
```

---

### 2 — Load demo data (one click)

**Dashboard:** click **Load Demo Data** in the sidebar.

**What happens:**
- Creates **Main Wallet** ($100k), **Savings Wallet** ($50k), and **Bounce Wallet** ($5k)
- Each deposit debits a system-managed **External Funding reserve account** — double-entry is preserved, money is not conjured from nothing
- 18 transactions run in sequence, deliberately triggering all 4 fraud rules:
  - **`amount_anomaly`** — 5 history txs at $50 → then $350 (7× the average)
  - **`large_transaction`** — single $20,000 transfer (threshold: $10,000)
  - **`round_trip`** — $5,000 main→savings, then savings→main within seconds
  - **`velocity`** — 11 rapid txs from the same account within 5 minutes
- Fraud alerts appear on the **Fraud Alerts** page and the dashboard stat card updates

```bash
# Replace with your actual token from login
TOKEN=<access_token>

curl -s -X POST https://api-gateway-production-75e4.up.railway.app/demo/seed \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

### 3 — Create accounts and deposit

**Dashboard:** Accounts → New Account → fill name + currency → Create. Then click **Deposit** on the wallet card.

**What happens on deposit:**
- System finds or creates a per-currency `External Funding` reserve account for your tenant
- `transaction` row inserted with `status = completed`
- Two `ledger_entries` rows inserted atomically in one DB transaction:
  - `debit` on the reserve account (goes negative — represents total external funding injected)
  - `credit` on your wallet (balance increases)
- Balance = `SUM(credits) − SUM(debits)` computed at query time — no mutable balance column exists
- `ledger_entries` has a PostgreSQL `RULE` making `UPDATE` and `DELETE` no-ops — entries are immutable at the database level

```bash
# Create wallet
ACCOUNT_ID=$(curl -s -X POST https://api-gateway-production-75e4.up.railway.app/accounts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Main Wallet","type":"wallet","currency":"USD"}' \
  | jq -r '.data.id')

# Deposit $5,000
curl -s -X POST https://api-gateway-production-75e4.up.railway.app/accounts/$ACCOUNT_ID/deposit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":"5000.00","description":"Initial funding"}' | jq .
```

---

### 4 — Transfer money between accounts

**Dashboard:** Send Money → select source account, enter destination ID, amount, description → Send.

**What happens (in order):**
1. API Gateway proxies the request to Transaction Service, preserving the full path
2. **Idempotency check** — if this key was used before, the original response is returned immediately; no second debit
3. **Redis `SETNX` lock** acquired on both account IDs (sorted alphabetically to prevent deadlock), 30s TTL
4. PostgreSQL transaction begins; `SELECT FOR UPDATE` acquires row-level locks on both accounts
5. Source balance computed from ledger: `SUM(credits) − SUM(debits)`
6. Insufficient funds → `failed` transaction recorded, error returned, locks released
7. Sufficient funds → `completed` transaction inserted, two ledger entries created atomically
8. Locks released
9. Kafka events published (fire-and-forget — DB is source of truth, Kafka is best-effort)
10. Response returned

```bash
ACCOUNT_A=<source_id>
ACCOUNT_B=<destination_id>

curl -s -X POST https://api-gateway-production-75e4.up.railway.app/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sourceAccountId\": \"$ACCOUNT_A\",
    \"destinationAccountId\": \"$ACCOUNT_B\",
    \"amount\": \"250.00\",
    \"currency\": \"USD\",
    \"idempotencyKey\": \"tx-$(date +%s%N)\",
    \"description\": \"Test transfer\"
  }" | jq .
```

**Test idempotency:** run the same curl twice with the same `idempotencyKey`. The second call returns the original transaction with `"isIdempotentReplay": true` — no second debit occurs. This is how Stripe prevents double charges.

---

### 5 — Inspect the double-entry ledger

**Dashboard:** Transactions → click any row → **View Ledger**.

The modal shows both entries: which account was debited, which credited, balance before and after for each side. This is the exact audit trail that financial regulators require.

```bash
TX_ID=<transaction_id>

curl -s https://api-gateway-production-75e4.up.railway.app/transactions/$TX_ID \
  -H "Authorization: Bearer $TOKEN" | jq '.data.ledgerEntries'
```

Expected response:
```json
[
  { "accountId": "...", "type": "debit",  "amount": "250.00", "balanceBefore": "1000.00", "balanceAfter": "750.00" },
  { "accountId": "...", "type": "credit", "amount": "250.00", "balanceBefore": "0.00",    "balanceAfter": "250.00" }
]
```

---

### 6 — Trigger fraud detection

**Dashboard:** Load Demo Data already fires the $15,000 rule. Check **Fraud Alerts** in the sidebar.

**Rule 1 — Large transaction (> $10,000):**
```bash
curl -s -X POST https://api-gateway-production-75e4.up.railway.app/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sourceAccountId\": \"$ACCOUNT_A\",
    \"destinationAccountId\": \"$ACCOUNT_B\",
    \"amount\": \"15000.00\",
    \"currency\": \"USD\",
    \"idempotencyKey\": \"large-$(date +%s%N)\"
  }" | jq .
```
**What happens:** fraud-service Kafka consumer receives `transaction.completed`. `largeTransactionCheck("15000")` returns `true`. `fraud_alerts` row inserted. Dashboard badge increments.

**Rule 2 — Velocity (> 10 transactions in 5 minutes):**
```bash
for i in $(seq 1 12); do
  curl -s -X POST https://api-gateway-production-75e4.up.railway.app/transactions \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"sourceAccountId\": \"$ACCOUNT_A\",
      \"destinationAccountId\": \"$ACCOUNT_B\",
      \"amount\": \"1.00\",
      \"currency\": \"USD\",
      \"idempotencyKey\": \"vel-$i-$(date +%s%N)\"
    }" &
done; wait
```
**What happens:** each transaction runs Redis `INCR fraud:velocity:<accountId>` with a 5-minute `EXPIRE`. When count exceeds 10, fraud-service raises an alert.

**Rule 3 — Round-tripping (same amount back within 60 seconds):**

Send $500 from A→B, then immediately send $500 from B→A.

**What happens:** PostgreSQL query checks for a transaction in the reverse direction with the same amount within the configured time window. If found, a round-trip alert is raised.

**Rule 4 — Amount anomaly (> 5× 30-day average):**

After establishing a transaction history of small amounts, send a single large transaction relative to your average.

**What happens:** PostgreSQL computes `AVG(amount)` over ledger debits from the past 30 days (minimum 5 data points required). If current amount > 5× average, alert raised.

**Manage alerts on the dashboard:** Fraud Alerts → click **Investigate** (`open` → `investigating`) or **Dismiss** (`open` → `dismissed`).

---

### 7 — Reverse a transaction

**Dashboard:** Transactions → click a completed transaction → **Reverse**.

**What happens:**
- A new transfer is created in the reverse direction (destination → source, same amount, new idempotency key)
- Original transaction marked `status = reversed`, `reversed_at` timestamp set
- Two new ledger entries created — the original entries are untouched (immutable by DB rule)
- Net balance returns to pre-transfer state across both accounts

```bash
curl -s -X POST https://api-gateway-production-75e4.up.railway.app/transactions/$TX_ID/reverse \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"idempotencyKey\": \"rev-$(date +%s%N)\"}" | jq .
```

---

### 8 — API key authentication

**Dashboard:** Settings → API Keys → **Create Key**. Copy the raw key — it is shown exactly once.

**What happens on creation:**
- A `ff_live_<random>` key is generated server-side
- SHA-256 hash is stored in the database — the raw key is never persisted anywhere
- The prefix (`ff_live_xxxx`) is stored for display purposes
- Raw key returned in the response, then gone forever

**Authenticate with the key:**
```bash
API_KEY=ff_live_<your_key>

curl -s https://api-gateway-production-75e4.up.railway.app/accounts \
  -H "X-API-Key: $API_KEY" | jq .
```

**What happens:** API Gateway hashes the incoming key with SHA-256, queries `api_keys` by hash, loads the associated user and tenant. Requests are fully authenticated without the server ever having stored the secret. Same design as GitHub personal access tokens.

---

### 9 — Webhooks

**Dashboard:** Settings → Webhooks → **Add Endpoint**.

Enter a URL (use https://webhook.site to inspect payloads in real time), select event types, save. Click **Test** to fire a test payload immediately.

**What happens on a real transaction:**
- notification-service Kafka consumer receives the `transaction.completed` event
- For each registered webhook matching the event type, an HTTP POST is sent to the endpoint URL
- Payload is signed: `X-Finflow-Signature: sha256=<HMAC-SHA256(secret, body)>`
- Consumers verify the signature to confirm the payload is authentic and untampered
- Failed deliveries retry with exponential backoff

---

### 10 — Real-time dashboard feed

Open the dashboard home page. Run a transfer in another tab (or fire one via curl). The **Recent Transactions** feed updates live without any page refresh or polling.

**What happens:**
- Transaction Service publishes `transaction.completed` to Kafka
- Analytics Service Kafka consumer receives it
- Socket.io broadcasts the event to all clients authenticated for that tenant
- React `useWebSocket` hook receives the event and invalidates the React Query cache
- The feed re-fetches and the new transaction appears

---

## API Reference

All endpoints return a consistent envelope:

```json
{ "success": true,  "data": { ... }, "meta": { "requestId": "uuid" } }
{ "success": false, "error": { "code": "ERR_CODE", "message": "..." } }
```

Authentication: `Authorization: Bearer <jwt>` or `X-API-Key: ff_live_<key>`

### Auth (`/auth/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register` | — | Create tenant + admin user, returns JWT |
| `POST` | `/auth/login` | — | Issue JWT + set httpOnly refresh cookie |
| `POST` | `/auth/refresh` | cookie | Rotate refresh token, issue new JWT |
| `POST` | `/auth/logout` | JWT | Blacklist access token in Redis |
| `GET` | `/auth/me` | JWT/Key | Current user + tenant profile |
| `POST` | `/auth/api-keys` | JWT | Create named API key (raw shown once) |
| `GET` | `/auth/api-keys` | JWT | List keys (prefix only, hash never exposed) |
| `DELETE` | `/auth/api-keys/:id` | JWT | Revoke key immediately |
| `GET` | `/health` | — | Liveness check |

### Accounts (`/accounts/*`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/accounts` | Create account (`wallet` / `escrow` / `reserve`) |
| `GET` | `/accounts` | List all with computed balance |
| `GET` | `/accounts/:id` | Account detail + balance |
| `POST` | `/accounts/:id/deposit` | External deposit via reserve account double-entry |

### Transactions (`/transactions/*`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/transactions` | Transfer (idempotency key required) |
| `GET` | `/transactions` | Paginated list — filter by status, account, date range |
| `GET` | `/transactions/:id` | Detail + full ledger entries with before/after balances |
| `POST` | `/transactions/:id/reverse` | Create reversal transaction |

### Fraud Alerts (`/fraud-alerts/*`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/fraud-alerts` | List alerts for tenant, newest first |
| `PATCH` | `/fraud-alerts/:id/status` | Transition: `open` → `investigating` → `resolved` / `dismissed` |

### Webhooks (`/webhooks/*`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/webhooks` | List active endpoints |
| `POST` | `/webhooks` | Register endpoint URL + event subscriptions |
| `DELETE` | `/webhooks/:id` | Disable endpoint (soft delete) |
| `POST` | `/webhooks/:id/test` | Fire test payload, return HTTP status + response body |

### Analytics (`/analytics/*`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/analytics/summary` | Totals: volume, transaction count, fraud rate |
| `GET` | `/analytics/volume?period=7d` | Daily volume time series |
| `GET` | `/analytics/fraud-rate` | 30-day fraud rate percentage |

**WebSocket:** connect to `https://analytics-service-production-7454.up.railway.app` with `{ auth: { token: "<jwt>" } }`.
Events emitted: `transaction:completed`, `transaction:failed` — each carries the full transaction object.

---

## Database Schema

10 migrations applied in order, all idempotent:

| # | Table | Key constraint |
|---|---|---|
| 001 | `tenants` | UUID PK, unique slug |
| 002 | `users` | bcrypt password, RBAC role enum, soft-delete flag |
| 003 | `refresh_tokens` | Rotated on every use, blacklisted on logout |
| 004 | `api_keys` | SHA-256 hash stored, prefix display only, expiry support |
| 005 | `accounts` | `wallet / escrow / reserve` enum, `account_currency` enum |
| 006 | `transactions` | `UNIQUE (idempotency_key, tenant_id)`, `CHECK source != destination` |
| 007 | `ledger_entries` | `RULE ledger_no_update / ledger_no_delete` — DB-enforced immutability |
| 008 | `fraud_alerts` | Rules enum, status lifecycle, linked transaction FK |
| 009 | `webhooks` | Endpoint URL, event subscriptions JSONB, HMAC secret |
| 010 | `audit_logs` | Every mutating request: user, action, resource, IP, correlation ID |

---

## Fraud Detection Rules

Four rules run in parallel in the fraud-service Kafka consumer for every `transaction.completed` event:

| Rule | Threshold | Implementation |
|---|---|---|
| **Velocity** | > 10 transactions / 5 min from one account | Redis `INCR fraud:velocity:<id>` + `EXPIRE 300` — atomic, sub-millisecond |
| **Amount anomaly** | Amount > 5× the account's 30-day average | PostgreSQL `AVG(amount)` over ledger debits, requires ≥ 5 data points |
| **Large transaction** | Single amount > $10,000 | Configurable constant threshold |
| **Round-tripping** | Same amount returned from destination within 60 s | PostgreSQL query for reverse transaction in time window |

Any matching rule inserts a `fraud_alerts` row. Rules are independent — a single transaction can trigger multiple alerts simultaneously.

---

## Architecture Decisions

### Double-entry ledger instead of a balance column

A mutable `balance` column requires careful locking and silently corrupts on any application bug. The ledger approach stores every debit and credit as an immutable row. Balance = `SUM(credits) − SUM(debits)` computed at query time — always correct by construction, impossible to corrupt, and a full audit trail for free. A PostgreSQL `RULE` (`DO INSTEAD NOTHING`) on `UPDATE` and `DELETE` enforces immutability at the database level — not the application level, where it could be bypassed. This is how Stripe, Monzo, and every regulated bank operates.

### Redis locks before PostgreSQL transactions

`SELECT FOR UPDATE` handles database-level consistency but does not prevent two service instances from beginning the same operation concurrently before they reach the database. A Redis `SETNX` lock with TTL is acquired first (account IDs sorted to prevent deadlock), ensuring exactly one execution path proceeds per account pair. TTL guarantees automatic release even if the lock holder crashes — no manual cleanup or lock monitoring needed.

### Idempotency keys

Financial APIs run over unreliable networks. A request can time out and the client retries — without idempotency, the customer is charged twice. Each transaction carries a client-generated UUID stored with `UNIQUE (idempotency_key, tenant_id)`. Duplicate requests return the original response without re-executing the transfer. This is the same mechanism Stripe uses for their Payments API.

### Kafka over direct HTTP between services

With synchronous HTTP: if fraud-service is down during a transaction, the fraud detection event is lost. With Kafka: events queue in a durable, replayable log and are consumed when the service restarts — zero data loss. The transaction-service has zero knowledge of fraud-service or notification-service. New consumers (e.g. a machine learning pipeline) can be added without touching producers. The event log can be replayed to rebuild analytics state from scratch.

### JWT in memory, refresh token in httpOnly cookie

`localStorage` is readable by any JavaScript on the page — a single XSS vulnerability permanently steals the token. Zustand in-memory storage means tokens vanish on page refresh. The httpOnly cookie is invisible to JavaScript entirely. `AuthInitializer` calls `/auth/refresh` on mount to silently restore sessions — users stay logged in across refreshes without a token ever touching browser storage.

### Reserve accounts for external deposits

Rather than a "deposit" that credits a wallet and debits nothing (creating money from nothing, violating double-entry), deposits debit a system-managed "External Funding" reserve account. Reserve accounts are permitted to hold negative balances, representing total external capital injected into the system. Every dollar credited to a wallet is balanced by a debit in the reserve — the entire ledger sums to zero at all times.

### No ORM

ORMs obscure `SELECT FOR UPDATE` semantics, make N+1 queries easy to write accidentally, and add an abstraction layer between your code and the execution plan. In a financial system where every query has correctness and performance requirements, raw parameterized SQL is explicit, reviewable, and maps directly to what the database executes. All 10 migrations are plain `.sql` files — every schema change is readable in git history without a framework's DSL.

---

## Local Development

### Prerequisites

- Docker Desktop
- Node.js ≥ 20
- npm ≥ 10

### Start infrastructure

```bash
docker-compose up -d
docker-compose ps   # wait until all show (healthy)
```

Kafka UI at http://localhost:8080.

### Install and configure

```bash
npm install

for svc in api-gateway transaction-service fraud-service notification-service analytics-service; do
  cp apps/$svc/.env.example apps/$svc/.env
done
```

`.env.example` files are pre-filled for local Docker — no changes needed for basic development.

### Run migrations

```bash
DATABASE_URL=postgresql://finflow:finflow_secret@localhost:5432/finflow npm run db:migrate
```

### Start services

```bash
npm run dev:services          # all backend services in parallel

npm run dev -w frontend       # :5173
```

Or individually:

```bash
npm run dev -w apps/api-gateway          # :3001
npm run dev -w apps/transaction-service  # :3002
npm run dev -w apps/fraud-service        # Kafka consumer
npm run dev -w apps/notification-service # Kafka consumer
npm run dev -w apps/analytics-service    # :3005
```

### Run tests

```bash
docker-compose up -d postgres redis
npm test -w apps/api-gateway
```

Covers: register → login → token validation → silent refresh → logout → Redis blacklist verification → API key create / authenticate / revoke.

---

## Production Deployment

### Backend — Railway

All 5 services deploy automatically on every push to `main`. On each push:

1. Nixpacks builds from the monorepo root
2. Shared packages (`types`, `database`, `redis`, `kafka`) are compiled first
3. Each service compiles and starts via its `start.js` entry point
4. `api-gateway` runs all 10 database migrations with retry logic for DNS propagation

**Required environment variables per service:**

```env
DATABASE_URL          # Injected automatically by Railway PostgreSQL plugin
REDIS_URL             # Injected automatically by Railway Redis plugin
JWT_ACCESS_SECRET     # 32+ random characters
REFRESH_TOKEN_SECRET  # 32+ random characters
CORS_ORIGIN           # Vercel frontend URL
TRANSACTION_SERVICE_URL  # Railway internal hostname (api-gateway only)
ANALYTICS_SERVICE_URL    # Railway internal hostname (api-gateway only)
```

### Frontend — Vercel

Deployed from the `frontend/` directory. `vercel.json` includes the SPA rewrite rule so React Router handles all client-side navigation.

```env
VITE_API_URL=https://api-gateway-production-75e4.up.railway.app
VITE_WS_URL=https://analytics-service-production-7454.up.railway.app
```

---

## Engineering Highlights

- **5-service TypeScript monorepo** — shared package layer (`types`, `database`, `redis`, `kafka`), strict compilation across all 9 TS projects, enforced build dependency order
- **PostgreSQL double-entry ledger** — immutable append-only design enforced by a database `RULE`, eliminating balance-corruption bugs by construction with a free audit trail
- **Distributed transaction safety** — Redis `SETNX` locks with TTL ahead of `SELECT FOR UPDATE`, preventing race conditions across horizontally-scaled service instances
- **Kafka event pipeline** — decouples transaction processing from fraud detection, notifications, and analytics; consumers restart independently without data loss
- **4-rule real-time fraud engine** — velocity (Redis INCR), amount anomaly (PostgreSQL aggregate), large transaction (threshold), round-tripping (time-window query)
- **JWT + httpOnly cookie auth** — XSS-safe in-memory token storage, automatic silent session restoration on page load, Redis blacklist on logout
- **SHA-256 API key authentication** — `ff_live_` prefix, raw key shown once, hash-only storage — same design as GitHub personal access tokens
- **Idempotency** — UUID keys with per-tenant unique constraint; retries return the original response without re-executing the financial operation
- **Reserve account deposits** — preserves double-entry invariants for external funding without creating money from nothing
- **Full multi-tenancy** — every row scoped by `tenant_id`, RBAC roles enforced at the gateway
- **Production-deployed** — Railway (5 microservices + PostgreSQL + Redis) + Vercel (React frontend), CI/CD on every git push

---

## License

MIT
