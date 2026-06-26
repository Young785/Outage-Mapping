/** Shared territory matching — zip codes and polygon boundaries. */

export type TerritoryDefinition = {
  zipCodes?: string[] | null;
  /** GeoJSON polygon rings: [ring][point][lng, lat] */
  polygonRings?: number[][][] | null;
};

export type Locatable = {
  lat: number;
  lng: number;
  zipCode?: string | null;
};

/** Ray-casting point-in-polygon for a single outer ring. */
export function pointInPolygon(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function normalizeZip(zip?: string | null): string | null {
  if (!zip) return null;
  const digits = zip.replace(/\D/g, "").slice(0, 5);
  return digits.length === 5 ? digits : null;
}

/** True when no territory constraints are configured. */
export function isTerritoryUnrestricted(territory?: TerritoryDefinition | null): boolean {
  if (!territory) return true;
  const hasZips = (territory.zipCodes?.length ?? 0) > 0;
  const hasPoly = (territory.polygonRings?.length ?? 0) > 0;
  return !hasZips && !hasPoly;
}

/** Marker is in territory when it matches zip OR falls inside a polygon ring. */
export function isInTerritory(item: Locatable, territory?: TerritoryDefinition | null): boolean {
  if (isTerritoryUnrestricted(territory)) return true;

  const zips = territory!.zipCodes ?? [];
  if (zips.length > 0) {
    const itemZip = normalizeZip(item.zipCode);
    if (itemZip && zips.includes(itemZip)) return true;
  }

  const rings = territory!.polygonRings ?? [];
  for (const ring of rings) {
    if (ring.length >= 3 && pointInPolygon(item.lat, item.lng, ring)) return true;
  }

  // Zip-only territory with no zip on marker → not in territory.
  // Polygon-only territory already checked above.
  if (zips.length > 0 && rings.length === 0) return false;
  if (rings.length > 0) return false;
  return true;
}

export type BoundaryZoneLike = {
  type?: "zip" | "polygon" | null;
  zip_codes?: string[] | null;
  geometry?: {
    coordinates?: number[][][];
    properties?: { zoneType?: "territory" | "priority" | "exclusion" };
  } | null;
};

export type ZoneType = "territory" | "priority" | "exclusion";

/** Zone classification stored in geometry.properties.zoneType (defaults to territory). */
export function zoneTypeOf(zone: BoundaryZoneLike): ZoneType {
  const t = zone.geometry?.properties?.zoneType;
  if (t === "priority" || t === "exclusion") return t;
  return "territory";
}

/** Only plain territory zones may be assigned to technicians. */
export function isAssignableTerritory(zone: BoundaryZoneLike): boolean {
  return zoneTypeOf(zone) === "territory";
}

/** True when a location falls inside a zip list or polygon boundary. */
export function isInBoundaryZone(item: Locatable, zone: BoundaryZoneLike): boolean {
  if (zone.type === "zip") {
    const zips = zone.zip_codes ?? [];
    if (zips.length === 0) return false;
    const itemZip = normalizeZip(item.zipCode);
    return itemZip ? zips.includes(itemZip) : false;
  }

  const ring = zone.geometry?.coordinates?.[0];
  if (!ring || ring.length < 3) return false;
  return pointInPolygon(item.lat, item.lng, ring);
}

/** Build territory definition from a territories table row. */
export function territoryFromRow(row: {
  zip_codes?: string[] | null;
  geometry?: { coordinates?: number[][][] } | null;
}): TerritoryDefinition {
  const rings = row.geometry?.coordinates ?? null;
  return {
    zipCodes: row.zip_codes ?? null,
    polygonRings: rings,
  };
}

type TerritoryRow = {
  id: string;
  type?: "zip" | "polygon" | null;
  zip_codes?: string[] | null;
  geometry?: {
    coordinates?: number[][][];
    properties?: { zoneType?: "territory" | "priority" | "exclusion" };
  } | null;
};

/** Territory ids whose zip or polygon constraints match the target location (assignable territories only). */
export function findTerritoriesForLocation(
  item: Locatable,
  territories: TerritoryRow[]
): string[] {
  return territories
    .filter((t) => isAssignableTerritory(t))
    .filter((t) => isInTerritory(item, territoryFromRow(t)))
    .map((t) => t.id);
}
