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
  steps: Array<{ title: string; detail: string }>;
  /** Buttons, toggles, and fields on this page */
  inputs: Array<{ name: string; description: string }>;
  /** Who can see or change what */
  access: Array<{ role: string; permissions: string }>;
};

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
      "Hide non-critical markers toggle lives in sidebar Map Layers.",
      "Collapsible legend — click Legend to shrink and free map space.",
    ],
    layman: {
      headline: "The map everyone works from",
      plainEnglish:
        "Every utility outage is a dot. Tap it, fill the quick form, and the dot updates so the whole team knows what happened. Route to Next sends you to the best stop for the current storm phase — not just the nearest dot.",
      onThisPage: ["Outage dots (shape = lead source, color = status)", "Collapsible legend", "Route to Next", "My Location / Satellite controls"],
      tryThis: ["Tap dot → Google Navigation at top of form", "Route to Next during Phase 1 for small outage clusters", "Collapse legend for more map space"],
    },
    steps: [
      { title: "Pan and zoom the map", detail: "Use pinch/drag or mouse. Toggle Satellite for roof-line context." },
      { title: "Tap an outage dot", detail: "Quick Investigate opens with customers affected, priority score, address, and Google Navigation." },
      { title: "Submit investigation", detail: "Pick outcome (utility issue, no damage, opportunity, not a target). Opportunity unlocks door actions and power status." },
      { title: "Use Route to Next", detail: "Picks the highest V1 score from your GPS: in Phase 1, clusters of 1–5 customer outages beat a single 80-customer main-line event." },
      { title: "Adjust map layers", detail: "Sidebar → Hide non-critical markers removes declined, completed, thinking, temp power, and grounding dots." },
    ],
    inputs: [
      { name: "Route to Next", description: "Scores all visible stops from your location using storm phase + cluster logic." },
      { name: "Quick Investigate form", description: "Primary outcome, door action, power status, optional service details." },
      { name: "Google Navigation", description: "Opens turn-by-turn in Google Maps app." },
      { name: "Hide non-critical markers", description: "Sidebar toggle — keeps map focused on active storm work." },
      { name: "Legend (collapsible)", description: "Top-left — explains dot shapes and colors." },
      { name: "Data Sources", description: "Toggle Xcel / Connexus feeds in sidebar." },
    ],
    access: [
      { role: "Field Tech", permissions: "View map, investigate dots, Route to Next, Add Opportunity." },
      { role: "Office", permissions: "Same as tech + remove markers, simulation tools in Admin." },
      { role: "Admin / Owner", permissions: "Full map access + all admin controls." },
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
      { title: "Change status if needed", detail: "Office can override status from dropdown on each row." },
    ],
    inputs: [
      { name: "Filter dropdown", description: "Limits list to one status." },
      { name: "Export CSV", description: "Downloads all visible outages for reporting." },
      { name: "Go", description: "Navigate to that address on Live Map." },
      { name: "Investigate", description: "Opens Quick Investigate form." },
      { name: "Status dropdown", description: "Manual status override (office use)." },
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
      { title: "Assign (office)", detail: "Recommend nearest/best tech → review reasons → Confirm Dispatch." },
    ],
    inputs: [
      { name: "Sort: Priority / Distance / Value / Smart", description: "Changes queue order." },
      { name: "Optimize Route", description: "Creates ordered multi-stop plan from your GPS." },
      { name: "Find Clusters", description: "Groups nearby jobs into hotspot packs." },
      { name: "Go Next Stop", description: "Navigate to first planned stop." },
      { name: "Skip (per stop)", description: "Exclude stop and reroute remaining plan." },
      { name: "Assign", description: "Office-only — recommend and confirm tech dispatch." },
    ],
    access: [
      { role: "Field Tech", permissions: "View queue, sort, optimize route, Go Next Stop, Skip." },
      { role: "Office", permissions: "All tech actions + Assign + New Job." },
      { role: "Admin / Owner", permissions: "Full queue + dispatch controls." },
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
    summary: "ZIP or polygon zones that influence dispatch scoring.",
    bullets: [
      "Draw polygon boundaries by clicking corners on the map — no deprecated Drawing library.",
      "Click Draw Polygon → click corners → Finish Polygon → drag vertices to adjust.",
      "Priority zones boost Route to Next and Assign scoring.",
    ],
    layman: {
      headline: "Draw zones so the right crew gets nearby jobs",
      plainEnglish: "Create territory, priority, or exclusion zones. Link techs to territories so Assign prefers the right crew.",
      onThisPage: ["+ New Boundary form", "Draw Polygon map", "Boundary list", "Tech assignment"],
      tryThis: ["Draw Polygon → click corners → Finish Polygon", "Set zone type: Territory, Priority, or Exclusion", "Link techs to home territories"],
    },
    steps: [
      { title: "Click + New Boundary", detail: "Enter name, choose ZIP or Polygon, pick zone type (Territory / Priority / Exclusion)." },
      { title: "Draw Polygon (if polygon mode)", detail: "Click Draw Polygon, then click each corner on the map. Click Finish Polygon after 3+ points." },
      { title: "Adjust vertices", detail: "Drag corner points on the editable polygon to fine-tune the boundary." },
      { title: "Create Boundary", detail: "Saves to the system — priority zones immediately affect routing scores." },
      { title: "Assign techs", detail: "Link each tech to their home territory at the bottom of this page." },
    ],
    inputs: [
      { name: "Boundary name", description: "Required label for the zone." },
      { name: "ZIP / Polygon mode", description: "ZIP = enter codes. Polygon = draw on map." },
      { name: "Zone type", description: "Territory (crew home), Priority (boost score), Exclusion (hide from routing)." },
      { name: "Draw Polygon", description: "Starts click-to-draw mode on the map." },
      { name: "Finish Polygon", description: "Closes shape after 3+ corner clicks." },
      { name: "Tech territory dropdown", description: "Assigns a tech to a territory zone." },
    ],
    access: [
      { role: "Field Tech", permissions: "Hidden — office/admin only tab." },
      { role: "Office", permissions: "Create, edit, delete boundaries; assign tech territories." },
      { role: "Admin / Owner", permissions: "Full territory management." },
    ],
  },
  admin: {
    title: "Admin",
    summary: "Storm mode, data sources, integrations, cleanup, and exports.",
    bullets: [
      "Storm Phase controls V1 routing priority (Phase 1 hunt → Phase 2 dispatch → Phase 3 cleanup).",
      "Temp-Out mode prioritizes temp power workflow.",
      "Simulation, cleanup, exports, and dispatch guardrails.",
    ],
    layman: {
      headline: "Storm control room — settings that affect everyone",
      plainEnglish: "Controls storm phase, data feeds, job ranking weights, and cleanup tools. Only office/admin should change these during a live event.",
      onThisPage: ["Storm Phase buttons", "Data Sources", "Temp-Out toggle", "Dispatch Guardrails", "Simulation", "Exports"],
      tryThis: ["Storm start: Phase 1 + Xcel ON", "Sales ramp: Phase 2", "End: Phase 3 + cleanup sweep"],
    },
    steps: [
      { title: "Set Storm Phase", detail: "Phase 1 = hunt small clusters. Phase 2 = dispatch sold/office calls. Phase 3 = cleanup returns and follow-ups." },
      { title: "Enable data sources", detail: "Turn Xcel/Connexus ON and set fetch interval." },
      { title: "Save & Apply", detail: "Writes settings — phase change immediately affects Route to Next scoring." },
      { title: "Configure guardrails", detail: "Max jobs per tech and overtime limits for Assign recommendations." },
      { title: "Run cleanup when storm ends", detail: "Sweep completed/declined dots; export CSVs for records." },
    ],
    inputs: [
      { name: "Storm Phase (1/2/3)", description: "Changes routing priority across map and queue." },
      { name: "Temp-Out Mode", description: "Prioritizes temp power install → return workflow." },
      { name: "Active Sources", description: "Xcel / Connexus outage feeds." },
      { name: "Fetch Interval", description: "How often utility data refreshes." },
      { name: "Dispatch Guardrails", description: "Max jobs per tech, overtime soft/hard limits." },
      { name: "Simulation Mode", description: "Synthetic dots for training — not real customers." },
    ],
    access: [
      { role: "Field Tech", permissions: "Hidden — office/admin only tab." },
      { role: "Office", permissions: "View and change storm settings, sources, guardrails." },
      { role: "Admin / Owner", permissions: "Full admin including simulation, cleanup, exports." },
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
      "Use the ? button (bottom-left) for page-specific help on any screen.",
    ],
    layman: {
      headline: "Click-by-click walkthrough",
      plainEnglish: "Built-in manual for every screen. Use the bottom-left help button on any page for steps, inputs, and role permissions.",
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
