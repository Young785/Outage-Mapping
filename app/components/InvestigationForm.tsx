"use client";

import { useEffect, useRef, useState } from "react";
import { seedInvestigationForm } from "@/lib/field-visit";

type Outage = {
  id: number | string;
  lat?: number;
  lng?: number;
  streetAddress?: string;
  city?: string;
  customers: number;
  cause?: string;
  etr?: string;
  crewStatus?: string;
  outageImpact?: string;
  outageType?: string;
  source?: string;
  priorityScore?: number;
  status: string;
  investigationResult?: string;
  customerIntent?: string;
  verbalPrice?: string;
  followUpStatus?: string;
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

type PrimaryOutcome = "" | "utility_only" | "no_damage" | "not_target" | "opportunity_found";
type OpportunityAction =
  | ""
  | "no_contact"
  | "door_hanger"
  | "job_sold"
  | "job_started"
  | "customer_thinking"
  | "customer_declined";
type PrimaryPower = "" | "has_power" | "no_power";
type NoPowerDetail = "" | "no_power_on_drop" | "no_power_no_drop" | "neighborhood_dead";

const JOB_SCOPE_OPTIONS = [
  { value: "", label: "— Not specified —" },
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
  /** When true, dismiss requires confirmation (pending visit gate). */
  required?: boolean;
  onClose: () => void;
  onSubmitted: (
    outageId: number | string,
    newStatus: string,
    visit?: {
      investigationResult?: string;
      customerIntent?: string;
      verbalPrice?: string;
      followUpStatus?: string;
      noContactMade?: boolean;
    }
  ) => void;
};

function deriveStatus(
  primary: PrimaryOutcome,
  action: OpportunityAction,
  startedSub: "" | "temp_power" | "return_grounding" | "job_completed"
): OutageStatus {
  if (primary === "utility_only" || primary === "no_damage" || primary === "not_target") return "no_opportunity";
  if (primary !== "opportunity_found") return "unvisited";

  if (action === "no_contact") return "opportunity";
  if (action === "door_hanger") return "door_hanger";
  if (action === "customer_declined") return "no_opportunity";
  if (action === "job_sold") return "sold";
  if (action === "job_started") {
    if (startedSub === "job_completed") return "completed";
    if (startedSub === "return_grounding") return "grounding";
    if (startedSub === "temp_power") return "temp_power";
    return "job_started";
  }
  if (action === "customer_thinking") return "customer_thinking";
  return "opportunity";
}

function applySeed(
  outage: Outage,
    setters: {
    setPrimary: (v: PrimaryOutcome) => void;
    setAction: (v: OpportunityAction) => void;
    setStartedSub: (v: "" | "temp_power" | "return_grounding" | "job_completed") => void;
    setThinkingIntent: (v: "" | "thinks_utility" | "wait_insurance" | "think_or_quotes") => void;
    setVerbalPrice: (v: string) => void;
  }
) {
  const seed = seedInvestigationForm(outage.status, {
    investigationResult: outage.investigationResult,
    customerIntent: outage.customerIntent,
    verbalPrice: outage.verbalPrice,
    followUpStatus: outage.followUpStatus,
  });
  setters.setPrimary(seed.primary);
  setters.setAction(seed.action);
  setters.setStartedSub(seed.startedSub);
  setters.setThinkingIntent(seed.thinkingIntent);
  setters.setVerbalPrice(seed.verbalPrice);
}

export default function InvestigationForm({ outage, token, required = false, onClose, onSubmitted }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [primary, setPrimary] = useState<PrimaryOutcome>("");
  const [action, setAction] = useState<OpportunityAction>("");
  const [startedSub, setStartedSub] = useState<"" | "temp_power" | "return_grounding" | "job_completed">("");
  const [thinkingIntent, setThinkingIntent] = useState<
    "" | "thinks_utility" | "wait_insurance" | "think_or_quotes"
  >("");
  const [primaryPower, setPrimaryPower] = useState<PrimaryPower>("");
  const [noPowerDetail, setNoPowerDetail] = useState<NoPowerDetail>("");
  const [verbalPrice, setVerbalPrice] = useState("");
  const [honeyHoleHomes, setHoneyHoleHomes] = useState<number | "">(
    outage.customers > 1 ? outage.customers : ""
  );
  const [jobScope, setJobScope] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  const [showAdditionalOutage, setShowAdditionalOutage] = useState(false);
  const [amperage, setAmperage] = useState("");
  const [serviceSetup, setServiceSetup] = useState("");
  const [notes, setNotes] = useState("");
  const [techsRequired, setTechsRequired] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    applySeed(outage, {
      setPrimary,
      setAction,
      setStartedSub,
      setThinkingIntent,
      setVerbalPrice,
    });
    setError(null);
  }, [outage.id, outage.status, outage.investigationResult, outage.customerIntent, outage.verbalPrice, outage.followUpStatus]);

  const serviceType = amperage && serviceSetup ? `${amperage} ${serviceSetup}`.toLowerCase() : "";
  const isOpportunity = primary === "opportunity_found";
  const needsThinking = action === "customer_thinking" && !thinkingIntent;
  const canSubmit =
    !!primary &&
    (primary !== "opportunity_found" || (!!action && !needsThinking));

  const power =
    primaryPower === "has_power"
      ? "has_power"
      : primaryPower === "no_power" && noPowerDetail
        ? noPowerDetail
        : ("" as const);

  const customerHasPower =
    power === "has_power" ? true : power === "" ? null : false;
  const lineDrop = power === "no_power_on_drop" || power === "no_power_no_drop";
  const powerOnLineDrop = power === "no_power_on_drop";
  const lineDropDamaged = false;
  const honeyHole = honeyHoleHomes !== "" && Number(honeyHoleHomes) > 1;
  const neighborhoodDead = power === "neighborhood_dead";
  const difficultJob = jobScope === "return_trip";
  const farmBoxNeeded = jobScope === "farm_box";
  const panelReplacementNeeded = jobScope === "panel_replace";

  const investigationResult =
    primary === "opportunity_found" ? "damage_found" : primary;

  const noContactMade = action === "no_contact";

  const followUpStatus =
    action === "no_contact"
      ? "no_contact"
      : action === "job_sold"
      ? "sold"
        : action === "job_started"
          ? jobScope === "return_trip"
            ? "return_trip"
            : startedSub === "job_completed"
          ? "completed"
          : startedSub === "return_grounding"
          ? "return_grounding"
          : startedSub === "temp_power"
            ? "temp_power"
            : "job_started"
        : action === "door_hanger"
          ? "door_hanger"
          : action === "customer_thinking"
            ? "customer_thinking"
            : action === "customer_declined"
              ? "complete"
              : "";

  const contactOutcome =
    action === "no_contact"
      ? "no_contact"
      : action === "door_hanger"
      ? "unavailable"
      : ["job_sold", "job_started", "customer_thinking", "customer_declined"].includes(action)
        ? "spoke_customer"
        : null;

  const customerIntent =
    action === "customer_thinking"
      ? thinkingIntent
      : action === "customer_declined"
        ? "not_interested"
        : null;

  const addressLine = outage.streetAddress ?? outage.city ?? `Outage #${outage.id}`;
  const shortAddress = outage.streetAddress?.split(",")[0] ?? outage.city ?? `Outage #${outage.id}`;
  const navUrl =
    outage.lat != null && outage.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${outage.lat},${outage.lng}&travelmode=driving`
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError("Select an outcome" + (isOpportunity ? " and what happened at the door." : "."));
      return;
    }
    setSubmitting(true);
    setError(null);

    const newStatus = deriveStatus(primary, action, startedSub);

    const scopeNote = [
      jobScope && `job_scope=${jobScope}`,
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
          customersAffected: honeyHole ? honeyHoleHomes : null,
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
          noContactMade,
          notes: fullNotes || null,
          newStatus,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Submission failed");
      }

      onSubmitted(outage.id, newStatus, {
        investigationResult,
        customerIntent: customerIntent ?? undefined,
        verbalPrice: verbalPrice.trim() || undefined,
        followUpStatus: followUpStatus || undefined,
        noContactMade: noContactMade || undefined,
      });
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

  function quickSave() {
    formRef.current?.requestSubmit();
  }

  function handleClose() {
    if (required) {
      const ok = window.confirm(
        "You must submit an investigation before routing to the next stop. Close without saving?"
      );
      if (!ok) return;
    }
    onClose();
  }

  const previewStatus = primary ? deriveStatus(primary, action, startedSub) : null;
  const STATUS_PREVIEW: Record<string, { color: string; stroke: string; label: string }> = {
    no_opportunity: { color: "#111827", stroke: "#111827", label: "Declined / No opportunity" },
    opportunity: { color: "#ffffff", stroke: "#f97316", label: "Opportunity found" },
    door_hanger: { color: "#ec4899", stroke: "#be185d", label: "Door hanger left" },
    customer_thinking: { color: "#9ca3af", stroke: "#6b7280", label: "Customer thinking" },
    sold: { color: "#ffffff", stroke: "#22c55e", label: "Job sold → Job queue" },
    job_started: { color: "#22c55e", stroke: "#16a34a", label: "Job started" },
    temp_power: { color: "#facc15", stroke: "#f97316", label: "Temp power installed" },
    grounding: { color: "#facc15", stroke: "#22c55e", label: "Return for grounding" },
    completed: { color: "#2563eb", stroke: "#1d4ed8", label: "Completed" },
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
            position: "sticky",
            top: 0,
            background: "#fff",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>Quick investigate</h2>
            <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
              {canSubmit && (
                <button
                  type="button"
                  onClick={quickSave}
                  style={{ background: "#0d9488", color: "#fff", border: "none", borderRadius: "8px", height: "36px", padding: "0 10px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                >
                  Done
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                style={{ background: "#f3f4f6", border: "none", borderRadius: "8px", width: "36px", height: "36px", fontSize: "20px", cursor: "pointer", color: "#374151" }}
              >
                ×
              </button>
            </div>
          </div>

          {navUrl && (
            <a
              href={navUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                width: "100%",
                padding: "12px",
                marginBottom: "12px",
                background: "#1d4ed8",
                color: "#fff",
                textDecoration: "none",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              Google Navigation
            </a>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "6px" }}>
            <div style={{ padding: "8px 10px", background: "#f9fafb", borderRadius: "8px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Customers affected</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#1f2937" }}>{outage.customers}</div>
            </div>
            <div style={{ padding: "8px 10px", background: "#f9fafb", borderRadius: "8px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Priority score</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#0d9488" }}>{Math.round(outage.priorityScore ?? 0)}</div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: "13px", color: "#374151", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {shortAddress}
          </p>
          {outage.streetAddress && outage.streetAddress !== shortAddress && (
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {addressLine}
            </p>
          )}
        </div>

        <form ref={formRef} onSubmit={handleSubmit} style={{ padding: "16px 20px 24px" }}>
          {error && (
            <div style={{ padding: "10px 12px", background: "#fee2e2", borderRadius: "8px", color: "#dc2626", fontSize: "14px", marginBottom: "12px" }}>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAdditionalOutage(!showAdditionalOutage)}
            style={{
              width: "100%",
              marginBottom: "14px",
              padding: "10px",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#6b7280",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {showAdditionalOutage ? "▲ Hide additional outage information" : "▼ Show additional outage information"}
          </button>

          {showAdditionalOutage && (
            <div style={{ marginBottom: "16px", padding: "12px 14px", background: "#f9fafb", borderRadius: "10px", border: "1px solid #e5e7eb", fontSize: "13px", color: "#374151" }}>
              {outage.outageType && <div style={{ marginBottom: "4px" }}><b>Type:</b> {outage.outageType}</div>}
              {outage.cause && <div style={{ marginBottom: "4px" }}><b>Cause:</b> {outage.cause}</div>}
              {outage.crewStatus && <div style={{ marginBottom: "4px" }}><b>Crew status:</b> {outage.crewStatus}</div>}
              {outage.outageImpact && <div style={{ marginBottom: "4px" }}><b>Impact:</b> {outage.outageImpact}</div>}
              {outage.etr && <div style={{ marginBottom: "4px" }}><b>ETR:</b> {outage.etr}</div>}
              {outage.source && <div><b>Source:</b> {outage.source}</div>}
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
          <BigRadio
            name="primary"
            value="not_target"
            checked={primary === "not_target"}
            onChange={() => { setPrimary("not_target"); setAction(""); }}
            label="Not a target property"
            sub="Warehouse, commercial, excluded zone"
          />

          {isOpportunity && (
            <>
              <p style={{ ...sectionHead, marginTop: "16px" }}>What happened?</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <Chip
                  selected={action === "no_contact"}
                  onClick={() => { setAction("no_contact"); setStartedSub(""); setThinkingIntent(""); }}
                  label="No contact made — damage confirmed, seller follow-up"
                />
                <Chip selected={action === "door_hanger"} onClick={() => { setAction("door_hanger"); setStartedSub(""); }} label="Door hanger left" />
                <Chip selected={action === "job_sold"} onClick={() => { setAction("job_sold"); setStartedSub(""); }} label="Job sold" />
                <Chip selected={action === "job_started"} onClick={() => { setAction("job_started"); }} label="Job started" />
                {action === "job_started" && (
                  <div style={{ marginLeft: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <Chip selected={startedSub === ""} onClick={() => setStartedSub("")} label="In progress" />
                    <Chip selected={startedSub === "temp_power"} onClick={() => setStartedSub("temp_power")} label="Temp power installed" />
                    <Chip selected={startedSub === "return_grounding"} onClick={() => setStartedSub("return_grounding")} label="Return for grounding" />
                    <Chip selected={startedSub === "job_completed"} onClick={() => setStartedSub("job_completed")} label="Job completed" />
                  </div>
                )}
                <Chip selected={action === "customer_thinking"} onClick={() => { setAction("customer_thinking"); setStartedSub(""); }} label="Customer thinking" />
                {action === "customer_thinking" && (
                  <div style={{ marginLeft: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    {[
                      { v: "thinks_utility" as const, l: "Thinks utility will fix it" },
                      { v: "wait_insurance" as const, l: "Wait for insurance" },
                      { v: "think_or_quotes" as const, l: "Wants quotes / thinking" },
                    ].map((o) => (
                      <Chip key={o.v} selected={thinkingIntent === o.v} onClick={() => setThinkingIntent(o.v)} label={o.l} />
                    ))}
                  </div>
                )}
                <Chip selected={action === "customer_declined"} onClick={() => { setAction("customer_declined"); setThinkingIntent(""); setStartedSub(""); }} label="Customer declined" />
              </div>

              <div style={{ marginTop: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                  Verbal price quoted ($) <span style={{ fontWeight: 400, color: "#9ca3af" }}>— optional</span>
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

              <p style={{ ...sectionHead, marginTop: "16px" }}>Power status</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <Chip
                  selected={primaryPower === "has_power"}
                  onClick={() => { setPrimaryPower("has_power"); setNoPowerDetail(""); }}
                  label="Has power"
                />
                <Chip
                  selected={primaryPower === "no_power"}
                  onClick={() => setPrimaryPower("no_power")}
                  label="No power"
                />
              </div>
              {primaryPower === "no_power" && (
                <div style={{ marginLeft: "12px", marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    { v: "no_power_on_drop" as const, l: "Power on line drop" },
                    { v: "no_power_no_drop" as const, l: "No power on line drop" },
                    { v: "neighborhood_dead" as const, l: "Neighborhood dead (entire area out)" },
                  ].map((o) => (
                    <Chip
                      key={o.v}
                      selected={noPowerDetail === o.v}
                      onClick={() => setNoPowerDetail(o.v)}
                      label={o.l}
                    />
                  ))}
                </div>
              )}

              {outage.customers > 1 && (
                <div style={{ marginTop: "12px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                    Homes affected (honey hole)
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
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
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
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: STATUS_PREVIEW[previewStatus]?.color ?? "#9ca3af", border: `2px solid ${STATUS_PREVIEW[previewStatus]?.stroke ?? "#9ca3af"}` }} />
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
