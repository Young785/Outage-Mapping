"use client";

import { useEffect, useState } from "react";
import CustomerInfoFields, { type CustomerInfoValue } from "./CustomerInfoFields";

type TechOption = { userId: string; name: string };

export type QueueDrawerItem = {
  id: string;
  type: "job" | "outage";
  displayName: string;
  address: string | null;
  status: string;
  customerPhone: string | null;
  customerEmail?: string | null;
  photos?: string[];
  assignedTechId: string | null;
  assignedTechName: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
};

type Props = {
  item: QueueDrawerItem;
  token: string;
  techs: TechOption[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onNavigate: (lat: number, lng: number, address?: string) => void;
  onAssignOutage?: (outageId: string, techId: string, lat: number, lng: number) => Promise<void>;
};

function emailFromNotes(notes: string | null | undefined): string {
  const line = String(notes ?? "").split("\n").find((l) => l.startsWith("email="));
  return line ? line.slice("email=".length).trim() : "";
}

function stripEmailFromNotes(notes: string): string {
  return notes
    .split("\n")
    .filter((l) => !l.startsWith("email="))
    .join("\n")
    .trim();
}

export default function QueueItemDrawer({
  item,
  token,
  techs,
  onClose,
  onSaved,
  onDeleted,
  onNavigate,
  onAssignOutage,
}: Props) {
  const [customer, setCustomer] = useState<CustomerInfoValue>({
    customerName: item.displayName,
    customerPhone: item.customerPhone ?? "",
    customerEmail: item.customerEmail ?? emailFromNotes(item.notes),
    notes: stripEmailFromNotes(item.notes ?? ""),
    photos: item.photos ?? [],
  });
  const [address, setAddress] = useState(item.address ?? "");
  const [status, setStatus] = useState(item.status);
  const [assignedTechId, setAssignedTechId] = useState(item.assignedTechId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCustomer({
      customerName: item.displayName,
      customerPhone: item.customerPhone ?? "",
      customerEmail: item.customerEmail ?? emailFromNotes(item.notes),
      notes: stripEmailFromNotes(item.notes ?? ""),
      photos: item.photos ?? [],
    });
    setAddress(item.address ?? "");
    setStatus(item.status);
    setAssignedTechId(item.assignedTechId ?? "");
  }, [item]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (item.type === "job") {
        const res = await fetch(`/api/jobs/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            customerName: customer.customerName,
            customerAddress: address,
            customerPhone: customer.customerPhone.trim() || null,
            customerEmail: customer.customerEmail.trim() || null,
            notes: customer.notes,
            photos: customer.photos,
            status,
            assignedTechId: assignedTechId || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed");
      } else {
        if (assignedTechId && assignedTechId !== (item.assignedTechId ?? "") && item.lat != null && item.lng != null && onAssignOutage) {
          await onAssignOutage(item.id, assignedTechId, item.lat, item.lng);
        }
        const res = await fetch("/api/outages", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            id: item.id,
            status,
            notes: customer.notes,
            streetAddress: address,
            customerName: customer.customerName.trim() || null,
            customerPhone: customer.customerPhone.trim() || null,
            customerEmail: customer.customerEmail.trim() || null,
            photos: customer.photos,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed");
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this item from the active queue?")) return;
    setSaving(true);
    setError(null);
    try {
      if (item.type === "job") {
        const res = await fetch(`/api/jobs/${item.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Delete failed");
      } else {
        const res = await fetch("/api/outages/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "deactivate_one", id: item.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Remove failed");
      }
      onDeleted();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 2500,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "520px",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>
              {item.type === "job" ? "Office job" : "Outage queue item"}
            </div>
            <h3 style={{ margin: "4px 0 0", fontSize: "17px", fontWeight: 700 }}>Edit queue item</h3>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {error && (
            <div style={{ padding: "10px 12px", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", fontSize: "13px" }}>{error}</div>
          )}

          <CustomerInfoFields
            value={customer}
            onChange={setCustomer}
            showName={item.type === "job" || true}
            nameRequired={item.type === "job"}
          />

          <label style={{ display: "block" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Address</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ ...inp, marginTop: "6px" }} />
          </label>

          <label style={{ display: "block" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inp, marginTop: "6px" }}>
              {item.type === "job" ? (
                <>
                  <option value="pending">Pending</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </>
              ) : (
                <>
                  <option value="sold">Job sold</option>
                  <option value="job_started">Job started</option>
                  <option value="temp_power">Temp power</option>
                  <option value="grounding">Return for grounding</option>
                  <option value="wants_to_proceed">Wants to proceed</option>
                  <option value="opportunity">Damage confirmed / no contact</option>
                  <option value="completed">Completed</option>
                  <option value="no_opportunity">Declined / dead</option>
                </>
              )}
            </select>
          </label>

          {(item.type === "job" || item.type === "outage") && (
            <label style={{ display: "block" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>Assigned technician</span>
              <select value={assignedTechId} onChange={(e) => setAssignedTechId(e.target.value)} style={{ ...inp, marginTop: "6px" }}>
                <option value="">— Unassigned —</option>
                {techs.map((t) => (
                  <option key={t.userId} value={t.userId}>{t.name}</option>
                ))}
              </select>
            </label>
          )}

          {item.assignedTechName && !assignedTechId && (
            <div style={{ fontSize: "12px", color: "#6b7280" }}>Currently: {item.assignedTechName}</div>
          )}

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
            {item.lat != null && item.lng != null && (
              <button
                type="button"
                onClick={() => onNavigate(item.lat!, item.lng!, address || undefined)}
                style={{ padding: "10px 14px", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}
              >
                Navigate
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{ padding: "10px 14px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              style={{ padding: "10px 14px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
