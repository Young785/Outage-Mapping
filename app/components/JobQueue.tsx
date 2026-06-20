"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import QueueItemDrawer, { type QueueDrawerItem } from "./QueueItemDrawer";

const TERMINAL_QUEUE_STATUSES = new Set([
  "completed",
  "cancelled",
  "resolved",
  "no_opportunity",
]);

type RoutePlan = {
  strategy?: string;
  totalStops: number;
  totalMiles: number;
  estimatedMinutes: number;
  mapsUrl?: string;
  orderedStops: Array<{ id: string; lat: number; lng: number; label?: string; legMiles: number }>;
};

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
  assignedTechName: string | null;
  notes: string | null;
  sortOrder: number | null;
  priority: number | null;
  createdAt: string;
};

import type { RoutingMode } from "@/lib/routing-mode";

type Props = {
  token: string;
  role: "office" | "tech" | "admin" | "owner";
  routingMode: RoutingMode;
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

export default function JobQueue({ token, role, routingMode, userLocation, onNavigate, onShowJobForm }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isCompactDesktop, setIsCompactDesktop] = useState(false);
  const [sort, setSort] = useState<"priority" | "distance" | "value" | "smart">("priority");
  const [filter, setFilter] = useState<"all" | "job" | "outage">("all");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignResult, setAssignResult] = useState<any | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [skippedStopIds, setSkippedStopIds] = useState<Set<string>>(() => new Set());
  const [routeError, setRouteError] = useState<string | null>(null);
  const rerouteInFlight = useRef(false);
  const [clustering, setClustering] = useState(false);
  const [clusterPlan, setClusterPlan] = useState<Array<{ id: string; size: number; avgPriority: number; centroid: { lat: number; lng: number }; topStop?: { lat: number; lng: number; label?: string; priorityScore?: number } }>>([]);
  const [selectedItem, setSelectedItem] = useState<QueueDrawerItem | null>(null);
  const [techOptions, setTechOptions] = useState<Array<{ userId: string; name: string }>>([]);
  const [reordering, setReordering] = useState(false);

  const isOffice = role === "office" || role === "admin" || role === "owner";

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
      if (!res.ok) {
        throw new Error(data.error || data.hint || "Queue load failed");
      }
      setQueue(data.queue ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Queue load failed";
      console.error("Queue load error:", err);
      setRouteError(msg);
    } finally {
      setLoading(false);
    }
  }, [sort, userLocation, token]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  useEffect(() => {
    if (!isOffice) return;
    fetch("/api/techs", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        setTechOptions(
          (d.techs ?? []).map((t: { userId: string; name: string }) => ({ userId: t.userId, name: t.name }))
        );
      })
      .catch(() => {});
  }, [isOffice, token]);
  useEffect(() => {
    if (routingMode === "simple") {
      setRoutePlan(null);
      setClusterPlan([]);
    }
    if (routingMode === "simple" && (sort === "smart" || sort === "value")) {
      setSort("distance");
    }
  }, [routingMode, sort]);
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

  function openDrawer(item: QueueItem) {
    if (!isOffice) return;
    setSelectedItem({
      id: item.id,
      type: item.type,
      displayName: item.displayName,
      address: item.address,
      status: item.status,
      customerPhone: item.customerPhone,
      assignedTechId: item.assignedTechId,
      assignedTechName: item.assignedTechName,
      notes: item.notes,
      lat: item.lat,
      lng: item.lng,
    });
  }

  async function moveJobToPosition(item: QueueItem, newPosition: number) {
    const jobItems = filtered.filter((i) => i.type === "job");
    const idx = jobItems.findIndex((i) => i.id === item.id);
    if (idx < 0) return;
    const targetIdx = Math.max(0, Math.min(jobItems.length - 1, newPosition - 1));
    if (targetIdx === idx) return;
    const reordered = [...jobItems];
    const [removed] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, removed);
    setReordering(true);
    try {
      const res = await fetch("/api/jobs/queue/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderedJobIds: reordered.map((i) => i.id) }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Reorder failed");
      }
      loadQueue();
    } catch (err: unknown) {
      setRouteError(err instanceof Error ? err.message : "Reorder failed");
    } finally {
      setReordering(false);
    }
  }

  async function moveJob(item: QueueItem, direction: -1 | 1) {
    const jobItems = filtered.filter((i) => i.type === "job");
    const idx = jobItems.findIndex((i) => i.id === item.id);
    if (idx < 0) return;
    await moveJobToPosition(item, idx + direction + 1);
  }

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
        ? {
            outageId: assignResult.itemId,
            targetLat: item?.lat ?? 0,
            targetLng: item?.lng ?? 0,
            confirm: true,
            recommendedTechId: assignResult.techId,
          }
        : {
            jobId: assignResult.itemId,
            targetLat: item?.lat ?? 0,
            targetLng: item?.lng ?? 0,
            confirm: true,
            recommendedTechId: assignResult.techId,
          };
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

  const buildRouteCandidates = useCallback(
    (items: QueueItem[], exclude: Set<string>) =>
      items
        .filter((i) => i.lat != null && i.lng != null)
        .filter((i) => !exclude.has(i.id))
        .filter((i) => !TERMINAL_QUEUE_STATUSES.has(i.status))
        .slice(0, 20)
        .map((i) => ({
          id: i.id,
          lat: i.lat!,
          lng: i.lng!,
          label: i.address ?? i.displayName,
          priorityScore: i.priorityScore ?? 0,
          status: i.status,
        })),
    []
  );

  const runOptimizeRoute = useCallback(
    async (exclude: Set<string>, silent = false) => {
      if (!userLocation) {
        if (!silent) setRouteError("Location is required for route optimization.");
        return;
      }
      const candidates = buildRouteCandidates(filtered, exclude);
      if (candidates.length < 2) {
        setRoutePlan(null);
        if (!silent) setRouteError("Need at least 2 routable items.");
        return;
      }
      if (!silent) setOptimizing(true);
      setRouteError(null);
      try {
        const res = await fetch("/api/routing/multi-stop", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            origin: userLocation,
            maxStops: 8,
            stops: candidates,
            excludeIds: [...exclude],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Route optimization failed");
        setRoutePlan(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Route optimization failed";
        if (!silent) setRouteError(msg);
      } finally {
        if (!silent) setOptimizing(false);
      }
    },
    [userLocation, filtered, buildRouteCandidates, token]
  );

  async function optimizeRoute() {
    await runOptimizeRoute(skippedStopIds, false);
  }

  function skipRouteStop(stopId: string) {
    setSkippedStopIds((prev) => {
      const next = new Set(prev);
      next.add(stopId);
      void runOptimizeRoute(next, true);
      return next;
    });
  }

  // Auto re-route when queue changes (completed job, item leaves queue, etc.)
  useEffect(() => {
    if (!routePlan || !userLocation || rerouteInFlight.current) return;

    const activeIds = new Set(filtered.map((i) => i.id));
    const planIds = routePlan.orderedStops.map((s) => s.id);
    const stale = planIds.some((id) => {
      if (skippedStopIds.has(id)) return true;
      if (!activeIds.has(id)) return true;
      const row = queue.find((q) => q.id === id);
      return row != null && TERMINAL_QUEUE_STATUSES.has(row.status);
    });

    if (!stale) return;

    const remainingIds = planIds.filter((id) => {
      if (skippedStopIds.has(id)) return false;
      if (!activeIds.has(id)) return false;
      const row = queue.find((q) => q.id === id);
      return row == null || !TERMINAL_QUEUE_STATUSES.has(row.status);
    });

    if (remainingIds.length < 2) {
      setRoutePlan(null);
      return;
    }

    rerouteInFlight.current = true;
    void runOptimizeRoute(skippedStopIds, true).finally(() => {
      rerouteInFlight.current = false;
    });
  }, [queue, filtered, routePlan, skippedStopIds, userLocation, runOptimizeRoute]);

  async function detectClusters() {
    const candidates = filtered
      .filter((i) => i.lat != null && i.lng != null)
      .slice(0, 120)
      .map((i) => ({
        id: i.id,
        lat: i.lat!,
        lng: i.lng!,
        label: i.address ?? i.displayName,
        priorityScore: i.priorityScore ?? 0,
        status: i.status,
      }));
    if (candidates.length < 3) {
      setRouteError("Need at least 3 routable points for cluster detection.");
      return;
    }
    setClustering(true);
    setRouteError(null);
    try {
      const res = await fetch("/api/routing/clusters", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stops: candidates, radiusMiles: 0.8, minPoints: 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cluster detection failed");
      setClusterPlan(data.clusters ?? []);
    } catch (err: any) {
      setRouteError(err.message);
    } finally {
      setClustering(false);
    }
  }

  const jobCount = filtered.filter((i) => i.type === "job").length;

  function PositionEditor({ item, position }: { item: QueueItem; position: number }) {
    const [val, setVal] = useState(String(position));
    useEffect(() => { setVal(String(position)); }, [position]);
    if (item.type !== "job") return null;
    return (
      <input
        type="number"
        min={1}
        max={jobCount}
        value={val}
        disabled={reordering}
        title="Queue position — press Enter to move"
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const n = Number(val);
            if (Number.isFinite(n) && n >= 1) void moveJobToPosition(item, n);
          }
        }}
        onBlur={() => {
          const n = Number(val);
          if (Number.isFinite(n) && n >= 1 && n !== position) void moveJobToPosition(item, n);
          else setVal(String(position));
        }}
        style={{ width: "44px", padding: "6px 4px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px", textAlign: "center", fontWeight: 700 }}
      />
    );
  }

  const sortOptions = routingMode === "simple"
    ? (["priority", "distance"] as const)
    : (["priority", "distance", "value", "smart"] as const);

  return (
    <div>
      {routingMode === "simple" && (
        <div style={{ padding: "10px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", marginBottom: "12px", fontSize: "13px", color: "#166534" }}>
          Simple routing is active — queue uses nearest-first sorting. Cluster and multi-stop tools are hidden.
        </div>
      )}
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#374151", alignSelf: "center" }}>Sort:</span>
          {sortOptions.map((s) => (
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

        <div style={{ display: "flex", gap: "8px" }}>
          {routingMode === "complicated" && (
            <>
          <button
            onClick={detectClusters}
            disabled={clustering}
            style={{ padding: "8px 14px", background: clustering ? "#94a3b8" : "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: clustering ? "default" : "pointer" }}
          >
            {clustering ? "Scanning..." : "Find Clusters"}
          </button>
          <button
            onClick={optimizeRoute}
            disabled={optimizing}
            style={{ padding: "8px 14px", background: optimizing ? "#94a3b8" : "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: optimizing ? "default" : "pointer" }}
          >
            {optimizing ? "Optimizing..." : "Optimize Route"}
          </button>
            </>
          )}
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
      </div>

      {routeError && (
        <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "8px", marginBottom: "10px", fontSize: "13px" }}>
          {routeError}
        </div>
      )}

      {routingMode === "complicated" && routePlan && (
        <div style={{ padding: "12px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "13px", color: "#1e3a8a", fontWeight: 700 }}>
                Optimized plan: {routePlan.totalStops} stops · {routePlan.totalMiles} mi · ~{routePlan.estimatedMinutes} min
              </div>
              {routePlan.strategy?.includes("google") && (
                <div style={{ fontSize: "11px", color: "#2563eb", marginTop: "2px" }}>
                  Traffic-aware (Google Routes)
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {routePlan.orderedStops?.[0] && (
                <button
                  onClick={() => onNavigate(routePlan.orderedStops[0].lat, routePlan.orderedStops[0].lng, routePlan.orderedStops[0].label)}
                  style={{ padding: "7px 11px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                >
                  Go Next Stop
                </button>
              )}
              {routePlan.mapsUrl && (
                <a
                  href={routePlan.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: "7px 11px", background: "#0d9488", color: "#fff", borderRadius: "6px", fontSize: "12px", fontWeight: 700, textDecoration: "none" }}
                >
                  Open in Maps
                </a>
              )}
              <button
                onClick={() => { setRoutePlan(null); setSkippedStopIds(new Set()); }}
                style={{ padding: "7px 11px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
              >
                Clear
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {(routePlan.orderedStops ?? []).map((s, idx) => (
              <div key={`${s.id}-${idx}`} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                <button
                  onClick={() => onNavigate(s.lat, s.lng, s.label)}
                  style={{ padding: "5px 8px", background: "#dbeafe", border: "1px solid #93c5fd", color: "#1e3a8a", borderRadius: "14px", fontSize: "11px", cursor: "pointer" }}
                >
                  {idx + 1}. {Math.round(s.legMiles * 10) / 10}mi
                </button>
                <button
                  type="button"
                  title="Skip this stop and re-route"
                  onClick={() => skipRouteStop(s.id)}
                  style={{ padding: "4px 7px", background: "#fff", border: "1px solid #cbd5e1", color: "#64748b", borderRadius: "6px", fontSize: "10px", cursor: "pointer" }}
                >
                  Skip
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {routingMode === "complicated" && clusterPlan.length > 0 && (
        <div style={{ padding: "12px 14px", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "8px", marginBottom: "14px" }}>
          <div style={{ fontSize: "13px", color: "#5b21b6", fontWeight: 700, marginBottom: "8px" }}>
            Cluster packs detected: {clusterPlan.length}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {clusterPlan.slice(0, 6).map((c, idx) => (
              <div key={c.id} style={{ background: "#fff", border: "1px solid #ddd6fe", borderRadius: "8px", padding: "8px 10px", minWidth: "180px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#4c1d95" }}>
                  Cluster {idx + 1} · {c.size} stops
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280", margin: "3px 0 8px" }}>
                  Avg score {c.avgPriority}
                </div>
                <button
                  onClick={() => {
                    const target = c.topStop ?? c.centroid;
                    onNavigate(target.lat, target.lng, `Cluster ${idx + 1}`);
                  }}
                  style={{ padding: "6px 10px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                >
                  Go To Cluster
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assign result banner */}
      {assignResult && !assignResult.error && (
        <div style={{ padding: "14px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontWeight: 600, color: "#1e40af" }}>Recommended tech: {assignResult.techName}</span>
            <span style={{ color: "#6b7280", marginLeft: "8px", fontSize: "13px" }}>{assignResult.distanceMiles} mi away</span>
            {assignResult.recommendationScore != null && (
              <span style={{ color: "#0d9488", marginLeft: "8px", fontSize: "13px", fontWeight: 700 }}>
                score {Math.round(assignResult.recommendationScore)}
              </span>
            )}
            {assignResult.inTerritory && (
              <span style={{ marginLeft: "8px", fontSize: "12px", padding: "2px 8px", background: "#d1fae5", color: "#059669", borderRadius: "10px", fontWeight: 600 }}>in territory</span>
            )}
            {assignResult.activeLoad != null && (
              <span style={{ marginLeft: "8px", fontSize: "12px", padding: "2px 8px", background: "#f1f5f9", color: "#334155", borderRadius: "10px", fontWeight: 600 }}>
                load {assignResult.activeLoad}
              </span>
            )}
            {assignResult.workingHours != null && (
              <span style={{ marginLeft: "8px", fontSize: "12px", padding: "2px 8px", background: "#fff7ed", color: "#9a3412", borderRadius: "10px", fontWeight: 600 }}>
                shift {assignResult.workingHours}h
              </span>
            )}
            {Array.isArray(assignResult.reasons) && assignResult.reasons.length > 0 && (
              <div style={{ marginTop: "6px", fontSize: "12px", color: "#475569" }}>
                Why: {assignResult.reasons.slice(0, 3).join(" · ")}
              </div>
            )}
            {(assignResult.maxJobsPerTech != null || assignResult.overtimeSoftHours != null) && (
              <div style={{ marginTop: "4px", fontSize: "11px", color: "#64748b" }}>
                Guardrails: max load {assignResult.maxJobsPerTech ?? "—"} · overtime soft {assignResult.overtimeSoftHours ?? "—"}h
              </div>
            )}
            {Array.isArray(assignResult.alternatives) && assignResult.alternatives.length > 0 && (
              <div style={{ marginTop: "4px", fontSize: "11px", color: "#64748b" }}>
                Alternatives: {assignResult.alternatives.map((a: any) => `${a.techName} (${a.distanceMiles}mi, score ${Math.round(a.recommendationScore)}, ${a.workingHours ?? "?"}h)`).join(" | ")}
              </div>
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
                      {item.assignedTechName && (
                        <div style={{ fontSize: "11px", color: "#0d9488", marginTop: "4px", fontWeight: 600 }}>Tech: {item.assignedTechName}</div>
                      )}
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
                      {isOffice && (
                        <button type="button" onClick={() => openDrawer(item)} style={{ padding: "8px 12px", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                          Edit
                        </button>
                      )}
                      {isOffice && item.type === "job" && (
                        <PositionEditor item={item} position={filtered.filter((i) => i.type === "job").findIndex((i) => i.id === item.id) + 1} />
                      )}
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
                  {item.assignedTechName && (
                    <div style={{ fontSize: "11px", color: "#0d9488", marginTop: "4px", fontWeight: 600 }}>Tech: {item.assignedTechName}</div>
                  )}
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
                  {isOffice && (
                    <button type="button" onClick={() => openDrawer(item)} style={{ padding: "8px 12px", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                      Edit
                    </button>
                  )}
                  {isOffice && item.type === "job" && (
                    <PositionEditor item={item} position={filtered.filter((i) => i.type === "job").findIndex((i) => i.id === item.id) + 1} />
                  )}
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

      {selectedItem && (
        <QueueItemDrawer
          item={selectedItem}
          token={token}
          techs={techOptions}
          onClose={() => setSelectedItem(null)}
          onSaved={loadQueue}
          onDeleted={loadQueue}
          onNavigate={onNavigate}
          onAssignOutage={async (outageId, techId, lat, lng) => {
            const res = await fetch("/api/jobs/assign", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                outageId,
                targetLat: lat,
                targetLng: lng,
                confirm: true,
                recommendedTechId: techId,
              }),
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || "Assignment failed");
            }
          }}
        />
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
