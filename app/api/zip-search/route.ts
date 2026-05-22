/**
 * GET /api/zip-search?q=802
 * Live US zip code suggestions via Google Places Autocomplete.
 */

import { NextResponse } from "next/server";
import { extractUsZip } from "@/lib/parseAddress";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ zips: [] });
  }

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Google Maps API key not configured" }, { status: 500 });
  }

  try {
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
      return NextResponse.json(
        { error: json.error_message ?? json.status ?? "Zip search failed" },
        { status: 502 }
      );
    }

    const seen = new Set<string>();
    const zips: { zip: string; label: string }[] = [];

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

    // Direct 5-digit entry
    if (/^\d{5}$/.test(q) && !seen.has(q)) {
      zips.unshift({ zip: q, label: q });
    }

    return NextResponse.json({ zips });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Zip search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
