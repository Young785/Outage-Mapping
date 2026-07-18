"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DISPATCH_ROLE_LABELS,
  type FieldDispatchRole,
  type InstallerFallback,
} from "@/lib/field-dispatch-role";
import { pickNextRouteStops } from "@/lib/route-next";
import { loadSavedVisits } from "@/lib/field-visit";
import { territoryFromRow, isAssignableTerritory, assignableTerritoryLabel, type BoundaryZoneLike } from "@/lib/territory-match";
import { isDelayedUtilityConfirmed } from "@/lib/utility-outage";
import { exceedsMapCustomerCap } from "@/lib/routing-sweep";
import { haversineMiles } from "@/lib/priority";
import type { StormPhase } from "@/lib/routing-v1";

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
  dispatchRole?: FieldDispatchRole;
  installerFallback?: InstallerFallback;
  mapColor?: string | null;
  workingSince: string | null;
  completedCount: number;
  returnTripCount: number;
  updatedAt: string;
};

type Territory = { id: string; name: string };

type NextStop = {
  displayName: string;
  address: string | null;
  distanceMiles: number | null;
  estimatedMinutes: number | null;
  priorityScore: number;
  lat: number | null;
  lng: number | null;
};

const MAP_COLOR_OPTIONS = [
  { value: "", label: "Status color (default)" },
  { value: "#ffffff", label: "White" },
  { value: "#ffff00", label: "Yellow" },
  { value: "#00ffff", label: "Aqua" },
  { value: "#ff8c00", label: "Orange" },
  { value: "#ff69b4", label: "Pink" },
  { value: "#22c55e", label: "Green" },
  { value: "#c0c0c0", label: "Silver" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ef4444", label: "Red" },
  { value: "#000000", label: "Black" },
  { value: "#8b4513", label: "Brown" },
  { value: "#000080", label: "Navy" },
  { value: "#84cc16", label: "Lime" },
];

function elapsedLabel(since: string | null): string {
  if (!since) return "";
  const ms = Date.now() - new Date(since).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

type SweepStop = {
  id: string | number;
  label: string;
  customers: number;
  distanceMiles: number;
  isRedOutline: boolean;
  lat: number;
  lng: number;
};

type RoutableOutage = {
  id: number | string;
  lat: number;
  lng: number;
  customers: number;
  status: string;
  source?: string;
  streetAddress?: string;
  city?: string;
  assignedTechName?: string | null;
  firstSeenAt?: string | null;
  investigationResult?: string;
  isStaleMarker?: boolean;
  noContactMade?: boolean;
  needsReturnTrip?: boolean;
};

type ZoneRow = {
  id: string;
  zip_codes?: string[] | null;
  geometry?: { coordinates?: number[][][] } | null;
};

type Props = {
  token: string;
  role: "office" | "tech" | "admin" | "owner";
  outages?: RoutableOutage[];
  stormPhase?: StormPhase;
  stormStartedAt?: string | null;
  zones?: ZoneRow[];
  onNavigateToTech: (lat: number, lng: number, name: string) => void;
  onNavigate?: (lat: number, lng: number, label: string) => void;
  onRouteFromTech?: (techLat: number, techLng: number, jobLat: number, jobLng: number, label: string) => void;
};

const STATUS_CONFIG = {
  available: { color: "#10b981", bg: "#d1fae5", label: "Available" },
  working:   { color: "#ef4444", bg: "#fee2e2", label: "On Job" },
  paused:    { color: "#f59e0b", bg: "#fef3c7", label: "Paused" },
  offline:   { color: "#6b7280", bg: "#f3f4f6", label: "Offline" },
};

export default function TechPanel({
  token,
  role,
  outages = [],
  stormPhase = "phase_1",
  stormStartedAt = null,
  zones = [],
  onNavigateToTech,
  onNavigate,
  onRouteFromTech,
}: Props) {
  const [techs, setTechs] = useState<Tech[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextStops, setNextStops] = useState<Record<string, NextStop | null>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [editingTech, setEditingTech] = useState<Tech | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formTerritoryId, setFormTerritoryId] = useState("");
  const [formDispatchRole, setFormDispatchRole] = useState<FieldDispatchRole>("hunter");
  const [formInstallerFallback, setFormInstallerFallback] = useState<InstallerFallback>("hunter");
  const [formMapColor, setFormMapColor] = useState("");

  const isOffice = role === "office" || role === "admin" || role === "owner";

  const routableOutages = useMemo(
    () => outages.filter((o) => !exceedsMapCustomerCap(o.customers)),
    [outages]
  );

  const sweepStopsByTech = useMemo(() => {
    const map: Record<string, SweepStop[]> = {};
    if (!isOffice || !routableOutages.length) return map;

    for (const tech of techs) {
      if (!tech.lat || !tech.lng) continue;
      let territory = null;
      if (tech.territoryId) {
        const zone = zones.find((z) => z.id === tech.territoryId);
        if (zone) territory = territoryFromRow({ zip_codes: zone.zip_codes, geometry: zone.geometry });
      }
      const peers = techs
        .filter((t) => t.userId !== tech.userId && t.lat != null && t.lng != null)
        .map((t) => ({ lat: t.lat!, lng: t.lng! }));

      const stops = pickNextRouteStops(
        routableOutages,
        { lat: tech.lat, lng: tech.lng },
        stormPhase,
        loadSavedVisits(),
        {
          dispatchRole: tech.dispatchRole ?? "hunter",
          installerFallback: tech.installerFallback ?? "hunter",
          territory,
          currentTechName: tech.name,
          peerTechLocations: peers,
          stormStartedAt,
        },
        5
      );

      map[tech.id] = stops.map((s) => ({
        id: s.id,
        label: s.streetAddress?.split(",")[0] ?? s.city ?? `Stop #${s.id}`,
        customers: s.customers,
        distanceMiles: Math.round(haversineMiles(tech.lat!, tech.lng!, s.lat, s.lng) * 10) / 10,
        isRedOutline: isDelayedUtilityConfirmed(s, stormStartedAt),
        lat: s.lat,
        lng: s.lng,
      }));
    }
    return map;
  }, [isOffice, routableOutages, techs, zones, stormPhase, stormStartedAt]);

  const loadTechs = useCallback(async () => {
    setLoading(true);
    try {
      const [techRes, terrRes] = await Promise.all([
        fetch("/api/techs", { headers: { Authorization: `Bearer ${token}` } }),
        isOffice ? fetch("/api/territories", { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve(null),
      ]);
      const data = await techRes.json();
      const list: Tech[] = data.techs ?? [];
      setTechs(list);

      if (terrRes) {
        const tData = await terrRes.json();
        setTerritories(
          (tData.territories ?? [])
            .filter((t: BoundaryZoneLike & { id: string; name: string }) => isAssignableTerritory(t))
            .map((t: BoundaryZoneLike & { id: string; name: string }) => ({
              id: t.id,
              name: assignableTerritoryLabel(t),
            }))
        );
      }

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
  }, [token, isOffice]);

  useEffect(() => { loadTechs(); }, [loadTechs]);

  function resetForm() {
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormPassword("");
    setFormTerritoryId("");
    setFormDispatchRole("hunter");
    setFormInstallerFallback("hunter");
    setFormMapColor("");
  }

  function openEdit(tech: Tech) {
    setEditingTech(tech);
    setFormName(tech.name);
    setFormEmail(tech.email ?? "");
    setFormPhone(tech.phone ?? "");
    setFormPassword("");
    setFormTerritoryId(tech.territoryId ?? "");
    setFormDispatchRole(tech.dispatchRole ?? "hunter");
    setFormInstallerFallback(tech.installerFallback ?? "hunter");
    setFormMapColor(tech.mapColor ?? "");
  }

  async function createTech() {
    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      setMessage({ type: "error", text: "Name, email, and password are required." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/techs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "create_tech",
          name: formName.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim() || null,
          password: formPassword,
          territoryId: formTerritoryId || null,
          dispatchRole: formDispatchRole,
          installerFallback: formInstallerFallback,
          mapColor: formMapColor || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      setMessage({ type: "success", text: `Technician ${formName} created.` });
      setShowCreate(false);
      resetForm();
      loadTechs();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Create failed" });
    } finally {
      setSaving(false);
    }
  }

  async function saveTech() {
    if (!editingTech) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/techs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "update_tech",
          techId: editingTech.userId,
          name: formName.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim() || null,
          ...(formPassword ? { password: formPassword } : {}),
          territoryId: formTerritoryId || null,
          dispatchRole: formDispatchRole,
          installerFallback: formInstallerFallback,
          mapColor: formMapColor || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMessage({ type: "success", text: "Technician updated." });
      setEditingTech(null);
      resetForm();
      loadTechs();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  const counts = {
    available: techs.filter((t) => t.status === "available").length,
    working:   techs.filter((t) => t.status === "working").length,
    paused:    techs.filter((t) => t.status === "paused").length,
    offline:   techs.filter((t) => t.status === "offline").length,
  };

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "9px 11px",
    fontSize: "13px",
    border: "1px solid #d1d5db",
    borderRadius: "7px",
    boxSizing: "border-box",
  };

  return (
    <div>
      {isOffice && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontSize: "14px", color: "#6b7280" }}>Create accounts, assign territories, roles, and map colors.</div>
          <button
            type="button"
            onClick={() => { resetForm(); setShowCreate(true); setEditingTech(null); }}
            style={{ padding: "8px 16px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            + Add Technician
          </button>
        </div>
      )}

      {message && (
        <div style={{
          padding: "10px 14px",
          marginBottom: "14px",
          borderRadius: "8px",
          fontSize: "13px",
          background: message.type === "success" ? "#d1fae5" : "#fee2e2",
          color: message.type === "success" ? "#065f46" : "#991b1b",
        }}>
          {message.text}
        </div>
      )}

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
          <div style={{ fontSize: "14px", color: "#9ca3af" }}>
            {isOffice ? "Use Add Technician above to create field accounts." : "Register tech accounts with role \"tech\" to see them here"}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {techs.map((tech) => {
            const cfg = STATUS_CONFIG[tech.status] ?? STATUS_CONFIG.offline;
            const markerColor = tech.mapColor ?? cfg.color;
            const lastUpdate = tech.updatedAt ? new Date(tech.updatedAt).toLocaleTimeString() : "—";
            const nextStop = nextStops[tech.id];
            const roleMeta = DISPATCH_ROLE_LABELS[tech.dispatchRole ?? "hunter"];

            return (
              <div key={tech.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderLeft: `4px solid ${markerColor}`, borderRadius: "10px", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "14px", height: "14px", background: markerColor, borderRadius: "2px", flexShrink: 0 }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#1f2937", fontSize: "14px" }}>{tech.name}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tech.email}{tech.phone && ` · ${tech.phone}`}
                    </div>
                  </div>

                  <span style={{ padding: "4px 12px", background: cfg.bg, color: cfg.color, borderRadius: "20px", fontSize: "12px", fontWeight: 600, flexShrink: 0 }}>
                    {cfg.label}
                    {tech.status === "working" && tech.workingSince && (
                      <span style={{ marginLeft: "6px", fontWeight: 400, opacity: 0.8 }}>
                        {elapsedLabel(tech.workingSince)}
                      </span>
                    )}
                  </span>

                  {isOffice && (
                    <button
                      type="button"
                      onClick={() => openEdit(tech)}
                      style={{ padding: "7px 12px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
                    >
                      Edit
                    </button>
                  )}

                  {tech.lat && tech.lng && (
                    <button
                      onClick={() => onNavigateToTech(tech.lat!, tech.lng!, tech.name)}
                      style={{ padding: "7px 12px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
                    >
                      View on Map
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: "12px", marginTop: "8px", flexWrap: "wrap" }}>
                  {tech.territoryName && (
                    <span style={{ fontSize: "11px", padding: "2px 8px", background: "#eff6ff", color: "#1d4ed8", borderRadius: "10px", fontWeight: 600 }}>
                      {tech.territoryName}
                    </span>
                  )}
                  <span style={{ fontSize: "11px", padding: "2px 8px", background: "#f0fdf4", color: "#15803d", borderRadius: "10px", fontWeight: 600 }}>
                    {roleMeta.title}
                  </span>
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

                {isOffice && (sweepStopsByTech[tech.id]?.length ?? 0) > 0 && (
                  <div style={{ marginTop: "10px", padding: "10px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#475569", marginBottom: "8px" }}>
                      V1 ROUTE PREVIEW (territory sweep)
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {sweepStopsByTech[tech.id].map((stop, idx) => (
                        <div key={`${stop.id}-${idx}`} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                          <span style={{ width: "20px", fontWeight: 700, color: "#64748b", flexShrink: 0 }}>{idx + 1}</span>
                          <span
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "50%",
                              background: "#fff",
                              border: `2px solid ${stop.isRedOutline ? "#dc2626" : "#6b7280"}`,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ flex: 1, minWidth: 0, color: "#1f2937", fontWeight: 500 }}>{stop.label}</span>
                          <span style={{ color: "#6b7280", flexShrink: 0 }}>{stop.customers} cust · {stop.distanceMiles} mi</span>
                          {onNavigate && (
                            <button
                              type="button"
                              onClick={() => onNavigate(stop.lat, stop.lng, stop.label)}
                              style={{ padding: "4px 8px", background: "#e0f2fe", color: "#0369a1", border: "none", borderRadius: "4px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                            >
                              Go
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
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

      {(showCreate || editingTech) && isOffice && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2500, padding: "16px" }}>
          <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "480px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>{editingTech ? "Edit Technician" : "Add Technician"}</h3>
              <button type="button" onClick={() => { setShowCreate(false); setEditingTech(null); resetForm(); }} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}>×</button>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <label>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Name</span>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} style={{ ...inp, marginTop: "4px" }} />
              </label>
              <label>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Email</span>
                <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} style={{ ...inp, marginTop: "4px" }} />
              </label>
              <label>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Phone</span>
                <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} style={{ ...inp, marginTop: "4px" }} />
              </label>
              <label>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>{editingTech ? "New password (optional)" : "Password"}</span>
                <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} style={{ ...inp, marginTop: "4px" }} />
              </label>
              <label>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Territory</span>
                <select value={formTerritoryId} onChange={(e) => setFormTerritoryId(e.target.value)} style={{ ...inp, marginTop: "4px" }}>
                  <option value="">— No territory —</option>
                  {territories.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Dispatch role</span>
                <select value={formDispatchRole} onChange={(e) => setFormDispatchRole(e.target.value as FieldDispatchRole)} style={{ ...inp, marginTop: "4px" }}>
                  {(Object.keys(DISPATCH_ROLE_LABELS) as FieldDispatchRole[]).map((r) => (
                    <option key={r} value={r}>{DISPATCH_ROLE_LABELS[r].title}</option>
                  ))}
                </select>
              </label>
              {formDispatchRole === "installer" && (
                <label>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Installer fallback</span>
                  <select value={formInstallerFallback} onChange={(e) => setFormInstallerFallback(e.target.value as InstallerFallback)} style={{ ...inp, marginTop: "4px" }}>
                    <option value="hunter">Hunter</option>
                    <option value="seller">Seller</option>
                  </select>
                </label>
              )}
              <label>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Map truck color</span>
                <select value={formMapColor} onChange={(e) => setFormMapColor(e.target.value)} style={{ ...inp, marginTop: "4px" }}>
                  {MAP_COLOR_OPTIONS.map((o) => (
                    <option key={o.value || "default"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={editingTech ? saveTech : createTech}
                style={{ marginTop: "4px", padding: "11px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving…" : editingTech ? "Save changes" : "Create technician"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
