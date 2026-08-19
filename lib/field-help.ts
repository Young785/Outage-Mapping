/** Tooltip copy for admin panel fields and sections */

export const ADMIN_SECTION_HELP: Record<string, string> = {
  dataSources:
    "Controls which utility feeds pull live outage dots onto the map. Save & Apply refreshes the map with your selection.",
  priorityWeights:
    "Bonuses when office creates jobs (call-ins, line drops, honey holes). Route to Next and queue sort use V1 phase scoring separately — Storm Phase in Data Sources is the main rerouting control.",
  simulation:
    "Replaces live utility data with fake storm dots for training. Does not change real customer outages until you turn it off.",
  syntheticGenerator:
    "Creates fake Twin Cities outage dots (1–10 customers each) and turns Simulation ON. Open Live Map to see them. Safe to run — never touches live feeds.",
  snapshots:
    "Replay a real outage fetch from history as simulation data — useful for testing dispatch on an actual storm shape.",
  stormEvents:
    "Named storm sessions for tracking start/end times, cleanup between events, and future reporting.",
  dataStorage:
    "Live counts from your database plus hot-zone alerts and CSV exports for office analysis.",
};

export const ADMIN_FIELD_HELP: Record<string, string> = {
  xcel: "Pulls live outage points from Xcel Energy's public ArcGIS REST layer (not the customer website HTML). Planned (wrench) events are omitted from the storm map; unplanned (lightning) stay.",
  connexus: "Pulls outage polygons from Connexus Energy's public ArcGIS layer. Secondary feed for north/east metro MN.",
  fetchInterval:
    "How often the cron job re-fetches utility data (minutes). Lower = fresher map, more API calls.",
  stormPhase1:
    "Hunting — prioritize honey holes and clusters of small outages (1–5 customers). Large utility main-line events (50+ customers) rank low. Six nearby small outages beat one 80-customer outage.",
  stormPhase2:
    "Capture / Dispatch — sold jobs and office call-ins first, then power-on-drop, utility-confirmed dots, confirmed opportunities. Hunting clusters continue but rank below dispatch work.",
  stormPhase3:
    "Cleanup — sold jobs, temp power returns, grounding, office calls, then follow-ups and remaining unvisited dots.",
  tempOutMode:
    "When ON, temp-power jobs score higher and the workflow expects secure → temp power → return later.",
  maxJobsPerTech:
    "Assign will avoid recommending techs who already have this many active jobs.",
  overtimeSoft:
    "Techs above this many hours get a lower assign score — still assignable if they're the best fit.",
  overtimeHard:
    "Techs at or above this limit are skipped by auto-assign unless no one else is available.",
  customersMultiplier: "Each affected customer adds this many points to priority score.",
  urgencyMultiplier: "Boosts score for urgent outage types or high-impact utility fields.",
  officeJobBonus: "Flat bonus when the job was created by office (call-in), not from a utility dot.",
  densityBonus: "Extra points when other outages are nearby — rewards hotspot hunting.",
  timeWeight: "Points added per hour since the outage was first seen — older dots can rise in queue.",
  confirmedOpportunityBonus: "Large boost for confirmed damage with customer contact ready to sell.",
  wantsToProceedBonus: "Boost when customer verbally wants to move forward.",
  honeyHoleBonus: "Boost for multi-customer or high-value cluster opportunities.",
  lineDropBonus: "Boost when investigation confirms a line down (no power context).",
  lineDropPowerBonus: "Extra boost when line down still has partial/neighbor power — higher close rate.",
  simulationToggle: "Switch between live utility feeds and synthetic test data on the map.",
  synthCount: "How many fake outage dots to generate in one batch. 2,000 is a large-storm stress test.",
  synthType:
    "Mixed = random spread; Clustered = tight groups; Sparse = wide area; Honey Hole = dense high-value pocket.",
  stormEventName: "Label for this storm (e.g. June 2026 Derecho) — appears in session history.",
  sweepEntireMap:
    "Between storms: removes every dot from the active map for a clean slate. History stays in the database for exports.",
  sweepCompleted: "Removes completed and declined dots from the active map without deleting DB history.",
  archiveStale48: "Hides dots untouched for 48+ hours from the active map.",
  archiveStale72: "Same as 48h but for 72+ hours — use between storms.",
  exportOutages: "Download outage rows as CSV for the last N days.",
  exportJobs: "Download office and dispatch jobs as CSV.",
  exportInvestigations: "Download field investigation forms as CSV.",
};

export type SiteHelpSection = {
  title: string;
  summary: string;
  bullets: string[];
};

export const SITE_HELP_OVERVIEW: SiteHelpSection[] = [
  {
    title: "What this platform does",
    summary: "Storm-response command center for utility outage hunting, sales, and dispatch.",
    bullets: [
      "Pulls live outage dots from Xcel (and optionally Connexus) onto a shared map.",
      "Field techs investigate dots, log outcomes, and update status in seconds.",
      "Office staff assign crews, optimize routes, and manage territories.",
      "Sold / dispatch-ready work flows into Job Queue — not the raw Outages list.",
    ],
  },
  {
    title: "Typical storm day",
    summary: "Phase 1 → Phase 2 → Phase 3 workflow.",
    bullets: [
      "Phase 1 — Techs hunt unvisited dots, leave door hangers, build opportunities.",
      "Phase 2 — Sold jobs enter Job Queue; office assigns and techs run optimized routes.",
      "Phase 3 — Temp-outs, grounding, cleanup; sweep completed dots from the map.",
      "Admin sets phase, temp-out mode, and guardrails before each shift.",
    ],
  },
  {
    title: "Key pages",
    summary: "Where each role spends time.",
    bullets: [
      "Live Map — tap dots, investigate, navigate (everyone).",
      "Outages — hunting list; Opportunities — follow-up sales; Job Queue — dispatch only.",
      "Techs / Territories / Admin — office and admin roles.",
      "Guide — step-by-step navigation; Platform docs at /docs for API reference.",
    ],
  },
  {
    title: "Roles",
    summary: "Who can do what.",
    bullets: [
      "Tech — map, lists, investigate, own route optimize; no assign or admin.",
      "Office — dispatch, territories, tech monitoring, most admin settings.",
      "Admin / Owner — full Admin panel, exports, simulation, storm sessions.",
    ],
  },
];
