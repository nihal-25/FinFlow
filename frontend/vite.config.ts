import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api/auth": { target: "http://localhost:3001", rewrite: (p) => p.replace(/^\/api\/auth/, "/auth") },
      "/api/transactions": { target: "http://localhost:3002", rewrite: (p) => p.replace(/^\/api\/transactions/, "/transactions") },
      "/api/accounts": { target: "http://localhost:3002", rewrite: (p) => p.replace(/^\/api\/accounts/, "/accounts") },
      "/api/analytics": { target: "http://localhost:3005", rewrite: (p) => p.replace(/^\/api\/analytics/, "/analytics") },
      "/api/fraud-alerts": { target: "http://localhost:3002", rewrite: (p) => p.replace(/^\/api\/fraud-alerts/, "/fraud-alerts") },
      "/api/webhooks": { target: "http://localhost:3002", rewrite: (p) => p.replace(/^\/api\/webhooks/, "/webhooks") },
      "/api/demo": { target: "http://localhost:3002", rewrite: (p) => p.replace(/^\/api\/demo/, "/demo") },
      "/socket.io": { target: "http://localhost:3005", ws: true },
    },
  },
});
