"use client";

import { useState } from "react";
import AddressFields, { type AddressValue } from "./AddressFields";
import CustomerInfoFields, { type CustomerInfoValue } from "./CustomerInfoFields";

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

const emptyCustomer = (): CustomerInfoValue => ({
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  notes: "",
  photos: [],
});

export default function JobForm({ token, onClose, onCreated }: Props) {
  const [customer, setCustomer] = useState<CustomerInfoValue>(emptyCustomer);
  const [address, setAddress] = useState<AddressValue>(emptyAddress);
  const [priority, setPriority] = useState(3);
  const [primaryPower, setPrimaryPower] = useState<"" | "has_power" | "no_power">("");
  const [noPowerDetail, setNoPowerDetail] = useState<"" | "no_power_on_drop" | "no_power_no_drop" | "neighborhood_dead">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.street.trim() || !address.city.trim() || !address.state.trim()) {
      setError("Street, city, and state are required.");
      return;
    }
    if (!customer.customerName.trim()) {
      setError("Customer name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const customerAddress = [address.street.trim(), address.city.trim(), address.state.trim(), address.zip.trim()]
      .filter(Boolean)
      .join(", ");

    const lineDrop = noPowerDetail === "no_power_on_drop" || noPowerDetail === "no_power_no_drop";
    const powerOnLineDrop = noPowerDetail === "no_power_on_drop";
    const neighborhoodDead = noPowerDetail === "neighborhood_dead";

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerName: customer.customerName.trim(),
          customerAddress,
          street: address.street.trim(),
          city: address.city.trim(),
          state: address.state.trim(),
          zip: address.zip.trim(),
          customerPhone: customer.customerPhone.trim() || null,
          customerEmail: customer.customerEmail.trim() || null,
          customerLat: address.lat,
          customerLng: address.lng,
          priority,
          lineDrop,
          powerOnLineDrop,
          neighborhoodDead,
          notes: customer.notes.trim() || null,
          photos: customer.photos,
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
            <CustomerInfoFields
              value={customer}
              onChange={setCustomer}
              nameRequired
              contactRow
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <AddressFields value={address} onChange={setAddress} enableMapPicker={false} />
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
            <p style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: 700, color: "#374151" }}>Power status</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {[
                { v: "has_power" as const, l: "Has power" },
                { v: "no_power" as const, l: "No power" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => {
                    setPrimaryPower(o.v);
                    if (o.v === "has_power") setNoPowerDetail("");
                  }}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                    border: `2px solid ${primaryPower === o.v ? "#0d9488" : "#e5e7eb"}`,
                    background: primaryPower === o.v ? "#f0fdfa" : "#fff",
                    color: primaryPower === o.v ? "#0d9488" : "#374151",
                  }}
                >
                  {o.l}
                </button>
              ))}
            </div>
            {primaryPower === "no_power" && (
              <div style={{ marginLeft: "12px", marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {[
                  { v: "no_power_on_drop" as const, l: "Power on line drop" },
                  { v: "no_power_no_drop" as const, l: "No power on line drop" },
                  { v: "neighborhood_dead" as const, l: "Neighborhood dead (entire area out)" },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setNoPowerDetail(o.v)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "left",
                      border: `2px solid ${noPowerDetail === o.v ? "#0d9488" : "#e5e7eb"}`,
                      background: noPowerDetail === o.v ? "#f0fdfa" : "#fff",
                      color: noPowerDetail === o.v ? "#0d9488" : "#374151",
                    }}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            )}
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
