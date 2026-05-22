/**
 * GET /api/zip-search?q=802
 * Live US zip code suggestions via Google Places Autocomplete.
 */

import { NextResponse } from "next/server";
import { extractUsZip } from "@/lib/parseAddress";

type ZipResult = { zip: string; label: string };

async function searchGoogle(q: string, key: string): Promise<ZipResult[]> {
  const params = new URLSearchParams({
    input: q,
    types: "(regions)",
    components: "country:us",
    key,
  });
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
    { signal: AbortSignal.timeout(8_000) }
  );
  const json = await res.json();
  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    return [];
  }

  const seen = new Set<string>();
  const zips: ZipResult[] = [];

  for (const p of json.predictions ?? []) {
    const label = p.description as string;
    const zip =
      extractUsZip(label) ||
      extractUsZip((p.structured_formatting?.main_text as string) ?? "");
    if (!zip || seen.has(zip)) continue;
    seen.add(zip);
    zips.push({ zip, label });
    if (zips.length >= 12) break;
  }
  return zips;
}

/** Fallback when Places API is unavailable — OpenStreetMap Nominatim */
async function searchNominatim(q: string): Promise<ZipResult[]> {
  const digits = q.replace(/\D/g, "");
  if (digits.length < 2) return [];

  const params = new URLSearchParams({
    q: `${digits} USA`,
    countrycodes: "us",
    format: "json",
    limit: "12",
    addressdetails: "1",
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "OutageFieldMap/1.0 (zip-search)" },
    }
  );
  if (!res.ok) return [];

  const rows = await res.json();
  const seen = new Set<string>();
  const zips: ZipResult[] = [];

  for (const row of rows) {
    const zip =
      extractUsZip(String(row.name ?? "")) ||
      (row.address?.postcode ? extractUsZip(String(row.address.postcode)) : null);
    if (!zip || !zip.startsWith(digits) || seen.has(zip)) continue;
    seen.add(zip);
    const place =
      row.display_name?.replace(new RegExp(`^${zip},?\\s*`), "") ||
      [row.address?.city, row.address?.state].filter(Boolean).join(", ");
    zips.push({ zip, label: `${zip} — ${place}` });
  }
  return zips;
}

async function searchZippopotam(q: string): Promise<ZipResult[]> {
  if (!/^\d{5}$/.test(q)) return [];
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${q}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const place = json.places?.[0];
    const label = place
      ? `${q} — ${place["place name"]}, ${place["state abbreviation"]}`
      : q;
    return [{ zip: q, label }];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ zips: [] });
  }

  try {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    let zips: ZipResult[] = key ? await searchGoogle(q, key) : [];

    if (zips.length === 0) {
      zips = await searchNominatim(q);
    }
    if (zips.length === 0) {
      zips = await searchZippopotam(q.replace(/\D/g, "").slice(0, 5));
    }

    const seen = new Set(zips.map((z) => z.zip));
    if (/^\d{5}$/.test(q.replace(/\D/g, ""))) {
      const exact = q.replace(/\D/g, "").slice(0, 5);
      if (!seen.has(exact)) {
        const exactRows = await searchZippopotam(exact);
        zips = [...exactRows, ...zips];
      }
    }

    return NextResponse.json({ zips: zips.slice(0, 12) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Zip search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
