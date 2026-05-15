/**
 * TerritoryPanel — 1.14 Territory assignment logic
 *
 * Lets office/admin create territories (by zip code list) and assign them to techs.
 * Territory list is fetched from /api/territories.
 * Techs can have their territory updated via /api/techs.
 */

"use client";

import { useState, useEffect, useCallback } from "react";

type Territory = {
  id: string;
  name: string;
  type: "zip" | "polygon";
  zip_codes: string[] | null;
  created_at: string;
};

type Tech = {
  userId: string;
  name: string;
  email: string;
  status: string;
  territoryId: string | null;
};

type Props = {
  token: string;
  role: string;
};

export default function TerritoryPanel({ token, role }: Props) {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state — create territory
  const [showForm, setShowForm] = useState(false);
  const [tName, setTName] = useState("");
  const [tZips, setTZips] = useState("");
  const [saving, setSaving] = useState(false);

  // Assign state
  const [assigningTech, setAssigningTech] = useState<string | null>(null);
  const [assignTerritory, setAssignTerritory] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, techRes] = await Promise.all([
        fetch("/api/territories", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/techs", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const tData = await tRes.json();
      const techData = await techRes.json();
      setTerritories(tData.territories ?? []);
      setTechs(
        (techData.techs ?? []).map((t: any) => ({
          userId: t.userId,
          name: t.name,
          email: t.email,
          status: t.status,
          territoryId: t.territoryId ?? null,
        }))
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function createTerritory(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const zipCodes = tZips
        .split(/[\s,]+/)
        .map((z) => z.trim())
        .filter(Boolean);
      const res = await fetch("/api/territories", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: tName, type: "zip", zipCodes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Territory "${tName}" created`);
      setTName("");
      setTZips("");
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function assignTechTerritory(techId: string, territoryId: string) {
    setAssigningTech(techId);
    setError(null);
    try {
      const res = await fetch("/api/techs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "assign_territory", techId, territoryId: territoryId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to assign territory");
      setSuccess("Territory assigned");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigningTech(null);
      setAssignTerritory("");
    }
  }

  const isOffice = role === "office" || role === "admin";

  if (loading) {
    return <div style={{ textAlign: "center", padding: "48px", color: "#6b7280" }}>Loading territories…</div>;
  }

  return (
    <div style={{ maxWidth: "800px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#1f2937" }}>Territory Management</h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>
            Define zones by zip code and assign techs to their home territories. The dispatch system routes jobs to in-territory techs first.
          </p>
        </div>
        {isOffice && (
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ padding: "8px 16px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            + New Territory
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px", color: "#dc2626", fontSize: "13px", marginBottom: "16px" }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: "12px 16px", background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: "8px", color: "#065f46", fontSize: "13px", marginBottom: "16px" }}>
          {success}
        </div>
      )}

      {/* Create territory form */}
      {showForm && isOffice && (
        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "20px", marginBottom: "24px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 600, color: "#1f2937" }}>Create Territory</h3>
          <form onSubmit={createTerritory}>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Territory name</label>
              <input
                value={tName}
                onChange={(e) => setTName(e.target.value)}
                required
                placeholder="e.g. North Denver"
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
                Zip codes <span style={{ fontWeight: 400, color: "#6b7280" }}>(comma or space separated)</span>
              </label>
              <textarea
                value={tZips}
                onChange={(e) => setTZips(e.target.value)}
                placeholder="80201, 80202, 80203"
                rows={3}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", resize: "vertical", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="submit" disabled={saving} style={{ padding: "9px 18px", background: saving ? "#9ca3af" : "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving…" : "Save Territory"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: "9px 18px", background: "#e5e7eb", border: "none", borderRadius: "8px", fontSize: "14px", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Territory list */}
      <div style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>
          Territories ({territories.length})
        </h3>
        {territories.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", background: "#f9fafb", borderRadius: "12px", color: "#9ca3af", fontSize: "14px" }}>
            No territories defined yet. Create one above to start assigning techs to zones.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {territories.map((t) => {
              const assignedTechs = techs.filter((tech) => tech.territoryId === t.id);
              return (
                <div key={t.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "14px", color: "#1f2937" }}>{t.name}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                        {t.zip_codes?.length
                          ? `Zip codes: ${t.zip_codes.join(", ")}`
                          : "Polygon boundary (no zip codes set)"}
                      </div>
                    </div>
                    <span style={{ fontSize: "11px", padding: "3px 8px", background: "#f0fdf4", color: "#059669", borderRadius: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {assignedTechs.length} tech{assignedTechs.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {assignedTechs.length > 0 && (
                    <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {assignedTechs.map((tech) => (
                        <span key={tech.userId} style={{ fontSize: "12px", padding: "3px 10px", background: "#eff6ff", color: "#1d4ed8", borderRadius: "12px" }}>
                          {tech.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign techs to territories */}
      {isOffice && techs.length > 0 && (
        <div>
          <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>
            Assign Techs to Territories
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {techs.map((tech) => {
              const current = territories.find((t) => t.id === tech.territoryId);
              return (
                <div key={tech.userId} style={{ display: "flex", alignItems: "center", gap: "12px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 16px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "#1f2937" }}>{tech.name}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>
                      {current ? `Currently: ${current.name}` : "No territory assigned"}
                    </div>
                  </div>
                  <select
                    value={assigningTech === tech.userId ? assignTerritory : tech.territoryId ?? ""}
                    onChange={(e) => {
                      setAssignTerritory(e.target.value);
                      assignTechTerritory(tech.userId, e.target.value);
                    }}
                    disabled={assigningTech === tech.userId}
                    style={{ padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: "7px", fontSize: "13px", color: "#374151", minWidth: "160px" }}
                  >
                    <option value="">— Unassigned —</option>
                    {territories.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
