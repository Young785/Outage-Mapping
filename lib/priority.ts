/**
 * Priority Scoring Engine
 *
 * Score = (customers × customers_multiplier)
 *       + (urgency × urgency_multiplier)
 *       + office_job_bonus      (if source = 'office')
 *       + density_bonus         (if nearby outages exist)
 *       + time_weight × hours_since_reported
 *       + confirmed_opportunity_bonus (if is_confirmed_opportunity)
 *
 * All weights are configurable from the Admin panel.
 */

import { getAdmin, isSupabaseConfigured } from "./supabase";

export type PriorityWeights = {
  customers_multiplier: number;
  urgency_multiplier: number;
  office_job_bonus: number;
  density_bonus: number;
  time_weight: number;
  confirmed_opportunity_bonus: number;
  // §9 — new scoring components
  line_drop_bonus: number;
  line_drop_power_bonus: number;
  wants_to_proceed_bonus: number;
  honey_hole_bonus: number;
};

const DEFAULT_WEIGHTS: PriorityWeights = {
  customers_multiplier: 1.0,
  urgency_multiplier: 1.5,
  office_job_bonus: 50.0,
  density_bonus: 20.0,
  time_weight: 0.1,
  confirmed_opportunity_bonus: 100.0,
  line_drop_bonus: 60.0,      // line drop present → high urgency
  line_drop_power_bonus: 40.0, // power on line drop → dangerous
  wants_to_proceed_bonus: 150.0, // customer confirmed → top priority
  honey_hole_bonus: 30.0,     // multiplied by customer count for clusters
};

// Urgency map: outage types → 1–10 score
const URGENCY_MAP: Record<string, number> = {
  "Known Electric Outage": 7,
  "Planned Outage": 3,
  "User Reported Outage": 5,
  "Partial Outage": 6,
  storm_response: 10,
  repair: 6,
  inspection: 3,
};

function urgencyScore(type: string): number {
  const normalized = (type || "").toLowerCase();
  for (const [key, val] of Object.entries(URGENCY_MAP)) {
    if (normalized.includes(key.toLowerCase())) return val;
  }
  return 5;
}

export async function getWeights(): Promise<PriorityWeights> {
  if (!isSupabaseConfigured) return DEFAULT_WEIGHTS;
  try {
    const db = getAdmin();
    const { data } = await db
      .from("priority_weights")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? DEFAULT_WEIGHTS;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export function calculateScore(
  opts: {
    customers: number;
    outageType?: string;
    isOfficeJob?: boolean;
    densityNearby?: number;
    firstSeenAt?: string;
    isConfirmedOpportunity?: boolean;
    // §9 new scoring inputs
    lineDrop?: boolean;
    powerOnLineDrop?: boolean;
    wantsToProceed?: boolean;
    outageStatus?: string;
  },
  weights: PriorityWeights = DEFAULT_WEIGHTS
): number {
  const {
    customers,
    outageType = "",
    isOfficeJob = false,
    densityNearby = 0,
    firstSeenAt,
    isConfirmedOpportunity = false,
    lineDrop = false,
    powerOnLineDrop = false,
    wantsToProceed = false,
    outageStatus = "unvisited",
  } = opts;

  // No-opportunity and completed outages sink to the bottom
  if (outageStatus === "no_opportunity" || outageStatus === "completed") return 0;

  const urgency = urgencyScore(outageType);
  const hoursSinceReported = firstSeenAt
    ? (Date.now() - new Date(firstSeenAt).getTime()) / 3_600_000
    : 0;

  // Honey hole: opportunity with multiple customers
  const isHoneyHole = customers > 1 &&
    ["opportunity", "wants_to_proceed", "door_hanger"].includes(outageStatus);

  let score = 0;
  score += customers * weights.customers_multiplier;
  score += urgency * weights.urgency_multiplier;
  if (isOfficeJob) score += weights.office_job_bonus;
  if (densityNearby > 0) score += weights.density_bonus * Math.min(densityNearby, 5);
  score += hoursSinceReported * weights.time_weight;
  if (isConfirmedOpportunity || wantsToProceed) score += weights.confirmed_opportunity_bonus;

  // §9 — new bonuses
  if (wantsToProceed)    score += weights.wants_to_proceed_bonus;
  if (lineDrop)          score += weights.line_drop_bonus;
  if (powerOnLineDrop)   score += weights.line_drop_power_bonus;
  if (isHoneyHole)       score += weights.honey_hole_bonus * Math.min(customers, 10);

  // §9 — already-visited penalty (no reason to re-visit)
  if (outageStatus === "investigating") score *= 0.5;

  return Math.round(score * 100) / 100;
}

export function calculateScoreBreakdown(
  opts: {
    customers: number;
    outageType?: string;
    isOfficeJob?: boolean;
    densityNearby?: number;
    firstSeenAt?: string;
    isConfirmedOpportunity?: boolean;
    lineDrop?: boolean;
    powerOnLineDrop?: boolean;
    wantsToProceed?: boolean;
    outageStatus?: string;
  },
  weights: PriorityWeights = DEFAULT_WEIGHTS
): {
  finalScore: number;
  urgency: number;
  parts: Record<string, number>;
} {
  const {
    customers,
    outageType = "",
    isOfficeJob = false,
    densityNearby = 0,
    firstSeenAt,
    isConfirmedOpportunity = false,
    lineDrop = false,
    powerOnLineDrop = false,
    wantsToProceed = false,
    outageStatus = "unvisited",
  } = opts;

  if (outageStatus === "no_opportunity" || outageStatus === "completed") {
    return { finalScore: 0, urgency: 0, parts: { status_sink: -999 } };
  }

  const urgency = urgencyScore(outageType);
  const hoursSinceReported = firstSeenAt
    ? (Date.now() - new Date(firstSeenAt).getTime()) / 3_600_000
    : 0;
  const isHoneyHole = customers > 1 &&
    ["opportunity", "wants_to_proceed", "door_hanger"].includes(outageStatus);

  const parts: Record<string, number> = {
    customers: customers * weights.customers_multiplier,
    urgency: urgency * weights.urgency_multiplier,
    office_bonus: isOfficeJob ? weights.office_job_bonus : 0,
    density: densityNearby > 0 ? weights.density_bonus * Math.min(densityNearby, 5) : 0,
    age_time: hoursSinceReported * weights.time_weight,
    confirmed: (isConfirmedOpportunity || wantsToProceed) ? weights.confirmed_opportunity_bonus : 0,
    wants_to_proceed: wantsToProceed ? weights.wants_to_proceed_bonus : 0,
    line_drop: lineDrop ? weights.line_drop_bonus : 0,
    line_drop_power: powerOnLineDrop ? weights.line_drop_power_bonus : 0,
    honey_hole: isHoneyHole ? weights.honey_hole_bonus * Math.min(customers, 10) : 0,
  };

  let total = Object.values(parts).reduce((s, n) => s + n, 0);
  if (outageStatus === "investigating") {
    total *= 0.5;
    parts.investigating_penalty = -Math.abs(total);
  }
  const finalScore = Math.round(total * 100) / 100;
  return { finalScore, urgency, parts };
}

/** Haversine distance in miles */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Count outages within `radiusMiles` of a point */
export function countNearby(
  lat: number,
  lng: number,
  outages: Array<{ lat: number; lng: number }>,
  radiusMiles = 2
): number {
  return outages.filter(
    (o) => haversineMiles(lat, lng, o.lat, o.lng) <= radiusMiles
  ).length;
}
