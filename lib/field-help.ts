/** Tooltip copy for admin panel fields and sections */

export const ADMIN_SECTION_HELP: Record<string, string> = {
  dataSources:
    "Controls which utility feeds pull live outage dots onto the map. Save & Apply refreshes the map with your selection.",
  priorityWeights:
    "Numbers used when ranking jobs and outages. Higher weights make that factor matter more in Job Queue sort and assign scoring.",
  simulation:
    "Replaces live utility data with fake storm dots for training. Does not change real customer outages until you turn it off.",
  syntheticGenerator:
    "Creates fake outage patterns (clusters, honey holes, etc.) into the simulation dataset. Safe to run — never touches live feeds.",
  snapshots:
    "Replay a real outage fetch from history as simulation data — useful for testing dispatch on an actual storm shape.",
  stormEvents:
    "Named storm sessions for tracking start/end times, cleanup between events, and future reporting.",
  dataStorage:
    "Live counts from your database plus hot-zone alerts and CSV exports for office analysis.",
};

export const ADMIN_FIELD_HELP: Record<string, string> = {
  xcel: "Pulls outage polygons from Xcel Energy's public ArcGIS layer. Primary feed for most Minnesota storms.",
  connexus: "Adds Connexus Energy outages when CONNEXUS_ARCGIS_URL is set in server environment variables.",
  fetchInterval:
    "How often the cron job re-fetches utility data (minutes). Lower = fresher map, more API calls.",
  stormPhase1:
    "Hunting mode — techs investigate dots and build opportunities. Dispatch is secondary.",
  stormPhase2:
    "Dispatch mode — sold jobs and queue work take priority. Office assigns crews actively.",
  stormPhase3:
    "Cleanup mode — finish temp-outs, grounding, and remaining sold work. Map cleanup tools matter most.",
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
  synthCount: "How many fake outage dots to generate in one batch.",
  synthType:
    "Mixed = random spread; Clustered = tight groups; Sparse = wide area; Honey Hole = dense high-value pocket.",
  stormEventName: "Label for this storm (e.g. June 2026 Derecho) — appears in session history.",
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
