import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { createProxyMiddleware } from "http-proxy-middleware";
import { config } from "./config";
import { requestIdMiddleware } from "./middleware/request-id";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import authRoutes from "./routes/auth.routes";
import healthRoutes from "./routes/health.routes";

const app = express();

// ─── Security headers ───────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
  })
);

// ─── Core middleware ─────────────────────────────────────────────────────────
app.use(requestIdMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Logging ─────────────────────────────────────────────────────────────────
if (config.NODE_ENV !== "test") {
  app.use(
    morgan(":method :url :status :res[content-length] - :response-time ms", {
      stream: {
        write: (message) => process.stdout.write(message),
      },
    })
  );
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
app.use(rateLimitMiddleware());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/", healthRoutes);
app.use("/auth", authRoutes);

// ─── Proxy to downstream services ─────────────────────────────────────────────
// Mount proxies on "/" (no prefix stripping) and use pathFilter to route correctly.
// app.use("/path", proxy) strips the path prefix before forwarding — breaking downstream routes.
//
// Because express.json() consumes the request stream before the proxy runs, we must
// re-write the parsed body back into the proxied request via the proxyReq event.
function rewriteParsedBody(proxyReq: import("http").ClientRequest, req: express.Request): void {
  if (req.body && Object.keys(req.body as object).length > 0) {
    const bodyData = JSON.stringify(req.body);
    proxyReq.setHeader("Content-Type", "application/json");
    proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }
}

const txProxy = createProxyMiddleware({
  target: config.TRANSACTION_SERVICE_URL,
  changeOrigin: true,
  pathFilter: ["/transactions", "/accounts", "/fraud-alerts", "/webhooks", "/demo"],
  on: {
    proxyReq: rewriteParsedBody,
    error: (err, _req, res) => { console.error("[proxy] tx error:", (err as Error).message); (res as express.Response).status(502).json({ success: false, error: { code: "BAD_GATEWAY", message: "Transaction service unavailable" } }); },
  },
});
const analyticsProxy = createProxyMiddleware({
  target: config.ANALYTICS_SERVICE_URL,
  changeOrigin: true,
  pathFilter: ["/analytics"],
  on: {
    proxyReq: rewriteParsedBody,
    error: (_err, _req, res) => { (res as express.Response).status(502).json({ success: false, error: { code: "BAD_GATEWAY", message: "Analytics service unavailable" } }); },
  },
});

app.use(txProxy);
app.use(analyticsProxy);

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
