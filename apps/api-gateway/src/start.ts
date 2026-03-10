import fs from "fs";
// Fix @finflow/* module resolution for Railway Nixpacks runtime.
// Nixpacks copies node_modules (workspace symlinks) + packages/*/dist, but NOT packages/*/package.json.
// Replacing each symlink with a real dir + package.json that points to the correct dist.
for (const pkg of ["types", "database", "redis", "kafka"]) {
  const dir = `/app/node_modules/@finflow/${pkg}`;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/package.json`, JSON.stringify({ main: `../../../packages/${pkg}/dist/index.js` }));
  } catch { /* not in Railway, skip */ }
}
// Nullify patches.js so server.js's require("./patches") becomes a no-op
try { fs.writeFileSync("/app/apps/api-gateway/dist/patches.js", ""); } catch { /* ok */ }

async function runMigrationsWithRetry(dbUrl: string, attempts = 8): Promise<void> {
  const { runMigrations } = await import("@finflow/database");
  for (let i = 0; i < attempts; i++) {
    try {
      await runMigrations(dbUrl);
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if ((code === "EAI_AGAIN" || code === "ECONNREFUSED") && i < attempts - 1) {
        const delay = Math.min(2000 * (i + 1), 10000);
        console.log(`[start] DB not ready (${code}), retrying in ${delay}ms... (${i + 1}/${attempts})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

async function bootstrap() {
  const dbUrl = process.env["DATABASE_URL"];
  if (dbUrl) {
    try {
      await runMigrationsWithRetry(dbUrl);
    } catch (err) {
      console.error("[start] Migration failed after retries (continuing):", err);
    }
  }
  require("./server");
}

bootstrap().catch((err) => {
  console.error("[start] Fatal:", err);
  process.exit(1);
});
