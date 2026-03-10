-- Migration: 007_ledger_entries.sql
-- Immutable double-entry ledger (append-only, never updated or deleted)

CREATE TYPE ledger_entry_type AS ENUM ('debit', 'credit');

CREATE TABLE ledger_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  type            ledger_entry_type NOT NULL,
  amount          NUMERIC(20, 8) NOT NULL CHECK (amount > 0),
  balance_before  NUMERIC(20, 8) NOT NULL,
  balance_after   NUMERIC(20, 8) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Protect immutability: no updates or deletes allowed
CREATE RULE ledger_no_update AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;
CREATE RULE ledger_no_delete AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;

CREATE INDEX idx_ledger_entries_account_id ON ledger_entries(account_id);
CREATE INDEX idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_entries_created_at ON ledger_entries(created_at DESC);
CREATE INDEX idx_ledger_entries_account_created ON ledger_entries(account_id, created_at DESC);
