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

export type TechRouteBundle = {
  techUserId: string;
  techName: string;
  mapColor: string | null;
  status: string;
  lat: number | null;
  lng: number | null;
  stops: RouteStopDetail[];
};

const OFFICE_SOURCES = new Set(["office", "manual", "user", "self_generated", "crm", "housecall"]);

/** Prefer call-ins, then score, then distance from tech — then nearest-neighbor order for driving. */
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
  const scored = candidates.map((c) => {
    const miles = haversineMiles(techLoc.lat, techLoc.lng, c.lat, c.lng);
    const isOffice = !!(c.source && OFFICE_SOURCES.has(c.source));
    const base = (c.priorityScore ?? 0) + (isOffice ? 80 : 0);
    const distPenalty = miles * 6;
    return { c, score: base - distPenalty, miles, isOffice };
  });

  scored.sort((a, b) => {
    if (a.isOffice !== b.isOffice) return a.isOffice ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.miles - b.miles;
  });

  const picked = scored.slice(0, Math.max(maxStops * 2, maxStops)).map((s) => s.c);
  // Nearest-neighbor tour from tech location reduces zig-zag across town.
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
