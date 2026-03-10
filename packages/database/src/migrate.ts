import fs from "fs";
import path from "path";
import { Pool } from "pg";

interface MigrationRow {
  name: string;
  executed_at: Date;
}

async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });

  try {
    // Ensure migrations tracking table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, "migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const executedResult = await pool.query<MigrationRow>(
      "SELECT name FROM schema_migrations ORDER BY name"
    );
    const executed = new Set(executedResult.rows.map((r) => r.name));

    for (const file of files) {
      if (executed.has(file)) {
        console.log(`[migrate] Skipping already-executed: ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      console.log(`[migrate] Running: ${file}`);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[migrate] Completed: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`[migrate] Failed: ${file}`, error);
        throw error;
      } finally {
        client.release();
      }
    }

    console.log("[migrate] All migrations complete.");
  } finally {
    await pool.end();
  }
}

export { runMigrations };

// Allow running directly: node dist/migrate.js
if (require.main === module) {
  const connectionString =
    process.env["DATABASE_URL"] ?? "postgresql://finflow:finflow_secret@localhost:5432/finflow";
  runMigrations(connectionString).catch((err) => {
    console.error("[migrate] Fatal error:", err);
    process.exit(1);
  });
}
