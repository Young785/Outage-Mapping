/**
 * Connexus Energy ArcGIS Adapter
 *
 * Public Experience URL:
 *   https://experience.arcgis.com/experience/3ef36487143d4dc28dad813f667a40d9/page/Page
 *
 * To find the underlying REST endpoint:
 *   1. Open the Experience URL in Chrome.
 *   2. Open DevTools → Network → filter "query?where" or "FeatureServer".
 *   3. Copy the full URL of the outage layer request.
 *   4. Set CONNEXUS_ARCGIS_URL in .env to that URL.
 *
 * Until discovered, this adapter returns an error and the system
 * gracefully falls back to Xcel or last snapshot.
 */

import type { AdapterResult, NormalizedOutage } from "./types";

const CONNEXUS_URL =
  process.env.CONNEXUS_ARCGIS_URL ||
  "";  // Must be configured via env — see instructions above

export function normalizeConnexusFeature(raw: any): NormalizedOutage {
  const attrs = raw?.attributes || {};
  const geom = raw?.geometry || {};

  let lat: number | null = geom.y ?? null;
  let lng: number | null = geom.x ?? null;

  const id =
    attrs.OBJECTID ??
    attrs.objectid ??
    attrs.OutageID ??
    attrs.outage_id ??
    `connexus-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id: `cnx-${String(id)}`,
    source: "connexus",
    lat: lat != null && isFinite(lat) ? lat : null,
    lng: lng != null && isFinite(lng) ? lng : null,
    city: attrs.City ?? attrs.CITY ?? attrs.city ?? null,
    county: attrs.County ?? attrs.COUNTY ?? attrs.county ?? null,
    state: attrs.State ?? attrs.STATE ?? attrs.state ?? "MN",
    zipCode: attrs.Zip ?? attrs.ZIP ?? attrs.zip ?? null,
    customers:
      Number(
        attrs.CustomersAffected ??
        attrs.customers_affected ??
        attrs.Customers ??
        attrs.CUSTOMERS ??
        0
      ),
    outageType: attrs.OutageType ?? attrs.outage_type ?? attrs.Type ?? "Known Electric Outage",
    cause: attrs.Cause ?? attrs.cause ?? null,
    etr:
      attrs.EstimatedRestoreTime ??
      attrs.ETR ??
      attrs.etr ??
      null,
    crewStatus: attrs.CrewStatus ?? attrs.crew_status ?? null,
    outageImpact: attrs.OutageImpact ?? attrs.outage_impact ?? null,
  };
}

export async function fetchConnexus(): Promise<AdapterResult> {
  const fetchedAt = new Date().toISOString();

  if (!CONNEXUS_URL) {
    const msg =
      "Connexus adapter not configured. Set CONNEXUS_ARCGIS_URL in .env. " +
      "See lib/adapters/connexus.ts for discovery instructions.";
    console.warn("[connexus]", msg);
    return { outages: [], rawData: null, source: "connexus", fetchedAt, error: msg, schemaWarnings: [] };
  }

  let rawData: unknown = null;
  const schemaWarnings: string[] = [];

  try {
    console.log("[connexus] Fetching from ArcGIS...");
    const res = await fetch(CONNEXUS_URL, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const msg = `Connexus ArcGIS returned HTTP ${res.status} ${res.statusText}`;
      console.error("[connexus]", msg);
      return { outages: [], rawData: null, source: "connexus", fetchedAt, error: msg, schemaWarnings };
    }

    const json = await res.json();
    rawData = json;

    if (!json || !Array.isArray(json.features)) {
      const msg = "Connexus schema mismatch detected — no features array";
      console.error("[connexus]", msg);
      return { outages: [], rawData, source: "connexus", fetchedAt, error: msg, schemaWarnings };
    }

    console.log(`[connexus] Received ${json.features.length} raw features`);

    const outages = (json.features as unknown[])
      .map(normalizeConnexusFeature)
      .filter((o: NormalizedOutage) => o.lat != null && o.lng != null);

    console.log(`[connexus] Normalized ${outages.length} valid outages`);
    return { outages, rawData, source: "connexus", fetchedAt, error: null, schemaWarnings };
  } catch (err: any) {
    const msg = `Connexus data fetch failed: ${err?.message ?? "Unknown error"}`;
    console.error("[connexus]", msg);
    return { outages: [], rawData, source: "connexus", fetchedAt, error: msg, schemaWarnings };
  }
}
