/**
 * V1 storm routing score — phase-aware prioritization for field dispatch.
 *
 * Priority Score =
 *   Lead Status + Storm Phase Weight + Zone Score + Small-Outage Score
 *   + Cluster Score + Utility-Confirmed Bonus + Power Status Bonus
 *   − Drive Time Penalty − Exclusion Penalty
 */

import type { FieldDispatchRole } from "./field-dispatch-role";
import { haversineMiles } from "./priority";

export type StormPhase = "phase_1" | "phase_2" | "phase_3";

export type RoutableItem = {
  id: number | string;
  lat: number;
  lng: number;
  customers: number;
  status: string;
  source?: string;
  isNew?: boolean;
  investigationResult?: string;
  powerOnLineDrop?: boolean;
  inPriorityZone?: boolean;
  inExclusionZone?: boolean;
  isHoneyHole?: boolean;
  isOfficeLead?: boolean;
  driveMiles?: number;
  noContactMade?: boolean;
  needsReturnTrip?: boolean;
};

export type ClusterInfo = { neighborCount: number; clusterScore: number };

const ARCGIS_SOURCES = new Set(["xcel", "connexus", "arcgis"]);
const OFFICE_SOURCES = new Set(["office", "crm", "housecall"]);

/** 1–4 high · 5–10 medium · 11–50 low · 50+ very low (utility main-line events sink) */
export function smallOutageScore(customers: number): number {
  if (customers >= 50) return -70;
  if (customers >= 11) return -40;
  if (customers >= 5) return 6;
  return 45;
}

/** Count nearby small outages (≤10 customers) within radius — cluster = opportunity pack. */
export function computeClusterMap(
  items: Array<{ id: number | string; lat: number; lng: number; customers: number }>,
  radiusMiles = 0.5,
  maxCustomersInCluster = 10,
  minPackSize = 3
): Map<string, ClusterInfo> {
  const map = new Map<string, ClusterInfo>();
  for (const item of items) {
    if (item.customers > maxCustomersInCluster) {
      map.set(String(item.id), { neighborCount: 1, clusterScore: 0 });
      continue;
    }
    const nearbySmall = items.filter((other) => {
      if (String(other.id) === String(item.id)) return false;
      if (other.customers > maxCustomersInCluster) return false;
      return haversineMiles(item.lat, item.lng, other.lat, other.lng) <= radiusMiles;
    });
    const packSize = nearbySmall.length + 1;
    const clusterScore =
      packSize >= minPackSize ? Math.min(packSize, 8) * 22 : nearbySmall.length * 4;
    map.set(String(item.id), { neighborCount: packSize, clusterScore });
  }
  return map;
}

function utilityConfirmedBonus(
  source?: string,
  status?: string,
  isNew?: boolean,
  phase: StormPhase = "phase_1"
): number {
  if (status !== "unvisited") return 0;
  if (!source || !ARCGIS_SOURCES.has(source)) return 0;
  if (phase === "phase_1") return isNew ? 52 : 28;
  if (phase === "phase_2") return isNew ? 72 : 58;
  return isNew ? 65 : 50;
}

function zoneScore(opts: { inPriorityZone?: boolean; isHoneyHole?: boolean }): number {
  let s = 0;
  if (opts.inPriorityZone) s += 85;
  if (opts.isHoneyHole) s += 70;
  return s;
}

function powerStatusBonus(powerOnLineDrop?: boolean, phase: StormPhase = "phase_1"): number {
  if (!powerOnLineDrop) return 0;
  return phase === "phase_2" ? 90 : phase === "phase_3" ? 45 : 20;
}

export type ScoreOptions = {
  /** When true, temp-power and return-for-grounding stops rank higher. */
  tempOutMode?: boolean;
  /** Seller-specific ranking tweaks within the eligible pool. */
  dispatchRole?: FieldDispatchRole;
};

/** Boost no-contact opportunities and de-prioritize tire-kickers for Sellers. */
function sellerRoleBonus(
  item: Pick<RoutableItem, "status" | "noContactMade">,
  role?: FieldDispatchRole
): number {
  if (role !== "seller") return 0;
  if (item.status === "opportunity" && item.noContactMade) return 115;
  if (item.status === "opportunity") return 30;
  if (item.status === "door_hanger") return 50;
  if (item.status === "customer_thinking") return -60;
  return 0;
}

function finisherRoleBonus(
  item: Pick<RoutableItem, "status" | "needsReturnTrip">,
  role?: FieldDispatchRole
): number {
  if (role !== "finisher") return 0;
  if (item.needsReturnTrip) return 130;
  if (item.status === "temp_power") return 85;
  if (item.status === "grounding") return 80;
  if (item.status === "job_started") return 45;
  return 0;
}

/** Phase-specific status ranking — sold/dispatch work rises in Phase 2/3. */
function leadStatusScore(
  status: string,
  phase: StormPhase,
  source?: string,
  powerOnLineDrop?: boolean
): number {
  const isOffice = source && OFFICE_SOURCES.has(source);

  if (phase === "phase_3") {
    if (status === "sold") return 340;
    if (status === "temp_power") return 310;
    if (status === "grounding") return 295;
    if (isOffice) return 280;
    if (status === "door_hanger") return 145;
    if (status === "customer_thinking") return 140;
    if (status === "wants_to_proceed") return 175;
    if (status === "job_started") return 190;
    if (status === "unvisited") return 50;
    if (status === "opportunity") return 95;
    return 20;
  }

  if (phase === "phase_2") {
    if (status === "sold") return 350;
    if (isOffice) return 330;
    if (powerOnLineDrop) return 305;
    if (status === "wants_to_proceed") return 255;
    if (status === "opportunity") return 235;
    if (status === "job_started") return 220;
    if (status === "temp_power") return 240;
    if (status === "grounding") return 230;
    if (status === "door_hanger") return 95;
    if (status === "customer_thinking") return 90;
    if (status === "unvisited") return 65;
    return 25;
  }

  // Phase 1 — Hunting: clusters & small outages beat large utility main-line events
  if (status === "sold") return 40;
  if (status === "wants_to_proceed") return 48;
  if (status === "opportunity") return 46;
  if (status === "door_hanger") return 44;
  if (status === "customer_thinking") return 38;
  if (status === "unvisited") return 50;
  if (status === "investigating") return 15;
  if (status === "job_started") return 32;
  if (status === "temp_power") return 28;
  if (status === "grounding") return 26;
  if (isOffice) return 42;
  if (status === "no_opportunity" || status === "completed") return 0;
  return 12;
}

function stormPhaseWeight(phase: StormPhase): number {
  if (phase === "phase_1") return 10;
  if (phase === "phase_2") return 5;
  return 0;
}

function driveTimePenalty(miles?: number): number {
  if (miles == null || miles <= 0) return 0;
  return miles * 9;
}

function exclusionPenalty(inExclusionZone?: boolean, investigationResult?: string, status?: string): number {
  if (investigationResult === "not_target") return 10_000;
  if (status === "no_opportunity" || status === "completed") return 10_000;
  if (inExclusionZone) return 800;
  return 0;
}

/** Under-10-customer bonus — Phase 1 hunting only. */
function smallCountBonus(customers: number, phase: StormPhase): number {
  if (phase !== "phase_1") return 0;
  if (customers < 10) return 38;
  return 0;
}

/** Cluster packs matter most in Phase 1; dampen in dispatch/cleanup phases. */
function clusterMultiplier(phase: StormPhase): number {
  if (phase === "phase_1") return 1;
  if (phase === "phase_2") return 0.3;
  return 0.15;
}

export const PHASE_PRIORITY_GUIDE: Record<
  StormPhase,
  { title: string; priorities: string[] }
> = {
  phase_1: {
    title: "Phase 1 — Hunting",
    priorities: [
      "Priority zones / honey holes",
      "Clusters of small customer-count outages (e.g. six 1–5 customer dots nearby)",
      "Utility-confirmed red-outline ArcGIS dots",
      "Under-10-customer outages",
      "Nearby dots along your drive (closer = less penalty)",
      "Regular white ArcGIS dots",
      "Do not chase large outages just because customer count is high",
    ],
  },
  phase_2: {
    title: "Phase 2 — Capture / Dispatch",
    priorities: [
      "Sold jobs",
      "Office-entered calls",
      "Power-on-drop opportunities",
      "Utility-confirmed red-outline ArcGIS dots",
      "Confirmed opportunities",
      "Hunting targets / small clusters (continues, but below dispatch work)",
    ],
  },
  phase_3: {
    title: "Phase 3 — Cleanup",
    priorities: [
      "Sold jobs",
      "Temp power / return-needed jobs",
      "Return for grounding",
      "Office calls",
      "Utility-confirmed red-outline dots",
      "Customer thinking / door hanger follow-ups",
      "Remaining unvisited dots",
    ],
  },
};

function tempOutModeBonus(status: string, phase: StormPhase, tempOutMode?: boolean): number {
  if (!tempOutMode) return 0;
  if (status === "temp_power") return phase === "phase_1" ? 220 : 95;
  if (status === "grounding") return phase === "phase_1" ? 200 : 85;
  if (status === "sold") return 35;
  return 0;
}

export function calculateV1RouteScore(
  item: RoutableItem,
  phase: StormPhase,
  cluster?: ClusterInfo,
  options: ScoreOptions = {}
): { total: number; parts: Record<string, number> } {
  const rawCluster = cluster?.clusterScore ?? 0;
  const parts: Record<string, number> = {
    leadStatus: leadStatusScore(item.status, phase, item.source, item.powerOnLineDrop),
    stormPhase: stormPhaseWeight(phase),
    zone: zoneScore(item),
    smallOutage: smallOutageScore(item.customers),
    cluster: Math.round(rawCluster * clusterMultiplier(phase) * 100) / 100,
    utilityConfirmed: utilityConfirmedBonus(item.source, item.status, item.isNew, phase),
    powerStatus: powerStatusBonus(item.powerOnLineDrop, phase),
    smallCountBonus: smallCountBonus(item.customers, phase),
  };

  if (item.isOfficeLead || (item.source && OFFICE_SOURCES.has(item.source ?? ""))) {
    parts.officeLead = phase === "phase_1" ? 35 : phase === "phase_2" ? 40 : 25;
  }

  parts.drivePenalty = -driveTimePenalty(item.driveMiles);
  parts.exclusionPenalty = -exclusionPenalty(item.inExclusionZone, item.investigationResult, item.status);
  parts.tempOutMode = tempOutModeBonus(item.status, phase, options.tempOutMode);
  parts.sellerRole = sellerRoleBonus(item, options.dispatchRole);
  parts.finisherRole = finisherRoleBonus(item, options.dispatchRole);

  const total = Math.round(
    Object.values(parts).reduce((s, n) => s + n, 0) * 100
  ) / 100;

  return { total: Math.max(0, total), parts };
}

/** Pick best next stop using V1 score. */
export function pickBestRouteStop<T extends RoutableItem>(
  items: T[],
  userLocation: { lat: number; lng: number },
  phase: StormPhase,
  exclude?: (item: T) => boolean
): T | null {
  const candidates = items.filter((o) => !(exclude?.(o)));
  if (!candidates.length) return null;

  const clusterMap = computeClusterMap(candidates);

  let best: T | null = null;
  let bestScore = -Infinity;

  for (const o of candidates) {
    const miles = haversineMiles(userLocation.lat, userLocation.lng, o.lat, o.lng);
    const { total } = calculateV1RouteScore(
      { ...o, driveMiles: miles },
      phase,
      clusterMap.get(String(o.id))
    );
    if (total > bestScore) {
      bestScore = total;
      best = o;
    }
  }

  return best;
}
