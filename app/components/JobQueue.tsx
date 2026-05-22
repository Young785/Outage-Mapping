"use client";

import { useState, useEffect, useCallback } from "react";

type QueueItem = {
  id: string;
  type: "job" | "outage";
  source: string;
  displayName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  customers: number;
  priorityScore: number;
  status: string;
  isConfirmed: boolean;
  distanceMiles: number | null;
  estimatedMinutes: number | null;
  inTerritory: boolean;
  jobType: string | null;
  customerPhone: string | null;
  assignedTechId: string | null;
  priority: number | null;
  createdAt: string;
};

type Props = {
  token: string;
  role: "office" | "tech" | "admin" | "owner";
  userLocation: { lat: number; lng: number } | null;
  onNavigate: (lat: number, lng: number, address?: string) => void;
  onShowJobForm: () => void;
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:     { bg: "#fef3c7", color: "#92400e" },
  assigned:    { bg: "#dbeafe", color: "#1e40af" },
  in_progress: { bg: "#fef3c7", color: "#92400e" },
  completed:   { bg: "#d1fae5", color: "#065f46" },
  cancelled:   { bg: "#f3f4f6", color: "#6b7280" },
  unvisited:   { bg: "#fef3c7", color: "#92400e" },
  investigating:{ bg: "#dbeafe", color: "#1e40af" },
  resolved:    { bg: "#d1fae5", color: "#065f46" },
};

export default function JobQueue({ token, role, userLocation, onNavigate, onShowJobForm }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isCompactDesktop, setIsCompactDesktop] = useState(false);
  const [sort, setSort] = useState<"priority" | "distance" | "value">("priority");
  const [filter, setFilter] = useState<"all" | "job" | "outage">("all");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignResult, setAssignResult] = useState<any | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort });
      if (userLocation) {
        params.set("techLat", userLocation.lat.toString());
        params.set("techLng", userLocation.lng.toString());
      }
      const res = await fetch(`/api/jobs/queue?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setQueue(data.queue ?? []);
    } catch (err) {
      console.error("Queue load error:", err);
    } finally {
      setLoading(false);
    }
  }, [sort, userLocation]);

  useEffect(() => { loadQueue(); }, [loadQueue]);
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      setIsCompactDesktop(w >= 768 && w < 1480);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const filtered = queue.filter((item) => filter === "all" || item.type === filter);

  async function findClosestTech(item: QueueItem) {
    if (!item.lat || !item.lng) return;
    setAssigning(item.id);
    setAssignResult(null);
    try {
      const body = item.type === "outage"
        ? { outageId: item.id, targetLat: item.lat, targetLng: item.lng, confirm: false }
        : { jobId: item.id, targetLat: item.lat, targetLng: item.lng, confirm: false };
      const res = await fetch("/api/jobs/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAssignResult({ itemId: item.id, ...data.recommended });
    } catch (err: any) {
      setAssignResult({ itemId: item.id, error: err.message });
    } finally {
      setAssigning(null);
    }
  }

  async function confirmAssign() {
    if (!assignResult) return;
    const item = queue.find((q) => q.id === assignResult.itemId);
    try {
      const body = item?.type === "outage"
        ? { outageId: assignResult.itemId, targetLat: item?.lat ?? 0, targetLng: item?.lng ?? 0, confirm: true }
        : { jobId: assignResult.itemId, targetLat: 0, targetLng: 0, confirm: true };
      const res = await fetch("/api/jobs/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setAssignResult(null);
        loadQueue();
      }
    } catch {}
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#374151", alignSelf: "center" }}>Sort:</span>
          {(["priority", "distance", "value"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              style={{
                padding: "6px 14px",
                border: `1px solid ${sort === s ? "#0d9488" : "#e5e7eb"}`,
                borderRadius: "20px",
                background: sort === s ? "#ccfbf1" : "#fff",
                color: sort === s ? "#0d9488" : "#6b7280",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <span style={{ width: "1px", background: "#e5e7eb", margin: "0 4px" }} />
          {(["all", "job", "outage"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px",
                border: `1px solid ${filter === f ? "#7c3aed" : "#e5e7eb"}`,
                borderRadius: "20px",
                background: filter === f ? "#ede9fe" : "#fff",
                color: filter === f ? "#7c3aed" : "#6b7280",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {(role === "office" || role === "admin" || role === "owner") && (
          <button
            onClick={onShowJobForm}
            style={{ padding: "8px 16px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New Job
          </button>
        )}
      </div>

      {/* Assign result banner */}
      {assignResult && !assignResult.error && (
        <div style={{ padding: "14px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontWeight: 600, color: "#1e40af" }}>Closest tech: {assignResult.techName}</span>
            <span style={{ color: "#6b7280", marginLeft: "8px", fontSize: "13px" }}>{assignResult.distanceMiles} mi away</span>
            {assignResult.inTerritory && (
              <span style={{ marginLeft: "8px", fontSize: "12px", padding: "2px 8px", background: "#d1fae5", color: "#059669", borderRadius: "10px", fontWeight: 600 }}>in territory</span>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setAssignResult(null)} style={{ padding: "6px 12px", background: "#e5e7eb", border: "none", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}>Cancel</button>
            <button onClick={confirmAssign} style={{ padding: "6px 12px", background: "#1e40af", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Confirm Dispatch</button>
          </div>
        </div>
      )}

      {/* Queue list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>Loading queue...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px", color: "#9ca3af", background: "#f9fafb", borderRadius: "12px" }}>
          <div style={{ fontSize: "36px", marginBottom: "8px" }}>✓</div>
          <div style={{ fontSize: "16px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Queue is empty</div>
          <div style={{ fontSize: "14px" }}>No call-ins or sold jobs to dispatch</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filtered.map((item, idx) => {
            const sc = STATUS_COLORS[item.status] ?? { bg: "#f3f4f6", color: "#374151" };
            return (
              <div key={item.id} style={{ background: "#fff", border: item.isConfirmed ? "2px solid #3b82f6" : "1px solid #e5e7eb", borderRadius: "10px", padding: isMobile ? "12px" : "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                {(isMobile || isCompactDesktop) ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                      <div style={{ width: "24px", height: "24px", background: idx === 0 ? "#fef3c7" : "#f3f4f6", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px", color: idx === 0 ? "#92400e" : "#6b7280", flexShrink: 0 }}>
                        {idx + 1}
                      </div>
                      <div style={{ width: "56px", textAlign: "center", padding: "4px 6px", background: item.type === "job" ? "#ede9fe" : "#fef3c7", color: item.type === "job" ? "#7c3aed" : "#92400e", borderRadius: "6px", fontSize: "11px", fontWeight: 700, flexShrink: 0 }}>
                        {item.type === "job" ? "OFFICE" : "OUTAGE"}
                      </div>
                      <span style={{ marginLeft: "auto", padding: "4px 10px", background: sc.bg, color: sc.color, borderRadius: "20px", fontSize: "11px", fontWeight: 600, flexShrink: 0 }}>
                        {item.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div style={{ marginBottom: "8px" }}>
                      <div style={{ fontWeight: 600, color: "#1f2937", fontSize: "14px", lineHeight: 1.25 }}>{item.displayName}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.address ?? "No address"} {item.customerPhone && `· ${item.customerPhone}`}
                      </div>
                      <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                        {item.isConfirmed && <span style={{ padding: "2px 6px", background: "#dbeafe", color: "#1e40af", borderRadius: "4px", fontSize: "10px", fontWeight: 700 }}>CONFIRMED</span>}
                        {item.inTerritory && <span style={{ padding: "2px 6px", background: "#d1fae5", color: "#059669", borderRadius: "4px", fontSize: "10px", fontWeight: 700 }}>IN TERRITORY</span>}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: "6px", marginBottom: "10px" }}>
                      <Metric value={item.customers} label="CUST" color="#1f2937" />
                      <Metric value={Math.round(item.priorityScore)} label="SCORE" color="#0d9488" />
                      <Metric value={item.distanceMiles != null ? item.distanceMiles.toFixed(1) : "—"} label="MILES" color="#6b7280" />
                      <Metric value={item.estimatedMinutes != null ? item.estimatedMinutes : "—"} label="MIN" color="#0891b2" />
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {item.lat && item.lng && (
                        <button onClick={() => onNavigate(item.lat!, item.lng!, item.address ?? undefined)} style={{ padding: "8px 12px", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                          Go
                        </button>
                      )}
                      {(role === "office" || role === "admin" || role === "owner") && item.lat && item.lng && (
                        <button onClick={() => findClosestTech(item)} disabled={assigning === item.id} style={{ padding: "8px 12px", background: assigning === item.id ? "#9ca3af" : "#7c3aed", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                          {assigning === item.id ? "..." : "Assign"}
                        </button>
                      )}
                      {(role === "office" || role === "admin" || role === "owner") && item.type === "job" && (
                        <select value={item.priority ?? 2} onChange={async (e) => {
                          const val = Number(e.target.value);
                          await fetch(`/api/jobs/${item.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ priority: val }),
                          });
                          loadQueue();
                        }} style={{ padding: "8px 6px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px" }}>
                          <option value={1}>P1</option>
                          <option value={2}>P2</option>
                          <option value={3}>P3</option>
                          <option value={4}>P4</option>
                        </select>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
                {/* Rank */}
                <div style={{ width: "28px", height: "28px", background: idx === 0 ? "#fef3c7" : "#f3f4f6", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "13px", color: idx === 0 ? "#92400e" : "#6b7280", flexShrink: 0 }}>
                  {idx + 1}
                </div>

                {/* Type badge */}
                <div style={{ width: "56px", textAlign: "center", padding: "4px 6px", background: item.type === "job" ? "#ede9fe" : "#fef3c7", color: item.type === "job" ? "#7c3aed" : "#92400e", borderRadius: "6px", fontSize: "11px", fontWeight: 700, flexShrink: 0 }}>
                  {item.type === "job" ? "OFFICE" : "OUTAGE"}
                </div>

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 600, color: "#1f2937", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    {item.displayName}
                    {item.isConfirmed && (
                      <span style={{ padding: "2px 6px", background: "#dbeafe", color: "#1e40af", borderRadius: "4px", fontSize: "10px", fontWeight: 700 }}>★ CONFIRMED</span>
                    )}
                    {item.inTerritory && (
                      <span style={{ padding: "2px 6px", background: "#d1fae5", color: "#059669", borderRadius: "4px", fontSize: "10px", fontWeight: 700 }}>IN TERRITORY</span>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.address ?? "No address"} {item.customerPhone && `· ${item.customerPhone}`}
                  </div>
                </div>

                {/* Metrics */}
                <div style={{ display: "flex", gap: "12px", flexShrink: 0, minWidth: 220, justifyContent: "flex-end" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "#1f2937" }}>{item.customers}</div>
                    <div style={{ fontSize: "10px", color: "#9ca3af" }}>CUST</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "#0d9488" }}>{Math.round(item.priorityScore)}</div>
                    <div style={{ fontSize: "10px", color: "#9ca3af" }}>SCORE</div>
                  </div>
                  {item.distanceMiles != null && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#6b7280" }}>{item.distanceMiles.toFixed(1)}</div>
                      <div style={{ fontSize: "10px", color: "#9ca3af" }}>MILES</div>
                    </div>
                  )}
                  {item.estimatedMinutes != null && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#0891b2" }}>{item.estimatedMinutes}</div>
                      <div style={{ fontSize: "10px", color: "#9ca3af" }}>MIN</div>
                    </div>
                  )}
                </div>

                {/* Status */}
                <span style={{ padding: "4px 10px", background: sc.bg, color: sc.color, borderRadius: "20px", fontSize: "12px", fontWeight: 500, flexShrink: 0 }}>
                  {item.status.replace(/_/g, " ")}
                </span>

                {/* Actions */}
                <div style={{ display: "flex", gap: "6px", flexShrink: 0, minWidth: 150, justifyContent: "flex-end" }}>
                  {item.lat && item.lng && (
                    <button
                      onClick={() => onNavigate(item.lat!, item.lng!, item.address ?? undefined)}
                      title="Navigate here"
                      style={{ padding: "8px 12px", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                    >
                      Go
                    </button>
                  )}
                  {(role === "office" || role === "admin" || role === "owner") && item.lat && item.lng && (
                    <button
                      onClick={() => findClosestTech(item)}
                      disabled={assigning === item.id}
                      title="Find closest available tech"
                      style={{ padding: "8px 12px", background: assigning === item.id ? "#9ca3af" : "#7c3aed", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: assigning === item.id ? "not-allowed" : "pointer" }}
                    >
                      {assigning === item.id ? "..." : "Assign"}
                    </button>
                  )}
                  {(role === "office" || role === "admin" || role === "owner") && item.type === "job" && (
                    <select
                      value={item.priority ?? 2}
                      onChange={async (e) => {
                        const val = Number(e.target.value);
                        await fetch(`/api/jobs/${item.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ priority: val }),
                        });
                        loadQueue();
                      }}
                      style={{ padding: "8px 6px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px" }}
                      title="Manual urgency override"
                    >
                      <option value={1}>P1</option>
                      <option value={2}>P2</option>
                      <option value={3}>P3</option>
                      <option value={4}>P4</option>
                    </select>
                  )}
                </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div style={{ textAlign: "center", background: "#f9fafb", borderRadius: "6px", padding: "6px 4px" }}>
      <div style={{ fontSize: "14px", fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: "9px", color: "#9ca3af" }}>{label}</div>
    </div>
  );
}
