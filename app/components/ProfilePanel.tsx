"use client";
import { useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: "office" | "tech" | "admin" | "owner";
}

interface ProfileStats {
  investigations: number;
  jobsAssigned: number;
  jobsCompleted: number;
  memberSince: string | null;
}

interface Props {
  user: User;
  token: string;
  onUserUpdate: (user: User, newToken: string) => void;
}

const ROLE_COLOR: Record<string, string> = {
  admin: "#7c3aed",
  office: "#0891b2",
  tech: "#0d9488",
};

const TECH_STATUSES = [
  { value: "available", label: "Available", color: "#10b981", bg: "#ecfdf5" },
  { value: "working",   label: "On Job",    color: "#f97316", bg: "#fff7ed" },
  { value: "paused",    label: "Paused",    color: "#f59e0b", bg: "#fef3c7" },
  { value: "offline",   label: "Offline",   color: "#6b7280", bg: "#f3f4f6" },
];

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function avatarColor(name: string) {
  const colors = ["#0d9488", "#0891b2", "#7c3aed", "#db2777", "#d97706", "#059669", "#2563eb"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

export default function ProfilePanel({ user, token, onUserUpdate }: Props) {
  // Edit form state
  const [editName, setEditName]   = useState(user.name);
  const [editPhone, setEditPhone] = useState(user.phone ?? "");
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Password change state
  const [curPw, setCurPw]   = useState("");
  const [newPw, setNewPw]   = useState("");
  const [confPw, setConfPw] = useState("");
  const [pwMsg, setPwMsg]   = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // Tech status state
  const [techStatus, setTechStatus]       = useState<string>("available");
  const [techStatusSaving, setTechStatusSaving] = useState(false);
  const [currentJobId, setCurrentJobId]   = useState<string | null>(null);

  // Job completion prompt (shown when tech leaves "working" → "available")
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionChoice, setCompletionChoice] = useState<"complete" | "temp_power" | "return_grounding" | "return_permanent" | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [pendingStatus, setPendingStatus]   = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState<ProfileStats>({ investigations: 0, jobsAssigned: 0, jobsCompleted: 0, memberSince: null });
  const [statsLoading, setStatsLoading] = useState(true);

  const isTech = user.role === "tech";

  // ── Load stats ────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      // Investigations count
      const [invRes, jobsRes, techRes] = await Promise.all([
        fetch(`/api/outages/${user.id}/investigate?list=true`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/jobs?userId=${user.id}`, { headers: { Authorization: `Bearer ${token}` } }),
        isTech ? fetch("/api/techs", { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve(null),
      ]);

      let investigations = 0;
      let jobsAssigned = 0;
      let jobsCompleted = 0;

      if (invRes.ok) {
        const d = await invRes.json();
        investigations = d.count ?? (Array.isArray(d.investigations) ? d.investigations.length : 0);
      }
      if (jobsRes.ok) {
        const d = await jobsRes.json();
        const jobs: any[] = d.jobs ?? [];
        jobsAssigned  = jobs.filter((j) => j.assigned_tech_id === user.id || j.created_by === user.id).length;
        jobsCompleted = jobs.filter((j) => j.status === "completed" && (j.assigned_tech_id === user.id || j.created_by === user.id)).length;
      }
      if (techRes?.ok) {
        const d = await techRes.json();
        const me = (d.techs ?? []).find((t: any) => t.userId === user.id);
        if (me) {
          setTechStatus(me.status ?? "available");
          setCurrentJobId(me.currentJobId ?? null);
        }
      }

      // Parse member since from JWT (iat)
      let memberSince: string | null = null;
      try {
        const parts = token.split(".");
        const pl = JSON.parse(atob(parts[1]));
        if (pl.iat) memberSince = new Date(pl.iat).toLocaleDateString("en-US", { year: "numeric", month: "long" });
      } catch {}

      setStats({ investigations, jobsAssigned, jobsCompleted, memberSince });
    } catch {}
    setStatsLoading(false);
  }, [user.id, token, isTech]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ── Save profile ──────────────────────────────────────────────────────────
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) { setSaveMsg({ type: "err", text: "Name is required" }); return; }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "update", name: editName, phone: editPhone }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveMsg({ type: "err", text: data.error ?? "Save failed" }); return; }
      onUserUpdate(data.user, data.token);
      setSaveMsg({ type: "ok", text: "Profile saved" });
    } catch { setSaveMsg({ type: "err", text: "Network error" }); }
    finally { setSaving(false); }
  }

  // ── Change password ───────────────────────────────────────────────────────
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confPw) { setPwMsg({ type: "err", text: "Passwords do not match" }); return; }
    if (newPw.length < 6) { setPwMsg({ type: "err", text: "Password must be at least 6 characters" }); return; }
    setPwSaving(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "update", currentPassword: curPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) { setPwMsg({ type: "err", text: data.error ?? "Change failed" }); return; }
      setPwMsg({ type: "ok", text: "Password changed successfully" });
      setCurPw(""); setNewPw(""); setConfPw("");
    } catch { setPwMsg({ type: "err", text: "Network error" }); }
    finally { setPwSaving(false); }
  }

  // ── Update tech status ────────────────────────────────────────────────────
  // When going from working → available, prompt for job completion first
  function handleTechStatus(status: string) {
    if (techStatus === "working" && status === "available") {
      setPendingStatus(status);
      setShowCompletion(true);
      return;
    }
    applyTechStatus(status);
  }

  async function applyTechStatus(status: string) {
    setTechStatusSaving(true);
    try {
      await fetch("/api/techs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      setTechStatus(status);
    } catch {}
    setTechStatusSaving(false);
  }

  async function submitCompletion() {
    if (!completionChoice) return;
    setTechStatusSaving(true);

    // If a job is linked, update its status based on the choice
    if (currentJobId) {
      const jobStatus = completionChoice === "complete" ? "completed" : "in_progress";
      await fetch(`/api/jobs/${currentJobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          status: jobStatus,
          notes: completionNotes || null,
          followUp: completionChoice !== "complete" ? completionChoice : null,
        }),
      }).catch(() => {});
    }

    // Apply the new status (clears current_job_id server-side for "complete")
    await fetch("/api/techs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        status: pendingStatus ?? "available",
        completionChoice,
        completionNotes: completionNotes || null,
      }),
    }).catch(() => {});

    setTechStatus(pendingStatus ?? "available");
    if (completionChoice === "complete") setCurrentJobId(null);
    setShowCompletion(false);
    setCompletionChoice(null);
    setCompletionNotes("");
    setPendingStatus(null);
    setTechStatusSaving(false);
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "20px",
  };

  const label: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "14px",
    color: "#1f2937",
    outline: "none",
    boxSizing: "border-box",
    background: "#fff",
  };

  const btnPrimary: React.CSSProperties = {
    padding: "9px 20px",
    background: "#0d9488",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  };

  const msgStyle = (type: "ok" | "err"): React.CSSProperties => ({
    marginTop: "10px",
    padding: "8px 12px",
    borderRadius: "6px",
    fontSize: "13px",
    background: type === "ok" ? "#ecfdf5" : "#fef2f2",
    color: type === "ok" ? "#065f46" : "#991b1b",
    border: `1px solid ${type === "ok" ? "#a7f3d0" : "#fecaca"}`,
  });

  const statBox: React.CSSProperties = {
    flex: "1 1 0",
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "14px 12px",
    textAlign: "center",
    minWidth: "80px",
  };

  const avColor = avatarColor(user.name);

  const COMPLETION_OPTIONS = [
    { value: "complete",          label: "Yes — job is complete",            color: "#10b981", bg: "#ecfdf5" },
    { value: "temp_power",        label: "No — temp power installed, return needed", color: "#ef4444", bg: "#fee2e2" },
    { value: "return_grounding",  label: "No — return for grounding",        color: "#eab308", bg: "#fefce8" },
    { value: "return_permanent",  label: "No — return for permanent repair", color: "#f97316", bg: "#fff7ed" },
  ] as const;

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "0 4px" }}>

      {/* ── Job completion prompt modal ─────────────────────────────── */}
      {showCompletion && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", maxWidth: "460px", width: "100%", padding: "28px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: 700, color: "#1f2937" }}>Is this job complete?</h2>
            <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#6b7280" }}>Select the current status of the job before switching to Available.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {COMPLETION_OPTIONS.map((opt) => (
                <label key={opt.value} style={{
                  display: "flex", alignItems: "center", gap: "12px", cursor: "pointer",
                  padding: "12px 16px", borderRadius: "10px",
                  border: `2px solid ${completionChoice === opt.value ? opt.color : "#e5e7eb"}`,
                  background: completionChoice === opt.value ? opt.bg : "#fff",
                  transition: "all 0.1s",
                }}>
                  <input
                    type="radio"
                    name="completion"
                    value={opt.value}
                    checked={completionChoice === opt.value}
                    onChange={() => setCompletionChoice(opt.value)}
                    style={{ accentColor: opt.color }}
                  />
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#1f2937" }}>{opt.label}</span>
                </label>
              ))}
            </div>

            <textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Notes (optional)..."
              rows={2}
              style={{ width: "100%", padding: "9px 12px", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "8px", resize: "vertical", marginBottom: "16px", boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => { setShowCompletion(false); setCompletionChoice(null); setCompletionNotes(""); setPendingStatus(null); }}
                style={{ flex: 1, padding: "11px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={submitCompletion}
                disabled={!completionChoice || techStatusSaving}
                style={{ flex: 2, padding: "11px", background: !completionChoice || techStatusSaving ? "#9ca3af" : "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: !completionChoice || techStatusSaving ? "not-allowed" : "pointer" }}
              >
                {techStatusSaving ? "Saving…" : "Confirm & Go Available"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Identity card ────────────────────────────────────────────── */}
      <div style={{ ...card, display: "flex", alignItems: "flex-start", gap: "20px" }}>
        {/* Avatar */}
        <div style={{
          width: "72px", height: "72px", borderRadius: "50%",
          background: avColor, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "22px", fontWeight: 700, flexShrink: 0,
          boxShadow: `0 0 0 3px ${avColor}33`,
        }}>
          {initials(user.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#1f2937", marginBottom: "4px" }}>{user.name}</div>
          <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px" }}>{user.email}</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ padding: "3px 10px", background: `${ROLE_COLOR[user.role] ?? "#6b7280"}18`, color: ROLE_COLOR[user.role] ?? "#6b7280", borderRadius: "20px", fontSize: "12px", fontWeight: 600, textTransform: "capitalize" }}>
              {user.role}
            </span>
            {user.phone && (
              <span style={{ padding: "3px 10px", background: "#f3f4f6", color: "#374151", borderRadius: "20px", fontSize: "12px" }}>
                📞 {user.phone}
              </span>
            )}
            {stats.memberSince && (
              <span style={{ padding: "3px 10px", background: "#f3f4f6", color: "#6b7280", borderRadius: "20px", fontSize: "12px" }}>
                Member since {stats.memberSince}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={statBox}>
          {statsLoading ? (
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#9ca3af" }}>—</div>
          ) : (
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#0d9488" }}>{stats.investigations}</div>
          )}
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>Investigations</div>
        </div>
        <div style={statBox}>
          {statsLoading ? (
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#9ca3af" }}>—</div>
          ) : (
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#7c3aed" }}>{stats.jobsAssigned}</div>
          )}
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>Jobs Assigned</div>
        </div>
        <div style={statBox}>
          {statsLoading ? (
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#9ca3af" }}>—</div>
          ) : (
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#10b981" }}>{stats.jobsCompleted}</div>
          )}
          <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>Completed</div>
        </div>
      </div>

      {/* ── Tech status toggle ────────────────────────────────────────── */}
      {isTech && (
        <div style={card}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#1f2937", marginBottom: "14px" }}>Field Status</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {TECH_STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => handleTechStatus(s.value)}
                disabled={techStatusSaving}
                style={{
                  padding: "8px 16px",
                  border: `2px solid ${techStatus === s.value ? s.color : "#e5e7eb"}`,
                  borderRadius: "8px",
                  background: techStatus === s.value ? s.bg : "#fff",
                  color: techStatus === s.value ? s.color : "#6b7280",
                  fontWeight: techStatus === s.value ? 700 : 400,
                  fontSize: "13px",
                  cursor: techStatusSaving ? "default" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                {techStatus === s.value && "● "}{s.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: "12px", color: "#9ca3af", margin: "10px 0 0" }}>
            Your status is visible to office staff on the Techs panel and Live Map.
          </p>
        </div>
      )}

      {/* ── Edit profile ─────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#1f2937", marginBottom: "16px" }}>Edit Profile</div>
        <form onSubmit={handleSaveProfile}>
          <div style={{ marginBottom: "14px" }}>
            <label style={label}>Full Name</label>
            <input
              style={input}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={label}>Phone (optional)</label>
            <input
              style={input}
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="(612) 555-0100"
              type="tel"
            />
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={label}>Email</label>
            <input
              style={{ ...input, background: "#f9fafb", color: "#9ca3af" }}
              value={user.email}
              disabled
            />
            <p style={{ fontSize: "11px", color: "#9ca3af", margin: "4px 0 0" }}>Email cannot be changed.</p>
          </div>
          <button type="submit" style={btnPrimary} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {saveMsg && <div style={msgStyle(saveMsg.type)}>{saveMsg.text}</div>}
        </form>
      </div>

      {/* ── Change password ───────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#1f2937", marginBottom: "16px" }}>Change Password</div>
        <form onSubmit={handleChangePassword}>
          <div style={{ marginBottom: "14px" }}>
            <label style={label}>Current Password</label>
            <div style={{ position: "relative" }}>
              <input
                style={input}
                type={showPw ? "text" : "password"}
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                placeholder="Enter current password"
                required
              />
            </div>
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={label}>New Password</label>
            <input
              style={input}
              type={showPw ? "text" : "password"}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 6 characters"
              required
            />
          </div>
          <div style={{ marginBottom: "14px" }}>
            <label style={label}>Confirm New Password</label>
            <input
              style={input}
              type={showPw ? "text" : "password"}
              value={confPw}
              onChange={(e) => setConfPw(e.target.value)}
              placeholder="Repeat new password"
              required
            />
          </div>
          <div style={{ marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              id="show-pw"
              type="checkbox"
              checked={showPw}
              onChange={(e) => setShowPw(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <label htmlFor="show-pw" style={{ fontSize: "12px", color: "#6b7280", cursor: "pointer" }}>Show passwords</label>
          </div>
          <button type="submit" style={{ ...btnPrimary, background: "#7c3aed" }} disabled={pwSaving}>
            {pwSaving ? "Updating…" : "Change Password"}
          </button>
          {pwMsg && <div style={msgStyle(pwMsg.type)}>{pwMsg.text}</div>}
        </form>
      </div>

    </div>
  );
}
