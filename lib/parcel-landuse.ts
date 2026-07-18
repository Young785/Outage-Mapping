/**
 * MetroGIS / MN Geospatial Commons parcel land-use lookup + R1/R2/R3-style targeting.
 *
 * Primary (reliable): MNGeo Plan Parcels Open FeatureServer
 * Fallback: Met Council LPH/Administrative_Parcels
 *
 * Docs:
 * https://metrocouncil.org/Data-and-Maps/MetroGIS.aspx
 * https://metrogis.org/how-do-i-get/parcel-data/
 * https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/FeatureServer
 *
 * Target allowlist ≈ residential 1–3 units (R1 / R2 / R3 style).
 */

export type ParcelAttrs = {
  COUNTY_PIN?: string | null;
  USECLASS1?: string | null;
  USECLASS2?: string | null;
  USECLASS3?: string | null;
  USECLASS4?: string | null;
  NUM_UNITS?: number | null;
  DWELL_TYPE?: string | null;
  ANUMBER?: number | string | null;
  ST_NAME?: string | null;
  ST_POS_TYP?: string | null;
  ZIP?: string | null;
  CO_NAME?: string | null;
  CTU_NAME?: string | null;
};

export type ParcelClassification = {
  isTargetResidential: boolean;
  excludeReason: string | null;
  useClassLabel: string;
  countyPin: string | null;
  numUnits: number | null;
  dwellType: string | null;
  streetAddress: string | null;
  attrs: ParcelAttrs;
};

export type ParcelLookupResult = {
  found: boolean;
  classification: ParcelClassification | null;
  source: "live" | "cache" | "unavailable";
  provider?: "mngeo" | "metc";
  error?: string;
};

/** Working statewide open parcels (verified HTTP 200 + feature hits). */
const MNGEO_PARCEL_QUERY =
  process.env.MNGEO_PARCEL_QUERY_URL ||
  "https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/FeatureServer/1/query";

/** Met Council MetroGIS regional parcels (can time out from some networks). */
const METC_PARCEL_QUERY =
  process.env.METROGIS_PARCEL_QUERY_URL ||
  "https://arcgis.metc.state.mn.us/arcgis/rest/services/LPH/Administrative_Parcels/FeatureServer/0/query";

const LOOKUP_TIMEOUT_MS = Number(process.env.METROGIS_LOOKUP_TIMEOUT_MS || 15000);

/** Explicit R1/R2/R3 (and close variants) in free-text use class / zoning notes. */
const R123_RE =
  /\b(?:r[\s\-]?[123]|residential[\s\-]?[123]|1[\s\-]?(?:to|-)[\s\-]?3\s*(?:unit|family)|single[\s\-]?family|duplex|two[\s\-]?family|triplex|three[\s\-]?family|1[\s\-]?(?:&|and)[\s\-]?3\s*family)\b/i;

const RESIDENTIAL_HINT =
  /\b(?:residen|dwell|home|house|homestead|townhome|townhouse|row\s*house)\b/i;

const EXCLUDE_HARD =
  /\b(?:commercial|industrial|retail|office|warehouse|manufactur|agricultur|farm|vacant\s*land|parking|utility|railroad|church|school|hospital|nursing\s*home|hotel|motel|apartment|apt\.?|condo(?:minium)?|cooperative|multi[\s\-]?family|4\+|four\s*\+|government|tax\s*exempt|cemetery|golf|airport|quarry|mining)\b/i;

function pickAttr(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (raw[k] != null && raw[k] !== "") return raw[k];
    const lower = k.toLowerCase();
    if (raw[lower] != null && raw[lower] !== "") return raw[lower];
    const upper = k.toUpperCase();
    if (raw[upper] != null && raw[upper] !== "") return raw[upper];
  }
  return null;
}

/** Normalize MetC (UPPER) and MNGeo (lower) attribute shapes. */
export function normalizeParcelAttrs(raw: Record<string, unknown> | null | undefined): ParcelAttrs {
  if (!raw) return {};
  const num = pickAttr(raw, "NUM_UNITS", "num_units");
  return {
    COUNTY_PIN: (pickAttr(raw, "COUNTY_PIN", "county_pin") as string | null) ?? null,
    USECLASS1: (pickAttr(raw, "USECLASS1", "useclass1") as string | null) ?? null,
    USECLASS2: (pickAttr(raw, "USECLASS2", "useclass2") as string | null) ?? null,
    USECLASS3: (pickAttr(raw, "USECLASS3", "useclass3") as string | null) ?? null,
    USECLASS4: (pickAttr(raw, "USECLASS4", "useclass4") as string | null) ?? null,
    NUM_UNITS: num != null && Number.isFinite(Number(num)) ? Number(num) : null,
    DWELL_TYPE: (pickAttr(raw, "DWELL_TYPE", "dwell_type") as string | null) ?? null,
    ANUMBER: (pickAttr(raw, "ANUMBER", "anumber") as number | string | null) ?? null,
    ST_NAME: (pickAttr(raw, "ST_NAME", "st_name") as string | null) ?? null,
    ST_POS_TYP: (pickAttr(raw, "ST_POS_TYP", "st_pos_typ") as string | null) ?? null,
    ZIP: (pickAttr(raw, "ZIP", "zip") as string | null) ?? null,
    CO_NAME: (pickAttr(raw, "CO_NAME", "co_name") as string | null) ?? null,
    CTU_NAME: (pickAttr(raw, "CTU_NAME", "ctu_name") as string | null) ?? null,
  };
}

function joinUseClasses(attrs: ParcelAttrs): string {
  return [attrs.USECLASS1, attrs.USECLASS2, attrs.USECLASS3, attrs.USECLASS4]
    .filter(Boolean)
    .join(" | ");
}

function buildStreetAddress(attrs: ParcelAttrs): string | null {
  const num = attrs.ANUMBER != null ? String(attrs.ANUMBER).trim() : "";
  const name = (attrs.ST_NAME || "").trim();
  const typ = (attrs.ST_POS_TYP || "").trim();
  const zip = (attrs.ZIP || "").trim();
  const city = (attrs.CTU_NAME || "").trim();
  const line = [num, name, typ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!line) return null;
  const tail = [city, zip ? `MN ${zip}` : "MN"].filter(Boolean).join(", ");
  return tail ? `${line}, ${tail}` : line;
}

/**
 * Classify parcel attributes for storm-chasing residential targeting.
 * Prefer NUM_UNITS when present (1–3 = target); otherwise USECLASS text heuristics.
 */
export function classifyParcelLandUse(attrs: ParcelAttrs): ParcelClassification {
  const useClassLabel = joinUseClasses(attrs) || (attrs.DWELL_TYPE || "").trim() || "unknown";
  const countyPin = attrs.COUNTY_PIN ? String(attrs.COUNTY_PIN) : null;
  const numUnits =
    attrs.NUM_UNITS != null && Number.isFinite(Number(attrs.NUM_UNITS))
      ? Number(attrs.NUM_UNITS)
      : null;
  const dwellType = attrs.DWELL_TYPE ? String(attrs.DWELL_TYPE) : null;
  const streetAddress = buildStreetAddress(attrs);
  const blob = `${useClassLabel} ${dwellType || ""}`.toLowerCase();

  if (numUnits != null && numUnits >= 1 && numUnits <= 3) {
    return {
      isTargetResidential: true,
      excludeReason: null,
      useClassLabel,
      countyPin,
      numUnits,
      dwellType,
      streetAddress,
      attrs,
    };
  }

  if (numUnits != null && numUnits >= 4) {
    return {
      isTargetResidential: false,
      excludeReason: `Multifamily (${numUnits} units) — outside R1/R2/R3 target`,
      useClassLabel,
      countyPin,
      numUnits,
      dwellType,
      streetAddress,
      attrs,
    };
  }

  if (R123_RE.test(blob)) {
    return {
      isTargetResidential: true,
      excludeReason: null,
      useClassLabel,
      countyPin,
      numUnits,
      dwellType,
      streetAddress,
      attrs,
    };
  }

  if (EXCLUDE_HARD.test(blob)) {
    return {
      isTargetResidential: false,
      excludeReason: `Non-target land use: ${useClassLabel}`,
      useClassLabel,
      countyPin,
      numUnits,
      dwellType,
      streetAddress,
      attrs,
    };
  }

  // Generic residential without unit count → treat as target (typical SF/duplex county labeling).
  if (RESIDENTIAL_HINT.test(blob)) {
    return {
      isTargetResidential: true,
      excludeReason: null,
      useClassLabel,
      countyPin,
      numUnits,
      dwellType,
      streetAddress,
      attrs,
    };
  }

  // Unknown / empty — do not auto-exclude (office can still add manually).
  return {
    isTargetResidential: true,
    excludeReason: null,
    useClassLabel: useClassLabel || "unknown",
    countyPin,
    numUnits,
    dwellType,
    streetAddress,
    attrs,
  };
}

function roundCoord(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

export function parcelCacheKey(lat: number, lng: number): { lat_round: number; lng_round: number } {
  return { lat_round: roundCoord(lat), lng_round: roundCoord(lng) };
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

type Provider = {
  id: "mngeo" | "metc";
  queryUrl: string;
  outFields: string;
};

const PROVIDERS: Provider[] = [
  {
    id: "mngeo",
    queryUrl: MNGEO_PARCEL_QUERY,
    outFields:
      "county_pin,useclass1,useclass2,useclass3,useclass4,num_units,dwell_type,anumber,st_name,st_pos_typ,zip,co_name,ctu_name",
  },
  {
    id: "metc",
    queryUrl: METC_PARCEL_QUERY,
    outFields:
      "COUNTY_PIN,USECLASS1,USECLASS2,USECLASS3,USECLASS4,NUM_UNITS,DWELL_TYPE,ANUMBER,ST_NAME,ST_POS_TYP,ZIP,CO_NAME,CTU_NAME",
  },
];

/** Tiny envelope around the point — more reliable than bare point hits on some layers. */
function envelopeGeometry(lat: number, lng: number, pad = 0.00015): string {
  return JSON.stringify({
    xmin: lng - pad,
    ymin: lat - pad,
    xmax: lng + pad,
    ymax: lat + pad,
    spatialReference: { wkid: 4326 },
  });
}

async function queryProvider(
  provider: Provider,
  lat: number,
  lng: number
): Promise<ParcelLookupResult> {
  const params = new URLSearchParams({
    f: "json",
    geometry: envelopeGeometry(lat, lng),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: provider.outFields,
    returnGeometry: "false",
    resultRecordCount: "1",
    orderByFields: provider.id === "mngeo" ? "objectid" : "OBJECTID",
  });

  try {
    const res = await fetchWithTimeout(`${provider.queryUrl}?${params}`, LOOKUP_TIMEOUT_MS);
    if (!res.ok) {
      return {
        found: false,
        classification: null,
        source: "unavailable",
        provider: provider.id,
        error: `${provider.id} HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      error?: { message?: string };
      features?: Array<{ attributes?: Record<string, unknown> }>;
    };
    if (data.error) {
      return {
        found: false,
        classification: null,
        source: "unavailable",
        provider: provider.id,
        error: data.error.message || `${provider.id} query error`,
      };
    }
    const raw = data.features?.[0]?.attributes;
    if (!raw) {
      return { found: false, classification: null, source: "live", provider: provider.id };
    }
    const attrs = normalizeParcelAttrs(raw);
    return {
      found: true,
      classification: classifyParcelLandUse(attrs),
      source: "live",
      provider: provider.id,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : `${provider.id} unreachable`;
    return {
      found: false,
      classification: null,
      source: "unavailable",
      provider: provider.id,
      error: msg,
    };
  }
}

/**
 * Live parcel lookup: MNGeo first (proven), then Met Council MetroGIS fallback.
 */
export async function lookupParcelAtLive(lat: number, lng: number): Promise<ParcelLookupResult> {
  let lastUnavailable: ParcelLookupResult | null = null;

  for (const provider of PROVIDERS) {
    const result = await queryProvider(provider, lat, lng);
    if (result.found && result.classification) return result;
    if (result.source === "live" && !result.found) {
      // Service up, no parcel at this location — try next provider before giving up.
      lastUnavailable = result;
      continue;
    }
    if (result.source === "unavailable") {
      lastUnavailable = result;
      continue;
    }
  }

  return (
    lastUnavailable || {
      found: false,
      classification: null,
      source: "unavailable",
      error: "No parcel provider returned data",
    }
  );
}
