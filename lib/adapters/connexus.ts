/**
 * Connexus Energy ArcGIS Adapter
 *
 * Public map: https://experience.arcgis.com/experience/3ef36487143d4dc28dad813f667a40d9/page/Page
 * Layer: OutagePro_WFL1 / "Connexus Outage Data" (point features, ~10-char field names)
 *
 * Override via CONNEXUS_ARCGIS_URL if Connexus changes hosts or layer paths.
 */

import type { AdapterResult, NormalizedOutage } from "./types";

const CONNEXUS_URL =
  process.env.CONNEXUS_ARCGIS_URL ||
  "https://services6.arcgis.com/tLxmfwKZGo8Ff5TR/arcgis/rest/services/OutagePro_WFL1/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json";

export function normalizeConnexusFeature(raw: any): NormalizedOutage {
  const attrs = raw?.attributes || {};
  const geom = raw?.geometry || {};

  let lat: number | null = geom.y ?? null;
  let lng: number | null = geom.x ?? null;

  // Connexus attribute X/Y are fallbacks only when geometry is missing (may not be WGS84).
  if ((lat == null || lng == null) && attrs.Y != null && attrs.X != null) {
    const attrLat = Number(attrs.Y);
    const attrLng = Number(attrs.X);
    if (Math.abs(attrLat) <= 90 && Math.abs(attrLng) <= 180) {
      lat = attrLat;
      lng = attrLng;
    }
  }

  const id =
    attrs.INCIDENT_I ??
    attrs.FID ??
    attrs.OBJECTID ??
    attrs.objectid ??
    attrs.OutageID ??
    attrs.outage_id ??
    `connexus-${Math.random().toString(36).slice(2, 10)}`;

  const customers = Number(
    attrs.CUSTOMER_C ??
    attrs.CUSTOMER_RESTO ??
    attrs.CustomersAffected ??
    attrs.customers_affected ??
    attrs.Customers ??
    0
  );

  const crewStatus = attrs.CREW_STATU ?? attrs.CrewStatus ?? attrs.crew_status ?? null;
  const etr = attrs.TIME_RESTO ?? attrs.EstimatedRestoreTime ?? attrs.ETR ?? attrs.etr ?? null;

  return {
    id: `cnx-${String(id)}`,
    source: "connexus",
    lat: lat != null && isFinite(lat) ? lat : null,
    lng: lng != null && isFinite(lng) ? lng : null,
    city: attrs.City ?? attrs.CITY ?? attrs.city ?? null,
    county: attrs.County ?? attrs.COUNTY ?? attrs.county ?? null,
    state: attrs.State ?? attrs.STATE ?? attrs.state ?? "MN",
    zipCode: attrs.Zip ?? attrs.ZIP ?? attrs.zip ?? null,
    customers,
    outageType: attrs.OutageType ?? attrs.outage_type ?? attrs.Type ?? "Known Electric Outage",
    cause: attrs.Cause ?? attrs.cause ?? null,
    etr,
    crewStatus,
    outageImpact:
      attrs.CRITICAL_C != null && Number(attrs.CRITICAL_C) > 0
        ? "Critical"
        : customers >= 100
          ? "Large"
          : customers >= 25
            ? "Medium"
            : "Small",
  };
}

function detectSchemaWarnings(features: any[]): string[] {
  const warnings: string[] = [];
  if (features.length === 0) return warnings;

  const sample = features[0]?.attributes || {};
  const knownFields = ["FID", "INCIDENT_I", "CUSTOMER_C", "X", "Y", "CREW_STATU", "TIME_RESTO"];
  const presentFields = Object.keys(sample);
  const missing = knownFields.filter(
    (f) => !presentFields.some((p) => p.toLowerCase() === f.toLowerCase())
  );
  if (missing.length > 0) {
    warnings.push(
      `Connexus schema may have changed — missing expected fields: ${missing.join(", ")}`
    );
  }
  return warnings;
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
    schemaWarnings.push(...detectSchemaWarnings(json.features));

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
