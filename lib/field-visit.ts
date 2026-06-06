/**
 * Offline / client-side field visit cache — merges with API data until refresh completes.
 */

export type FieldVisitCache = {
  status?: string;
  streetAddress?: string;
  investigationResult?: string;
  customerIntent?: string;
  verbalPrice?: string;
  followUpStatus?: string;
};

const STORAGE_KEY = "fieldmap_visits";

export function loadSavedVisits(): Record<string, FieldVisitCache> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveFieldVisit(id: number | string, data: FieldVisitCache) {
  const saved = loadSavedVisits();
  saved[String(id)] = { ...saved[String(id)], ...data };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

export type InvestigationFormSeed = {
  primary: "" | "utility_only" | "no_damage" | "not_target" | "opportunity_found";
  action:
    | ""
    | "door_hanger"
    | "job_sold"
    | "job_started"
    | "customer_thinking"
    | "customer_declined";
  thinkingIntent: "" | "thinks_utility" | "wait_insurance" | "think_or_quotes";
  startedSub: "" | "temp_power" | "return_grounding";
  verbalPrice: string;
};

/** Restore investigation form selections from outage status + cached field data. */
export function seedInvestigationForm(
  status: string,
  cache?: FieldVisitCache | null
): InvestigationFormSeed {
  const blank: InvestigationFormSeed = {
    primary: "",
    action: "",
    thinkingIntent: "",
    startedSub: "",
    verbalPrice: cache?.verbalPrice ?? "",
  };

  const result = cache?.investigationResult;
  if (result === "not_target") return { ...blank, primary: "not_target" };
  if (result === "utility_only") return { ...blank, primary: "utility_only" };
  if (result === "no_damage") return { ...blank, primary: "no_damage" };

  const intent = cache?.customerIntent as InvestigationFormSeed["thinkingIntent"] | undefined;

  switch (status) {
    case "no_opportunity":
      if (result === "not_target") return { ...blank, primary: "not_target" };
      if (result === "utility_only") return { ...blank, primary: "utility_only" };
      return { ...blank, primary: "no_damage" };
    case "door_hanger":
      return { ...blank, primary: "opportunity_found", action: "door_hanger" };
    case "customer_thinking":
      return {
        ...blank,
        primary: "opportunity_found",
        action: "customer_thinking",
        thinkingIntent: intent || "",
      };
    case "wants_to_proceed":
    case "sold":
      return { ...blank, primary: "opportunity_found", action: "job_sold" };
    case "temp_power":
      return { ...blank, primary: "opportunity_found", action: "job_started", startedSub: "temp_power" };
    case "job_started":
      return { ...blank, primary: "opportunity_found", action: "job_started" };
    case "grounding":
      return {
        ...blank,
        primary: "opportunity_found",
        action: "job_started",
        startedSub: "return_grounding",
      };
    case "completed":
      return { ...blank, primary: "opportunity_found", action: "job_started" };
    case "opportunity":
      return { ...blank, primary: "opportunity_found" };
    case "investigating":
      if (result === "damage_found" || cache?.followUpStatus) {
        return seedFromFollowUp(cache?.followUpStatus ?? "", blank, intent);
      }
      return { ...blank, primary: "opportunity_found" };
    default:
      return blank;
  }
}

function seedFromFollowUp(
  followUp: string,
  blank: InvestigationFormSeed,
  intent?: InvestigationFormSeed["thinkingIntent"]
): InvestigationFormSeed {
  switch (followUp) {
    case "door_hanger":
      return { ...blank, primary: "opportunity_found", action: "door_hanger" };
    case "sold":
      return { ...blank, primary: "opportunity_found", action: "job_sold" };
    case "temp_power":
      return { ...blank, primary: "opportunity_found", action: "job_started", startedSub: "temp_power" };
    case "job_started":
      return { ...blank, primary: "opportunity_found", action: "job_started" };
    case "return_grounding":
      return {
        ...blank,
        primary: "opportunity_found",
        action: "job_started",
        startedSub: "return_grounding",
      };
    case "customer_thinking":
      return {
        ...blank,
        primary: "opportunity_found",
        action: "customer_thinking",
        thinkingIntent: intent || "",
      };
    default:
      return { ...blank, primary: "opportunity_found" };
  }
}

/** Outages that should never be suggested for routing again. */
export function isRoutingExcluded(
  outage: { status: string; id: number | string },
  visits?: Record<string, FieldVisitCache>
): boolean {
  if (outage.status === "no_opportunity" || outage.status === "completed") return true;
  const cache = visits?.[String(outage.id)];
  return cache?.investigationResult === "not_target";
}
