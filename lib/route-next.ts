import { type StormPhase } from "./routing-v1";
import type { RoutingMode } from "./routing-mode";
import { loadSavedVisits, type FieldVisitCache } from "./field-visit";
import { type PipelineMarker, type RoutingContext } from "./routing-pipeline";
import { pickSweepRouteStop, pickSweepRouteStops, pickFullMapSweepStops, type SweepContext } from "./routing-sweep";

export type RoutableOutage = PipelineMarker;

function sweepContextFromRouting(ctx: RoutingContext, phase: StormPhase): SweepContext {
  return {
    dispatchRole: ctx.dispatchRole,
    installerFallback: ctx.installerFallback,
    territory: ctx.territory,
    hideStaleMarkers: ctx.hideStaleMarkers,
    stormPhase: phase,
    stormStartedAt: ctx.stormStartedAt,
    currentTechName: ctx.currentTechName,
    peerTechLocations: ctx.peerTechLocations,
  };
}

/**
 * Route to Next — V1 territory sweep (Pac-Man) for field reliability.
 * Complicated mode is retained for legacy queue scoring only.
 */
export function pickNextRouteStop<T extends RoutableOutage>(
  outages: T[],
  userLocation: { lat: number; lng: number },
  phase: StormPhase = "phase_1",
  visits: Record<string, FieldVisitCache> = loadSavedVisits(),
  _mode: RoutingMode = "simple",
  context: RoutingContext = {}
): T | null {
  return pickSweepRouteStop(outages, userLocation, visits, sweepContextFromRouting(context, phase));
}

/** Office preview: recommended next stops for a technician. */
export function pickNextRouteStops<T extends RoutableOutage>(
  outages: T[],
  userLocation: { lat: number; lng: number },
  phase: StormPhase = "phase_1",
  visits: Record<string, FieldVisitCache> = loadSavedVisits(),
  context: RoutingContext = {},
  limit = 5
): T[] {
  return pickSweepRouteStops(
    outages,
    userLocation,
    visits,
    sweepContextFromRouting(context, phase),
    limit
  );
}

/** Full-map sweep: ordered list of every actionable stop (Pac-Man greedy walk). */
export function pickFullMapSweep<T extends RoutableOutage>(
  outages: T[],
  userLocation: { lat: number; lng: number },
  phase: StormPhase = "phase_1",
  visits: Record<string, FieldVisitCache> = loadSavedVisits(),
  context: RoutingContext = {},
  maxStops = 100
): T[] {
  return pickFullMapSweepStops(
    outages,
    userLocation,
    visits,
    sweepContextFromRouting(context, phase),
    maxStops
  );
}

export { type StormPhase, type RoutingMode, type RoutingContext };
