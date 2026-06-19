import { getAdmin, isSupabaseConfigured } from "./supabase";

export type RoutingMode = "complicated" | "simple";

export const ROUTING_MODE_LABELS: Record<RoutingMode, { title: string; description: string }> = {
  complicated: {
    title: "Complicated routing",
    description:
      "Phase-aware V1 scoring with cluster density, storm phase weights, utility confirmation bonuses, and multi-stop optimization.",
  },
  simple: {
    title: "Simple routing",
    description:
      "Nearest-first dispatch with basic status priority. No storm phases, clusters, or multi-stop optimization.",
  },
};

export const DEFAULT_ROUTING_MODE: RoutingMode = "complicated";

export function parseRoutingMode(value: unknown): RoutingMode {
  return value === "simple" ? "simple" : "complicated";
}

export async function getRoutingMode(): Promise<RoutingMode> {
  if (!isSupabaseConfigured) return DEFAULT_ROUTING_MODE;
  try {
    const db = getAdmin();
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "routing_mode")
      .maybeSingle();
    return parseRoutingMode(data?.value);
  } catch {
    return DEFAULT_ROUTING_MODE;
  }
}
