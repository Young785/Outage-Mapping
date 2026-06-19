/** Sync map marker coordinates to linked office / Housecall job rows. */

import type { getAdmin } from "./supabase";

type AdminDb = ReturnType<typeof getAdmin>;

export async function syncLinkedJobLocation(
  db: AdminDb,
  outageId: string | number,
  lat: number,
  lng: number,
  address?: string | null
): Promise<void> {
  const id = String(outageId);
  const patch: Record<string, unknown> = {
    customer_lat: lat,
    customer_lng: lng,
    updated_at: new Date().toISOString(),
  };
  if (address != null) patch.customer_address = address;

  if (id.startsWith("office-")) {
    await db.from("jobs").update(patch).eq("id", id.slice("office-".length));
    return;
  }

  const { data: linked } = await db.from("jobs").select("id").eq("outage_id", id).maybeSingle();
  if (linked?.id) {
    await db.from("jobs").update(patch).eq("id", linked.id);
  }
}
