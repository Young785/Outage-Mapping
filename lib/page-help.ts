export type PageHelpId =
  | "dashboard"
  | "map"
  | "outages"
  | "opportunities"
  | "queue"
  | "techs"
  | "territories"
  | "admin"
  | "profile"
  | "guide";

export type HelpAudience = "all" | "office" | "tech";

export type HelpStep = { title: string; detail: string; audience?: HelpAudience };
export type HelpInput = { name: string; description: string; audience?: HelpAudience };

export type PageHelpContent = {
  title: string;
  summary: string;
  bullets: string[];
  layman: {
    headline: string;
    plainEnglish: string;
    onThisPage: string[];
    tryThis: string[];
  };
  /** Numbered walkthrough for this page only */
  steps: HelpStep[];
  /** Buttons, toggles, and fields on this page */
  inputs: HelpInput[];
  /** Who can see or change what — used to tailor help, not shown as its own tab */
  access: Array<{ role: string; permissions: string }>;
  /** Storm-phase routing order (map / queue pages) */
  prioritization?: Array<{ phase: string; rules: string[] }>;
  /** Admin rerouting flow — how V1 scoring and phase changes affect the field */
  rerouting?: {
    v1Formula: string;
    whereUsed: string[];
    customerTiers: string[];
    clusterRule: string;
    stormDayFlow: Array<{ when: string; actions: string[] }>;
  };
};

export function isOfficeRole(role?: string): boolean {
  return role === "office" || role === "admin" || role === "owner";
}

/** Keep only steps/inputs the signed-in user actually sees on this page. */
export function filterHelpItems<T extends { audience?: HelpAudience }>(
  items: T[],
  role?: string
): T[] {
  return items.filter((item) => {
    const aud = item.audience ?? "all";
    if (aud === "all") return true;
    if (aud === "office") return isOfficeRole(role);
    if (aud === "tech") return role === "tech";
    return true;
  });
}

export function permissionsForRole(
  page: PageHelpContent,
  role?: string
): string | undefined {
  if (isOfficeRole(role)) {
    if (role === "admin" || role === "owner") {
      return page.access.find((a) => a.role === "Admin / Owner")?.permissions;
    }
    return page.access.find((a) => a.role === "Office")?.permissions;
  }
  return page.access.find((a) => a.role === "Field Tech")?.permissions;
}

export const PAGE_HELP: Record<PageHelpId, PageHelpContent> = {
  dashboard: {
    title: "Dashboard",
    summary: "Storm-wide snapshot before you dispatch or send techs to the map.",
    bullets: [
      "Stat cards count outages by status — watch Unvisited during Phase 1 hunting.",
      "Technician summary shows how many crews are available vs working.",
      "Phase banner reflects Admin storm phase (Hunt → Dispatch → Cleanup).",
    ],
    layman: {
      headline: "Your storm morning briefing",
      plainEnglish:
        "This is the scoreboard at shift start: how many dots are unvisited, how many opportunities exist, and whether crews are free or working.",
      onThisPage: ["Status count cards", "Technician availability summary", "Storm phase banner"],
      tryThis: ["Open first when a storm starts", "If Unvisited is high → send techs to Live Map", "If sold jobs climb → focus Job Queue"],
    },
    steps: [
      { title: "Check the phase banner", detail: "Phase 1 = hunt new dots. Phase 2 = dispatch sold work. Phase 3 = cleanup and follow-ups." },
      { title: "Read the stat cards", detail: "Unvisited = nobody has knocked yet. Opportunities = damage found but not sold. Queue count = dispatch-ready jobs." },
      { title: "Glance at technician summary", detail: "Available (green) crews can take new assignments. Working (red) are on a job." },
      { title: "Choose your next screen", detail: "Hunting → Live Map or Outages. Dispatch → Job Queue. Crew balance → Techs." },
    ],
    inputs: [
      { name: "Stat cards", description: "Read-only counts — tap sidebar tabs to drill in." },
      { name: "Phase banner", description: "Set in Admin → Storm Phase. Affects how Route to Next ranks stops." },
    ],
    access: [
      { role: "Field Tech", permissions: "View dashboard and all stat cards." },
      { role: "Office", permissions: "View dashboard; change storm phase in Admin." },
      { role: "Admin / Owner", permissions: "Full dashboard + Admin controls." },
    ],
  },
  map: {
    title: "Live Map",
    summary: "Primary field and office view for every outage dot in your radius.",
    bullets: [
      "Tap a dot → Quick Investigate form (outcome, power status, Google Navigation).",
      "Route to Next uses V1 scoring: small clustered outages rank above large utility main-line events in Phase 1.",
      "Customer count: 1–4 = high, 5–10 = medium, 11–50 = low, 50+ = very low — clusters of small outages beat one big outage.",
      "Hide non-critical markers toggle lives in sidebar Map Layers.",
      "Collapsible legend — click Legend to shrink and free map space.",
    ],
    layman: {
      headline: "The map everyone works from",
      plainEnglish:
        "Every utility outage is a dot on the map. Tap a dot, fill out the quick form, and everyone sees the update. Route to Next does not just send you to the nearest dot — it picks the best stop for the current storm phase. In Phase 1 (Hunting), six nearby outages with 1–5 customers each rank higher than one outage with 80 customers, because big counts usually mean a utility main-line problem, not individual service work.",
      onThisPage: ["Outage dots (shape = lead source, color = status)", "Collapsible legend", "Route to Next", "My Location / Satellite controls", "Phase banner"],
      tryThis: ["Phase 1: Route to Next to find small outage clusters", "Tap dot → Google Navigation before you drive", "Collapse legend for more map space"],
    },
    steps: [
      { title: "Check the phase banner", detail: "The bar at the top shows Phase 1 (Hunting), Phase 2 (Dispatch), or Phase 3 (Cleanup). This changes what Route to Next prioritizes." },
      { title: "Pan and zoom the map", detail: "Use pinch/drag or mouse. Toggle Satellite in the bottom-right for roof-line context." },
      { title: "Tap an outage dot", detail: "Quick Investigate opens with customers affected, priority score, address, and a Google Navigation button at the top." },
      { title: "Submit your investigation", detail: "Pick an outcome: utility issue, no damage, opportunity, or not a target. If you found damage, log door action and whether power is still on the drop." },
      { title: "Use Route to Next", detail: "From your GPS, scores every visible stop. Phase 1 favors honey holes and small-outage clusters. Phase 2 favors sold jobs and office call-ins. Phase 3 favors temp power and cleanup returns." },
      { title: "Adjust map layers", detail: "Sidebar → Map Layers → Hide non-critical markers removes declined, completed, thinking, temp power, and grounding dots from view." },
    ],
    inputs: [
      { name: "Route to Next", description: "Picks the highest V1 priority score from your GPS. Formula: Lead Status + Storm Phase + Zone + Small-Outage + Cluster + Utility Bonus + Power Bonus − Drive Time − Exclusion." },
      { name: "Quick Investigate form", description: "Primary outcome, door action, power-on-drop flag, optional service details. Updates dot color for the whole team." },
      { name: "Google Navigation", description: "Opens turn-by-turn directions in Google Maps." },
      { name: "My Location", description: "Centers the map on your GPS — required for Route to Next." },
      { name: "Add Opportunity", description: "Field tech button — report damage at a location not on the utility feed.", audience: "tech" },
      { name: "+ New Job", description: "Office button — create a call-in job from the header.", audience: "office" },
      { name: "Remove marker", description: "Office action on a dot — hides it from the active map.", audience: "office" },
      { name: "Hide non-critical markers", description: "Sidebar toggle — hides dots that are not active storm work." },
      { name: "Legend (collapsible)", description: "Top-left — dot shapes (office vs utility) and colors (status)." },
      { name: "Data Sources", description: "Sidebar — toggle Xcel / Connexus utility feeds on or off." },
      { name: "Phase banner", description: "Read-only indicator of current storm phase (set in Admin)." },
    ],
    access: [
      { role: "Field Tech", permissions: "View map, investigate dots, Route to Next, Add Opportunity. Cannot remove markers or change storm phase." },
      { role: "Office", permissions: "Everything a tech can do, plus remove markers and access Admin settings." },
      { role: "Admin / Owner", permissions: "Full map access, storm phase control, simulation, and all admin tools." },
    ],
    prioritization: [
      {
        phase: "Phase 1 — Hunting",
        rules: [
          "1. Priority zones / honey holes",
          "2. Clusters of small customer-count outages",
          "3. Utility-confirmed red-outline ArcGIS dots",
          "4. Under-10-customer outages",
          "5. Dots along your drive (closer = higher)",
          "6. Regular white ArcGIS dots",
          "Large outages (50+ customers) are intentionally deprioritized",
        ],
      },
      {
        phase: "Phase 2 — Capture / Dispatch",
        rules: [
          "1. Sold jobs",
          "2. Office-entered calls",
          "3. Power-on-drop opportunities",
          "4. Utility-confirmed red-outline dots",
          "5. Confirmed opportunities",
          "6. Hunting targets / small clusters (below dispatch work)",
        ],
      },
      {
        phase: "Phase 3 — Cleanup",
        rules: [
          "1. Sold jobs",
          "2. Temp power / return-needed jobs",
          "3. Return for grounding",
          "4. Office calls",
          "5. Utility-confirmed red-outline dots",
          "6. Customer thinking / door hanger follow-ups",
          "7. Remaining unvisited dots",
        ],
      },
    ],
  },
  outages: {
    title: "Outages",
    summary: "Sortable list of every dot — your hunting board, not dispatch-ready jobs.",
    bullets: [
      "Filter by status or export CSV for office reporting.",
      "Priority score uses V1 logic — small clustered outages score higher than large main-line events.",
      "Sold or dispatch-ready work appears in Job Queue instead.",
    ],
    layman: {
      headline: "Your hunting list — not the dispatch list",
      plainEnglish: "Spreadsheet view of every dot. Filter, export, navigate, or investigate without panning the map.",
      onThisPage: ["Filter dropdown", "Status badges", "Go / Investigate / View buttons", "Export CSV"],
      tryThis: ["Filter Unvisited in Phase 1", "Sort mentally by score column — higher = go first", "Export CSV for office reporting"],
    },
    steps: [
      { title: "Choose a filter", detail: "All Statuses or narrow to Unvisited, Investigating, etc." },
      { title: "Scan priority score", detail: "Higher score = better hunting target for current storm phase." },
      { title: "Go or Investigate", detail: "Go pans map + draws route line. Investigate opens the field form." },
      { title: "Change status if needed", detail: "Override status from the dropdown on each row.", audience: "office" },
    ],
    inputs: [
      { name: "Filter dropdown", description: "Limits list to one status." },
      { name: "Export CSV", description: "Downloads all visible outages for reporting.", audience: "office" },
      { name: "Go", description: "Navigate to that address on Live Map." },
      { name: "Investigate", description: "Opens Quick Investigate form." },
      { name: "Status dropdown", description: "Manual status override on each row.", audience: "office" },
      { name: "Remove marker", description: "Hides the dot from the active map.", audience: "office" },
    ],
    access: [
      { role: "Field Tech", permissions: "View, filter, Go, Investigate." },
      { role: "Office", permissions: "All tech actions + status override + CSV export + Remove marker." },
      { role: "Admin / Owner", permissions: "Full outages list access." },
    ],
  },
  opportunities: {
    title: "Opportunities",
    summary: "Confirmed damage with customer contact — follow-up and sales, not dispatch yet.",
    bullets: [
      "Door hangers, thinking customers, and verbal quotes stay here until sold.",
      "Navigate opens the location on Live Map.",
      "When sold, work moves to Job Queue.",
    ],
    layman: {
      headline: "Warm leads — not ready to dispatch yet",
      plainEnglish: "Homes where techs found damage or left door hangers. Office follows up until the job is sold.",
      onThisPage: ["Follow-up lead list", "Navigate button", "Status per lead"],
      tryThis: ["Office calls from this list in Phase 1–2", "Once sold → check Job Queue"],
    },
    steps: [
      { title: "Review the list", detail: "Each row is a confirmed or partial contact — not yet dispatch-ready." },
      { title: "Navigate to follow up", detail: "Jump to that house on the map for a return visit." },
      { title: "Investigate to update", detail: "Change outcome when customer decides (sold, declined, thinking)." },
      { title: "Watch Job Queue", detail: "Sold jobs leave this list and appear in dispatch queue." },
    ],
    inputs: [
      { name: "Navigate", description: "Opens location on Live Map." },
      { name: "Investigate", description: "Update field outcome after follow-up visit." },
    ],
    access: [
      { role: "Field Tech", permissions: "View, navigate, investigate own follow-ups." },
      { role: "Office", permissions: "Full list access for phone follow-up." },
      { role: "Admin / Owner", permissions: "Full access." },
    ],
  },
  queue: {
    title: "Job Queue",
    summary: "Dispatch-ready work — assign techs, optimize routes, find clusters.",
    bullets: [
      "Sort by Priority, Distance, Value, or Smart (score minus distance).",
      "Optimize Route builds a multi-stop plan; auto-reroutes when jobs complete or are skipped.",
      "Phase 2+ elevates sold jobs and office call-ins above hunting targets.",
    ],
    layman: {
      headline: "The dispatch board — who goes where",
      plainEnglish: "Only sold or crew-ready jobs appear here. Assign techs, optimize driving order, skip stops, and the plan reroutes automatically.",
      onThisPage: ["Sort chips", "Assign flow", "Optimize Route", "Find Clusters", "Go Next Stop"],
      tryThis: ["Optimize Route → Go Next Stop", "Skip a stop → plan reroutes", "Smart sort for high-value nearby jobs"],
    },
    steps: [
      { title: "Pick a sort mode", detail: "Priority = score. Distance = nearest. Smart = score minus drive penalty." },
      { title: "Optimize Route", detail: "Builds up to 8 stops using traffic-aware Google Routes when configured." },
      { title: "Go Next Stop", detail: "Opens navigation to the first stop in the optimized plan." },
      { title: "Skip a stop", detail: "Removes it from the plan and silently reroutes the remaining stops." },
      { title: "Assign a tech", detail: "Recommend nearest/best tech → review reasons → Confirm Dispatch.", audience: "office" },
    ],
    inputs: [
      { name: "Sort: Priority / Distance / Value / Smart", description: "Changes queue order." },
      { name: "Optimize Route", description: "Creates ordered multi-stop plan from your GPS." },
      { name: "Find Clusters", description: "Groups nearby jobs into hotspot packs." },
      { name: "Go Next Stop", description: "Navigate to first planned stop." },
      { name: "Skip (per stop)", description: "Exclude stop and reroute remaining plan." },
      { name: "Assign", description: "Recommend and confirm tech dispatch.", audience: "office" },
      { name: "+ New Job", description: "Create a call-in job from the header.", audience: "office" },
    ],
    access: [
      { role: "Field Tech", permissions: "View queue, sort, optimize route, Go Next Stop, Skip." },
      { role: "Office", permissions: "All tech actions + Assign + New Job." },
      { role: "Admin / Owner", permissions: "Full queue + dispatch controls." },
    ],
    prioritization: [
      {
        phase: "Phase 2+ (Dispatch focus)",
        rules: [
          "Sold jobs and office call-ins rise to the top",
          "Power-on-drop and confirmed opportunities next",
          "Hunting clusters stay in the mix but rank below dispatch-ready work",
          "Smart sort = priority score minus drive-time penalty",
        ],
      },
    ],
  },
  techs: {
    title: "Techs",
    summary: "Live crew status and GPS — who is available and where they are.",
    bullets: [
      "Status: green = available, red = working, amber = paused, gray = offline.",
      "GPS refreshes ~every 30 seconds while the app is open.",
      "Next stop recommendation shown for available techs with location.",
    ],
    layman: {
      headline: "Where your crews are right now",
      plainEnglish: "See every tech's status and last GPS. Available techs show a recommended next stop based on queue priority.",
      onThisPage: ["Status chips", "GPS location", "Next stop recommendation", "Go / Route buttons"],
      tryThis: ["Check Available before assigning", "Route from tech GPS to their next job"],
    },
    steps: [
      { title: "Scan status counts", detail: "Available vs Working vs Offline at the top." },
      { title: "Find an available tech", detail: "Green = can take a new assignment." },
      { title: "Review next stop", detail: "System suggests highest-priority queue item from that tech's location." },
      { title: "Navigate or Route", detail: "Go = your map to the job. Route = line from tech GPS to job." },
    ],
    inputs: [
      { name: "Status chips", description: "Available, Working, Paused, Offline." },
      { name: "Go", description: "Navigate to recommended stop." },
      { name: "Route", description: "Draw route from tech location to job." },
      { name: "Refresh", description: "Reload tech list and GPS." },
    ],
    access: [
      { role: "Field Tech", permissions: "Hidden — office/admin only tab." },
      { role: "Office", permissions: "View all techs, navigate, route." },
      { role: "Admin / Owner", permissions: "Full tech panel access." },
    ],
  },
  territories: {
    title: "Territories",
    summary: "Split the map into ZIP or drawn zones, then link crews so dispatch and Route to Next prefer the right tech.",
    bullets: [
      "Draw polygon boundaries by clicking corners on the map — no deprecated Drawing library.",
      "Click Draw Polygon → click corners → Finish Polygon → drag vertices to adjust.",
      "Priority zones boost Route to Next and Assign scoring.",
      "Exclusion zones remove dots from routing recommendations.",
    ],
    layman: {
      headline: "Draw zones so the right crew gets nearby jobs",
      plainEnglish:
        "Split the map into areas using ZIP codes or drawn shapes. Link a technician to each area so when office assigns work — or when a tech hits Route to Next — the system prefers the crew that owns that territory. Priority zones (orange) boost hunting scores inside the boundary. Exclusion zones (red) hide areas from routing.",
      onThisPage: ["Territory list with names and ZIP/polygon areas", "Map for drawing and editing zone boundaries", "Zone type picker (Territory / Priority / Exclusion)", "Tech assignment section at the bottom"],
      tryThis: ["Set territories before a storm so dispatch has crew zones ready", "Draw a Priority zone over a honey hole to boost Route to Next there", "Link each tech to their home territory after drawing zones"],
    },
    steps: [
      { title: "Click + New Boundary", detail: "Opens the form. Give the zone a name, pick ZIP codes or Polygon mode, and choose zone type: Territory (crew home), Priority (score boost), or Exclusion (hide from routing)." },
      { title: "Draw on the map (polygon mode)", detail: "Click Draw Polygon, then click each corner. Drag the white handles to adjust placement. Ctrl+Z (or Undo) removes the last point." },
      { title: "Fine-tune the shape", detail: "Click Finish Polygon, then drag any corner or drag the whole shape to reposition. Changes save when you click Create Boundary." },
      { title: "Save the boundary", detail: "Click Create Boundary. Priority zones immediately boost Route to Next scores inside that area. Exclusion zones stop dots there from being recommended." },
      { title: "Assign techs to territories", detail: "Scroll to Tech Assignment at the bottom. Pick each crew member's home territory from the dropdown so Assign and dispatch scoring prefer the right owner." },
      { title: "Edit or delete later", detail: "Click any boundary in the list to edit its name, shape, or ZIP codes. Delete removes the zone — tech assignments to that zone are cleared." },
    ],
    inputs: [
      { name: "+ New Boundary", description: "Opens the create/edit form for a new zone." },
      { name: "Boundary name", description: "Required label shown in the list and tech assignment dropdown." },
      { name: "ZIP / Polygon toggle", description: "ZIP = type zip codes manually. Polygon = draw the shape on the map." },
      { name: "Zone type dropdown", description: "Territory = crew home area. Priority = boosts Route to Next score inside zone. Exclusion = hides dots from routing." },
      { name: "Draw Polygon", description: "Enters click-to-draw mode — each map click adds a corner point." },
      { name: "Finish Polygon", description: "Closes the shape after 3+ corners. Enables vertex dragging." },
      { name: "Create / Update Boundary", description: "Saves the zone to the database and redraws it on the map." },
      { name: "Boundary list (Edit / Delete)", description: "Manage existing zones — edit reopens the form, delete removes the zone." },
      { name: "Tech territory dropdown", description: "Links a crew member to a territory zone for dispatch scoring." },
    ],
    access: [
      { role: "Field Tech", permissions: "This tab is hidden. Territories affect your Route to Next scores but you cannot create or edit zones." },
      { role: "Office", permissions: "Create, edit, and delete boundaries. Assign techs to territories. Draw priority and exclusion zones." },
      { role: "Admin / Owner", permissions: "Full territory management — same as Office with no restrictions." },
    ],
    prioritization: [
      {
        phase: "How zones affect routing",
        rules: [
          "Priority zones (orange) add a large score boost to outages inside the boundary",
          "Exclusion zones (red) penalize or hide dots from Route to Next recommendations",
          "Territory zones link techs so Assign prefers the crew who owns that area",
          "Draw priority zones over known honey holes before Phase 1 hunting",
        ],
      },
    ],
  },
  admin: {
    title: "Admin",
    summary: "Storm control room — phase, data feeds, V1 rerouting logic, priority weights, simulation, cleanup, and exports.",
    bullets: [
      "Storm Phase is the master switch for V1 rerouting — changes what Route to Next and Job Queue prioritize.",
      "Map/queue use V1 scoring (small clusters beat large main-line events in Phase 1). Priority Weights below tune legacy job-creation bonuses.",
      "Territories priority zones and exclusion zones also feed into V1 zone score.",
      "Simulation lets you test rerouting without touching live utility data.",
    ],
    layman: {
      headline: "Storm control room — settings that affect everyone",
      plainEnglish:
        "This is where you steer the whole storm. Storm Phase tells the system whether crews should hunt new dots (Phase 1), run sold work (Phase 2), or finish cleanup (Phase 3). That phase instantly changes Route to Next on the map and sort order in Job Queue. Small clustered outages (six dots with 1–5 customers) rank above a single 80-customer utility main-line event in Phase 1 — by design. Use simulation to test rerouting before a live event.",
      onThisPage: [
        "Data Sources (Xcel / Connexus + fetch interval)",
        "Storm Phase 1 / 2 / 3 buttons",
        "Temp-Out Mode toggle",
        "Dispatch Guardrails (max jobs, overtime limits)",
        "Save & Apply",
        "Priority Scoring Weights (10 fields + Save Weights)",
        "Storm Simulation Mode + Apply Simulation",
        "Synthetic Outage Generator",
        "Load Real Snapshot into Test Mode",
        "Storm Event Sessions + Map Cleanup",
        "Data Storage metrics + Hot/Low-Yield zones + CSV exports",
      ],
      tryThis: [
        "Before storm: Phase 1 → Xcel ON → Save & Apply → draw priority zones in Territories",
        "When sales start: switch to Phase 2 → Save & Apply → watch Job Queue rise above hunting",
        "Wind-down: Phase 3 + Temp-Out ON → cleanup sweep → export CSVs",
        "Test rerouting: Simulation ON → Generate Clustered outages → Apply Simulation → Route to Next on map",
      ],
    },
    rerouting: {
      v1Formula:
        "Priority Score = Lead Status + Storm Phase Weight + Zone Score + Small-Outage Score + Cluster Score + Utility-Confirmed Bonus + Power Status Bonus − Drive Time Penalty − Exclusion Penalty",
      whereUsed: [
        "Live Map → Route to Next (picks highest score from tech GPS)",
        "Outages list → priority score column",
        "Job Queue → Priority and Smart sort",
        "Territories → priority zones boost score; exclusion zones hide dots",
      ],
      customerTiers: [
        "1–4 customers = high priority (individual service / mast work)",
        "5–10 customers = medium",
        "11–50 customers = low (likely feeder issue)",
        "50+ customers = very low (utility main-line — do not chase in Phase 1)",
      ],
      clusterRule:
        "Six nearby outages with 1–5 customers each score far higher than one outage with 80 customers. Cluster score is full weight in Phase 1, reduced in Phase 2, minimal in Phase 3.",
      stormDayFlow: [
        {
          when: "Storm starts — Phase 1 Hunting",
          actions: [
            "Set Phase 1 → Save & Apply",
            "Enable Xcel (and Connexus if needed)",
            "Techs use Route to Next — system favors honey holes and small-outage clusters",
            "Draw priority zones in Territories over known hot areas",
          ],
        },
        {
          when: "Sales ramp — Phase 2 Capture / Dispatch",
          actions: [
            "Set Phase 2 → Save & Apply",
            "Sold jobs and office call-ins jump above hunting targets",
            "Office assigns from Job Queue; techs Optimize Route",
            "Power-on-drop opportunities rank high",
          ],
        },
        {
          when: "Wind-down — Phase 3 Cleanup",
          actions: [
            "Set Phase 3 → Save & Apply",
            "Turn Temp-Out Mode ON if crews are doing temp power returns",
            "Temp power, grounding, and follow-ups rise; unvisited dots sink",
            "Sweep completed dots; archive stale markers",
          ],
        },
      ],
    },
    steps: [
      { title: "Configure data sources", detail: "In Data Sources: check Xcel Energy (primary feed). Optionally enable Connexus. Set Fetch Interval (5–60 min) for how often utility dots refresh." },
      { title: "Set Storm Phase", detail: "Click Phase 1 (Hunting), Phase 2 (Dispatch), or Phase 3 (Cleanup). This is the main rerouting control — it changes scoring for every tech immediately after Save & Apply." },
      { title: "Toggle Temp-Out Mode if needed", detail: "Turn ON when crews are securing customers with temporary power and returning later. Boosts temp-power workflow in Phase 3." },
      { title: "Set dispatch guardrails", detail: "Max Jobs/Tech, Overtime Soft Limit, and Overtime Hard Limit control how Assign recommends crews — prevents overload." },
      { title: "Click Save & Apply", detail: "Required to push phase, sources, temp-out, and guardrails live. Phase banner on every page updates instantly." },
      { title: "Tune priority weights (optional)", detail: "Priority Scoring Weights adjust bonuses when office creates jobs (office bonus, line drop, honey hole, etc.). Map Route to Next uses V1 phase logic separately — weights do not replace V1 cluster/small-outage tiers." },
      { title: "Click Save Weights", detail: "Saves the 10 weight fields to the database for job creation and cron scoring." },
      { title: "Test rerouting in simulation", detail: "Storm Simulation Mode → toggle ON → Generate Clustered or Honey Hole synthetic outages → Apply Simulation. Techs can Route to Next on fake data to verify phase logic." },
      { title: "Start a storm event session", detail: "Name the event (e.g. June 2026 Derecho) and click Start Session for historical tracking." },
      { title: "Cleanup when storm ends", detail: "Sweep Completed + Declined, Archive Stale (48h or 72h), export CSVs for records." },
    ],
    inputs: [
      { name: "Xcel Energy (ArcGIS) checkbox", description: "Primary live outage feed. Must be ON for real storm hunting." },
      { name: "Connexus Energy (ArcGIS) checkbox", description: "Secondary feed — requires CONNEXUS_ARCGIS_URL in server .env." },
      { name: "Fetch Interval (minutes)", description: "How often the cron job re-fetches utility data (5–60 min)." },
      { name: "Phase 1 — Hunting", description: "Rerouting favors priority zones, small-outage clusters, utility-confirmed dots. Large outages sink." },
      { name: "Phase 2 — Dispatch", description: "Rerouting favors sold jobs, office call-ins, power-on-drop. Hunting clusters continue but rank lower." },
      { name: "Phase 3 — Cleanup", description: "Rerouting favors sold jobs, temp power returns, grounding, office calls, then follow-ups." },
      { name: "Temp-Out Mode", description: "When ON, temp-power install → return workflow scores higher across the app." },
      { name: "Max Jobs / Tech", description: "Assign skips techs at or above this active job count." },
      { name: "Overtime Soft Limit (hours)", description: "Techs above this get lower assign score — still assignable." },
      { name: "Overtime Hard Limit (hours)", description: "Techs at/above this are skipped by auto-assign unless no one else fits." },
      { name: "Save & Apply", description: "Pushes data sources, phase, temp-out, and guardrails live — triggers rerouting recalculation." },
      { name: "Customers Multiplier", description: "Legacy job-creation weight. V1 map routing uses inverted small-outage tiers instead (small = high)." },
      { name: "Urgency Multiplier", description: "Boosts score for urgent outage types when creating jobs." },
      { name: "Office Job Bonus", description: "Flat bonus for office-entered call-in jobs." },
      { name: "Density Bonus (per nearby outage)", description: "Extra points per nearby outage — rewards hotspot areas in legacy scoring." },
      { name: "Time Weight (per hour)", description: "Points added per hour since outage first seen — older dots can rise." },
      { name: "Confirmed Opportunity Bonus", description: "Large boost when damage is confirmed with customer contact." },
      { name: "Wants-to-Proceed Bonus", description: "Boost when customer verbally wants to move forward." },
      { name: "Honey Hole Bonus (multi-customer)", description: "Boost for multi-customer opportunity clusters." },
      { name: "Line Drop Present Bonus", description: "Boost when investigation confirms a line down." },
      { name: "Line Drop w/ Power Bonus", description: "Extra boost when line down still has partial power — dangerous, high close rate." },
      { name: "Save Weights", description: "Writes all 10 priority weight fields to the database." },
      { name: "Simulation ON/OFF toggle", description: "Replaces live utility data with synthetic storm dots for testing rerouting." },
      { name: "Apply Simulation", description: "Activates or deactivates simulation mode on the map." },
      { name: "Outage Count (10/25/50/100)", description: "How many synthetic dots to generate." },
      { name: "Scenario Type (Mixed / Clustered / Sparse / Honey Hole)", description: "Shape of synthetic data — use Clustered or Honey Hole to test V1 cluster rerouting." },
      { name: "Generate outages button", description: "Creates synthetic dataset — does not affect live feeds until simulation is applied." },
      { name: "Load into Test (snapshots)", description: "Replay a saved real outage fetch as simulation data." },
      { name: "Refresh Snapshots", description: "Reloads list of saved outage snapshots." },
      { name: "Storm Event name + Start Session", description: "Names and begins a tracked storm session." },
      { name: "End Event", description: "Closes the active storm session." },
      { name: "Sweep Completed + Declined", description: "Removes finished/declined dots from active map — keeps DB history." },
      { name: "Archive Stale (48h / 72h)", description: "Hides untouched dots from active map after 48 or 72 hours." },
      { name: "Export CSV buttons", description: "Download outages (30d/90d), jobs (30d), or investigations (30d) for analysis." },
    ],
    access: [
      { role: "Field Tech", permissions: "Hidden — office/admin only tab." },
      { role: "Office", permissions: "View and change storm settings, sources, guardrails, weights." },
      { role: "Admin / Owner", permissions: "Full admin including simulation, synthetic generator, cleanup, exports." },
    ],
    prioritization: [
      {
        phase: "Phase 1 — Hunting (set in Admin)",
        rules: [
          "1. Priority zones / honey holes",
          "2. Clusters of small customer-count outages",
          "3. Utility-confirmed red-outline ArcGIS dots",
          "4. Under-10-customer outages",
          "5. Dots along the drive (closer = less penalty)",
          "6. Regular white ArcGIS dots",
          "Large outages intentionally deprioritized",
        ],
      },
      {
        phase: "Phase 2 — Capture / Dispatch",
        rules: [
          "1. Sold jobs",
          "2. Office-entered calls",
          "3. Power-on-drop opportunities",
          "4. Utility-confirmed red-outline dots",
          "5. Confirmed opportunities",
          "6. Hunting targets / small clusters (below dispatch)",
        ],
      },
      {
        phase: "Phase 3 — Cleanup",
        rules: [
          "1. Sold jobs",
          "2. Temp power / return-needed jobs",
          "3. Return for grounding",
          "4. Office calls",
          "5. Utility-confirmed dots",
          "6. Customer thinking / door hanger follow-ups",
          "7. Remaining unvisited dots",
        ],
      },
    ],
  },
  profile: {
    title: "Profile",
    summary: "Your account settings and sign-out.",
    bullets: ["Update name, phone, and password.", "Sign out clears session."],
    layman: {
      headline: "Your account",
      plainEnglish: "Update contact info and password. Sign out on shared devices.",
      onThisPage: ["Name / phone fields", "Password change", "Sign out"],
      tryThis: ["Keep phone current for dispatch SMS", "Sign out on shared tablets"],
    },
    steps: [
      { title: "Update name or phone", detail: "Save so dispatch and SMS reach the right person." },
      { title: "Change password", detail: "Enter current and new password if required by your org." },
      { title: "Sign out", detail: "Clears session and returns to login screen." },
    ],
    inputs: [
      { name: "Name / Phone", description: "Your display name and mobile for notifications." },
      { name: "Change password", description: "Updates login credentials." },
      { name: "Sign out", description: "Ends your session." },
    ],
    access: [
      { role: "Field Tech", permissions: "Edit own profile and sign out." },
      { role: "Office", permissions: "Edit own profile and sign out." },
      { role: "Admin / Owner", permissions: "Edit own profile and sign out." },
    ],
  },
  guide: {
    title: "Guide",
    summary: "Step-by-step navigation for every screen in the app.",
    bullets: [
      "Sidebar sections jump to each topic.",
      "Admins see Login & Database setup; techs see navigation only.",
      "Use the help button (bottom-right) for page-specific help on any screen.",
    ],
    layman: {
      headline: "Click-by-click walkthrough",
      plainEnglish: "Built-in manual for every screen. Use the bottom-right help button on any page for steps and inputs you can actually use.",
      onThisPage: ["Topic sidebar", "Step lists per screen", "Platform docs link"],
      tryThis: ["New user: read After Login sections in order", "Use ? help button while on any page"],
    },
    steps: [
      { title: "Pick a topic in the sidebar", detail: "Dashboard, Map, Queue, etc." },
      { title: "Follow the numbered steps", detail: "Each section explains clicks in order." },
      { title: "Open Platform docs", detail: "Deeper technical reference for admins." },
    ],
    inputs: [
      { name: "Sidebar topics", description: "Jump to any screen's guide section." },
      { name: "Platform docs link", description: "Full technical documentation." },
    ],
    access: [
      { role: "Field Tech", permissions: "Navigation guide sections." },
      { role: "Office", permissions: "All guide sections." },
      { role: "Admin / Owner", permissions: "All sections + Setup / database notes." },
    ],
  },
};

export const ALL_PAGE_IDS: PageHelpId[] = [
  "dashboard",
  "map",
  "outages",
  "opportunities",
  "queue",
  "techs",
  "territories",
  "admin",
  "profile",
  "guide",
];

/** Office-only tabs hidden from field techs in help picker */
export function pagesForRole(role?: string): PageHelpId[] {
  const isOffice = role === "office" || role === "admin" || role === "owner";
  return ALL_PAGE_IDS.filter((id) => {
    if (id === "techs" || id === "territories" || id === "admin") return isOffice;
    return true;
  });
}
