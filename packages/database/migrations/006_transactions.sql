-- Migration: 006_transactions.sql

CREATE TYPE transaction_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'reversed',
  'flagged'
);

CREATE TABLE transactions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_account_id     UUID NOT NULL REFERENCES accounts(id),
  destination_account_id UUID NOT NULL REFERENCES accounts(id),
  amount                NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  currency              account_currency NOT NULL,
  status                transaction_status NOT NULL DEFAULT 'pending',
  idempotency_key       VARCHAR(255) NOT NULL,
  description           TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}',
  failure_reason        TEXT,
  processed_at          TIMESTAMPTZ,
  reversed_at           TIMESTAMPTZ,
  reversal_of_id        UUID REFERENCES transactions(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT transactions_idempotency_key_tenant UNIQUE (idempotency_key, tenant_id),
  CONSTRAINT transactions_no_self_transfer CHECK (source_account_id != destination_account_id)
);

CREATE INDEX idx_transactions_tenant_id ON transactions(tenant_id);
CREATE INDEX idx_transactions_source_account_id ON transactions(source_account_id);
CREATE INDEX idx_transactions_destination_account_id ON transactions(destination_account_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_idempotency_key ON transactions(idempotency_key, tenant_id);

CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
