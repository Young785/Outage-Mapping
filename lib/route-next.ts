import { pickBestRouteStop, type StormPhase } from "./routing-v1";
import { isRoutingExcluded, loadSavedVisits, type FieldVisitCache } from "./field-visit";

export type RoutableOutage = {
  id: number | string;
  lat: number;
  lng: number;
  status: string;
  customers: number;
  priorityScore?: number;
  source?: string;
  isNew?: boolean;
  investigationResult?: string;
  powerOnLineDrop?: boolean;
  inPriorityZone?: boolean;
  inExclusionZone?: boolean;
  isHoneyHole?: boolean;
};

/**
 * Pick the highest-value next stop using V1 phase-aware routing score.
 */
export function pickNextRouteStop<T extends RoutableOutage>(
  outages: T[],
  userLocation: { lat: number; lng: number },
  phase: StormPhase = "phase_1",
  visits: Record<string, FieldVisitCache> = loadSavedVisits()
): T | null {
  return pickBestRouteStop(
    outages,
    userLocation,
    phase,
    (o) => isRoutingExcluded(o, visits) || !!o.inExclusionZone
  );
}

export { type StormPhase };
