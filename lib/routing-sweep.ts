/**
 * V1 Territory Sweep / Pac-Man routing — reliable field routing for live storms.
 *
 * Territory + Role + nearby-first radii + red-dot priority + customer-count tiers.
 * Not AI-style global scoring.
 */

import type { FieldDispatchRole, InstallerFallback } from "./field-dispatch-role";
import { DEFAULT_DISPATCH_ROLE, DEFAULT_INSTALLER_FALLBACK } from "./field-dispatch-role";
import { isEligibleForRole, roleFallbackChain } from "./routing-eligibility";
import { isRoutingExcluded, type FieldVisitCache } from "./field-visit";
import { isInTerritory, type TerritoryDefinition } from "./territory-match";
import { isDelayedUtilityConfirmed } from "./utility-outage";
import { haversineMiles } from "./priority";
import type { StormPhase } from "./routing-v1";

/** Outages above this count are omitted from the map and routing. */
export const MAX_MAP_CUSTOMERS = 10;

/** Hunters only route 7–10 customer dots in phase 3. */
export const PHASE3_CUSTOMER_MIN = 7;

export const SWEEP_RADII_MILES = [0.25, 0.5, 1.0] as const;

/** Soft dispersion — prefer a different area when another tech is this close. */
export const PEER_AVOIDANCE_MILES = 0.35;

const OFFICE_SOURCES = new Set(["office", "manual", "user", "self_generated", "crm", "housecall"]);
const ARCGIS_SOURCES = new Set(["xcel", "connexus", "arcgis"]);

export type SweepMarker = {
  id: number | string;
  lat: number;
  lng: number;
  status: string;
  customers: number;
  source?: string;
  investigationResult?: string;
  inExclusionZone?: boolean;
  isStaleMarker?: boolean;
  noContactMade?: boolean;
  needsReturnTrip?: boolean;
  firstSeenAt?: string | null;
  assignedTechName?: string | null;
};

export type SweepContext = {
  dispatchRole?: FieldDispatchRole;
  installerFallback?: InstallerFallback;
  territory?: TerritoryDefinition | null;
  hideStaleMarkers?: boolean;
  stormPhase?: StormPhase;
  stormStartedAt?: string | null;
  currentTechName?: string | null;
  peerTechLocations?: Array<{ lat: number; lng: number }>;
};

export function exceedsMapCustomerCap(customers: number | undefined | null): boolean {
  return (customers ?? 0) > MAX_MAP_CUSTOMERS;
}

function passesExclusions<T extends SweepMarker>(
  item: T,
  visits: Record<string, FieldVisitCache>,
  ctx: SweepContext
): boolean {
  if (exceedsMapCustomerCap(item.customers)) return false;
  if (isRoutingExcluded(item, visits)) return false;
  if (item.inExclusionZone) return false;
  if (ctx.hideStaleMarkers && item.isStaleMarker) return false;
  if (item.investigationResult === "not_target") return false;
  if (
    item.assignedTechName &&
    ctx.currentTechName &&
    item.assignedTechName.trim().toLowerCase() !== ctx.currentTechName.trim().toLowerCase()
  ) {
    return false;
  }
  return true;
}

function isUnvisitedArcGIS(item: SweepMarker): boolean {
  return (
    (item.status === "unvisited" || item.status === "investigating") &&
    !!(item.source && ARCGIS_SOURCES.has(item.source))
  );
}

function isOfficeLead(item: SweepMarker): boolean {
  return !!(item.source && OFFICE_SOURCES.has(item.source));
}

/** Lower tier number = higher routing priority within a role. */
export function priorityTier(item: SweepMarker, role: FieldDispatchRole, ctx: SweepContext): number {
  const phase = ctx.stormPhase ?? "phase_1";
  const customers = Math.max(1, item.customers ?? 1);

  switch (role) {
    case "hunter": {
      if (isDelayedUtilityConfirmed(item, ctx.stormStartedAt)) return 1;
      if (isUnvisitedArcGIS(item)) {
        if (customers === 1) return 2;
        if (customers <= 3) return 3;
        if (customers <= 6) return 4;
        if (customers <= MAX_MAP_CUSTOMERS) return phase === "phase_3" ? 5 : 99;
      }
      if (item.status === "unvisited" || item.status === "investigating") return 6;
      return 50;
    }
    case "seller": {
      if (item.status === "opportunity") return item.noContactMade ? 1 : 2;
      if (isOfficeLead(item) && (item.status === "unvisited" || item.status === "investigating")) return 3;
      if (item.status === "door_hanger") return 4;
      if (item.status === "customer_thinking") return 8;
      return 50;
    }
    case "installer": {
      if (item.status === "sold" || item.status === "wants_to_proceed") return 1;
      if (item.status === "job_started") return 2;
      return 50;
    }
    case "finisher": {
      if (item.needsReturnTrip) return 1;
      if (item.status === "temp_power") return 2;
      if (item.status === "grounding") return 3;
      if (item.status === "job_started") return 4;
      return 50;
    }
    default:
      return 50;
  }
}

function buildPool<T extends SweepMarker>(
  items: T[],
  visits: Record<string, FieldVisitCache>,
  ctx: SweepContext
): T[] {
  const role = ctx.dispatchRole ?? DEFAULT_DISPATCH_ROLE;
  const fallback = ctx.installerFallback ?? DEFAULT_INSTALLER_FALLBACK;
  const base = items.filter((o) => passesExclusions(o, visits, ctx));
  const inTerritory = ctx.territory ? base.filter((o) => isInTerritory(o, ctx.territory!)) : base;

  for (const tryRole of roleFallbackChain(role, fallback)) {
    const pool = inTerritory.filter((o) => isEligibleForRole(o, tryRole));
    const routable = pool.filter((o) => priorityTier(o, tryRole, ctx) < 99);
    if (routable.length > 0) return routable;
  }

  if (ctx.territory) {
    for (const tryRole of roleFallbackChain(role, fallback)) {
      const pool = base.filter((o) => isEligibleForRole(o, tryRole));
      const routable = pool.filter((o) => priorityTier(o, tryRole, ctx) < 99);
      if (routable.length > 0) return routable;
    }
  }

  return [];
}

function isNearPeer(lat: number, lng: number, peers: Array<{ lat: number; lng: number }>): boolean {
  return peers.some((p) => haversineMiles(lat, lng, p.lat, p.lng) < PEER_AVOIDANCE_MILES);
}

function pickBestInCandidates<T extends SweepMarker>(
  candidates: T[],
  userLocation: { lat: number; lng: number },
  role: FieldDispatchRole,
  ctx: SweepContext
): T | null {
  if (!candidates.length) return null;

  const peers = ctx.peerTechLocations ?? [];
  let working = candidates;

  if (peers.length > 0) {
    const spread = working.filter((o) => !isNearPeer(o.lat, o.lng, peers));
    if (spread.length > 0) working = spread;
  }

  let bestTier = Infinity;
  for (const o of working) {
    const t = priorityTier(o, role, ctx);
    if (t < bestTier) bestTier = t;
  }

  const topTier = working.filter((o) => priorityTier(o, role, ctx) === bestTier);

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

/**
 * Pac-Man sweep: search nearby radii first, then the rest of the eligible pool.
 */
export function pickSweepRouteStop<T extends SweepMarker>(
  items: T[],
  userLocation: { lat: number; lng: number },
  visits: Record<string, FieldVisitCache> = {},
  ctx: SweepContext = {}
): T | null {
  const pool = buildPool(items, visits, ctx);
  if (!pool.length) return null;

  const role = ctx.dispatchRole ?? DEFAULT_DISPATCH_ROLE;

  for (const radius of SWEEP_RADII_MILES) {
    const inRadius = pool.filter(
      (o) => haversineMiles(userLocation.lat, userLocation.lng, o.lat, o.lng) <= radius
    );
    const pick = pickBestInCandidates(inRadius, userLocation, role, ctx);
    if (pick) return pick;
  }

  return pickBestInCandidates(pool, userLocation, role, ctx);
}

/** Top N recommended stops for office preview / manual reorder baseline. */
export function pickSweepRouteStops<T extends SweepMarker>(
  items: T[],
  userLocation: { lat: number; lng: number },
  visits: Record<string, FieldVisitCache> = {},
  ctx: SweepContext = {},
  limit = 5
): T[] {
  const results: T[] = [];
  const usedIds = new Set<string>();
  let simLoc = { ...userLocation };
  let simItems = [...items];

  for (let i = 0; i < limit; i++) {
    const next = pickSweepRouteStop(simItems, simLoc, visits, ctx);
    if (!next) break;
    results.push(next);
    usedIds.add(String(next.id));
    simLoc = { lat: next.lat, lng: next.lng };
    simItems = simItems.filter((o) => !usedIds.has(String(o.id)));
  }

  return results;
}

/** Greedy Pac-Man sweep through every eligible stop on the map (nearest-first by tier). */
export function pickFullMapSweepStops<T extends SweepMarker>(
  items: T[],
  userLocation: { lat: number; lng: number },
  visits: Record<string, FieldVisitCache> = {},
  ctx: SweepContext = {},
  maxStops = 100
): T[] {
  return pickSweepRouteStops(items, userLocation, visits, ctx, Math.max(1, maxStops));
}
