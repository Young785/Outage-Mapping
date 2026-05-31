/**
 * App environment: development (local DB) vs production (hosted DB).
 * Set APP_ENV=development or APP_ENV=production in .env
 */

export type AppEnv = "development" | "production";

export function getAppEnv(): AppEnv {
  const raw = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
  if (raw === "production" || raw === "prod") return "production";
  return "development";
}

export function isProduction(): boolean {
  return getAppEnv() === "production";
}

/** Read DEV or PROD suffixed var, then unsuffixed legacy fallback. */
export function envForApp(key: string): string {
  const suffix = isProduction() ? "PROD" : "DEV";
  return (
    process.env[`${key}_${suffix}`]?.trim() ||
    process.env[key]?.trim() ||
    ""
  );
}

export function getSupabaseConfig() {
  return {
    url: envForApp("SUPABASE_URL"),
    serviceRoleKey: envForApp("SUPABASE_SERVICE_ROLE_KEY"),
    anonKey: envForApp("SUPABASE_ANON_KEY"),
    databaseUrl: envForApp("DATABASE_URL"),
  };
}

export function getJwtSecret(): string {
  const secret = envForApp("JWT_SECRET");
  if (secret) return secret;
  if (isProduction()) {
    console.warn("[env] JWT_SECRET_PROD not set — using insecure default");
  }
  return "dev-secret-change-in-production";
}
