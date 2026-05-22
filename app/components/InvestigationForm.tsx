"use client";

import { useState } from "react";

type Outage = {
  id: number | string;
  streetAddress?: string;
  city?: string;
  customers: number;
  cause?: string;
  status: string;
};

type OutageStatus =
  | "unvisited"
  | "investigating"
  | "no_opportunity"
  | "opportunity"
  | "door_hanger"
  | "wants_to_proceed"
  | "customer_thinking"
  | "sold"
  | "job_started"
  | "temp_power"
  | "grounding"
  | "completed";

type PrimaryOutcome = "" | "utility_only" | "no_damage" | "opportunity_found";
type OpportunityAction =
  | ""
  | "door_hanger"
  | "job_sold"
  | "temp_power"
  | "job_started"
  | "return_grounding"
  | "customer_thinking"
  | "customer_declined"
  | "verbal_quote";
type PowerOption =
  | ""
  | "has_power"
  | "no_power_on_drop"
  | "no_power_no_drop"
  | "neighborhood_dead"
  | "honey_hole";

const JOB_SCOPE_OPTIONS = [
  { value: "", label: "— Not specified —" },
  { value: "temped_out", label: "Temped-out job" },
  { value: "farm_box", label: "Farm box needed" },
  { value: "panel_replace", label: "Panel replacement needed" },
  { value: "relocate", label: "Relocate service" },
  { value: "multi_family", label: "Multi-family service" },
  { value: "return_trip", label: "Return trip required" },
] as const;

const AMPERAGE_OPTIONS = ["100 amp", "150 amp", "200 amp"] as const;
const SERVICE_SETUP_OPTIONS = [
  "Wall mount",
  "Through roof existing",
  "Through roof conversion",
  "Underground conversion",
] as const;

type Props = {
  outage: Outage;
  token: string | null;
  onClose: () => void;
  onSubmitted: (outageId: number | string, newStatus: string) => void;
};

function deriveStatus(
  primary: PrimaryOutcome,
  action: OpportunityAction,
  thinkingIntent: string,
  soldSub: "" | "temp_power",
  startedSub: "" | "return_grounding"
): OutageStatus {
  if (primary === "utility_only" || primary === "no_damage") return "no_opportunity";
  if (primary !== "opportunity_found") return "investigating";

  if (action === "door_hanger") return "door_hanger";
  if (action === "customer_declined") return "no_opportunity";
  if (action === "verbal_quote") return "opportunity";
  if (action === "job_sold") return soldSub === "temp_power" ? "temp_power" : "sold";
  if (action === "job_started") return startedSub === "return_grounding" ? "grounding" : "job_started";
  if (action === "customer_thinking") {
    if (thinkingIntent === "wants_to_proceed") return "wants_to_proceed";
    return "customer_thinking";
  }
  return "opportunity";
}

export default function InvestigationForm({ outage, token, onClose, onSubmitted }: Props) {
  const [primary, setPrimary] = useState<PrimaryOutcome>("");
  const [action, setAction] = useState<OpportunityAction>("");
  const [soldSub, setSoldSub] = useState<"" | "temp_power">("");
  const [startedSub, setStartedSub] = useState<"" | "return_grounding">("");
  const [thinkingIntent, setThinkingIntent] = useState<
    "" | "thinks_utility" | "wait_insurance" | "think_or_quotes" | "wants_to_proceed"
  >("");
  const [power, setPower] = useState<PowerOption>("");
  const [verbalPrice, setVerbalPrice] = useState("");
  const [honeyHoleHomes, setHoneyHoleHomes] = useState<number | "">(
    outage.customers > 1 ? outage.customers : ""
  );
  const [jobScope, setJobScope] = useState("");
  const [multiFamily, setMultiFamily] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [amperage, setAmperage] = useState("");
  const [serviceSetup, setServiceSetup] = useState("");
  const [notes, setNotes] = useState("");
  const [techsRequired, setTechsRequired] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serviceType = amperage && serviceSetup ? `${amperage} ${serviceSetup}`.toLowerCase() : "";
  const isOpportunity = primary === "opportunity_found";
  const needsAction = isOpportunity && !action;
  const needsThinking = action === "customer_thinking" && !thinkingIntent;
  const canSubmit =
    !!primary &&
    (primary !== "opportunity_found" || (!!action && !needsThinking));

  const customerHasPower =
    power === "has_power" ? true : power === "" ? null : false;
  const lineDrop = power === "no_power_on_drop" || power === "no_power_no_drop";
  const powerOnLineDrop = power === "no_power_on_drop";
  const lineDropDamaged = false;
  const honeyHole = power === "honey_hole";
  const neighborhoodDead = power === "neighborhood_dead";
  const difficultJob = jobScope === "return_trip";
  const farmBoxNeeded = jobScope === "farm_box";
  const panelReplacementNeeded = jobScope === "panel_replace";

  const investigationResult =
    primary === "opportunity_found" ? "damage_found" : primary;

  const followUpStatus =
    action === "job_sold"
      ? soldSub === "temp_power"
        ? "temp_power"
        : "sold"
      : action === "job_started"
        ? startedSub === "return_grounding"
          ? "return_grounding"
          : "job_started"
        : action === "door_hanger"
          ? "door_hanger"
          : action === "customer_thinking"
            ? "customer_thinking"
            : action === "customer_declined"
              ? "complete"
              : action === "verbal_quote"
                ? "opportunity"
                : "";

  const contactOutcome =
    action === "door_hanger"
      ? "unavailable"
      : ["verbal_quote", "job_sold", "job_started", "customer_thinking", "customer_declined"].includes(action)
        ? "spoke_customer"
        : null;

  const customerIntent =
    action === "customer_thinking"
      ? thinkingIntent
      : action === "customer_declined"
        ? "not_interested"
        : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError("Select an outcome" + (isOpportunity ? " and what happened at the door." : "."));
      return;
    }
    setSubmitting(true);
    setError(null);

    const newStatus = deriveStatus(primary, action, thinkingIntent, soldSub, startedSub);

    const scopeNote = [
      jobScope && `job_scope=${jobScope}`,
      multiFamily && "multi_family=true",
      neighborhoodDead && "neighborhood_dead=true",
      verbalPrice.trim() && `verbal_price=${verbalPrice.trim()}`,
    ]
      .filter(Boolean)
      .join("; ");

    const fullNotes = [notes.trim(), scopeNote].filter(Boolean).join("\n");

    try {
      const res = await fetch(`/api/outages/${outage.id}/investigate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          investigationResult,
          customersAffected: honeyHole && honeyHoleHomes !== "" ? honeyHoleHomes : null,
          customerHasPower,
          lineDrop,
          powerOnLineDrop,
          lineDropDamaged,
          honeyHole,
          honeyHoleHomes: honeyHoleHomes === "" ? null : honeyHoleHomes,
          serviceType: serviceType || null,
          contactOutcome,
          customerIntent,
          followUpStatus,
          farmBoxNeeded,
          panelReplacementNeeded,
          difficultJob,
          estimatedTimeHours: null,
          techsRequired: techsRequired === "" ? null : techsRequired,
          verbalPriceQuoted: verbalPrice.trim() || null,
          notes: fullNotes || null,
          newStatus,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Submission failed");
      }

      onSubmitted(outage.id, newStatus);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    fontSize: "15px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    outline: "none",
    background: "#fff",
    boxSizing: "border-box",
  };
  const sectionHead: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "8px",
    marginTop: 0,
  };

  function BigRadio({
    name,
    value,
    checked,
    onChange,
    label,
    sub,
  }: {
    name: string;
    value: string;
    checked: boolean;
    onChange: () => void;
    label: string;
    sub?: string;
  }) {
    return (
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          cursor: "pointer",
          padding: "14px 16px",
          borderRadius: "10px",
          border: `2px solid ${checked ? "#0d9488" : "#e5e7eb"}`,
          background: checked ? "#f0fdfa" : "#fff",
          marginBottom: "8px",
        }}
      >
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          style={{ width: "20px", height: "20px", accentColor: "#0d9488", flexShrink: 0 }}
        />
        <div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#1f2937" }}>{label}</div>
          {sub && <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>{sub}</div>}
        </div>
      </label>
    );
  }

  function Chip({
    selected,
    onClick,
    label,
  }: {
    selected: boolean;
    onClick: () => void;
    label: string;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          padding: "10px 14px",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
          border: `2px solid ${selected ? "#0d9488" : "#e5e7eb"}`,
          background: selected ? "#f0fdfa" : "#fff",
          color: selected ? "#0d9488" : "#374151",
          textAlign: "left",
        }}
      >
        {label}
      </button>
    );
  }

  const previewStatus = primary ? deriveStatus(primary, action, thinkingIntent, soldSub, startedSub) : null;
  const STATUS_PREVIEW: Record<string, { color: string; label: string }> = {
    no_opportunity: { color: "#111827", label: "Declined / No opportunity" },
    opportunity: { color: "#f97316", label: "Opportunity" },
    door_hanger: { color: "#ec4899", label: "Door hanger (square marker)" },
    customer_thinking: { color: "#9ca3af", label: "Customer thinking" },
    wants_to_proceed: { color: "#22c55e", label: "Wants to proceed → Job queue" },
    sold: { color: "#22c55e", label: "Job sold → Job queue" },
    job_started: { color: "#22c55e", label: "Job started" },
    temp_power: { color: "#facc15", label: "Temp power installed" },
    grounding: { color: "#facc15", label: "Return for grounding" },
    investigating: { color: "#a855f7", label: "Investigating" },
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px 16px 0 0",
          maxWidth: "520px",
          width: "100%",
          maxHeight: "92vh",
          overflow: "auto",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            position: "sticky",
            top: 0,
            background: "#fff",
            zIndex: 1,
          }}
        >
          <div style={{ minWidth: 0, paddingRight: "8px" }}>
            <h2 style={{ margin: "0 0 2px", fontSize: "17px", fontWeight: 700 }}>Quick investigate</h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {outage.streetAddress?.split(",")[0] ?? outage.city ?? `Outage #${outage.id}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "#f3f4f6", border: "none", borderRadius: "8px", width: "36px", height: "36px", fontSize: "20px", cursor: "pointer", color: "#374151", flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "16px 20px 24px" }}>
          {error && (
            <div style={{ padding: "10px 12px", background: "#fee2e2", borderRadius: "8px", color: "#dc2626", fontSize: "14px", marginBottom: "12px" }}>
              {error}
            </div>
          )}

          <p style={sectionHead}>What did you find?</p>
          <BigRadio
            name="primary"
            value="utility_only"
            checked={primary === "utility_only"}
            onChange={() => {
              setPrimary("utility_only");
              setAction("");
            }}
            label="Utility issue"
            sub="Utility will handle it"
          />
          <BigRadio
            name="primary"
            value="no_damage"
            checked={primary === "no_damage"}
            onChange={() => {
              setPrimary("no_damage");
              setAction("");
            }}
            label="No damage found"
          />
          <BigRadio
            name="primary"
            value="opportunity_found"
            checked={primary === "opportunity_found"}
            onChange={() => setPrimary("opportunity_found")}
            label="Opportunity found"
            sub="Damage / sale possible"
          />

          {isOpportunity && (
            <>
              <p style={{ ...sectionHead, marginTop: "16px" }}>What happened?</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Chip selected={action === "door_hanger"} onClick={() => { setAction("door_hanger"); setSoldSub(""); setStartedSub(""); }} label="Door hanger left" />
                <Chip selected={action === "verbal_quote"} onClick={() => { setAction("verbal_quote"); setSoldSub(""); setStartedSub(""); }} label="Verbal price quoted" />
                <Chip selected={action === "job_sold"} onClick={() => { setAction("job_sold"); setStartedSub(""); }} label="Job sold" />
                {action === "job_sold" && (
                  <div style={{ marginLeft: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <Chip selected={soldSub === ""} onClick={() => setSoldSub("")} label="Sold (no temp yet)" />
                    <Chip selected={soldSub === "temp_power"} onClick={() => setSoldSub("temp_power")} label="Temp power installed" />
                  </div>
                )}
                <Chip selected={action === "job_started"} onClick={() => { setAction("job_started"); setSoldSub(""); }} label="Job started" />
                {action === "job_started" && (
                  <div style={{ marginLeft: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <Chip selected={startedSub === ""} onClick={() => setStartedSub("")} label="In progress" />
                    <Chip selected={startedSub === "return_grounding"} onClick={() => setStartedSub("return_grounding")} label="Return for grounding" />
                  </div>
                )}
                <Chip selected={action === "customer_thinking"} onClick={() => { setAction("customer_thinking"); setSoldSub(""); setStartedSub(""); }} label="Customer thinking" />
                {action === "customer_thinking" && (
                  <div style={{ marginLeft: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {[
                      { v: "thinks_utility" as const, l: "Thinks utility will fix it" },
                      { v: "wait_insurance" as const, l: "Wait for insurance" },
                      { v: "think_or_quotes" as const, l: "Wants quotes / thinking" },
                      { v: "wants_to_proceed" as const, l: "Wants to proceed now" },
                    ].map((o) => (
                      <Chip key={o.v} selected={thinkingIntent === o.v} onClick={() => setThinkingIntent(o.v)} label={o.l} />
                    ))}
                  </div>
                )}
                <Chip selected={action === "customer_declined"} onClick={() => { setAction("customer_declined"); setThinkingIntent(""); }} label="Customer declined" />
              </div>

              {action === "verbal_quote" && (
                <div style={{ marginTop: "12px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                    Verbal price quoted ($)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={verbalPrice}
                    onChange={(e) => setVerbalPrice(e.target.value)}
                    placeholder="e.g. 4500"
                    style={inp}
                  />
                </div>
              )}

              <p style={{ ...sectionHead, marginTop: "16px" }}>Power status</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[
                  { v: "has_power" as const, l: "Has power" },
                  { v: "no_power_on_drop" as const, l: "No power — power on line drop" },
                  { v: "no_power_no_drop" as const, l: "No power — no power on line drop" },
                  { v: "neighborhood_dead" as const, l: "Neighborhood dead (whole area out)" },
                  { v: "honey_hole" as const, l: "Honey hole (multiple homes)" },
                ].map((o) => (
                  <Chip key={o.v} selected={power === o.v} onClick={() => setPower(o.v)} label={o.l} />
                ))}
              </div>
              {power === "honey_hole" && (
                <div style={{ marginTop: "10px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                    Homes affected
                  </label>
                  <input
                    type="number"
                    min={2}
                    value={honeyHoleHomes}
                    onChange={(e) => setHoneyHoleHomes(e.target.value === "" ? "" : Number(e.target.value))}
                    style={{ ...inp, width: "120px" }}
                  />
                </div>
              )}

              <div style={{ marginTop: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                  Job scope
                </label>
                <select value={jobScope} onChange={(e) => setJobScope(e.target.value)} style={inp}>
                  {JOB_SCOPE_OPTIONS.map((o) => (
                    <option key={o.value || "none"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px", cursor: "pointer" }}>
                  <input type="checkbox" checked={multiFamily} onChange={(e) => setMultiFamily(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "#0d9488" }} />
                  <span style={{ fontSize: "14px", color: "#374151" }}>Multi-family</span>
                </label>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => setShowOptional(!showOptional)}
            style={{
              width: "100%",
              marginTop: "16px",
              padding: "10px",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#6b7280",
              cursor: "pointer",
            }}
          >
            {showOptional ? "▲ Hide optional details" : "▼ Optional: service type, notes, photos"}
          </button>

          {showOptional && (
            <div style={{ marginTop: "12px", padding: "14px", background: "#f9fafb", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
              <p style={sectionHead}>Service (optional)</p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                <select value={amperage} onChange={(e) => setAmperage(e.target.value)} style={{ ...inp, flex: 1, minWidth: "120px" }}>
                  <option value="">Amperage…</option>
                  {AMPERAGE_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <select value={serviceSetup} onChange={(e) => setServiceSetup(e.target.value)} style={{ ...inp, flex: 1, minWidth: "140px" }}>
                  <option value="">Setup…</option>
                  {SERVICE_SETUP_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: "vertical", marginBottom: "10px" }} placeholder="Access, materials…" />
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Technicians needed</label>
              <input type="number" min={1} value={techsRequired} onChange={(e) => setTechsRequired(e.target.value === "" ? "" : Number(e.target.value))} style={{ ...inp, width: "100px" }} />
            </div>
          )}

          {previewStatus && (
            <div style={{ marginTop: "14px", padding: "10px 14px", background: "#f0fdfa", borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: previewStatus === "door_hanger" ? "2px" : "50%", background: STATUS_PREVIEW[previewStatus]?.color ?? "#9ca3af" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f766e" }}>{STATUS_PREVIEW[previewStatus]?.label ?? previewStatus}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !canSubmit}
            style={{
              width: "100%",
              marginTop: "16px",
              padding: "16px",
              background: submitting || !canSubmit ? "#9ca3af" : "#0d9488",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: submitting || !canSubmit ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Saving…" : "Save & close"}
          </button>
        </form>
      </div>
    </div>
  );
}
