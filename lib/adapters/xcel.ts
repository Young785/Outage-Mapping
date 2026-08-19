/**
 * Xcel Energy ArcGIS Adapter
 *
 * Live data source (NOT the public HTML map):
 *   https://emcs-gis.esriemcs.com/arcgis/rest/services/Xcel/XcelOutage/MapServer/3
 *
 * Cosmetic changes to Xcel's customer-facing map do not affect this adapter.
 * If Xcel changes their schema, fix ONE place: normalizeXcelFeature().
 *
 * As of Aug 2026 the Outages layer still returns point geometry + customers.
 * Planned vs unplanned is in `cause` ("Planned" / "Unplanned"); `outagetype`
 * is often just "Outage". The public map's lightning-bolt / wrench icons are
 * a UI legend on top of this same feed (plus SpecialEvents / PSPS layers we
 * do not ingest).
 */

import type { AdapterResult, NormalizedOutage } from "./types";
import { isValidMapCoordinate } from "../storm-outage";

const XCEL_URL =
  process.env.XCEL_ARCGIS_URL ||
  "https://emcs-gis.esriemcs.com/arcgis/rest/services/Xcel/XcelOutage/MapServer/3/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json";

const WEB_MERCATOR_MAX = 20037508.34;

function webMercatorToLonLat(x: number, y: number): { lng: number; lat: number } {
  const lng = (x / WEB_MERCATOR_MAX) * 180;
  let lat = (y / WEB_MERCATOR_MAX) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  return { lat, lng };
}

function asWgs84(lat: number | null, lng: number | null, latlong?: unknown): {
  lat: number | null;
  lng: number | null;
} {
  if (isValidMapCoordinate(lat, lng)) return { lat: Number(lat), lng: Number(lng) };

  // Geometry still in Web Mercator if outSR was ignored (x=easting, y=northing).
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      const converted = webMercatorToLonLat(lng, lat);
      if (isValidMapCoordinate(converted.lat, converted.lng)) return converted;
    }
  }

  if (latlong) {
    const parts = String(latlong).split(",").map((p) => parseFloat(p.trim()));
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      const [a, b] = parts;
      // Observed Xcel latlong is "northing,easting" in Web Mercator, not WGS84.
      if (Math.abs(a) > 90 || Math.abs(b) > 180) {
        const converted = webMercatorToLonLat(b, a);
        if (isValidMapCoordinate(converted.lat, converted.lng)) return converted;
      }
      if (isValidMapCoordinate(a, b)) return { lat: a, lng: b };
    }
  }

  return { lat: null, lng: null };
}

function normalizeOutageType(rawType: unknown, cause: unknown): string {
  const type = String(rawType ?? "").trim();
  const c = String(cause ?? "").trim();
  if (/^planned$/i.test(c) && !/planned/i.test(type)) return "Planned Outage";
  if (/^unplanned$/i.test(c) && !/unplanned/i.test(type)) return "Unplanned Outage";
  return type || "Outage";
}

export function normalizeXcelFeature(raw: any): NormalizedOutage {
  const attrs = raw?.attributes || {};
  const geom = raw?.geometry || {};
  const { lat, lng } = asWgs84(
    geom.y != null ? Number(geom.y) : null,
    geom.x != null ? Number(geom.x) : null,
    attrs.latlong ?? attrs.latLong
  );

  const id =
    attrs.objectid ??
    attrs.OBJECTID ??
    attrs.globalid ??
    attrs.id ??
    `xcel-${Math.random().toString(36).slice(2, 10)}`;

  const cause = attrs.cause ?? attrs.CAUSE ?? null;

  return {
    id: String(id),
    source: "xcel",
    lat,
    lng,
    city: attrs.city ?? attrs.CITY ?? attrs.municipality ?? null,
    county: attrs.county ?? attrs.COUNTY ?? null,
    state: attrs.states ?? attrs.state ?? attrs.STATES ?? attrs.STATE ?? null,
    zipCode: attrs.zip ?? attrs.ZIP ?? attrs.postal_code ?? null,
    // Unknown/missing counts still show as 1 so map dots are labeled.
    customers: Math.max(
      1,
      Number(attrs.customers ?? attrs.CUSTOMERS ?? attrs.customersAffected ?? attrs.CustomersAffected ?? 0) || 1
    ),
    outageType: normalizeOutageType(attrs.outagetype ?? attrs.OUTAGE_TYPE ?? attrs.type, cause),
    cause,
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
      .filter((o: NormalizedOutage) => isValidMapCoordinate(o.lat, o.lng));

    console.log(`[xcel] Normalized ${outages.length} valid outages`);
    return { outages, rawData, source: "xcel", fetchedAt, error: null, schemaWarnings };
  } catch (err: any) {
    const msg = `Xcel data fetch failed: ${err?.message ?? "Unknown error"}`;
    console.error("[xcel]", msg);
    return { outages: [], rawData, source: "xcel", fetchedAt, error: msg, schemaWarnings };
  }
}
