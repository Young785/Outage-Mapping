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
import { calculateSimpleRouteScore } from "./routing-simple";
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
import { isDelayedUtilityConfirmed } from "./utility-outage";
import { isPlannedUtilityEvent, isValidMapCoordinate } from "./storm-outage";

export type PipelineMarker = {
  id: number | string;
  lat: number;
  lng: number;
  status: string;
  customers: number;
  priorityScore?: number;
  source?: string;
  cause?: string | null;
  outageType?: string | null;
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
  firstSeenAt?: string | null;
  assignedTechName?: string | null;
};

export type RoutingContext = {
  dispatchRole?: FieldDispatchRole;
  installerFallback?: InstallerFallback;
  territory?: TerritoryDefinition | null;
  hideStaleMarkers?: boolean;
  tempOutMode?: boolean;
  /** Other tech GPS positions — used to spread crews and avoid clustering. */
  peerTechLocations?: Array<{ lat: number; lng: number }>;
  stormStartedAt?: string | null;
  currentTechName?: string | null;
  stormPhase?: StormPhase;
};

const PEER_AVOIDANCE_MILES = 0.4;

function passesBaseExclusions<T extends PipelineMarker>(
  item: T,
  visits: Record<string, FieldVisitCache>,
  hideStaleMarkers: boolean,
  currentTechName?: string | null
): boolean {
  if (!isValidMapCoordinate(item.lat, item.lng)) return false;
  if (isPlannedUtilityEvent(item)) return false;
  if (isRoutingExcluded(item, visits)) return false;
  if (item.inExclusionZone) return false;
  if (hideStaleMarkers && item.isStaleMarker) return false;
  if (item.investigationResult === "not_target" || item.investigationResult === "underground_service") return false;
  // Skip stops already assigned to another technician — prevents duplicate routing.
  if (
    item.assignedTechName &&
    currentTechName &&
    item.assignedTechName.trim().toLowerCase() !== currentTechName.trim().toLowerCase()
  ) {
    return false;
  }
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

  const base = items.filter((o) =>
    passesBaseExclusions(o, visits, hideStale, context.currentTechName)
  );
  const inTerritory = filterByTerritory(base, context.territory);

  for (const tryRole of roleFallbackChain(role, fallback)) {
    const pool = filterByRole(inTerritory, tryRole);
    if (pool.length > 0) return pool;
  }

  // Territory fallback: when assigned zone has no eligible stops, use closest eligible marker globally.
  if (context.territory) {
    for (const tryRole of roleFallbackChain(role, fallback)) {
      const pool = filterByRole(base, tryRole);
      if (pool.length > 0) return pool;
    }
  }

  return [];
}

function delayedUtilityBonus<T extends PipelineMarker>(
  item: T,
  stormStartedAt?: string | null
): number {
  if (isDelayedUtilityConfirmed(item, stormStartedAt)) return 200;
  if (
    (item.status === "unvisited" || item.status === "investigating") &&
    item.source &&
    ["xcel", "connexus", "arcgis"].includes(item.source)
  ) {
    return 40;
  }
  return 0;
}

function isNearPeerTech(
  lat: number,
  lng: number,
  peers: Array<{ lat: number; lng: number }>
): boolean {
  return peers.some(
    (p) => haversineMiles(lat, lng, p.lat, p.lng) < PEER_AVOIDANCE_MILES
  );
}

/** Score-ranked pick with distance tie-break when scores are close. */
export function pickFromEligiblePool<T extends PipelineMarker>(
  pool: T[],
  userLocation: { lat: number; lng: number },
  phase: StormPhase,
  mode: RoutingMode,
  options: {
    tempOutMode?: boolean;
    dispatchRole?: RoutingContext["dispatchRole"];
    peerTechLocations?: Array<{ lat: number; lng: number }>;
    stormStartedAt?: string | null;
  } = {}
): T | null {
  if (!pool.length) return null;

  const peers = options.peerTechLocations ?? [];

  if (mode === "simple") {
    let best: T | null = null;
    let bestScore = -Infinity;
    for (const o of pool) {
      const miles = haversineMiles(userLocation.lat, userLocation.lng, o.lat, o.lng);
      const { total } = calculateSimpleRouteScore(o, miles, {
        tempOutMode: options.tempOutMode,
        dispatchRole: options.dispatchRole,
      });
      const utilityBonus = delayedUtilityBonus(o, options.stormStartedAt);
      const peerPenalty = isNearPeerTech(o.lat, o.lng, peers) ? 35 : 0;
      const score = total + utilityBonus - peerPenalty;
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  const clusterMap = computeClusterMap(pool);
  let bestScore = -Infinity;
  const scoreById = new Map<string, number>();
  const scoreOpts = { tempOutMode: options.tempOutMode, dispatchRole: options.dispatchRole };

  for (const o of pool) {
    const miles = haversineMiles(userLocation.lat, userLocation.lng, o.lat, o.lng);
    const { total } = calculateV1RouteScore({ ...o, driveMiles: miles }, phase, clusterMap.get(String(o.id)), scoreOpts);
    const utilityBonus = delayedUtilityBonus(o, options.stormStartedAt);
    const peerPenalty = isNearPeerTech(o.lat, o.lng, peers) ? 45 : 0;
    const combined = total + utilityBonus - peerPenalty;
    scoreById.set(String(o.id), combined);
    if (combined > bestScore) bestScore = combined;
  }

  const threshold = bestScore * 0.95;
  let topTier = pool.filter((o) => (scoreById.get(String(o.id)) ?? 0) >= threshold);

  // Spread techs: prefer stops away from other crews when alternatives exist.
  if (peers.length > 0) {
    const spread = topTier.filter((o) => !isNearPeerTech(o.lat, o.lng, peers));
    if (spread.length > 0) topTier = spread;
  }

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
