import { getAdmin, isSupabaseConfigured } from "./supabase";

export type StormEventRow = {
  id: string;
  name: string;
  started_at: string;
  ended_at?: string | null;
};

export async function getActiveStormEvent(): Promise<StormEventRow | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const db = getAdmin();
    const { data: setting } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "active_storm_event_id")
      .maybeSingle();

    const raw = setting?.value;
    const eventId = typeof raw === "string" && raw.length > 10 ? raw : null;
    if (!eventId || eventId === "null") return null;

    const { data: event } = await db
      .from("storm_events")
      .select("id, name, started_at, ended_at")
      .eq("id", eventId)
      .is("ended_at", null)
      .maybeSingle();

    return event ?? null;
  } catch {
    return null;
  }
}

export async function setActiveStormEventId(eventId: string | null): Promise<void> {
  if (!isSupabaseConfigured) return;
  const db = getAdmin();
  await db
    .from("app_settings")
    .upsert({ key: "active_storm_event_id", value: eventId }, { onConflict: "key" });
}

/** Tag new outage rows with the active storm when one is running. */
export async function applyActiveStormToRow<T extends Record<string, unknown>>(
  row: T,
  isNew: boolean
): Promise<T & { storm_event_id?: string }> {
  if (!isNew) return row;
  const active = await getActiveStormEvent();
  if (!active) return row;
  return { ...row, storm_event_id: active.id };
}

export function isPreviousStormMarker(
  outage: { stormEventId?: string | null; firstSeenAt?: string | null },
  activeEvent: StormEventRow | null
): boolean {
  if (!activeEvent) return false;
  if (outage.stormEventId) return outage.stormEventId !== activeEvent.id;
  if (outage.firstSeenAt) {
    return new Date(outage.firstSeenAt).getTime() < new Date(activeEvent.started_at).getTime();
  }
  return true;
}
