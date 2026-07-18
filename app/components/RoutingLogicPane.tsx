"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TechRouteBundle } from "@/lib/tech-routes";

type Props = {
  token: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selectedTechIds: Set<string>;
  onSelectedTechIdsChange: (next: Set<string>) => void;
  routes: TechRouteBundle[];
  onRoutesChange: (routes: TechRouteBundle[]) => void;
  onFocusStop: (stop: { lat: number; lng: number; outageId: string }) => void;
  isOffice: boolean;
  currentUserId: string | null;
};

export default function RoutingLogicPane({
  token,
  collapsed,
  onToggleCollapsed,
  selectedTechIds,
  onSelectedTechIdsChange,
  routes,
  onRoutesChange,
  onFocusStop,
  isOffice,
  currentUserId,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragTechId, setDragTechId] = useState<string | null>(null);
  const [dragStopId, setDragStopId] = useState<string | null>(null);

  const visibleRoutes = useMemo(() => {
    if (isOffice) return routes;
    return routes.filter((r) => r.techUserId === currentUserId);
  }, [routes, isOffice, currentUserId]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/routing/tech-routes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load routes");
      onRoutesChange(data.routes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load routes");
    }
  }, [token, onRoutesChange]);

  useEffect(() => {
    load();
    const id = setInterval(load, 45_000);
    return () => clearInterval(id);
  }, [load]);

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/routing/tech-routes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      if (Array.isArray(data.routes)) onRoutesChange(data.routes);
      else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleTech(techUserId: string) {
    const next = new Set(selectedTechIds);
    if (next.has(techUserId)) next.delete(techUserId);
    else next.add(techUserId);
    onSelectedTechIdsChange(next);
  }

  function onDropReorder(techUserId: string, targetOutageId: string) {
    if (!dragStopId || dragTechId !== techUserId) return;
    const route = routes.find((r) => r.techUserId === techUserId);
    if (!route) return;
    const ids = route.stops.map((s) => s.outageId);
    const from = ids.indexOf(dragStopId);
    const to = ids.indexOf(targetOutageId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...ids];
    const [removed] = next.splice(from, 1);
    next.splice(to, 0, removed);
    void mutate({ action: "reorder", techUserId, orderedOutageIds: next });
    setDragStopId(null);
    setDragTechId(null);
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        title="Open Routing Logic"
        style={{
          position: "absolute",
          top: "50%",
          right: 0,
          transform: "translateY(-50%)",
          zIndex: 6,
          writingMode: "vertical-rl",
          padding: "12px 8px",
          background: "#0f766e",
          color: "#fff",
          border: "none",
          borderRadius: "10px 0 0 10px",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
          boxShadow: "-2px 0 10px rgba(0,0,0,0.12)",
        }}
      >
        Routing Logic
      </button>
    );
  }

  return (
    <aside
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(360px, 25vw)",
        minWidth: 280,
        zIndex: 6,
        background: "rgba(255,255,255,0.98)",
        borderLeft: "1px solid #e5e7eb",
        boxShadow: "-4px 0 20px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#134e4a" }}>Routing Logic</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
            Next 10 stops · drag to reorder
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          style={{
            background: "#f3f4f6",
            border: "none",
            borderRadius: 8,
            width: 32,
            height: 32,
            cursor: "pointer",
            fontSize: 16,
            color: "#374151",
          }}
          aria-label="Collapse routing pane"
        >
          ›
        </button>
      </div>

      {isOffice && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => mutate({ action: "auto_populate", maxStopsPerTech: 10 })}
            style={{
              flex: 1,
              padding: "8px 10px",
              background: busy ? "#99f6e4" : "#0d9488",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 12,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Updating…" : "Auto-populate routes"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => load()}
            style={{
              padding: "8px 10px",
              background: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      )}

      {error && (
        <div style={{ margin: "8px 14px", padding: "8px 10px", background: "#fef2f2", color: "#b91c1c", borderRadius: 8, fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: "8px 10px 16px" }}>
        {visibleRoutes.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: "#6b7280", textAlign: "center" }}>
            No technicians found. Run Auto-populate after techs are Available with GPS.
          </div>
        )}

        {visibleRoutes.map((route) => {
          const checked = selectedTechIds.has(route.techUserId);
          const color = route.mapColor || "#0d9488";
          const stops = route.stops.slice(0, 10);
          return (
            <div
              key={route.techUserId}
              style={{
                marginBottom: 10,
                border: `1px solid ${checked ? color : "#e5e7eb"}`,
                borderRadius: 12,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  background: checked ? `${color}14` : "#f9fafb",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleTech(route.techUserId)}
                />
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{route.techName}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {route.status} · {stops.length} stop{stops.length === 1 ? "" : "s"}
                  </div>
                </div>
                {isOffice && stops.length > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={(e) => {
                      e.preventDefault();
                      void mutate({ action: "clear", techUserId: route.techUserId });
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#b91c1c",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                )}
              </label>

              {checked && (
                <ol style={{ margin: 0, padding: "8px 10px 10px 28px", listStyle: "decimal" }}>
                  {stops.length === 0 && (
                    <li style={{ listStyle: "none", marginLeft: -18, fontSize: 12, color: "#9ca3af" }}>
                      No stops yet — right-click a marker or Auto-populate.
                    </li>
                  )}
                  {stops.map((stop, idx) => (
                    <li
                      key={stop.outageId}
                      draggable
                      onDragStart={() => {
                        setDragTechId(route.techUserId);
                        setDragStopId(stop.outageId);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDropReorder(route.techUserId, stop.outageId)}
                      style={{
                        marginBottom: 6,
                        padding: "6px 8px",
                        background: "#f9fafb",
                        borderRadius: 8,
                        border: "1px solid #f3f4f6",
                        cursor: "grab",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onFocusStop({
                            lat: stop.lat,
                            lng: stop.lng,
                            outageId: stop.outageId,
                          })
                        }
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          textAlign: "left",
                          cursor: "pointer",
                          width: "100%",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>
                          {idx + 1}. {stop.address?.split(",")[0] || stop.customerName || stop.outageId}
                        </div>
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                          {[stop.customerName, stop.customerPhone, stop.source]
                            .filter(Boolean)
                            .join(" · ") || stop.status}
                        </div>
                      </button>
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            mutate({
                              action: "remove",
                              techUserId: route.techUserId,
                              outageId: stop.outageId,
                            })
                          }
                          style={{
                            background: "none",
                            border: "none",
                            color: "#b91c1c",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "10px 14px", borderTop: "1px solid #e5e7eb", fontSize: 11, color: "#6b7280" }}>
        {isOffice
          ? "Right-click a map marker to add/remove from a tech route or mark Not a target."
          : "Tap your truck, then tap up to 5 map dots to build your next stops."}
      </div>
    </aside>
  );
}
