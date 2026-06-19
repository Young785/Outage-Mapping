"use client";

import { useState, useEffect } from "react";
import { ROUTING_MODE_LABELS, type RoutingMode } from "@/lib/routing-mode";

type Props = {
  token: string;
  currentMode: RoutingMode;
  onModeChanged: (mode: RoutingMode) => void;
};

export default function PlatformRoutingPanel({ token, currentMode, onModeChanged }: Props) {
  const [selected, setSelected] = useState<RoutingMode>(currentMode);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(currentMode);
  }, [currentMode]);

  async function saveMode() {
    if (selected === currentMode) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type: "routing", data: { routing_mode: selected } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update routing mode");
      onModeChanged(selected);
      setMessage(`Platform routing switched to ${ROUTING_MODE_LABELS[selected].title}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #e5e7eb" }}>
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 700, color: "#1f2937" }}>
          Platform Routing
        </h3>
        <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>
          Admin / owner only. Chooses how the platform prioritizes and routes field work for all users.
        </p>
      </div>

      <div
        style={{
          padding: "10px 12px",
          background: currentMode === "complicated" ? "#ecfeff" : "#f0fdf4",
          border: `1px solid ${currentMode === "complicated" ? "#a5f3fc" : "#bbf7d0"}`,
          borderRadius: "8px",
          marginBottom: "14px",
          fontSize: "13px",
          color: "#374151",
        }}
      >
        Active mode: <strong>{ROUTING_MODE_LABELS[currentMode].title}</strong>
      </div>

      {error && (
        <div style={{ padding: "10px 12px", background: "#fee2e2", borderRadius: "8px", color: "#dc2626", fontSize: "13px", marginBottom: "12px" }}>
          {error}
        </div>
      )}
      {message && (
        <div style={{ padding: "10px 12px", background: "#ecfdf5", borderRadius: "8px", color: "#047857", fontSize: "13px", marginBottom: "12px" }}>
          {message}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px" }}>
        {(["complicated", "simple"] as const).map((mode) => {
          const meta = ROUTING_MODE_LABELS[mode];
          const active = selected === mode;
          return (
            <label
              key={mode}
              style={{
                display: "block",
                padding: "14px",
                borderRadius: "8px",
                border: `2px solid ${active ? "#0d9488" : "#e5e7eb"}`,
                background: active ? "#f0fdfa" : "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <input
                  type="radio"
                  name="routing_mode"
                  value={mode}
                  checked={active}
                  onChange={() => setSelected(mode)}
                  style={{ marginTop: "3px" }}
                />
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#1f2937", marginBottom: "2px" }}>
                    {meta.title}
                  </div>
                  <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.45 }}>{meta.description}</div>
                </div>
              </div>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        onClick={saveMode}
        disabled={saving || selected === currentMode}
        style={{
          padding: "10px 16px",
          background: saving || selected === currentMode ? "#9ca3af" : "#0d9488",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: saving || selected === currentMode ? "default" : "pointer",
        }}
      >
        {saving ? "Saving…" : "Apply routing mode"}
      </button>
    </div>
  );
}
