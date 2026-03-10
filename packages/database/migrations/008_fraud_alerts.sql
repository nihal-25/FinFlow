-- Migration: 008_fraud_alerts.sql

CREATE TYPE fraud_alert_status AS ENUM ('open', 'investigating', 'resolved', 'dismissed');

CREATE TABLE fraud_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  rules_triggered TEXT[] NOT NULL DEFAULT '{}',
  risk_score      SMALLINT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  status          fraud_alert_status NOT NULL DEFAULT 'open',
  metadata        JSONB NOT NULL DEFAULT '{}',
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fraud_alerts_tenant_id ON fraud_alerts(tenant_id);
CREATE INDEX idx_fraud_alerts_transaction_id ON fraud_alerts(transaction_id);
CREATE INDEX idx_fraud_alerts_account_id ON fraud_alerts(account_id);
CREATE INDEX idx_fraud_alerts_status ON fraud_alerts(status);
CREATE INDEX idx_fraud_alerts_created_at ON fraud_alerts(created_at DESC);
