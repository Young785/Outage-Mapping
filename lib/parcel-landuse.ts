/**
 * MetroGIS regional parcel land-use lookup + R1/R2/R3-style residential targeting.
 *
 * Data: Metropolitan Council / MetroGIS Administrative Parcels FeatureServer
 * (USECLASS1–4, NUM_UNITS, DWELL_TYPE). See:
 * https://metrocouncil.org/Data-and-Maps/MetroGIS.aspx
 * https://metrogis.org/how-do-i-get/parcel-data/
 *
 * Target allowlist ≈ residential 1–3 units (R1 single-family, R2 duplex, R3 triplex).
 * Non-residential / larger multifamily → auto-exclude candidates.
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
  error?: string;
};

const METROGIS_PARCEL_QUERY =
  process.env.METROGIS_PARCEL_QUERY_URL ||
  "https://arcgis.metc.state.mn.us/arcgis/rest/services/LPH/Administrative_Parcels/FeatureServer/0/query";

const LOOKUP_TIMEOUT_MS = Number(process.env.METROGIS_LOOKUP_TIMEOUT_MS || 12000);

/** Explicit R1/R2/R3 (and close variants) in free-text use class / zoning notes. */
const R123_RE = /\b(?:r[\s\-]?[123]|residential[\s\-]?[123]|1[\s\-]?(?:to|-)[\s\-]?3\s*(?:unit|family)|single[\s\-]?family|duplex|two[\s\-]?family|triplex|three[\s\-]?family|1[\s\-]?(?:&|and)[\s\-]?3\s*family)\b/i;

const RESIDENTIAL_HINT =
  /\b(?:residen|dwell|home|house|homestead|townhome|townhouse|row\s*house|condo(?:minium)?)\b/i;

const EXCLUDE_HARD =
  /\b(?:commercial|industrial|retail|office|warehouse|manufactur|agricultur|farm|vacant\s*land|parking|utility|railroad|church|school|hospital|hotel|motel|apartment|apt\.?|multi[\s\-]?family|4\+|four\s*\+|condo\s*complex|government|tax\s*exempt|cemetery|golf|airport|quarry|mining)\b/i;

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
 * Classify MetroGIS parcel attributes for storm-chasing residential targeting.
 * Prefer NUM_UNITS when present; otherwise USECLASS / DWELL_TYPE text heuristics.
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

  if (EXCLUDE_HARD.test(blob) && !R123_RE.test(blob)) {
    // Apartments / commercial / industrial always out unless clearly R1–R3 wording.
    if (/\b(?:apartment|apt\.?|commercial|industrial|retail|office|warehouse)\b/i.test(blob)) {
      return {
        isTargetResidential: false,
        excludeReason: `Non-target land use: ${useClassLabel || "excluded class"}`,
        useClassLabel,
        countyPin,
        numUnits,
        dwellType,
        streetAddress,
        attrs,
      };
    }
  }

  if (numUnits != null) {
    if (numUnits >= 1 && numUnits <= 3) {
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
    if (numUnits >= 4) {
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

  // Generic "Residential" without unit count → treat as target (likely SF/duplex in county data).
  if (RESIDENTIAL_HINT.test(blob) && !/\b(?:apartment|apt\.?|multi)\b/i.test(blob)) {
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

/** Live point-in-parcel query against MetroGIS FeatureServer. */
export async function lookupParcelAtLive(lat: number, lng: number): Promise<ParcelLookupResult> {
  const params = new URLSearchParams({
    f: "json",
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields:
      "COUNTY_PIN,USECLASS1,USECLASS2,USECLASS3,USECLASS4,NUM_UNITS,DWELL_TYPE,ANUMBER,ST_NAME,ST_POS_TYP,ZIP,CO_NAME,CTU_NAME",
    returnGeometry: "false",
    resultRecordCount: "1",
  });

  try {
    const res = await fetchWithTimeout(`${METROGIS_PARCEL_QUERY}?${params}`, LOOKUP_TIMEOUT_MS);
    if (!res.ok) {
      return {
        found: false,
        classification: null,
        source: "unavailable",
        error: `MetroGIS HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      error?: { message?: string };
      features?: Array<{ attributes?: ParcelAttrs }>;
    };
    if (data.error) {
      return {
        found: false,
        classification: null,
        source: "unavailable",
        error: data.error.message || "MetroGIS query error",
      };
    }
    const attrs = data.features?.[0]?.attributes;
    if (!attrs) {
      return { found: false, classification: null, source: "live" };
    }
    return {
      found: true,
      classification: classifyParcelLandUse(attrs),
      source: "live",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "MetroGIS unreachable";
    return { found: false, classification: null, source: "unavailable", error: msg };
  }
}
