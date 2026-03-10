import crypto from "crypto";
import { query, queryOne } from "@finflow/database";

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000];
const MAX_CONSECUTIVE_FAILURES = 5;

export async function deliverWebhook(
  webhookEndpointId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  interface EndpointRow {
    id: string; url: string; is_active: boolean; consecutive_failures: number;
  }
  const endpoint = await queryOne<EndpointRow>(
    `SELECT id, url, is_active, consecutive_failures FROM webhook_endpoints WHERE id = $1`,
    [webhookEndpointId]
  );

  if (!endpoint || !endpoint.is_active) {
    console.warn(`[webhook] Endpoint ${webhookEndpointId} not found or inactive`);
    return;
  }

  // Get tenant webhook secret for HMAC signature
  interface SecretRow { webhook_secret: string; }
  const tenant = await queryOne<SecretRow>(
    `SELECT t.webhook_secret FROM webhook_endpoints we
     JOIN tenants t ON t.id = we.tenant_id
     WHERE we.id = $1`,
    [webhookEndpointId]
  );

  const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
  const signature = tenant
    ? `sha256=${crypto.createHmac("sha256", tenant.webhook_secret).update(body).digest("hex")}`
    : "";

  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const deliveryId = crypto.randomUUID();
    let responseCode: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;
    let success = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FinFlow-Signature": signature,
          "X-FinFlow-Event": event,
          "X-FinFlow-Delivery": deliveryId,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      responseCode = response.status;
      responseBody = await response.text().catch(() => "");
      success = response.ok;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    // Log delivery attempt
    await query(
      `INSERT INTO webhook_deliveries
         (webhook_endpoint_id, event, payload, status, attempt_number, response_code, response_body, error_message, delivered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        webhookEndpointId,
        event,
        JSON.stringify(payload),
        success ? "success" : "failed",
        attempt,
        responseCode,
        responseBody,
        errorMessage,
        success ? new Date() : null,
      ]
    );

    if (success) {
      // Reset consecutive failures
      await query(
        `UPDATE webhook_endpoints SET consecutive_failures = 0, last_success_at = NOW() WHERE id = $1`,
        [webhookEndpointId]
      );
      console.log(`[webhook] Delivered to ${endpoint.url} on attempt ${attempt}`);
      return;
    }

    // Track failure
    const newFailureCount = endpoint.consecutive_failures + attempt;
    if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
      await query(
        `UPDATE webhook_endpoints SET consecutive_failures = $1, is_active = FALSE WHERE id = $2`,
        [newFailureCount, webhookEndpointId]
      );
      console.error(`[webhook] Endpoint ${webhookEndpointId} disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
      return;
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      const delay = RETRY_DELAYS_MS[attempt] ?? 16_000;
      console.warn(`[webhook] Attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  console.error(`[webhook] All ${RETRY_DELAYS_MS.length} delivery attempts failed for ${endpoint.url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
