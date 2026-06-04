import { haversineMiles } from "./priority";
import { isRoutingExcluded, loadSavedVisits, type FieldVisitCache } from "./field-visit";

export type RoutableOutage = {
  id: number | string;
  lat: number;
  lng: number;
  status: string;
  priorityScore?: number;
  source?: string;
  isNew?: boolean;
};

const STATUS_BOOST: Record<string, number> = {
  sold: 200,
  wants_to_proceed: 200,
  job_started: 180,
  temp_power: 160,
  grounding: 150,
  door_hanger: 120,
  customer_thinking: 100,
  opportunity: 90,
  unvisited: 80,
  investigating: 40,
};

const OFFICE_SOURCES = new Set(["office", "crm", "housecall"]);

/**
 * Pick the highest-value next stop: priority score + status boost − distance penalty.
 */
export function pickNextRouteStop<T extends RoutableOutage>(
  outages: T[],
  userLocation: { lat: number; lng: number },
  visits: Record<string, FieldVisitCache> = loadSavedVisits()
): T | null {
  const candidates = outages.filter((o) => !isRoutingExcluded(o, visits));
  if (!candidates.length) return null;

  let best: T | null = null;
  let bestValue = -Infinity;

  for (const o of candidates) {
    const dist = haversineMiles(userLocation.lat, userLocation.lng, o.lat, o.lng);
    const distPenalty = dist * 8;
    const statusBoost = STATUS_BOOST[o.status] ?? 0;
    const officeBoost = o.source && OFFICE_SOURCES.has(o.source) ? 60 : 0;
    const utilityBoost =
      o.status === "unvisited" &&
      (o.source === "xcel" || o.source === "connexus" || o.source === "arcgis")
        ? 40
        : 0;
    const newDotBoost = o.isNew ? 25 : 0;
    const value =
      (o.priorityScore ?? 0) + statusBoost + officeBoost + utilityBoost + newDotBoost - distPenalty;

    if (value > bestValue) {
      bestValue = value;
      best = o;
    }
  }

  return best;
}
