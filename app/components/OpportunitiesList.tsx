"use client";

import { useMemo } from "react";

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
};

const OPPORTUNITY_STATUSES = new Set([
  "opportunity",
  "door_hanger",
  "customer_thinking",
]);

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  opportunity: { bg: "#fff7ed", color: "#c2410c", label: "Opportunity" },
  door_hanger: { bg: "#fdf2f8", color: "#be185d", label: "Door hanger" },
  customer_thinking: { bg: "#f3f4f6", color: "#4b5563", label: "Thinking" },
};

type Props = {
  outages: OpportunityRow[];
  onNavigate: (lat: number, lng: number, address?: string) => void;
  onInvestigate: (row: OpportunityRow) => void;
};

/** Parse verbal price from investigation notes blob if present */
function parseVerbalPrice(notes?: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/verbal_price=([^;\n]+)/i);
  return m ? m[1].trim() : null;
}

export function filterConfirmedOpportunities<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter((o) => OPPORTUNITY_STATUSES.has(o.status));
}

export default function OpportunitiesList({ outages, onNavigate, onInvestigate }: Props) {
  const rows = useMemo(() => filterConfirmedOpportunities(outages), [outages]);

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
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {rows.map((o) => {
        const sc = STATUS_STYLE[o.status] ?? { bg: "#f3f4f6", color: "#374151", label: o.status };
        const verbal = o.verbalPrice ?? parseVerbalPrice((o as { officeNotes?: string }).officeNotes);
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
            }}
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
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => onNavigate(o.lat, o.lng, o.streetAddress)} style={opBtn("#0ea5e9")}>
                Go
              </button>
              <button type="button" onClick={() => onInvestigate(o)} style={opBtn("#7c3aed")}>
                Update
              </button>
            </div>
          </div>
        );
      })}
    </div>
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
