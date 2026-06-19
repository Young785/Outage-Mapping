import type { FieldDispatchRole } from "./field-dispatch-role";
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
  noContactMade?: boolean;
  needsReturnTrip?: boolean;
};

const STATUS_PRIORITY: Record<string, number> = {
  wants_to_proceed: 100,
  sold: 95,
  job_started: 90,
  opportunity: 85,
  door_hanger: 75,
  customer_thinking: 55,
  temp_power: 65,
  grounding: 65,
  unvisited: 50,
  investigating: 25,
  in_progress: 20,
};

const OFFICE_SOURCES = new Set(["office", "manual", "user", "self_generated"]);

export type SimpleScoreOptions = {
  tempOutMode?: boolean;
  dispatchRole?: FieldDispatchRole;
};

function sellerSimpleBonus(
  item: Pick<SimpleRoutableItem, "status" | "noContactMade">,
  role?: FieldDispatchRole
): number {
  if (role !== "seller") return 0;
  if (item.status === "opportunity" && item.noContactMade) return 40;
  if (item.status === "door_hanger") return 18;
  if (item.status === "customer_thinking") return -25;
  return 0;
}

function finisherSimpleBonus(
  item: Pick<SimpleRoutableItem, "status" | "needsReturnTrip">,
  role?: FieldDispatchRole
): number {
  if (role !== "finisher") return 0;
  if (item.needsReturnTrip) return 45;
  if (item.status === "temp_power") return 30;
  if (item.status === "grounding") return 28;
  return 0;
}

/** Basic score: status weight + small customer bonus − distance penalty. */
export function calculateSimpleRouteScore(
  item: Pick<SimpleRoutableItem, "status" | "customers" | "source" | "noContactMade" | "needsReturnTrip">,
  distanceMiles: number,
  options: SimpleScoreOptions = {}
): { total: number; parts: Record<string, number> } {
  let statusPri = STATUS_PRIORITY[item.status] ?? 30;
  if (options.dispatchRole === "seller" && item.status === "customer_thinking") {
    statusPri = 40;
  }
  const officeBonus = item.source && OFFICE_SOURCES.has(item.source) ? 15 : 0;
  const customerBonus = Math.min(item.customers, 10) * 2;
  const drivePenalty = distanceMiles * 6;
  let tempOutBonus = 0;
  if (options.tempOutMode) {
    if (item.status === "temp_power") tempOutBonus = 55;
    else if (item.status === "grounding") tempOutBonus = 50;
    else if (item.status === "sold") tempOutBonus = 20;
  }
  const sellerBonus = sellerSimpleBonus(item, options.dispatchRole);
  const finisherBonus = finisherSimpleBonus(item, options.dispatchRole);
  const parts = { statusPri, officeBonus, customerBonus, tempOutBonus, sellerBonus, finisherBonus, drivePenalty: -drivePenalty };
  const total = Math.max(
    0,
    Math.round((statusPri + officeBonus + customerBonus + tempOutBonus + sellerBonus + finisherBonus - drivePenalty) * 100) / 100
  );
  return { total, parts };
}

/** Pick nearest actionable stop with basic status priority weighting. */
export function pickSimpleRouteStop<T extends SimpleRoutableItem>(
  items: T[],
  userLocation: { lat: number; lng: number },
  visits: Record<string, FieldVisitCache> = {},
  options: SimpleScoreOptions = {}
): T | null {
  const candidates = items.filter((o) => !isRoutingExcluded(o, visits) && !o.inExclusionZone);
  if (!candidates.length) return null;

  let best: T | null = null;
  let bestScore = -Infinity;

  for (const o of candidates) {
    const miles = haversineMiles(userLocation.lat, userLocation.lng, o.lat, o.lng);
    const { total } = calculateSimpleRouteScore(o, miles, options);
    if (total > bestScore) {
      bestScore = total;
      best = o;
    }
  }

  return best;
}
