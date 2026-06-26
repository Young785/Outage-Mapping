"use client";
import { useState, useEffect, useCallback } from "react";
import FieldTip, { LabelWithTip, SectionTitleWithTip } from "./FieldTip";
import { ADMIN_FIELD_HELP, ADMIN_SECTION_HELP } from "@/lib/field-help";
import PlatformRoutingPanel from "./PlatformRoutingPanel";
import type { RoutingMode } from "@/lib/routing-mode";

type Weights = {
  customers_multiplier: number;
  urgency_multiplier: number;
  office_job_bonus: number;
  density_bonus: number;
  time_weight: number;
  confirmed_opportunity_bonus: number;
  // §9 new scoring fields
  line_drop_bonus: number;
  line_drop_power_bonus: number;
  wants_to_proceed_bonus: number;
  honey_hole_bonus: number;
};

type Settings = {
  simulation_mode: boolean;
  active_sources: string[];
  connexus_enabled: boolean;
  fetch_interval_minutes: number;
  storm_phase: "phase_1" | "phase_2" | "phase_3";
  temp_out_mode: boolean;
  max_jobs_per_tech: number;
  overtime_hours_soft_limit: number;
  overtime_hours_hard_limit: number;
};

type Props = {
  token: string;
  role: "office" | "tech" | "admin" | "owner";
  routingMode: RoutingMode;
  onRoutingModeChanged?: (mode: RoutingMode) => void;
  /** Called after any save so page.tsx can sync activeSources and refetch outages */
  onSettingsChanged?: (
    activeSources: string[],
    simulationMode: boolean,
    stormOps?: {
      stormPhase: "phase_1" | "phase_2" | "phase_3";
      tempOutMode: boolean;
      fetchIntervalMinutes: number;
    }
  ) => void;
  /** Called after map cleanup actions so the live map refreshes immediately. */
  onOutagesChanged?: () => void;
};

type OpsMetrics = {
  metrics: {
    activeCallsInQueue: number;
    soldJobs: number;
    confirmedOpportunities: number;
    tempOutPendingReturn: number;
  };
  storage?: {
    provider: string;
    tables: string[];
  };
  totals?: {
    outages: number;
    jobs: number;
    investigations: number;
  };
  recent7d?: {
    outages: number;
    jobs: number;
  };
};

type PhaseAlert = {
  city: string;
  hotScore?: number;
  hotCount?: number;
  lowYieldScore?: number;
  lowYieldCount?: number;
  sample: number;
};

export default function AdminPanel({ token, role, routingMode, onRoutingModeChanged, onSettingsChanged, onOutagesChanged }: Props) {
  const [weights, setWeights] = useState<Weights>({
    customers_multiplier: 1.0,
    urgency_multiplier: 1.5,
    office_job_bonus: 50,
    density_bonus: 20,
    time_weight: 0.1,
    confirmed_opportunity_bonus: 100,
    line_drop_bonus: 60,
    line_drop_power_bonus: 40,
    wants_to_proceed_bonus: 80,
    honey_hole_bonus: 50,
  });
  // Synthetic outage generation state
  const [synthCount, setSynthCount] = useState<10 | 25 | 50 | 100>(25);
  const [synthType, setSynthType]   = useState<"mixed" | "clustered" | "sparse" | "honey_hole">("mixed");
  const [genRunning, setGenRunning] = useState(false);

  // Storm event state
  type StormEvent = { id: string; name: string; started_at: string; ended_at: string | null; notes: string | null };
  const [stormEvents, setStormEvents] = useState<StormEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<StormEvent | null>(null);
  const [newEventName, setNewEventName] = useState("");
  const [stormLoading, setStormLoading] = useState(false);

  // Snapshot-to-simulation state
  type Snapshot = { id: string; fetched_at: string; normalized_count: number; source: string };
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapLoading, setSnapLoading] = useState(false);
  const [loadingSnap, setLoadingSnap] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({
    simulation_mode: false,
    active_sources: ["xcel"],
    connexus_enabled: false,
    fetch_interval_minutes: 15,
    storm_phase: "phase_1",
    temp_out_mode: false,
    max_jobs_per_tech: 4,
    overtime_hours_soft_limit: 10,
    overtime_hours_hard_limit: 14,
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [message, setMessage]   = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [opsMetrics, setOpsMetrics] = useState<OpsMetrics | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [phaseAlerts, setPhaseAlerts] = useState<{ hotZones: PhaseAlert[]; lowYieldZones: PhaseAlert[] } | null>(null);

  // ── Load current settings ─────────────────────────────────────────────────
  async function loadAdmin() {
    try {
      const res  = await fetch("/api/admin", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.weights)  setWeights(data.weights);
      if (data.settings) {
        const s = data.settings;
        const sources = Array.isArray(s.active_sources) ? s.active_sources : ["xcel"];
        setSettings((prev) => ({
          ...prev,
          ...s,
          active_sources: sources,
          connexus_enabled: sources.includes("connexus"),
        }));
      }
    } catch {}
    setLoading(false);
  }

  const loadStormEvents = useCallback(async () => {
    setStormLoading(true);
    try {
      const res = await fetch("/api/storm-events", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      const list: StormEvent[] = d.events ?? [];
      setStormEvents(list);
      setActiveEvent(list.find((e) => !e.ended_at) ?? null);
    } catch {}
    setStormLoading(false);
  }, [token]);

  const loadSnapshots = useCallback(async () => {
    setSnapLoading(true);
    try {
      const res = await fetch("/api/snapshots?limit=10", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setSnapshots(d.snapshots ?? []);
    } catch {}
    setSnapLoading(false);
  }, [token]);

  const loadOpsMetrics = useCallback(async () => {
    setOpsLoading(true);
    try {
      const res = await fetch("/api/ops/metrics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (res.ok) setOpsMetrics(d);
    } catch {}
    setOpsLoading(false);
  }, [token]);

  const loadPhaseAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/phase-alerts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (res.ok) setPhaseAlerts({ hotZones: d.hotZones ?? [], lowYieldZones: d.lowYieldZones ?? [] });
    } catch {}
  }, [token]);

  useEffect(() => { loadAdmin(); loadStormEvents(); loadSnapshots(); loadOpsMetrics(); loadPhaseAlerts(); }, []);

  async function downloadExport(kind: "outages" | "jobs" | "investigations", sinceDays = 30) {
    try {
      const res = await fetch(`/api/ops/export?kind=${kind}&sinceDays=${sinceDays}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Export failed");
      }
      const text = await res.text();
      const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}-${sinceDays}d-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  }

  async function downloadStormExport(eventId: string, eventName: string, format: "csv" | "geojson") {
    try {
      const res = await fetch(`/api/storm-events/${eventId}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Storm export failed");
      }
      const text = await res.text();
      const mime = format === "geojson" ? "application/geo+json" : "text/csv;charset=utf-8;";
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (eventName || "storm").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
      a.download = `${safe}-outages.${format === "geojson" ? "geojson" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  }

  // ── Save priority weights ─────────────────────────────────────────────────
  async function saveWeights() {
    setSaving(true); setMessage(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "weights", data: weights }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMessage({ type: "success", text: "Priority weights saved." });
    } catch (err: any) { setMessage({ type: "error", text: err.message }); }
    setSaving(false);
  }

  // ── Save data-source settings (NOT simulation — handled separately) ────────
  async function persistActiveSources(sources: string[]) {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        active_sources: sources,
        connexus_enabled: sources.includes("connexus"),
      };
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "settings", data: payload }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setSettings((prev) => ({ ...prev, ...payload }));
      onSettingsChanged?.(sources, settings.simulation_mode, {
        stormPhase: settings.storm_phase,
        tempOutMode: settings.temp_out_mode,
        fetchIntervalMinutes: settings.fetch_interval_minutes,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
    setSaving(false);
  }

  function toggleAdminSource(source: "xcel" | "connexus", enabled: boolean) {
    const sources = enabled
      ? [...new Set([...settings.active_sources, source])]
      : settings.active_sources.filter((s) => s !== source);
    void persistActiveSources(sources);
  }

  async function saveSourceSettings() {
    setSaving(true); setMessage(null);
    try {
      const payload = {
        active_sources: settings.active_sources,
        connexus_enabled: settings.active_sources.includes("connexus"),
        fetch_interval_minutes: settings.fetch_interval_minutes,
        storm_phase: settings.storm_phase,
        temp_out_mode: settings.temp_out_mode,
        max_jobs_per_tech: Math.max(1, Number(settings.max_jobs_per_tech) || 4),
        overtime_hours_soft_limit: Math.max(1, Number(settings.overtime_hours_soft_limit) || 10),
        overtime_hours_hard_limit: Math.max(
          Number(settings.overtime_hours_soft_limit) || 10,
          Number(settings.overtime_hours_hard_limit) || 14
        ),
      };
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "settings", data: payload }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMessage({ type: "success", text: "Settings saved. Refreshing outages…" });
      onSettingsChanged?.(settings.active_sources, settings.simulation_mode, {
        stormPhase: settings.storm_phase,
        tempOutMode: settings.temp_out_mode,
        fetchIntervalMinutes: settings.fetch_interval_minutes,
      });
    } catch (err: any) { setMessage({ type: "error", text: err.message }); }
    setSaving(false);
  }

  // ── Toggle simulation mode (uses /api/simulation for scenario activation) ─
  async function applySimulation() {
    const enable = settings.simulation_mode;
    setSaving(true); setMessage(null);
    try {
      const res = await fetch("/api/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enable }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMessage({
        type: "success",
        text: enable ? "Simulation mode ON — synthetic storm data active." : "Simulation mode OFF — live data restored.",
      });
      onSettingsChanged?.(settings.active_sources, enable, {
        stormPhase: settings.storm_phase,
        tempOutMode: settings.temp_out_mode,
        fetchIntervalMinutes: settings.fetch_interval_minutes,
      });
    } catch (err: any) { setMessage({ type: "error", text: err.message }); }
    setSaving(false);
  }

  // ── Storm event management ────────────────────────────────────────────────
  async function startStormEvent() {
    if (!newEventName.trim()) return;
    setStormLoading(true); setMessage(null);
    try {
      const res = await fetch("/api/storm-events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "start", name: newEventName }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setNewEventName("");
      await loadStormEvents();
      await loadOpsMetrics();
      await loadPhaseAlerts();
      setMessage({ type: "success", text: `Storm event "${newEventName}" started.` });
    } catch (err: any) { setMessage({ type: "error", text: err.message }); }
    setStormLoading(false);
  }

  async function endStormEvent(id: string, name: string) {
    setStormLoading(true); setMessage(null);
    try {
      const res = await fetch("/api/storm-events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "end", id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      await loadStormEvents();
      await loadOpsMetrics();
      await loadPhaseAlerts();
      setMessage({ type: "success", text: `Storm event "${name}" ended.` });
    } catch (err: any) { setMessage({ type: "error", text: err.message }); }
    setStormLoading(false);
  }

  async function sweepEntireMap() {
    if (
      !window.confirm(
        "Sweep the entire map? This removes every active dot from the live map between storms. Database history is kept for exports."
      )
    ) {
      return;
    }
    setStormLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/outages/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "sweep_all_active" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMessage({
        type: "success",
        text: `Map sweep complete. Removed ${d.affected ?? 0} dot${d.affected === 1 ? "" : "s"} from the active map.`,
      });
      await loadOpsMetrics();
      await loadPhaseAlerts();
      onOutagesChanged?.();
      onSettingsChanged?.(settings.active_sources, settings.simulation_mode, {
        stormPhase: settings.storm_phase,
        tempOutMode: settings.temp_out_mode,
        fetchIntervalMinutes: settings.fetch_interval_minutes,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
    setStormLoading(false);
  }

  async function sweepCompletedAndDeclined() {
    setStormLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/outages/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "sweep_statuses", statuses: ["completed", "no_opportunity"] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMessage({ type: "success", text: `Sweep complete. Removed ${d.affected ?? 0} completed/declined dots from active map.` });
      await loadOpsMetrics();
      await loadPhaseAlerts();
      onOutagesChanged?.();
      onSettingsChanged?.(settings.active_sources, settings.simulation_mode, {
        stormPhase: settings.storm_phase,
        tempOutMode: settings.temp_out_mode,
        fetchIntervalMinutes: settings.fetch_interval_minutes,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
    setStormLoading(false);
  }

  async function archiveStaleDots(hours: number) {
    setStormLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/outages/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "archive_stale", hours }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMessage({ type: "success", text: `Archived ${d.affected ?? 0} stale dots older than ${hours}h.` });
      await loadOpsMetrics();
      await loadPhaseAlerts();
      onOutagesChanged?.();
      onSettingsChanged?.(settings.active_sources, settings.simulation_mode, {
        stormPhase: settings.storm_phase,
        tempOutMode: settings.temp_out_mode,
        fetchIntervalMinutes: settings.fetch_interval_minutes,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
    setStormLoading(false);
  }

  // ── Load snapshot into test mode ──────────────────────────────────────────
  async function loadSnapshotIntoSim(snapshotId: string) {
    setLoadingSnap(snapshotId); setMessage(null);
    try {
      const res = await fetch("/api/simulation/load-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ snapshotId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMessage({ type: "success", text: `Loaded ${d.loaded} outages from snapshot. Activate simulation mode to view them.` });
      onSettingsChanged?.(settings.active_sources, true, {
        stormPhase: settings.storm_phase,
        tempOutMode: settings.temp_out_mode,
        fetchIntervalMinutes: settings.fetch_interval_minutes,
      });
    } catch (err: any) { setMessage({ type: "error", text: err.message }); }
    setLoadingSnap(null);
  }

  // ── Generate synthetic outages ────────────────────────────────────────────
  async function generateSyntheticOutages() {
    setGenRunning(true); setMessage(null);
    try {
      const res = await fetch("/api/simulation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ count: synthCount, type: synthType }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMessage({ type: "success", text: `Generated ${d.created} synthetic outages (${synthType}). Activate simulation to see them.` });
    } catch (err: any) { setMessage({ type: "error", text: err.message }); }
    setGenRunning(false);
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", fontSize: "14px",
    border: "1px solid #e5e7eb", borderRadius: "8px", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "13px", fontWeight: 600, color: "#374151",
    marginBottom: "6px", display: "block",
  };
  const sectionStyle: React.CSSProperties = {
    background: "#fff", borderRadius: "12px", padding: "20px",
    marginBottom: "20px", border: "1px solid #e5e7eb",
  };
  const saveBtn = (color = "#0d9488"): React.CSSProperties => ({
    marginTop: "16px", padding: "10px 20px", background: saving ? "#9ca3af" : color,
    color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px",
    fontWeight: 600, cursor: saving ? "default" : "pointer",
  });

  if (loading) return <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>Loading admin settings…</div>;

  return (
    <div>
      {message && (
        <div style={{ padding: "12px 16px", background: message.type === "success" ? "#d1fae5" : "#fee2e2", color: message.type === "success" ? "#065f46" : "#dc2626", borderRadius: "8px", marginBottom: "16px", fontSize: "14px" }}>
          {message.text}
        </div>
      )}

      {/* ── Data Sources ────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <SectionTitleWithTip title="Data Sources" tip={ADMIN_SECTION_HELP.dataSources} />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Xcel */}
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px", background: "#f9fafb", borderRadius: "8px", cursor: "pointer", border: settings.active_sources.includes("xcel") ? "2px solid #0d9488" : "1px solid #e5e7eb" }}>
            <div>
              <div style={{ fontWeight: 600, color: "#1f2937", display: "flex", alignItems: "center" }}>
                Xcel Energy (ArcGIS)
                <FieldTip text={ADMIN_FIELD_HELP.xcel} />
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>Live outage data from Xcel's ArcGIS REST endpoint</div>
            </div>
            <input
              type="checkbox"
              checked={settings.active_sources.includes("xcel")}
              onChange={(e) => toggleAdminSource("xcel", e.target.checked)}
              style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#0d9488" }}
            />
          </label>

          {/* Connexus */}
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px", background: "#f9fafb", borderRadius: "8px", cursor: "pointer", border: settings.active_sources.includes("connexus") ? "2px solid #0d9488" : "1px solid #e5e7eb" }}>
            <div>
              <div style={{ fontWeight: 600, color: "#1f2937", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
                Connexus Energy (ArcGIS)
                <FieldTip text={ADMIN_FIELD_HELP.connexus} />
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>
                Live outage data from Connexus Energy's public ArcGIS REST endpoint
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.active_sources.includes("connexus")}
              onChange={(e) => toggleAdminSource("connexus", e.target.checked)}
              style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#0d9488" }}
            />
          </label>
        </div>

        <div style={{ marginTop: "12px" }}>
          <label style={labelStyle}><LabelWithTip label="Fetch Interval (minutes)" tip={ADMIN_FIELD_HELP.fetchInterval} /></label>
          <input
            type="number" min={5} max={60}
            value={settings.fetch_interval_minutes}
            onChange={(e) => setSettings({ ...settings, fetch_interval_minutes: parseInt(e.target.value) || 15 })}
            style={{ ...fieldStyle, maxWidth: "120px" }}
          />
        </div>

        <div style={{ marginTop: "14px" }}>
          <label style={labelStyle}>Storm Phase</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "8px" }}>
            {[
              { value: "phase_1" as const, label: "Phase 1", sub: "Hunting", tip: ADMIN_FIELD_HELP.stormPhase1 },
              { value: "phase_2" as const, label: "Phase 2", sub: "Dispatch", tip: ADMIN_FIELD_HELP.stormPhase2 },
              { value: "phase_3" as const, label: "Phase 3", sub: "Cleanup", tip: ADMIN_FIELD_HELP.stormPhase3 },
            ].map((phase) => (
              <button
                key={phase.value}
                type="button"
                onClick={() => setSettings((prev) => ({ ...prev, storm_phase: phase.value }))}
                style={{
                  padding: "10px 8px",
                  borderRadius: "8px",
                  border: `1px solid ${settings.storm_phase === phase.value ? "#0d9488" : "#e5e7eb"}`,
                  background: settings.storm_phase === phase.value ? "#ccfbf1" : "#fff",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <div style={{ fontWeight: 700, color: settings.storm_phase === phase.value ? "#0f766e" : "#1f2937", fontSize: "12px", display: "inline-flex", alignItems: "center" }}>
                  {phase.label}
                  <FieldTip text={phase.tip} />
                </div>
                <div style={{ color: "#6b7280", fontSize: "11px", marginTop: "2px" }}>{phase.sub}</div>
              </button>
            ))}
          </div>
        </div>

        <label
          style={{
            marginTop: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            background: settings.temp_out_mode ? "#fff7ed" : "#f9fafb",
            borderRadius: "8px",
            cursor: "pointer",
            border: `1px solid ${settings.temp_out_mode ? "#fb923c" : "#e5e7eb"}`,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: "#1f2937", display: "flex", alignItems: "center" }}>
              Temp-Out Mode
              <FieldTip text={ADMIN_FIELD_HELP.tempOutMode} />
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>When ON, crews secure customer + temporary power + return later</div>
          </div>
          <input
            type="checkbox"
            checked={settings.temp_out_mode}
            onChange={(e) => setSettings((prev) => ({ ...prev, temp_out_mode: e.target.checked }))}
            style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#f97316" }}
          />
        </label>
        <div style={{ marginTop: "12px", padding: "12px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#f8fafc" }}>
          <div style={{ fontWeight: 700, fontSize: "12px", color: "#334155", marginBottom: "8px", textTransform: "uppercase", display: "flex", alignItems: "center" }}>
            Dispatch Guardrails
            <FieldTip text="Limits used when Assign recommends a tech — prevents overload and overtime-heavy dispatch." wide />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "8px" }}>
            <div>
              <label style={labelStyle}><LabelWithTip label="Max Jobs / Tech" tip={ADMIN_FIELD_HELP.maxJobsPerTech} /></label>
              <input
                type="number"
                min={1}
                max={12}
                value={settings.max_jobs_per_tech}
                onChange={(e) => setSettings((prev) => ({ ...prev, max_jobs_per_tech: parseInt(e.target.value) || 4 }))}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}><LabelWithTip label="Overtime Soft Limit (h)" tip={ADMIN_FIELD_HELP.overtimeSoft} /></label>
              <input
                type="number"
                min={1}
                max={24}
                value={settings.overtime_hours_soft_limit}
                onChange={(e) => setSettings((prev) => ({ ...prev, overtime_hours_soft_limit: parseInt(e.target.value) || 10 }))}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}><LabelWithTip label="Overtime Hard Limit (h)" tip={ADMIN_FIELD_HELP.overtimeHard} /></label>
              <input
                type="number"
                min={1}
                max={24}
                value={settings.overtime_hours_hard_limit}
                onChange={(e) => setSettings((prev) => ({ ...prev, overtime_hours_hard_limit: parseInt(e.target.value) || 14 }))}
                style={fieldStyle}
              />
            </div>
          </div>
          <div style={{ marginTop: "6px", fontSize: "11px", color: "#64748b" }}>
            Used by auto-dispatch scoring to reduce overload and avoid overtime-heavy assignments.
          </div>
        </div>
        <button onClick={saveSourceSettings} disabled={saving} style={saveBtn()}>
          {saving ? "Saving…" : "Save & Apply"}
        </button>

        {(role === "admin" || role === "owner") && onRoutingModeChanged && (
          <PlatformRoutingPanel
            token={token}
            currentMode={routingMode}
            onModeChanged={onRoutingModeChanged}
          />
        )}
      </div>

      {/* ── Priority Weights ─────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <SectionTitleWithTip title="Priority Scoring Weights" tip={ADMIN_SECTION_HELP.priorityWeights} />
        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#6b7280", lineHeight: 1.55 }}>
          Tunes bonuses when office <strong>creates jobs</strong> (call-ins, line drops, honey holes).
          Live Map <strong>Route to Next</strong> and Job Queue use separate <strong>V1 phase scoring</strong> — small-outage clusters beat large utility events in Phase 1 regardless of these multipliers.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
          {([
            { key: "customers_multiplier",       label: "Customers Multiplier", tip: ADMIN_FIELD_HELP.customersMultiplier },
            { key: "urgency_multiplier",          label: "Urgency Multiplier", tip: ADMIN_FIELD_HELP.urgencyMultiplier },
            { key: "office_job_bonus",            label: "Office Job Bonus", tip: ADMIN_FIELD_HELP.officeJobBonus },
            { key: "density_bonus",               label: "Density Bonus (per nearby outage)", tip: ADMIN_FIELD_HELP.densityBonus },
            { key: "time_weight",                 label: "Time Weight (per hour)", tip: ADMIN_FIELD_HELP.timeWeight },
            { key: "confirmed_opportunity_bonus", label: "Confirmed Opportunity Bonus", tip: ADMIN_FIELD_HELP.confirmedOpportunityBonus },
            { key: "wants_to_proceed_bonus",      label: "Wants-to-Proceed Bonus", tip: ADMIN_FIELD_HELP.wantsToProceedBonus },
            { key: "honey_hole_bonus",            label: "Honey Hole Bonus (multi-customer)", tip: ADMIN_FIELD_HELP.honeyHoleBonus },
            { key: "line_drop_bonus",             label: "Line Drop Present Bonus", tip: ADMIN_FIELD_HELP.lineDropBonus },
            { key: "line_drop_power_bonus",       label: "Line Drop w/ Power Bonus", tip: ADMIN_FIELD_HELP.lineDropPowerBonus },
          ] as { key: keyof Weights; label: string; tip: string }[]).map(({ key, label, tip }) => (
            <div key={key}>
              <label style={labelStyle}><LabelWithTip label={label} tip={tip} /></label>
              <input
                type="number" step="0.1"
                value={weights[key]}
                onChange={(e) => setWeights({ ...weights, [key]: parseFloat(e.target.value) || 0 })}
                style={fieldStyle}
              />
            </div>
          ))}
        </div>
        <button onClick={saveWeights} disabled={saving} style={saveBtn()}>
          {saving ? "Saving…" : "Save Weights"}
        </button>
      </div>

      {/* ── Storm Simulation Mode ─────────────────────────────────────── */}
      <div style={sectionStyle}>
        <SectionTitleWithTip title="Storm Simulation Mode" tip={ADMIN_SECTION_HELP.simulation} />
        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#6b7280" }}>
          Replace live outage data with a synthetic storm scenario for testing routing, dispatch, and priority logic.
        </p>

        {/* Visual toggle */}
        <label
          style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", background: settings.simulation_mode ? "#fff7ed" : "#f9fafb", border: `1px solid ${settings.simulation_mode ? "#fed7aa" : "#e5e7eb"}`, borderRadius: "8px", cursor: "pointer" }}
          onClick={() => setSettings((prev) => ({ ...prev, simulation_mode: !prev.simulation_mode }))}
        >
          {/* Track */}
          <div style={{ width: "44px", height: "24px", background: settings.simulation_mode ? "#f97316" : "#d1d5db", borderRadius: "12px", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ width: "20px", height: "20px", background: "#fff", borderRadius: "50%", position: "absolute", top: "2px", left: settings.simulation_mode ? "22px" : "2px", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#1f2937", display: "flex", alignItems: "center" }}>
              {settings.simulation_mode ? "Simulation ON (unsaved)" : "Simulation OFF"}
              <FieldTip text={ADMIN_FIELD_HELP.simulationToggle} />
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>
              {settings.simulation_mode
                ? "Click 'Apply Simulation' to activate synthetic storm data."
                : "Live data is active. Toggle to test with synthetic outage clusters."}
            </div>
          </div>
        </label>

        <button
          onClick={applySimulation}
          disabled={saving}
          style={{ ...saveBtn(settings.simulation_mode ? "#f97316" : "#6b7280"), marginTop: "12px" }}
        >
          {saving ? "Applying…" : settings.simulation_mode ? "Apply Simulation" : "Apply (Turn Off Simulation)"}
        </button>
      </div>

      {/* ── Synthetic Outage Generator ─────────────────────────────── */}
      <div style={sectionStyle}>
        <SectionTitleWithTip title="Synthetic Outage Generator" tip={ADMIN_SECTION_HELP.syntheticGenerator} />
        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#6b7280" }}>
          Generate a synthetic storm dataset for simulation. This does <strong>not</strong> affect live data.
        </p>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "14px" }}>
          {/* Count buttons */}
          <div>
            <label style={labelStyle}><LabelWithTip label="Outage Count" tip={ADMIN_FIELD_HELP.synthCount} /></label>
            <div style={{ display: "flex", gap: "6px" }}>
              {([10, 25, 50, 100] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setSynthCount(n)}
                  style={{
                    padding: "7px 16px",
                    border: `1px solid ${synthCount === n ? "#0d9488" : "#e5e7eb"}`,
                    borderRadius: "8px",
                    background: synthCount === n ? "#ccfbf1" : "#fff",
                    color: synthCount === n ? "#0d9488" : "#6b7280",
                    fontWeight: synthCount === n ? 700 : 400,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Type buttons */}
          <div>
            <label style={labelStyle}><LabelWithTip label="Scenario Type" tip={ADMIN_FIELD_HELP.synthType} /></label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {([
                { value: "mixed",      label: "Mixed" },
                { value: "clustered",  label: "Clustered" },
                { value: "sparse",     label: "Sparse" },
                { value: "honey_hole", label: "Honey Hole" },
              ] as const).map((t) => (
                <button
                  key={t.value}
                  onClick={() => setSynthType(t.value)}
                  style={{
                    padding: "7px 16px",
                    border: `1px solid ${synthType === t.value ? "#7c3aed" : "#e5e7eb"}`,
                    borderRadius: "8px",
                    background: synthType === t.value ? "#ede9fe" : "#fff",
                    color: synthType === t.value ? "#7c3aed" : "#6b7280",
                    fontWeight: synthType === t.value ? 700 : 400,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={generateSyntheticOutages}
          disabled={genRunning}
          style={{ ...saveBtn("#7c3aed"), margin: 0 }}
        >
          {genRunning ? "Generating…" : `Generate ${synthCount} ${synthType} outages`}
        </button>
      </div>

      {/* ── Load Saved Snapshot into Test Mode ──────────────────────── */}
      <div style={sectionStyle}>
        <SectionTitleWithTip title="Load Real Snapshot into Test Mode" tip={ADMIN_SECTION_HELP.snapshots} />
        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#6b7280" }}>
          Replay a saved Xcel outage snapshot as simulation data — full interaction, no live impact.
        </p>
        {snapLoading ? (
          <div style={{ color: "#9ca3af", fontSize: "13px" }}>Loading snapshots…</div>
        ) : snapshots.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: "13px" }}>No snapshots available yet. Snapshots are saved automatically when outages are fetched.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {snapshots.map((snap) => (
              <div key={snap.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                <div>
                  <div style={{ fontWeight: 600, color: "#1f2937", fontSize: "13px" }}>
                    {new Date(snap.fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>
                    {snap.normalized_count} outages · {snap.source}
                  </div>
                </div>
                <button
                  onClick={() => loadSnapshotIntoSim(snap.id)}
                  disabled={loadingSnap === snap.id}
                  style={{ padding: "7px 14px", background: loadingSnap === snap.id ? "#9ca3af" : "#7c3aed", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: loadingSnap === snap.id ? "default" : "pointer" }}
                >
                  {loadingSnap === snap.id ? "Loading…" : "Load into Test"}
                </button>
              </div>
            ))}
          </div>
        )}
        <button onClick={loadSnapshots} style={{ marginTop: "12px", padding: "7px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px", color: "#6b7280", cursor: "pointer" }}>
          Refresh Snapshots
        </button>
      </div>

      {/* ── Storm Event Sessions ─────────────────────────────────────── */}
      <div style={sectionStyle}>
        <SectionTitleWithTip title="Storm Event Sessions" tip={ADMIN_SECTION_HELP.stormEvents} />
        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#6b7280" }}>
          Track storm response sessions for historical analysis and future AI routing improvement.
        </p>

        {/* Active event banner */}
        {activeEvent && (
          <div style={{ padding: "12px 14px", background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "8px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, color: "#92400e", fontSize: "14px" }}>ACTIVE: {activeEvent.name}</div>
              <div style={{ fontSize: "12px", color: "#78350f" }}>
                Started {new Date(activeEvent.started_at).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => endStormEvent(activeEvent.id, activeEvent.name)}
              disabled={stormLoading}
              style={{ padding: "8px 16px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: stormLoading ? "default" : "pointer" }}
            >
              End Event
            </button>
          </div>
        )}

        {/* Start new event */}
        {!activeEvent && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <input
              type="text"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              placeholder="Event name (e.g. June 2026 Derecho)"
              title={ADMIN_FIELD_HELP.stormEventName}
              style={{ flex: 1, padding: "9px 12px", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "8px", outline: "none" }}
            />
            <button
              onClick={startStormEvent}
              disabled={stormLoading || !newEventName.trim()}
              style={{ padding: "9px 18px", background: stormLoading || !newEventName.trim() ? "#9ca3af" : "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: stormLoading || !newEventName.trim() ? "default" : "pointer" }}
            >
              {stormLoading ? "Starting…" : "Start Session"}
            </button>
          </div>
        )}

        {/* Past events */}
        {stormEvents.filter((e) => e.ended_at).length > 0 && (
          <div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", marginBottom: "8px", textTransform: "uppercase" }}>Past Events</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {stormEvents.filter((e) => e.ended_at).map((e) => (
                <div key={e.id} style={{ padding: "10px 14px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                  <div style={{ fontWeight: 600, color: "#1f2937", fontSize: "13px" }}>{e.name}</div>
                  <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "8px" }}>
                    {new Date(e.started_at).toLocaleDateString()} → {new Date(e.ended_at!).toLocaleDateString()}
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => downloadStormExport(e.id, e.name, "csv")}
                      style={{ padding: "5px 10px", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadStormExport(e.id, e.name, "geojson")}
                      style={{ padding: "5px 10px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                    >
                      Export GeoJSON
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: "18px", borderTop: "1px solid #e5e7eb", paddingTop: "14px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6b7280", marginBottom: "8px", textTransform: "uppercase", display: "flex", alignItems: "center" }}>
            Map Cleanup
            <FieldTip text="Remove clutter from the active map between storms. Data stays in the database for exports." wide />
          </div>
          <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#6b7280" }}>
            Use these tools between storms to keep the active map clean without deleting history.
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={sweepEntireMap}
              disabled={stormLoading}
              title={ADMIN_FIELD_HELP.sweepEntireMap}
              style={{ padding: "8px 12px", background: "#b45309", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: stormLoading ? "default" : "pointer" }}
            >
              Sweep Entire Map
            </button>
            <button
              onClick={sweepCompletedAndDeclined}
              disabled={stormLoading}
              title={ADMIN_FIELD_HELP.sweepCompleted}
              style={{ padding: "8px 12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: stormLoading ? "default" : "pointer" }}
            >
              Sweep Completed + Declined
            </button>
            <button
              onClick={() => archiveStaleDots(48)}
              disabled={stormLoading}
              title={ADMIN_FIELD_HELP.archiveStale48}
              style={{ padding: "8px 12px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: stormLoading ? "default" : "pointer" }}
            >
              Archive Stale (48h)
            </button>
            <button
              onClick={() => archiveStaleDots(72)}
              disabled={stormLoading}
              title={ADMIN_FIELD_HELP.archiveStale72}
              style={{ padding: "8px 12px", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: stormLoading ? "default" : "pointer" }}
            >
              Archive Stale (72h)
            </button>
          </div>
        </div>
      </div>

      {/* ── Data Storage & Exports ────────────────────────────────────── */}
      <div style={sectionStyle}>
        <SectionTitleWithTip title="Data Storage & Analytics" tip={ADMIN_SECTION_HELP.dataStorage} />
        <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#6b7280" }}>
          Operational data is stored in Supabase Postgres and can be exported for routing analysis, inventory planning, and historical storm reviews.
        </p>

        {opsLoading ? (
          <div style={{ fontSize: "13px", color: "#9ca3af" }}>Loading metrics…</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "10px", marginBottom: "12px" }}>
              {[
                { label: "Total Outages", value: opsMetrics?.totals?.outages ?? 0, color: "#334155" },
                { label: "Total Jobs", value: opsMetrics?.totals?.jobs ?? 0, color: "#0f766e" },
                { label: "Investigations", value: opsMetrics?.totals?.investigations ?? 0, color: "#7c3aed" },
                { label: "Outages (7d)", value: opsMetrics?.recent7d?.outages ?? 0, color: "#ea580c" },
                { label: "Jobs (7d)", value: opsMetrics?.recent7d?.jobs ?? 0, color: "#2563eb" },
              ].map((m) => (
                <div key={m.label} style={{ padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff" }}>
                  <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>{m.label}</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "10px" }}>
              <strong>Storage:</strong> {opsMetrics?.storage?.provider ?? "Supabase Postgres"} · Tables: {(opsMetrics?.storage?.tables ?? []).join(", ")}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "8px" }}>
              <div style={{ padding: "12px", border: "1px solid #d1fae5", background: "#ecfdf5", borderRadius: "10px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#065f46", marginBottom: "8px" }}>Hot Zones (72h)</div>
                {(phaseAlerts?.hotZones ?? []).length === 0 ? (
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>No hot zones detected yet.</div>
                ) : (
                  (phaseAlerts?.hotZones ?? []).map((z) => (
                    <div key={`hot-${z.city}`} style={{ fontSize: "12px", color: "#064e3b", marginBottom: "6px" }}>
                      {z.city}: {z.hotScore}% hot ({z.hotCount}/{z.sample})
                    </div>
                  ))
                )}
              </div>
              <div style={{ padding: "12px", border: "1px solid #fee2e2", background: "#fef2f2", borderRadius: "10px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#991b1b", marginBottom: "8px" }}>Low-Yield Areas (72h)</div>
                {(phaseAlerts?.lowYieldZones ?? []).length === 0 ? (
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>No low-yield alerts yet.</div>
                ) : (
                  (phaseAlerts?.lowYieldZones ?? []).map((z) => (
                    <div key={`low-${z.city}`} style={{ fontSize: "12px", color: "#7f1d1d", marginBottom: "6px" }}>
                      {z.city}: {z.lowYieldScore}% low-yield ({z.lowYieldCount}/{z.sample})
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "12px", marginTop: "10px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6b7280", marginBottom: "8px", textTransform: "uppercase" }}>
            Export CSV
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button onClick={() => downloadExport("outages", 30)} title={ADMIN_FIELD_HELP.exportOutages} style={{ padding: "8px 12px", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              Outages (30d)
            </button>
            <button onClick={() => downloadExport("jobs", 30)} title={ADMIN_FIELD_HELP.exportJobs} style={{ padding: "8px 12px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              Jobs (30d)
            </button>
            <button onClick={() => downloadExport("investigations", 30)} title={ADMIN_FIELD_HELP.exportInvestigations} style={{ padding: "8px 12px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              Investigations (30d)
            </button>
            <button onClick={() => downloadExport("outages", 90)} title={ADMIN_FIELD_HELP.exportOutages} style={{ padding: "8px 12px", background: "#6b7280", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              Outages (90d)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
