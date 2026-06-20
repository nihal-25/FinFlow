# FinFlow

A multi-tenant payment processing backend with a double-entry ledger, Kafka-driven fraud
detection, and a live React dashboard. Five Node.js microservices, Postgres, and Redis,
all deployed on Railway.

---

## Live demo

https://frontend-phi-six-93.vercel.app

Register, then click **Load Demo Data** in the sidebar. That one button creates three
wallets, deposits funds, and runs 18 transactions designed to trigger all four fraud
rules. Every page in the app will have real data within about 10 seconds.

API Gateway: https://api-gateway-production-75e4.up.railway.app

---

## What this is

FinFlow is a payment processing system built around three problems I kept reading about
in fintech engineering posts: how do you prevent balance corruption under concurrent
writes? How do you handle duplicate charges when the network drops? And how do you run
fraud detection without blocking the payment response?

The answers drove most of the architecture. An append-only ledger instead of a mutable
balance column. Idempotency keys backed by a database-level unique constraint. Kafka
between the transaction service and fraud detection so the payment path never waits for
a fraud check to complete.

I built this to work through those problems properly, not just describe them. It's
multi-tenant from the start, so the same backend serves completely isolated organizations.

---

## Architecture

```
                   React Dashboard (Vercel)
                          |
                    HTTPS + WebSocket
                          |
             +--[ API Gateway :3001 ]--+
             |  JWT, RBAC, rate limit  |
             |  reverse proxy          |
             +-------------------------+
              /                        \
             /                          \
 +--[Transaction :3002]--+    +--[Analytics :3005]--+
 |  double-entry ledger  |    |  Redis aggregates   |
 |  Redis SETNX locks    |    |  Socket.io push     |
 |  idempotency table    |    |  Kafka consumer     |
 |  reserve accounts     |    +---------------------+
 +-----------------------+
             |
             | Kafka (Confluent Cloud, SASL_SSL)
             | transactions.created / .completed / .failed
             | fraud.alerts
             | notifications.email / .webhook
             |
      +------+-------+
      |               |
 +----v-----+   +-----v-----------+
 |  Fraud   |   | Notification    |
 | Service  |   | Service         |
 |          |   |                 |
 | velocity |   | webhook POST    |
 | anomaly  |   | HMAC-SHA256 sig |
 | large tx |   | exponential     |
 | round-   |   | backoff retry   |
 | tripping |   +-----------------+
 +----------+

  PostgreSQL 15                 Redis 7
  +----------------------+      +----------------------+
  | 10 SQL migrations    |      | SETNX locks (30s TTL)|
  | ledger (RULE: immut) |      | rate limit windows   |
  | transactions         |      | token blacklist      |
  | fraud_alerts         |      | velocity counters    |
  | audit_logs           |      +----------------------+
  +----------------------+
```

When a transfer request arrives, the API Gateway authenticates it and proxies it to the
transaction service. That service acquires a Redis lock on both account IDs (sorted to
prevent deadlock), opens a Postgres transaction, locks both rows with
`SELECT FOR UPDATE`, computes the source balance by summing ledger entries, and inserts
the transaction record plus two ledger rows atomically. Then it releases the locks and
fires Kafka events. The fraud service and notification service pick those events up
independently. The HTTP response is back before either of them finishes.

---

## Tech choices

### Postgres

Postgres is the source of truth for everything: the ledger, transactions, accounts,
fraud alerts, webhooks, API keys, and audit logs. All 10 migrations are plain `.sql`
files. No ORM. I went with raw parameterized SQL partly because `SELECT FOR UPDATE`
semantics are clearer when you see the exact query, and partly because schema changes
are readable in git history without translating through a framework DSL.

### Redis

Redis is doing four different jobs here. Distributed locks during transaction processing
(`SETNX` with a 30-second TTL on both account IDs). Sliding-window rate limiting at the
gateway level. A blacklist for invalidated JWT access tokens so logout takes effect
immediately, before the token expires. And velocity counters for the fraud engine (`INCR`
plus `EXPIRE 300` per account per 5-minute window). The common thread: these all need to
be atomic and fast, and losing them on a Redis restart is acceptable.

### Kafka

The transaction service publishes to three topics. Fraud-service, analytics-service, and
notification-service each have their own consumer groups and consume independently.
Running on Confluent Cloud in production with SASL_SSL and PLAIN auth.

The reason for Kafka over direct HTTP: if fraud-service is down during a transaction,
the event queues and gets processed when it restarts. No data loss. And the transaction
service has no knowledge of what consumes its events, so adding a new downstream
consumer means writing that consumer, not touching the producer.

### TypeScript

Strict mode across all nine projects, with `exactOptionalPropertyTypes: true`. The
shared `packages/types` package is the single source of truth for every domain type.
Compile errors across package boundaries catch integration issues before deployment.

### Express

Minimal routing layer, full control over middleware ordering. The API Gateway uses
`http-proxy-middleware` to forward requests to downstream services and re-streams the
parsed JSON body (since `express.json()` consumes the request stream before the proxy
runs).

### React and the frontend

Seven pages. React Query handles server state, caching, and invalidation. Zustand holds
auth state in memory, not localStorage. Socket.io connects to the analytics service for
real-time event push. Tailwind for styling. The frontend is deployed on Vercel; the
`VITE_API_URL` and `VITE_WS_URL` env vars point at the Railway services.

---

## The interesting parts

### Balance from the ledger, not a stored column

A mutable `balance` column is a running total that you update in place. Two concurrent
writes both read the same number, apply their delta, and write back, and one update is
silently lost. This is a real class of bugs in financial systems.

The ledger approach avoids it entirely. Every debit and credit is a separate immutable
row. Balance is always `SUM(credits) - SUM(debits)`, computed at query time from the
full history. It cannot drift. You also get a full audit trail for free, which is what
compliance actually requires.

### The append-only rule

Immutability in `ledger_entries` is enforced by a Postgres `RULE`, not by application
code. The rule intercepts `UPDATE` and `DELETE` and silently turns them into no-ops.
Not a trigger. Not a check constraint. A rule, which applies even when someone connects
directly via `psql` and issues a delete manually. You cannot accidentally corrupt the
ledger from any connection.

### Two-layer locking

`SELECT FOR UPDATE` handles row-level consistency inside a Postgres transaction, but it
does not stop two service instances from starting the same transfer concurrently before
they reach the database. The Redis `SETNX` lock closes that gap.

The sequence: acquire a Redis lock on both account IDs (sorted alphabetically to prevent
deadlock), with a 30-second TTL. If the lock is held, fail fast and tell the client to
retry. Only after acquiring the lock does the code open the Postgres transaction and
issue the `SELECT FOR UPDATE`. The TTL handles crashes: if the process dies while holding
the lock, it releases automatically after 30 seconds, no manual cleanup needed.

### Idempotency keys

Every transfer requires a client-generated UUID as an idempotency key. There is a
`UNIQUE (idempotency_key, tenant_id)` constraint on the transactions table. If the same
key arrives twice, the second request looks up the original transaction and returns it
without re-running the transfer.

This matters when the transfer commits, the response is queued, and the network drops
before the client receives it. The client retries with the same key. Without idempotency,
the customer is charged twice. With it, they get the original response and nothing runs
again.

### Kafka event flow

The transaction service publishes `transaction.completed` and returns the HTTP response.
The fraud service consumer receives that event, runs four checks in parallel (velocity
counter, amount anomaly, large transaction threshold, round-trip detection), and writes
any fraud alerts to Postgres. The notification service consumer receives fraud alerts and
delivers webhooks to registered endpoints.

Neither service is in the payment response path. If they are slow, it does not matter.
If they crash, Kafka holds the events until they restart. Consumer groups mean each
service maintains its own offset independently.

### Webhook signatures

Webhook deliveries include `X-Finflow-Signature: sha256=<HMAC-SHA256(secret, body)>`.
The receiving server can verify that the payload came from FinFlow and was not modified
in transit. Each endpoint has its own secret stored in Postgres. Delivery failures retry
with exponential backoff (100ms, 200ms, 400ms, and so on) up to a configured limit. The
test endpoint button in the settings UI fires a real delivery immediately and shows the
HTTP response.

### Auth

Access tokens have a 15-minute TTL and live in Zustand in memory. They vanish on page
refresh. On mount, `AuthInitializer` makes a silent `/auth/refresh` request. The refresh
token is in an httpOnly cookie, which JavaScript cannot read at all. Logout adds the
access token to a Redis blacklist, so it cannot be used for its remaining TTL even if
someone already has a copy.

API keys store only a SHA-256 hash. The raw key is generated server-side, shown once in
the response, and never persisted. The `ff_live_` prefix is stored separately for
display. When a request comes in with an API key, the gateway hashes it with SHA-256 and
looks up the hash. The same design GitHub uses for personal access tokens.

### Reserve accounts for external deposits

Depositing funds from outside the system needs to debit something, or it violates
double-entry (crediting a wallet without a matching debit creates money from nothing).
The system creates a per-currency "External Funding" reserve account for each tenant.
Deposits credit the wallet and debit the reserve. Reserve accounts are allowed to go
negative, representing total external capital injected. The entire ledger sums to zero.

---

## Running locally

Prerequisites: Docker Desktop and Node >= 20.

```bash
# Start Postgres, Redis, Kafka, Zookeeper, and Kafka UI (localhost:8080)
docker-compose up -d

# Wait until containers are healthy
docker-compose ps

# Install all workspace dependencies
npm install

# Copy env files -- pre-configured for local Docker, no edits needed
for svc in api-gateway transaction-service fraud-service notification-service analytics-service; do
  cp apps/$svc/.env.example apps/$svc/.env
done

# Run the 10 migrations
DATABASE_URL=postgresql://finflow:finflow_secret@localhost:5432/finflow npm run db:migrate

# Start all five backend services in parallel
npm run dev:services

# In a separate terminal, start the frontend
npm run dev -w frontend
```

Frontend runs at http://localhost:5173. API Gateway at http://localhost:3001.

The `dev:services` command uses concurrently. If you want to start services individually:

```bash
npm run dev -w apps/api-gateway
npm run dev -w apps/transaction-service
npm run dev -w apps/fraud-service
npm run dev -w apps/notification-service
npm run dev -w apps/analytics-service
```

To run the auth integration tests:

```bash
docker-compose up -d postgres redis
npm test -w apps/api-gateway
```

The test suite covers register, login, token validation, silent refresh, logout, Redis
blacklist verification, and API key create/authenticate/revoke.

---

## Test flow

Everything below works on the live demo at https://frontend-phi-six-93.vercel.app.

1. Go to **/register**. Fill in your name, a company/tenant name, email, and password.
   You will be logged in automatically.

2. Click **Load Demo Data** in the left sidebar. Wait about 10 seconds. This creates
   three wallets (Main, Savings, Bounce), deposits funds using the reserve account
   system, and runs 18 transactions designed to trigger all four fraud rules.

3. Go to **Transactions** and click any row. The detail view shows the full double-entry
   ledger for that transaction: which account was debited, which was credited, and the
   balance before and after on each side.

4. Open **Fraud Alerts**. You should see alerts for large transaction, velocity,
   round-tripping, and amount anomaly. These were created by the fraud-service Kafka
   consumer, not inline during the transaction. Click **Investigate** or **Dismiss** on
   any of them.

5. Open **Analytics**. The chart shows daily transaction volume from the seeded data.
   If you run a transfer in another tab, the live feed on the dashboard home page updates
   in real time via Socket.io without a page reload.

6. Go to **Send Money** and transfer $15,000 between your wallets. The transaction
   completes immediately. Switch to **Fraud Alerts** and wait a few seconds. A new alert
   will appear for the large transaction rule. The delay is Kafka roundtrip latency,
   typically a few hundred milliseconds to a couple of seconds. This is not inline
   synchronous detection.

7. Go to **Settings** and create an API key. Copy the raw key, shown once. Test it:

```bash
curl https://api-gateway-production-75e4.up.railway.app/accounts \
  -H "X-API-Key: ff_live_<your_key>"
```

---

## Project structure

```
finflow/
├── apps/
│   ├── api-gateway/           # JWT auth, RBAC, rate limiting, reverse proxy
│   ├── transaction-service/   # Ledger, accounts, transfers, idempotency, webhooks
│   ├── fraud-service/         # Kafka consumer with four fraud rules
│   ├── notification-service/  # Kafka consumer, webhook delivery, HMAC signing
│   └── analytics-service/     # Kafka consumer, Socket.io push, REST analytics
├── packages/
│   ├── types/                 # Shared TypeScript interfaces for every domain type
│   ├── database/              # pg pool, parameterized query helpers, migration runner
│   ├── redis/                 # ioredis client, SETNX locks, sliding-window rate limiter
│   └── kafka/                 # KafkaJS producer and consumer wrappers, SASL_SSL
├── frontend/                  # React + Vite dashboard, seven pages
├── scripts/                   # One-off scripts (Confluent topic provisioning, etc.)
├── docker-compose.yml         # Postgres, Redis, Kafka, Zookeeper, Kafka UI
└── tsconfig.base.json         # Base TypeScript config shared by all nine projects
```

Build order follows the dependency chain: `packages/types` first, then
`packages/database`, `packages/redis`, `packages/kafka`, then `apps/*`. All five apps
depend on at least one shared package, so the packages have to compile before the
services can.

---

## What I'd do differently

### Sagas for multi-step operations

The current transaction write is a single atomic Postgres operation, which works well
for same-database transfers. If you needed to coordinate with an external card network,
a different database, or any system where you cannot wrap everything in one DB
transaction, you would need a proper saga with explicit compensating transactions. Getting
that right is genuinely hard and I left it out.

### Distributed tracing

There are correlation IDs on every request and they propagate through Kafka message
headers. You can trace a transaction through log lines by correlation ID. But there is no
OpenTelemetry, no trace viewer, no flame graph. When something breaks and the event has
flowed from the transaction service through Kafka into the fraud service and then into the
notification service, you correlate timestamps manually. Adding OTEL would make debugging
in production much faster.

### Webhook secret storage

Each webhook endpoint stores its HMAC secret in a Postgres column. For a deployment with
serious security requirements you would want those secrets in something like AWS KMS or
HashiCorp Vault, where the secret material never lives in application-readable database
storage and access is audited. Storing secrets next to the endpoint config is convenient
for a side project and a reasonable place to start, but it is not where you would leave
them.

---

## License

MIT
