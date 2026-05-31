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
};

export const PAGE_HELP: Record<PageHelpId, PageHelpContent> = {
  dashboard: {
    title: "Dashboard",
    summary: "Storm-wide snapshot before you dispatch or send techs to the map.",
    bullets: [
      "Stat cards count outages by status — watch Unvisited during Phase 1 hunting.",
      "Technician summary shows how many crews are available vs working.",
      "Use this page at shift start; drill into Live Map or Job Queue for action.",
    ],
  },
  map: {
    title: "Live Map",
    summary: "Primary field and office view for every outage dot in your radius.",
    bullets: [
      "Click a dot to open details, then Investigate to submit the field form.",
      "Toggle Xcel / Connexus in the sidebar to control which feeds appear.",
      "Use Hide done / Hide declined to reduce clutter; Route to Nearest sends you to the closest unvisited dot.",
      "Colors match the legend — gray badge = Unvisited; white circle with gray ring on the map.",
    ],
  },
  outages: {
    title: "Outages",
    summary: "Sortable list of every dot — your hunting board, not dispatch-ready jobs.",
    bullets: [
      "Filter by status or export CSV for office reporting.",
      "Status column shows color-coded labels — Unvisited is gray.",
      "View / Go / Investigate per row; change status from the dropdown if needed.",
      "Sold or dispatch-ready work moves to Job Queue, not this list.",
    ],
  },
  opportunities: {
    title: "Opportunities",
    summary: "Confirmed damage with customer contact — follow-up and sales, not dispatch yet.",
    bullets: [
      "Door hangers, thinking customers, and verbal quotes stay here until sold.",
      "Navigate opens the location on Live Map.",
      "When a job is sold or customer wants to proceed, it leaves this list for Job Queue.",
    ],
  },
  queue: {
    title: "Job Queue",
    summary: "Dispatch-ready work only — assign techs, optimize routes, and find clusters.",
    bullets: [
      "Sort by Priority, Distance, Value, or Smart before assigning.",
      "Assign shows a recommended tech with score and reasons before you confirm.",
      "Optimize Route and Find Clusters help plan efficient storm movement.",
    ],
  },
  techs: {
    title: "Techs",
    summary: "Live crew status and GPS — who is available and where they are.",
    bullets: [
      "Status colors: green = available, red = working, amber = paused, gray = offline.",
      "Locations refresh about every 30 seconds while the tech app is open.",
      "Navigate to a tech or route from tech to their next assigned job.",
    ],
  },
  territories: {
    title: "Territories",
    summary: "ZIP or polygon zones that influence dispatch scoring.",
    bullets: [
      "Draw or edit territories so assign recommendations prefer the right crew.",
      "Jobs with a matching ZIP score higher for techs linked to that territory.",
    ],
  },
  admin: {
    title: "Admin",
    summary: "Storm mode, data sources, integrations, cleanup, and exports.",
    bullets: [
      "Set Storm Phase (1 hunt → 2 dispatch → 3 cleanup) and Temp-Out mode.",
      "Adjust fetch interval, dispatch weights, and crew guardrails.",
      "Run map cleanup, export CSVs, and enable simulation for training.",
    ],
  },
  profile: {
    title: "Profile",
    summary: "Your account settings and sign-out.",
    bullets: [
      "Update name, phone, and password.",
      "Sign out clears your session and returns to the public landing page.",
    ],
  },
  guide: {
    title: "Guide",
    summary: "Step-by-step navigation, login help, and local database setup.",
    bullets: [
      "Use the sidebar sections to jump to a topic.",
      "Default dev logins and .env dev/prod keys are documented under Login & Database.",
      "Open Platform docs for routing, API, and feature reference.",
    ],
  },
};
