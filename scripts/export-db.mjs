#!/usr/bin/env node
/**
 * Export hosted Supabase Postgres to SQL files for migrations / backups.
 * Usage: node scripts/export-db.mjs [--data] [--schema-only]
 *
 * Writes to supabase/exports/schema_YYYYMMDD.sql (and optionally data_YYYYMMDD.sql).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local"), override: true });

const includeData = process.argv.includes("--data");
const schemaOnly = process.argv.includes("--schema-only") || !includeData;

const suffix = (process.env.APP_ENV || "development") === "production" ? "PROD" : "DEV";
const rawUrl = process.env[`DATABASE_URL_${suffix}`] || process.env.DATABASE_URL;

if (!rawUrl) {
  console.error("DATABASE_URL not configured.");
  process.exit(1);
}

/** pg_dump needs session mode (port 5432), not transaction pooler (?pgbouncer=true). */
function dumpConnectionString(url) {
  const u = new URL(url);
  u.searchParams.delete("pgbouncer");
  if (u.port === "6543" || !u.port) u.port = "5432";
  return u.toString();
}

function findPgDump() {
  const candidates = [
    "/opt/homebrew/opt/postgresql@17/bin/pg_dump",
    "/usr/local/opt/postgresql@17/bin/pg_dump",
    "pg_dump",
  ];
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) {
      const ver = (r.stdout || "").match(/(\d+)/);
      if (ver && Number(ver[1]) >= 17) return bin;
    }
  }
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return bin;
  }
  console.error("pg_dump not found. Install PostgreSQL 17+ (brew install postgresql@17).");
  process.exit(1);
}

const pgDump = findPgDump();
const dumpUrl = dumpConnectionString(rawUrl);
const outDir = path.join(root, "supabase/exports");
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const schemaFile = path.join(outDir, `schema_${stamp}.sql`);
const schemaLiveFile = path.join(root, "supabase/schema_live.sql");
const dataFile = path.join(outDir, `data_${stamp}.sql`);

/** Large / volatile tables — skip on data export to avoid pooler timeouts. */
const DATA_EXCLUDE_TABLES = [
  "public.schema_migrations",
  "public.outage_snapshots",
  "public.geocode_cache",
];

const baseArgs = [dumpUrl, "--no-owner", "--no-privileges", "--schema=public"];

function runDump(label, file, extra) {
  process.stdout.write(`Exporting ${label} → ${path.relative(root, file)}... `);
  const r = spawnSync(pgDump, [...baseArgs, "--file", file, ...extra], {
    encoding: "utf8",
    env: { ...process.env, PGSSLMODE: "require" },
  });
  if (r.status !== 0) {
    console.log("failed");
    if (fs.existsSync(file)) fs.unlinkSync(file);
    console.error((r.stderr || r.stdout || "").trim());
    process.exit(1);
  }
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`ok (${kb} KB)`);
}

runDump("schema", schemaFile, ["--schema-only"]);
fs.copyFileSync(schemaFile, schemaLiveFile);
console.log(`Copied schema snapshot → ${path.relative(root, schemaLiveFile)}`);

if (includeData && !schemaOnly) {
  const excludeArgs = DATA_EXCLUDE_TABLES.flatMap((t) => ["--exclude-table", t]);
  runDump("data", dataFile, ["--data-only", ...excludeArgs]);
}

console.log("Done.");
