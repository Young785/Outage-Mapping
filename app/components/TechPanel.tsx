"use client";

import { useState, useEffect, useCallback } from "react";

type Tech = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: "available" | "working" | "paused" | "offline";
  lat: number | null;
  lng: number | null;
  currentJobId: string | null;
  currentJobName: string | null;
  territoryId: string | null;
  territoryName: string | null;
  workingSince: string | null;
  completedCount: number;
  returnTripCount: number;
  updatedAt: string;
};

type NextStop = {
  displayName: string;
  address: string | null;
  distanceMiles: number | null;
  estimatedMinutes: number | null;
  priorityScore: number;
  lat: number | null;
  lng: number | null;
};

function elapsedLabel(since: string | null): string {
  if (!since) return "";
  const ms = Date.now() - new Date(since).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

type Props = {
  token: string;
  onNavigateToTech: (lat: number, lng: number, name: string) => void;
  onNavigate?: (lat: number, lng: number, label: string) => void;
  onRouteFromTech?: (techLat: number, techLng: number, jobLat: number, jobLng: number, label: string) => void;
};

const STATUS_CONFIG = {
  available: { color: "#10b981", bg: "#d1fae5", label: "Available" },
  working:   { color: "#ef4444", bg: "#fee2e2", label: "Working" },
  paused:    { color: "#f59e0b", bg: "#fef3c7", label: "Paused" },
  offline:   { color: "#6b7280", bg: "#f3f4f6", label: "Offline" },
};

export default function TechPanel({ token, onNavigateToTech, onNavigate, onRouteFromTech }: Props) {
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextStops, setNextStops] = useState<Record<string, NextStop | null>>({});

  const loadTechs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/techs", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const list: Tech[] = data.techs ?? [];
      setTechs(list);

      // Fetch per-tech next-stop recommendation for available techs with known location
      const stops: Record<string, NextStop | null> = {};
      await Promise.all(
        list
          .filter((t) => t.status === "available" && t.lat && t.lng)
          .map(async (t) => {
            try {
              const params = new URLSearchParams({
                sort: "priority",
                techLat: String(t.lat),
                techLng: String(t.lng),
                techId: t.userId,
                excludeStatus: "completed,cancelled,no_opportunity",
              });
              const r = await fetch(`/api/jobs/queue?${params}`, { headers: { Authorization: `Bearer ${token}` } });
              const d = await r.json();
              const top = (d.queue ?? [])[0];
              stops[t.id] = top
                ? {
                    displayName: top.displayName,
                    address: top.address,
                    distanceMiles: top.distanceMiles,
                    estimatedMinutes: top.estimatedMinutes,
                    priorityScore: top.priorityScore,
                    lat: top.lat,
                    lng: top.lng,
                  }
                : null;
            } catch {
              stops[t.id] = null;
            }
          })
      );
      setNextStops(stops);
    } catch (err) {
      console.error("Tech load error:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadTechs(); }, [loadTechs]);

  const counts = {
    available: techs.filter((t) => t.status === "available").length,
    working:   techs.filter((t) => t.status === "working").length,
    paused:    techs.filter((t) => t.status === "paused").length,
    offline:   techs.filter((t) => t.status === "offline").length,
  };

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
        {(Object.entries(counts) as [keyof typeof counts, number][]).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status];
          return (
            <div key={status} style={{ background: "#fff", borderRadius: "10px", padding: "16px", borderLeft: `4px solid ${cfg.color}` }}>
              <div style={{ fontSize: "24px", fontWeight: 700, color: cfg.color }}>{count}</div>
              <div style={{ fontSize: "13px", color: "#6b7280" }}>{cfg.label}</div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>Loading technicians...</div>
      ) : techs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px", background: "#f9fafb", borderRadius: "12px" }}>
          <div style={{ fontWeight: 600, color: "#374151", marginBottom: "4px" }}>No technicians registered</div>
          <div style={{ fontSize: "14px", color: "#9ca3af" }}>Register tech accounts with role &quot;tech&quot; to see them here</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {techs.map((tech) => {
            const cfg = STATUS_CONFIG[tech.status] ?? STATUS_CONFIG.offline;
            const lastUpdate = tech.updatedAt ? new Date(tech.updatedAt).toLocaleTimeString() : "—";
            const nextStop = nextStops[tech.id];

            return (
              <div key={tech.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderLeft: `4px solid ${cfg.color}`, borderRadius: "10px", padding: "14px 16px" }}>
                {/* Top row */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "14px", height: "14px", background: cfg.color, borderRadius: "2px", flexShrink: 0 }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#1f2937", fontSize: "14px" }}>{tech.name}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tech.email}{tech.phone && ` · ${tech.phone}`}
                    </div>
                  </div>

                  {/* Status badge with elapsed time */}
                  <span style={{ padding: "4px 12px", background: cfg.bg, color: cfg.color, borderRadius: "20px", fontSize: "12px", fontWeight: 600, flexShrink: 0 }}>
                    {cfg.label}
                    {tech.status === "working" && tech.workingSince && (
                      <span style={{ marginLeft: "6px", fontWeight: 400, opacity: 0.8 }}>
                        {elapsedLabel(tech.workingSince)}
                      </span>
                    )}
                  </span>

                  {/* Completed + return-trip counts */}
                  <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
                    {tech.completedCount > 0 && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "15px", fontWeight: 700, color: "#10b981" }}>{tech.completedCount}</div>
                        <div style={{ fontSize: "10px", color: "#9ca3af" }}>DONE</div>
                      </div>
                    )}
                    {tech.returnTripCount > 0 && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "15px", fontWeight: 700, color: "#f59e0b" }}>{tech.returnTripCount}</div>
                        <div style={{ fontSize: "10px", color: "#9ca3af" }}>RETURN</div>
                      </div>
                    )}
                  </div>

                  {tech.lat && tech.lng && (
                    <button
                      onClick={() => onNavigateToTech(tech.lat!, tech.lng!, tech.name)}
                      style={{ padding: "7px 12px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
                    >
                      View on Map
                    </button>
                  )}
                </div>

                {/* Second row: territory / current job / location */}
                <div style={{ display: "flex", gap: "12px", marginTop: "8px", flexWrap: "wrap" }}>
                  {tech.territoryName && (
                    <span style={{ fontSize: "11px", padding: "2px 8px", background: "#eff6ff", color: "#1d4ed8", borderRadius: "10px", fontWeight: 600 }}>
                      {tech.territoryName}
                    </span>
                  )}
                  {tech.currentJobName && (
                    <span style={{ fontSize: "11px", padding: "2px 8px", background: "#fef3c7", color: "#92400e", borderRadius: "10px", fontWeight: 600 }}>
                      On: {tech.currentJobName}
                    </span>
                  )}
                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                    {tech.lat && tech.lng ? `${tech.lat.toFixed(4)}, ${tech.lng.toFixed(4)}` : "No location"}
                    {" · "}updated {lastUpdate}
                  </span>
                </div>

                {/* Next recommended stop (available techs only) */}
                {tech.status === "available" && nextStop && (
                  <div style={{ marginTop: "10px", padding: "10px 12px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#059669", marginBottom: "2px" }}>NEXT RECOMMENDED STOP</div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1f2937" }}>{nextStop.displayName}</div>
                      <div style={{ fontSize: "11px", color: "#6b7280" }}>
                        {nextStop.distanceMiles != null && `${nextStop.distanceMiles} mi`}
                        {nextStop.estimatedMinutes != null && ` · ~${nextStop.estimatedMinutes} min`}
                        {" · "}score {Math.round(nextStop.priorityScore)}
                      </div>
                    </div>
                    {onNavigate && nextStop.lat && nextStop.lng && (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={() => onNavigate(nextStop.lat!, nextStop.lng!, nextStop.displayName)}
                          style={{ padding: "7px 12px", background: "#059669", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
                        >
                          Go
                        </button>
                        {onRouteFromTech && tech.lat && tech.lng && (
                          <button
                            onClick={() => onRouteFromTech(tech.lat!, tech.lng!, nextStop.lat!, nextStop.lng!, nextStop.displayName)}
                            style={{ padding: "7px 12px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
                          >
                            Route
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {tech.status === "available" && nextStop === undefined && (
                  <div style={{ marginTop: "8px", fontSize: "11px", color: "#9ca3af" }}>
                    {tech.lat ? "Calculating next stop…" : "No location — next stop unavailable"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: "16px", textAlign: "right" }}>
        <button onClick={loadTechs} style={{ padding: "8px 16px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", color: "#6b7280", cursor: "pointer" }}>
          Refresh
        </button>
      </div>
    </div>
  );
}
