"use client";

import { useMemo, useState } from "react";

export type OpportunityRow = {
  id: number | string;
  streetAddress?: string;
  city?: string;
  customers: number;
  status: string;
  source?: string;
  lat: number;
  lng: number;
  verbalPrice?: string | null;
  officeNotes?: string | null;
  cause?: string | null;
};

const OPPORTUNITY_STATUSES = new Set([
  "opportunity",
  "door_hanger",
  "customer_thinking",
]);

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  opportunity: { bg: "#faf5ff", color: "#7e22ce", label: "No contact / Opportunity" },
  door_hanger: { bg: "#fdf2f8", color: "#be185d", label: "Door hanger" },
  customer_thinking: { bg: "#f3f4f6", color: "#4b5563", label: "Thinking" },
};

type Props = {
  outages: OpportunityRow[];
  token?: string | null;
  isOffice?: boolean;
  onNavigate: (lat: number, lng: number, address?: string) => void;
  onInvestigate: (row: OpportunityRow) => void;
  onUpdated?: () => void;
};

function parseVerbalPrice(notes?: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/verbal_price=([^;\n]+)/i);
  return m ? m[1].trim() : null;
}

export function filterConfirmedOpportunities<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter((o) => OPPORTUNITY_STATUSES.has(o.status));
}

export default function OpportunitiesList({
  outages,
  token,
  isOffice,
  onNavigate,
  onInvestigate,
  onUpdated,
}: Props) {
  const rows = useMemo(() => filterConfirmedOpportunities(outages), [outages]);
  const [editing, setEditing] = useState<OpportunityRow | null>(null);
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("opportunity");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEdit(row: OpportunityRow) {
    setEditing(row);
    setNotes(row.cause ?? row.officeNotes ?? "");
    setAddress(row.streetAddress ?? "");
    setStatus(row.status);
    setError(null);
  }

  async function deleteRow(row: OpportunityRow) {
    if (!token || !isOffice) return;
    const addr = row.streetAddress?.split(",")[0] ?? row.city ?? `Outage ${row.id}`;
    if (!window.confirm(`Remove "${addr}" from the map and opportunities list?`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/outages/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "deactivate_one", id: row.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      if (editing?.id === row.id) setEditing(null);
      onUpdated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function saveEdit() {
    if (!editing || !token) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/outages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: editing.id,
          status,
          notes,
          streetAddress: address,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setEditing(null);
      onUpdated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px", color: "#9ca3af", background: "#f9fafb", borderRadius: "12px" }}>
        <div style={{ fontSize: "32px", marginBottom: "8px" }}>◇</div>
        <div style={{ fontSize: "16px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>No confirmed opportunities</div>
        <div style={{ fontSize: "14px" }}>Mark a dot as &quot;Opportunity found&quot; in the field form</div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {rows.map((o) => {
          const sc = STATUS_STYLE[o.status] ?? { bg: "#f3f4f6", color: "#374151", label: o.status };
          const verbal = o.verbalPrice ?? parseVerbalPrice(o.officeNotes ?? o.cause);
          const addr = o.streetAddress?.split(",")[0] ?? o.city ?? `Outage ${o.id}`;
          const isSelf = o.source === "self_generated" || o.source === "user_reported" || o.source === "user";
          return (
            <div
              key={String(o.id)}
              style={{
                padding: "14px 16px",
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                borderLeft: `4px solid ${sc.color}`,
                cursor: isOffice ? "pointer" : "default",
              }}
              onClick={() => isOffice && openEdit(o)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "#1f2937" }}>{addr}</div>
                  <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                    {isSelf ? "Self-generated" : (o.source ?? "map").toUpperCase()}
                    {o.customers > 1 ? ` · ${o.customers} homes` : ""}
                  </div>
                </div>
                <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, background: sc.bg, color: sc.color, flexShrink: 0 }}>
                  {sc.label}
                </span>
              </div>
              {verbal && (
                <div style={{ fontSize: "13px", color: "#0d9488", fontWeight: 600, marginBottom: "8px" }}>
                  Verbal quote: ${verbal}
                </div>
              )}
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => onNavigate(o.lat, o.lng, o.streetAddress)} style={opBtn("#0ea5e9")}>
                  Go
                </button>
                <button type="button" onClick={() => onInvestigate(o)} style={opBtn("#7c3aed")}>
                  Investigate
                </button>
                {isOffice && (
                  <>
                    <button type="button" onClick={() => openEdit(o)} style={opBtn("#374151")}>
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteRow(o)} disabled={deleting} style={opBtn("#ef4444")}>
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2400, padding: "16px" }} onClick={() => setEditing(null)}>
          <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "480px", padding: "20px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px", fontSize: "17px", fontWeight: 700 }}>Edit opportunity</h3>
            {error && <div style={{ marginBottom: "10px", padding: "8px", background: "#fef2f2", color: "#b91c1c", borderRadius: "6px", fontSize: "13px" }}>{error}</div>}
            <label style={{ display: "block", marginBottom: "10px", fontSize: "12px", fontWeight: 600 }}>Address
              <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ display: "block", width: "100%", marginTop: "4px", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }} />
            </label>
            <label style={{ display: "block", marginBottom: "10px", fontSize: "12px", fontWeight: 600 }}>Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ display: "block", width: "100%", marginTop: "4px", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }} />
            </label>
            <label style={{ display: "block", marginBottom: "14px", fontSize: "12px", fontWeight: 600 }}>Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ display: "block", width: "100%", marginTop: "4px", padding: "8px", border: "1px solid #e5e7eb", borderRadius: "6px" }}>
                <option value="opportunity">Opportunity / no contact</option>
                <option value="door_hanger">Door hanger</option>
                <option value="customer_thinking">Customer thinking</option>
                <option value="sold">Job sold</option>
              </select>
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={saveEdit} disabled={saving} style={{ flex: 1, padding: "10px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600 }}>{saving ? "Saving…" : "Save"}</button>
              {isOffice && (
                <button
                  type="button"
                  onClick={() => editing && deleteRow(editing)}
                  disabled={deleting || saving}
                  style={{ padding: "10px 14px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: "8px", fontWeight: 600 }}
                >
                  {deleting ? "Removing…" : "Remove"}
                </button>
              )}
              <button type="button" onClick={() => setEditing(null)} style={{ padding: "10px 14px", background: "#f3f4f6", border: "none", borderRadius: "8px" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function opBtn(bg: string): React.CSSProperties {
  return {
    padding: "6px 12px",
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  };
}
