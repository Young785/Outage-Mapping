/**
 * Xcel Energy ArcGIS Adapter
 *
 * Source: https://emcs-gis.esriemcs.com/arcgis/rest/services/Xcel/XcelOutage/MapServer/3/query
 *
 * If Xcel changes their schema, fix ONE place: normalizeXcelFeature().
 */

import type { AdapterResult, NormalizedOutage } from "./types";

const XCEL_URL =
  process.env.XCEL_ARCGIS_URL ||
  "https://emcs-gis.esriemcs.com/arcgis/rest/services/Xcel/XcelOutage/MapServer/3/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json";

export function normalizeXcelFeature(raw: any): NormalizedOutage {
  const attrs = raw?.attributes || {};
  const geom = raw?.geometry || {};

  let lat: number | null = geom.y ?? null;
  let lng: number | null = geom.x ?? null;

  // Fallback: some responses embed latlong string attribute
  if ((lat == null || lng == null) && attrs.latlong) {
    const parts = String(attrs.latlong).split(",");
    if (parts.length === 2) {
      lng = parseFloat(parts[0]);
      lat = parseFloat(parts[1]);
    }
  }

  const id =
    attrs.objectid ??
    attrs.OBJECTID ??
    attrs.id ??
    `xcel-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id: String(id),
    source: "xcel",
    lat: lat != null && isFinite(lat) ? lat : null,
    lng: lng != null && isFinite(lng) ? lng : null,
    city: attrs.city ?? attrs.CITY ?? attrs.municipality ?? null,
    county: attrs.county ?? attrs.COUNTY ?? null,
    state: attrs.states ?? attrs.state ?? attrs.STATES ?? attrs.STATE ?? null,
    zipCode: attrs.zip ?? attrs.ZIP ?? attrs.postal_code ?? null,
    customers: Number(attrs.customers ?? attrs.CUSTOMERS ?? attrs.customersAffected ?? 0),
    outageType: attrs.outagetype ?? attrs.OUTAGE_TYPE ?? attrs.type ?? "Known Electric Outage",
    cause: attrs.cause ?? attrs.CAUSE ?? null,
    etr: attrs.etr ?? attrs.ETR ?? attrs.estimatedRestorationTime ?? null,
    crewStatus: attrs.crewstatus ?? attrs.CREW_STATUS ?? null,
    outageImpact: attrs.outageimpact ?? attrs.OUTAGE_IMPACT ?? null,
  };
}

function detectSchemaWarnings(features: any[]): string[] {
  const warnings: string[] = [];
  if (features.length === 0) return warnings;

  const sample = features[0]?.attributes || {};
  const knownFields = [
    "objectid", "OBJECTID", "city", "county", "customers",
    "outagetype", "cause", "etr", "crewstatus",
  ];
  const presentFields = Object.keys(sample);
  const missing = knownFields.filter(
    (f) => !presentFields.some((p) => p.toLowerCase() === f.toLowerCase())
  );
  if (missing.length > 0) {
    warnings.push(`Xcel schema may have changed — missing expected fields: ${missing.join(", ")}`);
  }
  return warnings;
}

export async function fetchXcel(): Promise<AdapterResult> {
  const fetchedAt = new Date().toISOString();
  let rawData: unknown = null;
  const schemaWarnings: string[] = [];

  try {
    console.log("[xcel] Fetching from ArcGIS...");
    const res = await fetch(XCEL_URL, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const msg = `Xcel ArcGIS returned HTTP ${res.status} ${res.statusText}`;
      console.error("[xcel]", msg);
      return { outages: [], rawData: null, source: "xcel", fetchedAt, error: msg, schemaWarnings };
    }

    const json = await res.json();
    rawData = json;

    if (!json || typeof json !== "object") {
      const msg = "Xcel schema mismatch detected — response is not a JSON object";
      console.error("[xcel]", msg);
      return { outages: [], rawData, source: "xcel", fetchedAt, error: msg, schemaWarnings };
    }

    if (!Array.isArray(json.features)) {
      const msg = "Xcel schema mismatch detected — no features array in response";
      console.error("[xcel]", msg);
      return { outages: [], rawData, source: "xcel", fetchedAt, error: msg, schemaWarnings };
    }

    console.log(`[xcel] Received ${json.features.length} raw features`);
    schemaWarnings.push(...detectSchemaWarnings(json.features));

    const outages = (json.features as unknown[])
      .map(normalizeXcelFeature)
      .filter((o: NormalizedOutage) => o.lat != null && o.lng != null);

    console.log(`[xcel] Normalized ${outages.length} valid outages`);
    return { outages, rawData, source: "xcel", fetchedAt, error: null, schemaWarnings };
  } catch (err: any) {
    const msg = `Xcel data fetch failed: ${err?.message ?? "Unknown error"}`;
    console.error("[xcel]", msg);
    return { outages: [], rawData, source: "xcel", fetchedAt, error: msg, schemaWarnings };
  }
}
