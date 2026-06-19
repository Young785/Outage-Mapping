import type { FieldDispatchRole, InstallerFallback } from "./field-dispatch-role";

const OFFICE_SOURCES = new Set(["office", "manual", "user", "self_generated", "crm", "housecall"]);

export type EligibleMarker = {
  status: string;
  source?: string;
  investigationResult?: string;
  noContactMade?: boolean;
  isStaleMarker?: boolean;
  needsReturnTrip?: boolean;
};

/** Status sets per field role — operational filters before scoring. */
const HUNTER_STATUSES = new Set(["unvisited", "investigating"]);

const SELLER_STATUSES = new Set(["opportunity", "door_hanger", "customer_thinking"]);

const INSTALLER_STATUSES = new Set(["sold", "wants_to_proceed", "job_started"]);

const FINISHER_STATUSES = new Set(["temp_power", "grounding", "job_started", "sold"]);

function isOfficeLead(item: EligibleMarker): boolean {
  return !!(item.source && OFFICE_SOURCES.has(item.source));
}

/** Seller targets: no-contact opportunities rank above other opportunities. */
export function isSellerEligible(item: EligibleMarker): boolean {
  if (item.status === "opportunity") return true;
  if (SELLER_STATUSES.has(item.status) && item.status !== "opportunity") return true;
  if (isOfficeLead(item) && (item.status === "unvisited" || item.status === "investigating")) {
    return true;
  }
  return false;
}

export function isHunterEligible(item: EligibleMarker): boolean {
  if (HUNTER_STATUSES.has(item.status)) return true;
  // Hunters may still clear stale unvisited office leads
  if (isOfficeLead(item) && item.status === "unvisited") return true;
  return false;
}

export function isInstallerEligible(item: EligibleMarker): boolean {
  return INSTALLER_STATUSES.has(item.status);
}

export function isFinisherEligible(item: EligibleMarker): boolean {
  if (item.needsReturnTrip) return true;
  return FINISHER_STATUSES.has(item.status);
}

export function isEligibleForRole(item: EligibleMarker, role: FieldDispatchRole): boolean {
  switch (role) {
    case "hunter":
      return isHunterEligible(item);
    case "seller":
      return isSellerEligible(item);
    case "installer":
      return isInstallerEligible(item);
    case "finisher":
      return isFinisherEligible(item);
    default:
      return isHunterEligible(item);
  }
}

/**
 * Role fallback chain when primary pool is empty.
 * Seller → Hunter; Installer → configured fallback → Hunter.
 */
export function roleFallbackChain(
  role: FieldDispatchRole,
  installerFallback: InstallerFallback = "hunter"
): FieldDispatchRole[] {
  switch (role) {
    case "seller":
      return ["seller", "hunter"];
    case "installer":
      return ["installer", installerFallback, "hunter"];
    case "finisher":
      return ["finisher", "hunter"];
    default:
      return ["hunter"];
  }
}
