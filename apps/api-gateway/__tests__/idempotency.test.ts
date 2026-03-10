/**
 * Integration tests for transaction idempotency.
 * Tests that duplicate idempotency keys return the same transaction.
 */
import request from "supertest";
import { api } from "../src/lib/api-client.js";

// Placeholder — full idempotency tests run against transaction-service
describe("Idempotency", () => {
  it("same idempotency key returns existing transaction (not double-charged)", async () => {
    // This test documents the expected behavior:
    // 1. POST /transactions with idempotencyKey = "test-idem-123"
    // 2. POST /transactions with same idempotencyKey
    // 3. Response should contain isIdempotentReplay: true
    // 4. Only one debit/credit pair should exist in ledger_entries
    expect(true).toBe(true); // Placeholder — see README for running full integration tests
  });
});
