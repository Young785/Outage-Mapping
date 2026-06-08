/**
 * V1 storm routing score — phase-aware prioritization for field dispatch.
 *
 * Priority Score =
 *   Lead Status + Storm Phase Weight + Zone Score + Small-Outage Score
 *   + Cluster Score + Utility-Confirmed Bonus + Power Status Bonus
 *   − Drive Time Penalty − Exclusion Penalty
 */

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
};

export type ClusterInfo = { neighborCount: number; clusterScore: number };

const ARCGIS_SOURCES = new Set(["xcel", "connexus", "arcgis"]);
const OFFICE_SOURCES = new Set(["office", "crm", "housecall"]);

/** 1–4 high · 5–10 medium · 11–50 low · 50+ very low */
export function smallOutageScore(customers: number): number {
  if (customers >= 50) return -55;
  if (customers >= 11) return -30;
  if (customers >= 5) return 8;
  return 42;
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

function utilityConfirmedBonus(source?: string, status?: string, isNew?: boolean): number {
  if (status !== "unvisited") return 0;
  if (source && ARCGIS_SOURCES.has(source)) return isNew ? 48 : 38;
  return 0;
}

function zoneScore(opts: { inPriorityZone?: boolean; isHoneyHole?: boolean }): number {
  let s = 0;
  if (opts.inPriorityZone) s += 85;
  if (opts.isHoneyHole) s += 70;
  return s;
}

function powerStatusBonus(powerOnLineDrop?: boolean, phase: StormPhase = "phase_1"): number {
  if (!powerOnLineDrop) return 0;
  return phase === "phase_2" ? 75 : phase === "phase_3" ? 40 : 25;
}

/** Phase-specific status ranking — sold/dispatch work rises in Phase 2/3. */
function leadStatusScore(status: string, phase: StormPhase, source?: string): number {
  const isOffice = source && OFFICE_SOURCES.has(source);

  if (phase === "phase_3") {
    if (status === "sold") return 320;
    if (status === "temp_power") return 290;
    if (status === "grounding") return 280;
    if (isOffice) return 265;
    if (status === "door_hanger") return 130;
    if (status === "customer_thinking") return 125;
    if (status === "wants_to_proceed") return 200;
    if (status === "job_started") return 180;
    if (status === "unvisited") return 55;
    if (status === "opportunity") return 100;
    return 20;
  }

  if (phase === "phase_2") {
    if (status === "sold") return 330;
    if (isOffice) return 310;
    if (status === "wants_to_proceed") return 280;
    if (status === "opportunity") return 160;
    if (status === "job_started") return 170;
    if (status === "temp_power") return 200;
    if (status === "grounding") return 190;
    if (status === "door_hanger") return 90;
    if (status === "customer_thinking") return 85;
    if (status === "unvisited") return 70;
    return 25;
  }

  // Phase 1 — Hunting: clusters & small outages beat large utility main-line events
  if (status === "sold") return 45;
  if (status === "wants_to_proceed") return 55;
  if (status === "opportunity") return 50;
  if (status === "door_hanger") return 48;
  if (status === "customer_thinking") return 40;
  if (status === "unvisited") return 52;
  if (status === "investigating") return 18;
  if (status === "job_started") return 35;
  if (status === "temp_power") return 30;
  if (status === "grounding") return 28;
  if (isOffice) return 60;
  if (status === "no_opportunity" || status === "completed") return 0;
  return 15;
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

/** Under-10-customer bonus used heavily in Phase 1 hunting. */
function smallCountBonus(customers: number, phase: StormPhase): number {
  if (phase !== "phase_1") return customers < 10 ? 8 : 0;
  if (customers < 10) return 35;
  return 0;
}

export function calculateV1RouteScore(
  item: RoutableItem,
  phase: StormPhase,
  cluster?: ClusterInfo
): { total: number; parts: Record<string, number> } {
  const parts: Record<string, number> = {
    leadStatus: leadStatusScore(item.status, phase, item.source),
    stormPhase: stormPhaseWeight(phase),
    zone: zoneScore(item),
    smallOutage: smallOutageScore(item.customers),
    cluster: cluster?.clusterScore ?? 0,
    utilityConfirmed: utilityConfirmedBonus(item.source, item.status, item.isNew),
    powerStatus: powerStatusBonus(item.powerOnLineDrop, phase),
    smallCountBonus: smallCountBonus(item.customers, phase),
  };

  if (item.isOfficeLead || (item.source && OFFICE_SOURCES.has(item.source ?? ""))) {
    parts.officeLead = phase === "phase_1" ? 55 : phase === "phase_2" ? 120 : 90;
  }

  parts.drivePenalty = -driveTimePenalty(item.driveMiles);
  parts.exclusionPenalty = -exclusionPenalty(item.inExclusionZone, item.investigationResult, item.status);

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
