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
    layman: {
      headline: "Your storm morning briefing",
      plainEnglish:
        "Think of this as the scoreboard at the start of a shift. It tells you how big the storm is, how many dots nobody has visited yet, and whether your crews are free or already working.",
      onThisPage: [
        "Number cards — each shows a count (unvisited dots, opportunities, jobs waiting, customers without power).",
        "Technician summary — how many techs are available vs busy.",
        "Phase banner at the top — reminds you if you're hunting (Phase 1), dispatching (Phase 2), or cleaning up (Phase 3).",
      ],
      tryThis: [
        "Open this first when a storm starts to see how much work is out there.",
        "If Unvisited is high, send techs to Live Map to hunt.",
        "If sold jobs are climbing, switch focus to Job Queue for dispatch.",
      ],
    },
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
    layman: {
      headline: "The map everyone works from",
      plainEnglish:
        "Every power outage from the utility shows up as a dot. Tap a dot, knock on the door, fill out a quick form, and the dot changes color so the whole team knows what happened.",
      onThisPage: [
        "Colored dots — each is a real outage location from Xcel or Connexus.",
        "Legend — explains what each color and shape means (unvisited, sold, door hanger, etc.).",
        "Top buttons — Route to Nearest, Add Opportunity, hide finished dots.",
        "Sidebar toggles — turn Xcel or Connexus feeds on/off.",
      ],
      tryThis: [
        "Tap any dot → Investigate → pick an outcome (no answer, opportunity, sold, etc.).",
        "Use Route to Nearest to jump to the closest unvisited stop.",
        "Red + button adds a new lead at an address you found in the field.",
      ],
    },
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
    layman: {
      headline: "Your hunting list — not the dispatch list",
      plainEnglish:
        "This is every outage dot in a spreadsheet-style view. Use it to see what's still unvisited, filter by neighborhood, or export for the office. Jobs that are sold and ready for a crew show up in Job Queue instead.",
      onThisPage: [
        "Table rows — one row per outage with address, status, and customer count.",
        "Status badges — color tells you if it's unvisited, investigating, sold, etc.",
        "Filters — narrow to one status or search by street/city.",
        "Go / Investigate buttons — same actions as the map, without panning around.",
      ],
      tryThis: [
        "Filter to Unvisited during Phase 1 to see what's left to knock.",
        "Click Go to open that address on the map for navigation.",
        "Don't look here for dispatch — check Job Queue once jobs are sold.",
      ],
    },
  },
  opportunities: {
    title: "Opportunities",
    summary: "Confirmed damage with customer contact — follow-up and sales, not dispatch yet.",
    bullets: [
      "Door hangers, thinking customers, and verbal quotes stay here until sold.",
      "Navigate opens the location on Live Map.",
      "When a job is sold or customer wants to proceed, it leaves this list for Job Queue.",
    ],
    layman: {
      headline: "Warm leads — not ready to dispatch yet",
      plainEnglish:
        "These are homes where your tech found something interesting: left a door hanger, customer is thinking, or wants a quote later. Office follows up here until the job is sold and moves to the queue.",
      onThisPage: [
        "List of follow-up leads with address and status.",
        "Door hanger, thinking, wants-to-proceed types stay here until sold.",
        "Navigate — jump to that house on the map.",
      ],
      tryThis: [
        "Office calls customers from this list during Phase 1 and early Phase 2.",
        "Once sold, the job disappears from here and appears in Job Queue.",
      ],
    },
  },
  queue: {
    title: "Job Queue",
    summary: "Dispatch-ready work only — assign techs, optimize routes, and find clusters.",
    bullets: [
      "Sort by Priority, Distance, Value, or Smart before assigning.",
      "Assign shows a recommended tech with score and reasons before you confirm.",
      "Optimize Route and Find Clusters help plan efficient storm movement.",
    ],
    layman: {
      headline: "The dispatch board — who goes where",
      plainEnglish:
        "Only jobs that are sold or ready for a crew show up here. Office picks the best tech, confirms dispatch, and can build an efficient driving order. Techs can optimize their own route too.",
      onThisPage: [
        "Job cards — sold work and office call-ins waiting for a crew.",
        "Sort dropdown — priority, distance, value, or smart mix.",
        "Assign — recommends nearest/best tech; you confirm before SMS goes out.",
        "Optimize Route — orders stops using traffic-aware routing when available.",
        "Find Clusters — groups nearby jobs so one crew hits a hotspot.",
      ],
      tryThis: [
        "Office: Assign → review recommendation → Confirm Dispatch.",
        "Tech: Optimize Route → Go Next Stop → Skip if you pass one.",
        "Use Smart sort when you want high-value jobs that aren't too far.",
      ],
    },
  },
  techs: {
    title: "Techs",
    summary: "Live crew status and GPS — who is available and where they are.",
    bullets: [
      "Status colors: green = available, red = working, amber = paused, gray = offline.",
      "Locations refresh about every 30 seconds while the tech app is open.",
      "Navigate to a tech or route from tech to their next assigned job.",
    ],
    layman: {
      headline: "Where your crews are right now",
      plainEnglish:
        "See every tech on a mini-map and list: who's free, who's on a job, and where their phone last reported GPS. Updates about every 30 seconds while their app is open.",
      onThisPage: [
        "Status chips — Available (green), Working (red), Paused (amber), Offline (gray).",
        "Last known location — from the tech's phone GPS.",
        "Assigned job — what they're working on, if anything.",
      ],
      tryThis: [
        "Before assigning, check who's Available and closest on the map.",
        "If someone shows Offline, they may have closed the app.",
      ],
    },
  },
  territories: {
    title: "Territories",
    summary: "ZIP or polygon zones that influence dispatch scoring.",
    bullets: [
      "Draw or edit territories so assign recommendations prefer the right crew.",
      "Jobs with a matching ZIP score higher for techs linked to that territory.",
    ],
    layman: {
      headline: "Draw zones so the right crew gets nearby jobs",
      plainEnglish:
        "Split the map into areas (ZIP codes or drawn shapes) and link techs to each zone. When office hits Assign, the system prefers techs who 'own' that territory.",
      onThisPage: [
        "Territory list — names and ZIP lists or polygon areas.",
        "Map — draw or edit zone boundaries.",
        "Tech assignment — which crew covers which zone.",
      ],
      tryThis: [
        "Set territories before the storm so dispatch isn't guessing.",
        "After drawing, link each tech to their home territory.",
      ],
    },
  },
  admin: {
    title: "Admin",
    summary: "Storm mode, data sources, integrations, cleanup, and exports.",
    bullets: [
      "Set Storm Phase (1 hunt → 2 dispatch → 3 cleanup) and Temp-Out mode.",
      "Adjust fetch interval, dispatch weights, and crew guardrails.",
      "Run map cleanup, export CSVs, and enable simulation for training.",
    ],
    layman: {
      headline: "Storm control room — settings that affect everyone",
      plainEnglish:
        "This page controls how the whole app behaves during a storm: which utility feeds load, what phase you're in, how jobs get ranked, and when to clean up the map. Only office/admin should change these during a live event.",
      onThisPage: [
        "Data Sources — turn Xcel/Connexus feeds on; set how often data refreshes.",
        "Storm Phase — Phase 1 hunt, Phase 2 dispatch, Phase 3 cleanup.",
        "Temp-Out Mode — prioritize temporary power jobs (secure → temp power → return).",
        "Dispatch Guardrails — max jobs per tech and overtime limits for Assign.",
        "Priority Weights — numbers that control which jobs float to the top.",
        "Simulation — practice with fake dots; never affects real customers when used correctly.",
        "Storm Events — name and track a storm session; cleanup tools between events.",
        "Exports — download CSV files for reporting.",
      ],
      tryThis: [
        "Start of storm: Phase 1, check Xcel is ON, Save & Apply.",
        "When sales ramp up: switch to Phase 2.",
        "End of storm: Phase 3, Sweep Completed + Declined, export CSVs.",
        "Hover any teal ? icon on this page for field-level help.",
      ],
    },
  },
  profile: {
    title: "Profile",
    summary: "Your account settings and sign-out.",
    bullets: [
      "Update name, phone, and password.",
      "Sign out clears your session and returns to the public landing page.",
    ],
    layman: {
      headline: "Your account",
      plainEnglish: "Update your name, phone, or password. Sign out when you're done — especially on a shared device.",
      onThisPage: ["Name and phone fields.", "Change password section.", "Sign out button."],
      tryThis: ["Keep your phone current so dispatch SMS reaches you.", "Sign out at end of shift on shared tablets."],
    },
  },
  guide: {
    title: "Guide",
    summary: "Step-by-step navigation for every screen in the app.",
    bullets: [
      "Use the sidebar sections to jump to a topic.",
      "Admins see Login & Database setup at the bottom; tech and office see navigation only.",
      "Open Platform docs for routing, API, and feature reference.",
    ],
    layman: {
      headline: "Click-by-click walkthrough",
      plainEnglish:
        "A built-in manual for every screen in the app. Jump to any section in the sidebar. Admins also see database and login setup at the bottom.",
      onThisPage: [
        "Sidebar topics — jump to Dashboard, Map, Queue, etc.",
        "Step lists — what to click in order.",
        "Platform docs link — deeper technical reference.",
      ],
      tryThis: [
        "New user? Read 'After Login' sections in order.",
        "Admin only: scroll to Setup for dev logins and database notes.",
      ],
    },
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
