/**
 * Operational routing pipeline — filters before scoring.
 *
 * Hierarchy: Territory → Role → Exclusions → Scoring → Distance tie-break
 */

import {
  calculateV1RouteScore,
  computeClusterMap,
  type StormPhase,
} from "./routing-v1";
import { pickSimpleRouteStop } from "./routing-simple";
import type { RoutingMode } from "./routing-mode";
import { isRoutingExcluded, type FieldVisitCache } from "./field-visit";
import {
  DEFAULT_DISPATCH_ROLE,
  DEFAULT_INSTALLER_FALLBACK,
  type FieldDispatchRole,
  type InstallerFallback,
} from "./field-dispatch-role";
import { isInTerritory, type TerritoryDefinition } from "./territory-match";
import { isEligibleForRole, roleFallbackChain } from "./routing-eligibility";
import { haversineMiles } from "./priority";

export type PipelineMarker = {
  id: number | string;
  lat: number;
  lng: number;
  status: string;
  customers: number;
  priorityScore?: number;
  source?: string;
  isNew?: boolean;
  investigationResult?: string;
  powerOnLineDrop?: boolean;
  inPriorityZone?: boolean;
  inExclusionZone?: boolean;
  isHoneyHole?: boolean;
  zipCode?: string | null;
  isStaleMarker?: boolean;
  noContactMade?: boolean;
  needsReturnTrip?: boolean;
};

export type RoutingContext = {
  dispatchRole?: FieldDispatchRole;
  installerFallback?: InstallerFallback;
  territory?: TerritoryDefinition | null;
  hideStaleMarkers?: boolean;
  tempOutMode?: boolean;
};

function passesBaseExclusions<T extends PipelineMarker>(
  item: T,
  visits: Record<string, FieldVisitCache>,
  hideStaleMarkers: boolean
): boolean {
  if (isRoutingExcluded(item, visits)) return false;
  if (item.inExclusionZone) return false;
  if (hideStaleMarkers && item.isStaleMarker) return false;
  if (item.investigationResult === "not_target") return false;
  return true;
}

function filterByTerritory<T extends PipelineMarker>(
  items: T[],
  territory?: TerritoryDefinition | null
): T[] {
  if (!territory) return items;
  return items.filter((o) => isInTerritory(o, territory));
}

function filterByRole<T extends PipelineMarker>(items: T[], role: FieldDispatchRole): T[] {
  return items.filter((o) => isEligibleForRole(o, role));
}

/** Apply operational filters and resolve role fallbacks. */
export function buildEligiblePool<T extends PipelineMarker>(
  items: T[],
  visits: Record<string, FieldVisitCache>,
  context: RoutingContext = {}
): T[] {
  const role = context.dispatchRole ?? DEFAULT_DISPATCH_ROLE;
  const fallback = context.installerFallback ?? DEFAULT_INSTALLER_FALLBACK;
  const hideStale = context.hideStaleMarkers ?? false;

  const base = items.filter((o) => passesBaseExclusions(o, visits, hideStale));
  const inTerritory = filterByTerritory(base, context.territory);

  for (const tryRole of roleFallbackChain(role, fallback)) {
    const pool = filterByRole(inTerritory, tryRole);
    if (pool.length > 0) return pool;
  }

  return [];
}

/** Score-ranked pick with distance tie-break when scores are close. */
export function pickFromEligiblePool<T extends PipelineMarker>(
  pool: T[],
  userLocation: { lat: number; lng: number },
  phase: StormPhase,
  mode: RoutingMode,
  options: { tempOutMode?: boolean; dispatchRole?: RoutingContext["dispatchRole"] } = {}
): T | null {
  if (!pool.length) return null;

  if (mode === "simple") {
    return pickSimpleRouteStop(pool, userLocation, {}, {
      tempOutMode: options.tempOutMode,
      dispatchRole: options.dispatchRole,
    });
  }

  const clusterMap = computeClusterMap(pool);
  let bestScore = -Infinity;
  const scoreById = new Map<string, number>();
  const scoreOpts = { tempOutMode: options.tempOutMode, dispatchRole: options.dispatchRole };

  for (const o of pool) {
    const miles = haversineMiles(userLocation.lat, userLocation.lng, o.lat, o.lng);
    const { total } = calculateV1RouteScore({ ...o, driveMiles: miles }, phase, clusterMap.get(String(o.id)), scoreOpts);
    scoreById.set(String(o.id), total);
    if (total > bestScore) bestScore = total;
  }

  const threshold = bestScore * 0.95;
  const topTier = pool.filter((o) => (scoreById.get(String(o.id)) ?? 0) >= threshold);

  let nearest: T | null = null;
  let nearestMiles = Infinity;
  for (const o of topTier) {
    const miles = haversineMiles(userLocation.lat, userLocation.lng, o.lat, o.lng);
    if (miles < nearestMiles) {
      nearestMiles = miles;
      nearest = o;
    }
  }

  return nearest;
}
