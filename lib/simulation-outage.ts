/**
 * Shared helpers for synthetic / snapshot simulation outage rows.
 * Must match the live `outages` table (id, no xcel_id/raw_data/fetched_at).
 */

import { MAX_MAP_CUSTOMERS } from "./routing-sweep";

type MetroPlace = { city: string; county: string; state: string; lat: number; lng: number };

const METRO_PLACES: MetroPlace[] = [
  { city: "Minneapolis", county: "Hennepin", state: "MN", lat: 44.9778, lng: -93.265 },
  { city: "St. Paul", county: "Ramsey", state: "MN", lat: 44.9537, lng: -93.09 },
  { city: "Bloomington", county: "Hennepin", state: "MN", lat: 44.8408, lng: -93.2983 },
  { city: "Brooklyn Park", county: "Hennepin", state: "MN", lat: 45.0941, lng: -93.3563 },
  { city: "Eagan", county: "Dakota", state: "MN", lat: 44.8041, lng: -93.1669 },
  { city: "Plymouth", county: "Hennepin", state: "MN", lat: 45.0105, lng: -93.4555 },
  { city: "Burnsville", county: "Dakota", state: "MN", lat: 44.7677, lng: -93.2777 },
  { city: "Maple Grove", county: "Hennepin", state: "MN", lat: 45.0725, lng: -93.4555 },
  { city: "Eden Prairie", county: "Hennepin", state: "MN", lat: 44.8547, lng: -93.4708 },
  { city: "Minnetonka", county: "Hennepin", state: "MN", lat: 44.9212, lng: -93.4687 },
  { city: "Fridley", county: "Anoka", state: "MN", lat: 45.0861, lng: -93.2633 },
  { city: "St. Louis Park", county: "Hennepin", state: "MN", lat: 44.9483, lng: -93.348 },
];

export function nearestMetroPlace(lat: number, lng: number): MetroPlace {
  let best = METRO_PLACES[0];
  let bestDist = Infinity;
  for (const place of METRO_PLACES) {
    const dLat = place.lat - lat;
    const dLng = place.lng - lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      best = place;
      bestDist = dist;
    }
  }
  return best;
}

export function clampMapCustomers(n: unknown, { cap = true } = {}): number {
  const raw = Math.max(1, Math.round(Number(n) || 1));
  return cap ? Math.min(MAX_MAP_CUSTOMERS, raw) : raw;
}

export type SimulationOutageInput = {
  id: string;
  lat: number;
  lng: number;
  customers?: number;
  capCustomers?: boolean;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  streetAddress?: string | null;
  zipCode?: string | null;
  outageType?: string | null;
  cause?: string | null;
  crewStatus?: string | null;
  etr?: string | null;
  source?: string;
};

export function buildSimulationOutageRow(input: SimulationOutageInput): Record<string, unknown> {
  const place = nearestMetroPlace(input.lat, input.lng);
  const now = new Date().toISOString();
  const city = input.city || place.city;
  const state = input.state || place.state;
  return {
    id: input.id,
    source: input.source ?? "xcel",
    lat: input.lat,
    lng: input.lng,
    street_address: input.streetAddress || `${city}, ${state}`,
    city,
    county: input.county || place.county,
    state,
    zip_code: input.zipCode ?? null,
    customers: clampMapCustomers(input.customers, { cap: input.capCustomers !== false }),
    outage_type: input.outageType || "Unplanned Outage",
    cause: input.cause || "storm damage",
    crew_status: input.crewStatus ?? "none",
    etr: input.etr ?? null,
    status: "unvisited",
    priority_score: 0,
    first_seen_at: now,
    last_updated_at: now,
    is_active: true,
    is_simulation: true,
  };
}

/** Drop unknown columns and retry so older Supabase schemas still accept inserts. */
export async function insertOutageRows(
  db: { from: (table: string) => any },
  rows: Record<string, unknown>[]
): Promise<{ data: { id: string }[] | null; error: { message: string } | null }> {
  let payload = rows.map((row) => ({ ...row }));
  let result = await db.from("outages").insert(payload).select("id");
  while (result.error) {
    const match = String(result.error.message || "").match(/Could not find the '([^']+)' column/);
    if (!match) break;
    const col = match[1];
    payload = payload.map((row) => {
      const next = { ...row };
      delete next[col];
      return next;
    });
    result = await db.from("outages").insert(payload).select("id");
  }
  return result;
}
