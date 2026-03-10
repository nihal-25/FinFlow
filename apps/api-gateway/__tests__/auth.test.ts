/**
 * Integration tests for auth flow.
 * Requires running PostgreSQL and Redis (use docker-compose up -d postgres redis).
 */
import request from "supertest";
import app from "../src/app.js";
import { query } from "@finflow/database";

const testTenant = {
  tenantName: `Test Corp ${Date.now()}`,
  firstName: "Test",
  lastName: "Admin",
  email: `test_${Date.now()}@example.com`,
  password: "SecurePassword123!",
};

let accessToken: string;
let refreshCookie: string;
let apiKeyId: string;
let createdApiKey: string;

describe("Auth Flow", () => {
  afterAll(async () => {
    // Cleanup test data
    await query("DELETE FROM tenants WHERE slug LIKE 'test-corp-%'").catch(() => {});
  });

  it("POST /auth/register — creates tenant and admin user", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send(testTenant)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.tenant).toHaveProperty("id");
    expect(res.body.data.user.email).toBe(testTenant.email);
    expect(res.body.data.user.role).toBe("admin");
  });

  it("POST /auth/register — rejects duplicate email", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send(testTenant)
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("POST /auth/login — returns access token", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: testTenant.email, password: testTenant.password })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("accessToken");
    accessToken = res.body.data.accessToken as string;

    // Extract refresh token cookie
    const cookies = res.headers["set-cookie"] as string[] | string | undefined;
    const cookieArr = Array.isArray(cookies) ? cookies : [cookies ?? ""];
    refreshCookie = cookieArr.find((c) => c.startsWith("refresh_token=")) ?? "";
    expect(refreshCookie).toBeTruthy();
  });

  it("POST /auth/login — rejects wrong password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: testTenant.email, password: "WrongPassword!" })
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it("GET /auth/me — returns user with valid token", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testTenant.email);
  });

  it("GET /auth/me — rejects request without token", async () => {
    const res = await request(app).get("/auth/me").expect(401);
    expect(res.body.success).toBe(false);
  });

  it("POST /auth/refresh — issues new access token", async () => {
    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("accessToken");
    accessToken = res.body.data.accessToken as string;
  });

  it("POST /auth/api-keys — creates API key", async () => {
    const res = await request(app)
      .post("/auth/api-keys")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Test Key" })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.key).toMatch(/^ff_live_/);
    apiKeyId = res.body.data.id as string;
    createdApiKey = res.body.data.key as string;
  });

  it("GET /auth/me — works with API key", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("X-API-Key", createdApiKey)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it("DELETE /auth/api-keys/:id — revokes API key", async () => {
    const res = await request(app)
      .delete(`/auth/api-keys/${apiKeyId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it("GET /auth/me — rejects revoked API key", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("X-API-Key", createdApiKey)
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it("POST /auth/logout — invalidates token", async () => {
    await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    // Token should now be blacklisted
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);

    expect(res.body.success).toBe(false);
  });
});
