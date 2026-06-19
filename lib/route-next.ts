import { type StormPhase } from "./routing-v1";
import type { RoutingMode } from "./routing-mode";
import { loadSavedVisits, type FieldVisitCache } from "./field-visit";
import {
  buildEligiblePool,
  pickFromEligiblePool,
  type PipelineMarker,
  type RoutingContext,
} from "./routing-pipeline";

export type RoutableOutage = PipelineMarker;

/**
 * Pick the next stop using operational filters first, then scoring within the eligible pool.
 *
 * Filter order: Territory → Role → Exclusions → Scoring → Distance
 */
export function pickNextRouteStop<T extends RoutableOutage>(
  outages: T[],
  userLocation: { lat: number; lng: number },
  phase: StormPhase = "phase_1",
  visits: Record<string, FieldVisitCache> = loadSavedVisits(),
  mode: RoutingMode = "complicated",
  context: RoutingContext = {}
): T | null {
  const pool = buildEligiblePool(outages, visits, context);
  if (!pool.length) return null;
  return pickFromEligiblePool(pool, userLocation, phase, mode, {
    tempOutMode: context.tempOutMode,
    dispatchRole: context.dispatchRole,
  });
}

export { type StormPhase, type RoutingMode, type RoutingContext };
