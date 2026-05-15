/**
 * Adapter factory + orchestrator
 *
 * Your app → /api/outages → HERE → (Xcel | Connexus) → normalized format
 *
 * This is the single place to add new utility providers.
 */

import { fetchXcel } from "./xcel";
import { fetchConnexus } from "./connexus";
import type { AdapterResult, NormalizedOutage } from "./types";
import { getAdmin, isSupabaseConfigured } from "../supabase";

export type { AdapterResult, NormalizedOutage };

/** Fetch from one or more sources, store raw snapshot, return normalized */
export async function fetchAndNormalize(
  sources: Array<"xcel" | "connexus"> = ["xcel"]
): Promise<{
  outages: NormalizedOutage[];
  results: AdapterResult[];
  snapshotIds: string[];
}> {
  const results: AdapterResult[] = [];

  // Fetch all requested sources in parallel
  const fetches = sources.map((s) => (s === "xcel" ? fetchXcel() : fetchConnexus()));
  const settled = await Promise.allSettled(fetches);

  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      results.push(s.value);
    } else {
      results.push({
        outages: [],
        rawData: null,
        source: sources[i],
        fetchedAt: new Date().toISOString(),
        error: s.reason?.message ?? "Fetch rejected",
        schemaWarnings: [],
      });
    }
  });

  // Store raw snapshots to DB (fire-and-forget with error capture)
  const snapshotIds: string[] = [];
  if (isSupabaseConfigured) {
    const db = getAdmin();
    for (const result of results) {
      try {
        const { data } = await db
          .from("outage_snapshots")
          .insert({
            source: result.source,
            raw_data: result.rawData ?? {},
            normalized_count: result.outages.length,
            error: result.error,
          })
          .select("id")
          .single();
        if (data?.id) snapshotIds.push(data.id);
      } catch (err) {
        console.error("[adapter] Failed to store snapshot:", err);
      }
    }
  }

  // Merge and deduplicate by id (Connexus outages keep their `cnx-` prefix)
  const all = results.flatMap((r) => r.outages);
  const seen = new Set<string>();
  const outages = all.filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });

  return { outages, results, snapshotIds };
}

/** Get last known snapshot for a source (fallback when live fetch fails) */
export async function getLastSnapshot(
  source: "xcel" | "connexus"
): Promise<NormalizedOutage[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const db = getAdmin();
    const { data } = await db
      .from("outage_snapshots")
      .select("raw_data, source")
      .eq("source", source)
      .is("error", null)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    if (!data?.raw_data) return [];

    const raw = data.raw_data as any;
    if (!Array.isArray(raw.features)) return [];

    const { normalizeXcelFeature } = await import("./xcel");
    const { normalizeConnexusFeature } = await import("./connexus");
    const normalize = source === "xcel" ? normalizeXcelFeature : normalizeConnexusFeature;

    return raw.features
      .map(normalize)
      .filter((o: NormalizedOutage) => o.lat != null && o.lng != null);
  } catch (err) {
    console.error("[adapter] getLastSnapshot error:", err);
    return [];
  }
}
