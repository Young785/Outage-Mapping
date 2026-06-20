const ARCGIS_SOURCES = new Set(["xcel", "connexus", "arcgis"]);

/** Hours after storm start before new utility dots get elevated priority styling. */
export const DELAYED_UTILITY_HOURS = 5;

export function isArcgisUtilityOutage(source?: string): boolean {
  return !!(source && ARCGIS_SOURCES.has(source));
}

/**
 * Utility-confirmed customer damage that appeared well after the initial storm wave.
 * These get white fill + red outline and rank above initial-wave unvisited dots.
 */
export function isDelayedUtilityConfirmed(
  outage: { status?: string; source?: string; firstSeenAt?: string | null },
  stormStartedAt?: string | null
): boolean {
  if (outage.status !== "unvisited" && outage.status !== "investigating") return false;
  if (!isArcgisUtilityOutage(outage.source)) return false;
  if (!stormStartedAt || !outage.firstSeenAt) return false;
  const delayMs =
    new Date(outage.firstSeenAt).getTime() - new Date(stormStartedAt).getTime();
  return delayMs >= DELAYED_UTILITY_HOURS * 3_600_000;
}
