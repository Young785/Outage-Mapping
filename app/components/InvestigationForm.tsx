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

type Props = {
  outage: Outage;
  token: string | null;
  onClose: () => void;
  onSubmitted: (outageId: number | string, newStatus: string) => void;
};

// §6 — Investigation result options
const INVESTIGATION_RESULTS = [
  { value: "utility_only", label: "Utility issue only" },
  { value: "no_damage", label: "No damage found" },
  { value: "damage_found", label: "Damage found" },
] as const;

// §6 — Service type is now Amperage + Service Setup (two dropdowns)
const AMPERAGE_OPTIONS = ["100 amp", "150 amp", "200 amp"] as const;
const SERVICE_SETUP_OPTIONS = [
  "Wall mount",
  "Through roof existing",
  "Through roof conversion",
  "Underground conversion",
] as const;

// §6 — Follow-up status options
const FOLLOW_UP_OPTIONS = [
  { value: "opportunity", label: "Opportunity Found", marker: "opportunity" },
  { value: "sold", label: "Job Sold", marker: "sold" },
  { value: "job_started", label: "Job Started", marker: "job_started" },
  { value: "temp_power", label: "Temp Power Installed", marker: "temp_power" },
  { value: "return_grounding", label: "Return for Grounding", marker: "grounding" },
  { value: "complete", label: "Job Completed", marker: "completed" },
  { value: "customer_thinking", label: "Customer Thinking", marker: "customer_thinking" },
] as const;

/** Derive the outage marker status from form answers.
 *  Status → marker color is driven by STATUS_CONFIG in page.tsx.
 *
 *  Customer Intent → Status mapping (per spec):
 *    Utility will fix       → customer_thinking (gray)
 *    Wait for insurance     → customer_thinking (gray)
 *    Get quotes             → customer_thinking (gray)
 *    Not interested         → no_opportunity   (black, declined)
 */
function deriveStatus(
  result: string,
  followUp: string,
  contactOutcome: string,
  customerIntent: string
): OutageStatus {
  if (followUp === "opportunity") return "opportunity";
  if (followUp === "sold") return "sold";
  if (followUp === "job_started") return "job_started";
  if (followUp === "temp_power") return "temp_power";
  if (followUp === "return_grounding") return "grounding";
  if (followUp === "complete") return "completed";
  if (followUp === "customer_thinking") return "customer_thinking";
  if (customerIntent === "not_interested") return "no_opportunity";
  if (contactOutcome === "unavailable") return "door_hanger";
  if (
    customerIntent === "thinks_utility" ||
    customerIntent === "wait_insurance" ||
    customerIntent === "think_or_quotes"
  ) {
    return "customer_thinking";
  }
  if (result === "damage_found") return "opportunity";
  return "no_opportunity";
}

export default function InvestigationForm({ outage, token, onClose, onSubmitted }: Props) {
  // §6 Section A — Investigation result
  const [result, setResult] = useState("");

  // §6 Section B — Damage / power details
  const [customersAffected, setCustomersAffected] = useState(outage.customers ?? 1);
  const [customerHasPower, setCustomerHasPower] = useState<boolean | null>(null);
  const [lineDrop, setLineDrop] = useState(false);
  const [powerOnLineDrop, setPowerOnLineDrop] = useState(false);
  const [lineDropDamaged, setLineDropDamaged] = useState(false);
  const [honeyHole, setHoneyHole] = useState(false);
  const [honeyHoleHomes, setHoneyHoleHomes] = useState<number | "">("");

  // §6 Section C — Service type (two dropdowns: Amperage + Setup)
  const [amperage, setAmperage] = useState("");
  const [serviceSetup, setServiceSetup] = useState("");
  const serviceType = amperage && serviceSetup ? `${amperage} ${serviceSetup}`.toLowerCase() : "";

  // §6 Section D — Follow-up
  const [contactOutcome, setContactOutcome] = useState<"" | "unavailable" | "spoke_customer">("");
  const [customerIntent, setCustomerIntent] = useState<
    "" | "thinks_utility" | "wait_insurance" | "think_or_quotes" | "not_interested"
  >("");
  const [followUp, setFollowUp] = useState("");
  const [farmBoxNeeded, setFarmBoxNeeded] = useState(false);
  const [panelReplacementNeeded, setPanelReplacementNeeded] = useState(false);
  const [difficultJob, setDifficultJob] = useState(false);
  const [estimatedTimeHours, setEstimatedTimeHours] = useState<number | "">("");
  const [techsRequired, setTechsRequired] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showDamageSection = result === "damage_found";
  const showServiceSection = result === "damage_found";

  // Submit is allowed when EITHER Section A (investigation result) OR
  // Section D (status / follow-up) is filled. Office jobs in particular often
  // just need a status bump (e.g. → Job Sold) without re-running an A/B/C survey.
  const canSubmit = !!result || !!followUp;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) { setError("Pick an Investigation Result (A) or a Status (D)."); return; }
    setSubmitting(true);
    setError(null);

    const newStatus = deriveStatus(result, followUp, contactOutcome, customerIntent);

    try {
      const res = await fetch(`/api/outages/${outage.id}/investigate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          investigationResult: result,
          customersAffected,
          customerHasPower,
          lineDrop,
          powerOnLineDrop,
          lineDropDamaged,
          honeyHole,
          honeyHoleHomes: honeyHoleHomes === "" ? null : honeyHoleHomes,
          serviceType,
          contactOutcome: contactOutcome || null,
          customerIntent: customerIntent || null,
          followUpStatus: followUp,
          farmBoxNeeded,
          panelReplacementNeeded,
          difficultJob,
          estimatedTimeHours: estimatedTimeHours === "" ? null : estimatedTimeHours,
          techsRequired: techsRequired === "" ? null : techsRequired,
          notes,
          newStatus,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Submission failed");
      }

      onSubmitted(outage.id, newStatus);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "9px 12px", fontSize: "14px",
    border: "1px solid #e5e7eb", borderRadius: "8px", outline: "none", background: "#fff", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px",
  };
  const sectionHead: React.CSSProperties = {
    fontSize: "12px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase",
    letterSpacing: "0.06em", marginBottom: "10px", marginTop: "4px",
  };

  function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", marginBottom: "8px" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: "17px", height: "17px", cursor: "pointer", accentColor: "#0d9488" }}
        />
        <span style={{ fontSize: "14px", color: "#374151" }}>{label}</span>
      </label>
    );
  }

  const previewStatus = result ? deriveStatus(result, followUp, contactOutcome, customerIntent) : null;

  const STATUS_PREVIEW_COLORS: Record<string, string> = {
    no_opportunity: "#111827", opportunity: "#f97316", door_hanger: "#ec4899",
    wants_to_proceed: "#22c55e", customer_thinking: "#9ca3af", sold: "#ffffff", job_started: "#22c55e",
    completed: "#2563eb", temp_power: "#facc15", grounding: "#facc15", investigating: "#3b82f6",
  };
  const STATUS_PREVIEW_LABELS: Record<string, string> = {
    no_opportunity: "Dead / No Opportunity", opportunity: "Opportunity Found", door_hanger: "Door Hanger",
    wants_to_proceed: "Wants to Proceed", customer_thinking: "Customer Thinking", sold: "Job Sold",
    job_started: "Job Started", completed: "Completed", temp_power: "Temp Power",
    grounding: "Return for Grounding", investigating: "Investigating",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "16px", maxWidth: "640px", width: "100%", maxHeight: "92vh", overflow: "auto", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)" }}>

        {/* Header */}
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div>
            <h2 style={{ margin: "0 0 3px", fontSize: "17px", fontWeight: 700, color: "#1f2937" }}>Field Investigation</h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>
              {outage.streetAddress?.split(",")[0] ?? outage.city ?? `Outage #${outage.id}`} · {outage.customers} Xcel customers
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280", padding: "0 4px", lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px" }}>
          {error && (
            <div style={{ padding: "12px", background: "#fee2e2", borderRadius: "8px", color: "#dc2626", fontSize: "14px", marginBottom: "16px" }}>
              {error}
            </div>
          )}

          {/* Section A — Investigation Result */}
          <div style={{ marginBottom: "20px" }}>
            <p style={sectionHead}>A — Investigation Result</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {INVESTIGATION_RESULTS.map((opt) => (
                <label key={opt.value} style={{
                  display: "flex", alignItems: "center", gap: "10px", cursor: "pointer",
                  padding: "10px 14px", borderRadius: "8px",
                  border: `2px solid ${result === opt.value ? "#0d9488" : "#e5e7eb"}`,
                  background: result === opt.value ? "#f0fdfa" : "#fff",
                  transition: "all 0.1s",
                }}>
                  <input
                    type="radio"
                    name="result"
                    value={opt.value}
                    checked={result === opt.value}
                    onChange={() => setResult(opt.value)}
                    style={{ accentColor: "#0d9488" }}
                  />
                  <span style={{ fontSize: "14px", color: "#1f2937" }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Section B — Damage / Power Details */}
          {showDamageSection && (
            <div style={{ marginBottom: "20px", padding: "16px", background: "#f9fafb", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
              <p style={sectionHead}>B — Damage & Power Details</p>

              <div style={{ marginBottom: "14px" }}>
                <label style={lbl}>Number of customers affected</label>
                <input
                  type="number"
                  min={1}
                  value={customersAffected}
                  onChange={(e) => setCustomersAffected(parseInt(e.target.value) || 1)}
                  style={{ ...inp, width: "140px" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={lbl}>Customer power status</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[{ v: true, l: "Has power" }, { v: false, l: "No power" }].map(({ v, l }) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => {
                        setCustomerHasPower(v);
                        if (v === true) {
                          // If customer has power, the "missing line drop" path is implied false.
                          setLineDrop(false);
                          setPowerOnLineDrop(false);
                          setLineDropDamaged(false);
                        }
                      }}
                      style={{
                        padding: "8px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
                        border: `2px solid ${customerHasPower === v ? "#0d9488" : "#e5e7eb"}`,
                        background: customerHasPower === v ? "#f0fdfa" : "#fff",
                        color: customerHasPower === v ? "#0d9488" : "#6b7280",
                      }}
                    >{l}</button>
                  ))}
                </div>
              </div>

              {/* Missing line drop only matters when there's no power.
                  If there is no line drop, the property cannot have power (implied). */}
              {customerHasPower === false && (
                <>
                  <Checkbox checked={lineDrop} onChange={setLineDrop} label="Missing line drop / coiled on pole" />
                  {lineDrop && (
                    <div style={{ marginLeft: "28px" }}>
                      <Checkbox checked={powerOnLineDrop} onChange={setPowerOnLineDrop} label="Power on line drop" />
                      <Checkbox checked={lineDropDamaged} onChange={setLineDropDamaged} label="Line drop damaged" />
                    </div>
                  )}
                </>
              )}
              <Checkbox checked={honeyHole} onChange={setHoneyHole} label="Honey hole" />
              {honeyHole && (
                <div style={{ marginLeft: "28px", marginTop: "8px" }}>
                  <label style={lbl}>Number of homes affected</label>
                  <input
                    type="number"
                    min={1}
                    value={honeyHoleHomes}
                    onChange={(e) => setHoneyHoleHomes(e.target.value === "" ? "" : Number(e.target.value))}
                    style={{ ...inp, width: "180px" }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Section C — Service Type: Amperage + Setup */}
          {showServiceSection && (
            <div style={{ marginBottom: "20px" }}>
              <p style={sectionHead}>C — Service Type</p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "160px" }}>
                  <label style={lbl}>Amperage</label>
                  <select value={amperage} onChange={(e) => setAmperage(e.target.value)} style={inp}>
                    <option value="">Select amperage...</option>
                    {AMPERAGE_OPTIONS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <label style={lbl}>Service Setup</label>
                  <select value={serviceSetup} onChange={(e) => setServiceSetup(e.target.value)} style={inp}>
                    <option value="">Select setup...</option>
                    {SERVICE_SETUP_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {result === "damage_found" && (
            <div style={{ marginBottom: "20px" }}>
              <p style={sectionHead}>Contact Outcome</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[
                  { value: "unavailable", label: "Customer unavailable (door hanger left)" },
                  { value: "spoke_customer", label: "Spoke with customer" },
                ].map((opt) => (
                  <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="contactOutcome"
                      value={opt.value}
                      checked={contactOutcome === opt.value}
                      onChange={() => setContactOutcome(opt.value as "unavailable" | "spoke_customer")}
                    />
                    <span style={{ fontSize: "14px", color: "#1f2937" }}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {contactOutcome === "spoke_customer" && (
            <div style={{ marginBottom: "20px" }}>
              <p style={sectionHead}>Customer Intent</p>
              <p style={{ fontSize: "11px", color: "#6b7280", marginTop: "-6px", marginBottom: "10px" }}>
                If the customer wants to move forward, set status under <b>D — Status</b> below (e.g. Job Sold).
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[
                  { value: "thinks_utility", label: "Customer thinks utility will fix it" },
                  { value: "wait_insurance", label: "Customer wants to wait for insurance" },
                  { value: "think_or_quotes", label: "Customer wants to think about it / get quotes" },
                  { value: "not_interested", label: "Customer not interested" },
                ].map((opt) => (
                  <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="customerIntent"
                      value={opt.value}
                      checked={customerIntent === opt.value}
                      onChange={() => setCustomerIntent(opt.value as typeof customerIntent)}
                    />
                    <span style={{ fontSize: "14px", color: "#1f2937" }}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {showServiceSection && (
            <div style={{ marginBottom: "20px", padding: "16px", background: "#f9fafb", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
              <p style={sectionHead}>Equipment / Scope</p>
              <Checkbox checked={farmBoxNeeded} onChange={setFarmBoxNeeded} label="Farm box needed" />
              <Checkbox checked={panelReplacementNeeded} onChange={setPanelReplacementNeeded} label="Panel replacement needed" />
            </div>
          )}

          {/* Section D — Follow-Up Status */}
          <div style={{ marginBottom: "20px" }}>
            <p style={sectionHead}>D — Status</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {FOLLOW_UP_OPTIONS.map((opt) => (
                <label key={opt.value} style={{
                  display: "flex", alignItems: "center", gap: "10px", cursor: "pointer",
                  padding: "9px 14px", borderRadius: "8px",
                  border: `2px solid ${followUp === opt.value ? "#0d9488" : "#e5e7eb"}`,
                  background: followUp === opt.value ? "#f0fdfa" : "#fff",
                  transition: "all 0.1s",
                }}>
                  <input
                    type="radio"
                    name="followUp"
                    value={opt.value}
                    checked={followUp === opt.value}
                    onChange={() => setFollowUp(opt.value)}
                    style={{ accentColor: "#0d9488" }}
                  />
                  <span style={{ fontSize: "14px", color: "#1f2937" }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: "20px", padding: "16px", background: "#f9fafb", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
            <p style={sectionHead}>E — Job Difficulty</p>
            <Checkbox checked={difficultJob} onChange={setDifficultJob} label="Difficult Job (Return trip)" />
            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Estimated time (hours)</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={estimatedTimeHours}
                  onChange={(e) => setEstimatedTimeHours(e.target.value === "" ? "" : Number(e.target.value))}
                  style={inp}
                />
              </div>
              <div style={{ width: "170px" }}>
                <label style={lbl}>Technicians needed</label>
                <input
                  type="number"
                  min={1}
                  value={techsRequired}
                  onChange={(e) => setTechsRequired(e.target.value === "" ? "" : Number(e.target.value))}
                  style={inp}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: "20px" }}>
            <label style={lbl}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes, customer contact, access issues..."
              rows={3}
              style={{ ...inp, resize: "vertical" }}
            />
          </div>

          {/* Marker preview */}
          {previewStatus && (
            <div style={{ marginBottom: "20px", padding: "12px 16px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "14px", height: "14px", borderRadius: "50%", background: STATUS_PREVIEW_COLORS[previewStatus] ?? "#9ca3af", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Marker will update to</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1f2937" }}>{STATUS_PREVIEW_LABELS[previewStatus] ?? previewStatus}</div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: "12px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              style={{
                flex: 2, padding: "12px",
                background: submitting || !canSubmit ? "#9ca3af" : "#0d9488",
                color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600,
                cursor: submitting || !canSubmit ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Submitting…" : "Submit Investigation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
