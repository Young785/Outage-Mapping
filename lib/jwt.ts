import crypto from "crypto";
import { getJwtSecret } from "./env";

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type JWTPayload = {
  sub: string;    // user id
  email: string;
  name: string;
  role: "office" | "tech" | "admin" | "owner";
  iat: number;
  exp: number;
};

function b64url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(str: string): string {
  const padded = str + "===".slice((str.length + 3) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
}

export function signJWT(payload: Omit<JWTPayload, "iat" | "exp">): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Date.now();
  const body = b64url(
    JSON.stringify({ ...payload, iat: now, exp: now + JWT_EXPIRES_IN_MS })
  );
  const sig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyJWT(token: string): JWTPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const [header, body, sig] = parts;
  const expected = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  if (sig !== expected) throw new Error("Invalid JWT signature");
  const payload: JWTPayload = JSON.parse(b64urlDecode(body));
  if (payload.exp < Date.now()) throw new Error("JWT expired");
  return payload;
}

export function hashPassword(password: string, salt?: string): string {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, s, 100_000, 64, "sha512")
    .toString("hex");
  return `${s}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const newHash = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, "sha512")
    .toString("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(newHash, "hex")
    );
  } catch {
    return false;
  }
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
