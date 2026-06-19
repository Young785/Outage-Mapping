"use client";

import { useState } from "react";
import AddressFields, { type AddressValue } from "./AddressFields";

type Props = {
  token: string;
  onClose: () => void;
  onCreated: () => void;
};

const PRIORITY_OPTIONS = [
  { value: 1, label: "1 — Highest", desc: "Possible honey hole / utility pole down", color: "#ef4444", bg: "#fee2e2" },
  { value: 2, label: "2 — High", desc: "Single service / no power but neighbors have power", color: "#f97316", bg: "#fff7ed" },
  { value: 3, label: "3 — Medium", desc: "Neighborhood down / clear damage", color: "#f59e0b", bg: "#fef3c7" },
  { value: 4, label: "4 — Can Wait", desc: "Minor damage only", color: "#10b981", bg: "#ecfdf5" },
];

const emptyAddress = (): AddressValue => ({
  street: "",
  city: "",
  state: "",
  zip: "",
  lat: null,
  lng: null,
});

export default function JobForm({ token, onClose, onCreated }: Props) {
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [priority, setPriority] = useState(3);
  const [lineDrop, setLineDrop] = useState(false);
  const [powerOnLineDrop, setPowerOnLineDrop] = useState(false);
  const [neighborhoodDead, setNeighborhoodDead] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.street.trim() || !address.city.trim() || !address.state.trim()) {
      setError("Street, city, and state are required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const customerAddress = [address.street.trim(), address.city.trim(), address.state.trim(), address.zip.trim()]
      .filter(Boolean)
      .join(", ");

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerName,
          customerAddress,
          street: address.street.trim(),
          city: address.city.trim(),
          state: address.state.trim(),
          zip: address.zip.trim(),
          customerPhone,
          customerEmail,
          customerLat: address.lat,
          customerLng: address.lng,
          priority,
          lineDrop,
          powerOnLineDrop,
          neighborhoodDead,
          notes,
          isConfirmedOpportunity: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create job");

      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "6px",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "16px", maxWidth: "520px", width: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 700, color: "#1f2937" }}>New Office Job</h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>Call-in — goes to job queue & map</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
          {error && (
            <div style={{ padding: "12px", background: "#fee2e2", borderRadius: "8px", color: "#dc2626", fontSize: "14px", marginBottom: "16px" }}>{error}</div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Customer Name <span style={{ color: "#ef4444" }}>*</span></label>
            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required style={inputStyle} placeholder="Full name or company" />
          </div>

          <AddressFields value={address} onChange={setAddress} enableMapPicker />

          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Phone</label>
            <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(612) 555-0100" style={inputStyle} />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@email.com" style={inputStyle} />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Priority</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {PRIORITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    cursor: "pointer",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: `2px solid ${priority === opt.value ? opt.color : "#e5e7eb"}`,
                    background: priority === opt.value ? opt.bg : "#fff",
                  }}
                >
                  <input type="radio" name="priority" checked={priority === opt.value} onChange={() => setPriority(opt.value)} style={{ marginTop: "2px", accentColor: opt.color }} />
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 600 }}>{opt.label}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: "16px", padding: "14px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", marginBottom: "8px" }}>
              <input type="checkbox" checked={lineDrop} onChange={(e) => { setLineDrop(e.target.checked); if (!e.target.checked) setPowerOnLineDrop(false); }} style={{ width: "17px", height: "17px", accentColor: "#0d9488" }} />
              <span style={{ fontSize: "14px", fontWeight: 600 }}>Line drop present</span>
            </label>
            {lineDrop && (
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", marginLeft: "26px", marginBottom: "8px" }}>
                <input type="checkbox" checked={powerOnLineDrop} onChange={(e) => setPowerOnLineDrop(e.target.checked)} style={{ width: "17px", height: "17px", accentColor: "#0d9488" }} />
                <span style={{ fontSize: "14px" }}>Power on line drop</span>
              </label>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
              <input type="checkbox" checked={neighborhoodDead} onChange={(e) => setNeighborhoodDead(e.target.checked)} style={{ width: "17px", height: "17px", accentColor: "#0d9488" }} />
              <span style={{ fontSize: "14px" }}>Entire neighborhood without power</span>
            </label>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Access instructions, special requirements…" />
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "12px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} style={{ flex: 2, padding: "12px", background: submitting ? "#9ca3af" : "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer" }}>
              {submitting ? "Creating..." : "Add to Queue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
