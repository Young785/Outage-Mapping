import crypto from "crypto";

export const HOUSECALL_ALLOWED_TAGS = [
  "Storm Damage",
  "Door Hanger",
  "Self Generated",
] as const;

export type HousecallLeadSource = "storm_damage" | "door_hanger" | "self_generated";

export function isStormRelevantTag(tags: string[]): boolean {
  return tags.some((t) => HOUSECALL_ALLOWED_TAGS.includes(t as (typeof HOUSECALL_ALLOWED_TAGS)[number]));
}

export function leadSourceFromTags(tags: string[]): HousecallLeadSource | null {
  if (tags.includes("Door Hanger")) return "door_hanger";
  if (tags.includes("Self Generated")) return "self_generated";
  if (tags.includes("Storm Damage")) return "storm_damage";
  return null;
}

function safeEq(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function verifyHousecallSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const hexDigest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const base64Digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const normalized = signature.trim().replace(/^sha256=/i, "");
  return safeEq(normalized, hexDigest) || safeEq(normalized, base64Digest);
}

function getHeaderValue(headers: Headers, keys: string[]): string | null {
  for (const k of keys) {
    const v = headers.get(k);
    if (v) return v;
  }
  return null;
}

export function getHousecallSignatureHeader(headers: Headers): string | null {
  return getHeaderValue(headers, [
    "x-housecall-signature",
    "x-hcp-signature",
    "x-signature",
  ]);
}

export function getHousecallEventId(payload: any): string | null {
  return payload?.event_id ?? payload?.eventId ?? payload?.id ?? null;
}

export function getHousecallJobId(payload: any): string | null {
  return (
    payload?.data?.job_id ??
    payload?.data?.jobId ??
    payload?.job_id ??
    payload?.jobId ??
    payload?.job?.id ??
    null
  );
}

export async function fetchHousecallJob(jobId: string): Promise<any> {
  const apiKey = process.env.HOUSECALL_API_KEY;
  if (!apiKey) throw new Error("HOUSECALL_API_KEY missing");
  const baseUrl = process.env.HOUSECALL_API_BASE_URL || "https://api.housecallpro.com";

  const res = await fetch(`${baseUrl}/jobs/${jobId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HouseCall API error ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export async function listHousecallJobsByTag(tag: string): Promise<any[]> {
  const apiKey = process.env.HOUSECALL_API_KEY;
  if (!apiKey) throw new Error("HOUSECALL_API_KEY missing");
  const baseUrl = process.env.HOUSECALL_API_BASE_URL || "https://api.housecallpro.com";
  const all: any[] = [];
  let cursor: string | null = null;

  for (let i = 0; i < 50; i++) {
    const qp = new URLSearchParams({ tag });
    if (cursor) qp.set("cursor", cursor);
    const res = await fetch(`${baseUrl}/jobs?${qp.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) break;
    const data = await res.json();
    const rows = data?.jobs ?? data?.data ?? [];
    all.push(...rows);
    cursor = data?.next_cursor ?? data?.nextCursor ?? null;
    if (!cursor) break;
  }
  return all;
}

export async function postHousecallJobNote(jobId: string, note: string): Promise<void> {
  const apiKey = process.env.HOUSECALL_API_KEY;
  if (!apiKey) throw new Error("HOUSECALL_API_KEY missing");
  const baseUrl = process.env.HOUSECALL_API_BASE_URL || "https://api.housecallpro.com";
  await fetch(`${baseUrl}/jobs/${jobId}/notes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ note }),
  });
}
