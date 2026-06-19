/** Tracks the outage a tech must clear before routing to the next stop. */

const STORAGE_KEY = "fieldmap_pending_visit";

export type PendingVisit = {
  outageId: string;
  routedAt: string;
};

export function needsInvestigation(status: string): boolean {
  return status === "unvisited" || status === "investigating";
}

export function loadPendingVisit(): PendingVisit | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingVisit;
    return parsed?.outageId ? parsed : null;
  } catch {
    return null;
  }
}

export function savePendingVisit(outageId: number | string): PendingVisit {
  const entry: PendingVisit = { outageId: String(outageId), routedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  return entry;
}

export function clearPendingVisit(): void {
  localStorage.removeItem(STORAGE_KEY);
}
