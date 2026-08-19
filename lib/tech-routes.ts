/**
 * Manual String Routing helpers — per-technician ordered stop lists.
 */

import { haversineMiles } from "./priority";

export type TechRouteStopRow = {
  tech_user_id: string;
  outage_id: string;
  sort_order: number;
};

export type RouteStopDetail = {
  outageId: string;
  sortOrder: number;
  lat: number;
  lng: number;
  address: string | null;
  customers: number;
  source: string | null;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  priorityScore: number;
};

export type RouteControl = "auto" | "manual";

export type TechRouteBundle = {
  techUserId: string;
  techName: string;
  mapColor: string | null;
  status: string;
  lat: number | null;
  lng: number | null;
  routeControl: RouteControl;
  assignmentNote: string | null;
  stops: RouteStopDetail[];
};

const OFFICE_SOURCES = new Set(["office", "manual", "user", "self_generated", "crm", "housecall"]);

/**
 * Prefer a local geographic pocket around the tech, then score within it.
 * Strong distance weight + nearest-neighbor tour keeps routes from pinging across the metro.
 */
export function rankCandidatesForTech<
  T extends {
    id: string | number;
    lat: number;
    lng: number;
    status: string;
    customers: number;
    priorityScore?: number;
    source?: string | null;
  }
>(
  techLoc: { lat: number; lng: number },
  candidates: T[],
  maxStops: number
): T[] {
  if (candidates.length === 0) return [];

  const withMiles = candidates.map((c) => ({
    c,
    miles: haversineMiles(techLoc.lat, techLoc.lng, c.lat, c.lng),
  }));

  // Grow a local working radius until we have enough stops (or hit metro-wide fallback).
  let radius = 6;
  let local = withMiles.filter((x) => x.miles <= radius);
  while (local.length < Math.max(maxStops, 3) && radius < 35) {
    radius += 5;
    local = withMiles.filter((x) => x.miles <= radius);
  }
  if (local.length === 0) local = withMiles;

  const scored = local.map(({ c, miles }) => {
    const isOffice = !!(c.source && OFFICE_SOURCES.has(c.source));
    const base = (c.priorityScore ?? 0) + (isOffice ? 50 : 0);
    // Distance dominates so far-away high scores don't leapfrog nearby work.
    const distPenalty = miles * 18;
    return { c, score: base - distPenalty, miles, isOffice };
  });

  scored.sort((a, b) => {
    if (a.isOffice !== b.isOffice) return a.isOffice ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.miles - b.miles;
  });

  const poolSize = Math.min(local.length, Math.max(maxStops * 2, maxStops));
  const picked = scored.slice(0, poolSize).map((s) => s.c);
  return orderNearestNeighbor(techLoc, picked).slice(0, maxStops);
}

function orderNearestNeighbor<T extends { lat: number; lng: number }>(
  start: { lat: number; lng: number },
  stops: T[]
): T[] {
  if (stops.length <= 1) return stops;
  const remaining = [...stops];
  const ordered: T[] = [];
  let cur = start;
  while (remaining.length) {
    let bestIdx = 0;
    let bestMiles = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const m = haversineMiles(cur.lat, cur.lng, remaining[i].lat, remaining[i].lng);
      if (m < bestMiles) {
        bestMiles = m;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    cur = next;
  }
  return ordered;
}

export function defaultTruckColor(index: number): string {
  const palette = ["#0d9488", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#ea580c"];
  return palette[index % palette.length];
}
