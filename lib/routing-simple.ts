import { haversineMiles } from "./priority";
import { isRoutingExcluded, type FieldVisitCache } from "./field-visit";

export type SimpleRoutableItem = {
  id: number | string;
  lat: number;
  lng: number;
  status: string;
  customers: number;
  source?: string;
  inExclusionZone?: boolean;
};

const STATUS_PRIORITY: Record<string, number> = {
  wants_to_proceed: 100,
  sold: 95,
  job_started: 90,
  opportunity: 85,
  door_hanger: 75,
  customer_thinking: 70,
  temp_power: 65,
  grounding: 65,
  unvisited: 50,
  investigating: 25,
  in_progress: 20,
};

const OFFICE_SOURCES = new Set(["office", "manual", "user", "self_generated"]);

/** Basic score: status weight + small customer bonus − distance penalty. */
export function calculateSimpleRouteScore(
  item: Pick<SimpleRoutableItem, "status" | "customers" | "source">,
  distanceMiles: number
): { total: number; parts: Record<string, number> } {
  const statusPri = STATUS_PRIORITY[item.status] ?? 30;
  const officeBonus = item.source && OFFICE_SOURCES.has(item.source) ? 15 : 0;
  const customerBonus = Math.min(item.customers, 10) * 2;
  const drivePenalty = distanceMiles * 6;
  const parts = { statusPri, officeBonus, customerBonus, drivePenalty: -drivePenalty };
  const total = Math.max(0, Math.round((statusPri + officeBonus + customerBonus - drivePenalty) * 100) / 100);
  return { total, parts };
}

/** Pick nearest actionable stop with basic status priority weighting. */
export function pickSimpleRouteStop<T extends SimpleRoutableItem>(
  items: T[],
  userLocation: { lat: number; lng: number },
  visits: Record<string, FieldVisitCache> = {}
): T | null {
  const candidates = items.filter((o) => !isRoutingExcluded(o, visits) && !o.inExclusionZone);
  if (!candidates.length) return null;

  let best: T | null = null;
  let bestScore = -Infinity;

  for (const o of candidates) {
    const miles = haversineMiles(userLocation.lat, userLocation.lng, o.lat, o.lng);
    const { total } = calculateSimpleRouteScore(o, miles);
    if (total > bestScore) {
      bestScore = total;
      best = o;
    }
  }

  return best;
}
