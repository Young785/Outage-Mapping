/**
 * Shared map-marker eligibility for routing APIs.
 * Mirrors the core visibility rules from the office map (exclusions, planned events, etc.).
 */

import { isPermanentlyExcluded, type ExcludedProperty } from "./excluded-properties";
import { exceedsMapCustomerCap } from "./routing-sweep";
import { isPlannedUtilityEvent, isValidMapCoordinate } from "./storm-outage";
import { isInBoundaryZone, zoneTypeOf, type BoundaryZoneLike } from "./territory-match";

export type MapEligibleOutage = {
  lat?: number | null;
  lng?: number | null;
  street_address?: string | null;
  streetAddress?: string | null;
  customers?: number | null;
  source?: string | null;
  cause?: string | null;
  outage_type?: string | null;
  outageType?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  is_simulation?: boolean | null;
  investigation_result?: string | null;
  investigationResult?: string | null;
};

export type MapEligibilityContext = {
  excludedProperties?: ExcludedProperty[];
  exclusionZones?: BoundaryZoneLike[];
};

/** Base eligibility — coordinates, active status, customer cap, planned events. */
export function isBaseMapVisibleOutage(o: MapEligibleOutage): boolean {
  if (o.is_active === false) return false;
  if (!isValidMapCoordinate(o.lat, o.lng)) return false;
  if (o.status === "no_opportunity" || o.status === "completed") return false;
  if (isPlannedUtilityEvent({ cause: o.cause, outageType: o.outage_type ?? o.outageType, source: o.source })) {
    return false;
  }
  if (!o.is_simulation && exceedsMapCustomerCap(o.customers)) return false;
  return true;
}

/** Full routing eligibility — base rules plus permanent exclusions and polygon exclusion zones. */
export function isRoutingMapVisibleOutage(
  o: MapEligibleOutage,
  ctx: MapEligibilityContext = {}
): boolean {
  if (!isBaseMapVisibleOutage(o)) return false;

  const inv = o.investigation_result ?? o.investigationResult;
  if (inv === "not_target" || inv === "underground_service") return false;

  const lat = Number(o.lat);
  const lng = Number(o.lng);
  const addr = o.street_address ?? o.streetAddress ?? null;

  if (ctx.excludedProperties?.length) {
    if (isPermanentlyExcluded({ lat, lng, streetAddress: addr }, ctx.excludedProperties)) {
      return false;
    }
  }

  if (ctx.exclusionZones?.length) {
    for (const zone of ctx.exclusionZones) {
      if (zoneTypeOf(zone) === "exclusion" && isInBoundaryZone({ lat, lng }, zone)) {
        return false;
      }
    }
  }

  return true;
}
