/** Field dispatch roles — distinct from auth roles (office/tech/admin). */

export type FieldDispatchRole = "hunter" | "seller" | "installer" | "finisher";
export type InstallerFallback = "hunter" | "seller";

export const DEFAULT_DISPATCH_ROLE: FieldDispatchRole = "hunter";
export const DEFAULT_INSTALLER_FALLBACK: InstallerFallback = "hunter";

export const DISPATCH_ROLE_LABELS: Record<
  FieldDispatchRole,
  { title: string; description: string }
> = {
  hunter: {
    title: "Hunter",
    description: "Find damage, visit unworked outage dots, clear the map.",
  },
  seller: {
    title: "Seller",
    description: "Follow up on confirmed opportunities and convert to sold jobs.",
  },
  installer: {
    title: "Installer",
    description: "Handle sold work — job sold and job started stops.",
  },
  finisher: {
    title: "Finisher",
    description: "Cleanup — temp power, grounding, and incomplete jobs.",
  },
};

export function parseDispatchRole(value: unknown): FieldDispatchRole {
  if (value === "seller" || value === "installer" || value === "finisher") return value;
  return DEFAULT_DISPATCH_ROLE;
}

export function parseInstallerFallback(value: unknown): InstallerFallback {
  return value === "seller" ? "seller" : DEFAULT_INSTALLER_FALLBACK;
}
