export type OutageStatus =
  | "unvisited"
  | "investigating"
  | "no_opportunity"
  | "opportunity"
  | "door_hanger"
  | "wants_to_proceed"
  | "customer_thinking"
  | "sold"
  | "job_started"
  | "temp_power"
  | "grounding"
  | "completed";

export type StatusStyle = {
  color: string;
  strokeColor: string;
  bg: string;
  label: string;
  /** Readable text on status badges (when map fill is white) */
  badgeText: string;
};

export const STATUS_CONFIG: Record<OutageStatus, StatusStyle> = {
  unvisited: {
    color: "#ffffff",
    strokeColor: "#6b7280",
    bg: "#e5e7eb",
    label: "Unvisited",
    badgeText: "#374151",
  },
  investigating: {
    color: "#a855f7",
    strokeColor: "#7e22ce",
    bg: "#faf5ff",
    label: "Investigating",
    badgeText: "#6b21a8",
  },
  no_opportunity: {
    color: "#111827",
    strokeColor: "#111827",
    bg: "#f3f4f6",
    label: "Declined / Dead",
    badgeText: "#111827",
  },
  opportunity: {
    color: "#ffffff",
    strokeColor: "#f97316",
    bg: "#fff7ed",
    label: "Opportunity Found",
    badgeText: "#c2410c",
  },
  door_hanger: {
    color: "#ec4899",
    strokeColor: "#be185d",
    bg: "#fdf2f8",
    label: "Door Hanger Left",
    badgeText: "#9d174d",
  },
  wants_to_proceed: {
    color: "#f97316",
    strokeColor: "#22c55e",
    bg: "#f0fdf4",
    label: "Wants to Proceed",
    badgeText: "#15803d",
  },
  customer_thinking: {
    color: "#9ca3af",
    strokeColor: "#6b7280",
    bg: "#f3f4f6",
    label: "Customer Thinking",
    badgeText: "#4b5563",
  },
  sold: {
    color: "#ffffff",
    strokeColor: "#22c55e",
    bg: "#f0fdf4",
    label: "Job Sold",
    badgeText: "#15803d",
  },
  job_started: {
    color: "#22c55e",
    strokeColor: "#16a34a",
    bg: "#ecfdf5",
    label: "Job Started",
    badgeText: "#166534",
  },
  temp_power: {
    color: "#facc15",
    strokeColor: "#f97316",
    bg: "#fffbeb",
    label: "Temp Power Installed",
    badgeText: "#b45309",
  },
  grounding: {
    color: "#facc15",
    strokeColor: "#22c55e",
    bg: "#f0fdf4",
    label: "Return for Grounding",
    badgeText: "#15803d",
  },
  completed: {
    color: "#2563eb",
    strokeColor: "#1d4ed8",
    bg: "#eff6ff",
    label: "Completed",
    badgeText: "#1e40af",
  },
};

export function getStatusConfig(status: string | undefined | null): StatusStyle {
  return STATUS_CONFIG[status as OutageStatus] ?? STATUS_CONFIG.unvisited;
}

export function statusBadgeStyle(cfg: StatusStyle): Record<string, string | number> {
  return {
    padding: "3px 10px",
    background: cfg.bg,
    color: cfg.badgeText,
    border: `1px solid ${cfg.strokeColor}`,
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
    display: "inline-block",
    whiteSpace: "nowrap",
  };
}
