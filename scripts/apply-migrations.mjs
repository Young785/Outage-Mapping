#!/usr/bin/env node
/**
 * Apply supabase/migrations/*.sql in order (skips already-applied files).
 * Usage: node scripts/apply-migrations.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local"), override: true });

const suffix = (process.env.APP_ENV || "development") === "production" ? "PROD" : "DEV";
const url = process.env[`DATABASE_URL_${suffix}`] || process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL not configured.");
  process.exit(1);
}

const dir = path.join(root, "supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({
  connectionString: url,
  ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
});

await client.connect();
await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

const { rows } = await client.query("SELECT filename FROM schema_migrations");
const done = new Set(rows.map((r) => r.filename));

let applied = 0;
for (const file of files) {
  if (done.has(file)) continue;
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  process.stdout.write(`Applying ${file}... `);
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
    await client.query("COMMIT");
    console.log("ok");
    applied++;
  } catch (err) {
    await client.query("ROLLBACK");
    console.log(`failed: ${err.message.split("\n")[0]}`);
  }
}

console.log(applied ? `Done — ${applied} migration(s) applied.` : "Done — database is up to date.");
await client.end();
