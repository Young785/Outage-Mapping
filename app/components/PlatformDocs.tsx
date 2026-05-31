"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export type DocsNavGroup = {
  title: string;
  items: { id: string; label: string }[];
};

export const DOCS_NAV: DocsNavGroup[] = [
  {
    title: "Getting Started",
    items: [
      { id: "overview", label: "Overview" },
      { id: "quickstart", label: "Quickstart" },
      { id: "roles", label: "Roles & Access" },
      { id: "workflow", label: "Core Workflow" },
    ],
  },
  {
    title: "Core Features",
    items: [
      { id: "three-lists", label: "Three Lists" },
      { id: "investigation", label: "Field Investigation" },
      { id: "map-markers", label: "Map & Markers" },
    ],
  },
  {
    title: "Routing & Dispatch",
    items: [
      { id: "queue-sort", label: "Smart Queue Sort" },
      { id: "multi-stop", label: "Multi-Stop Routes" },
      { id: "clusters", label: "Cluster Routing" },
      { id: "auto-dispatch", label: "Auto-Dispatch" },
      { id: "eta-arrival", label: "ETA & Auto-Arrival" },
    ],
  },
  {
    title: "Office & Admin",
    items: [
      { id: "storm-controls", label: "Storm Controls" },
      { id: "guardrails", label: "Crew Guardrails" },
      { id: "cleanup-export", label: "Cleanup & Export" },
    ],
  },
  {
    title: "Real-Time",
    items: [
      { id: "gps-tracking", label: "Tech GPS Tracking" },
      { id: "notifications", label: "SMS Notifications" },
    ],
  },
  {
    title: "API Reference",
    items: [
      { id: "api-overview", label: "Endpoints" },
      { id: "status", label: "Platform Status" },
    ],
  },
];

type Props = {
  variant?: "full" | "embedded";
  onBack?: () => void;
  loginHref?: string;
};

function Callout({ title, children, tone = "info" }: { title?: string; children: React.ReactNode; tone?: "info" | "warn" | "success" }) {
  const styles = {
    info: { bg: "#eff6ff", border: "#bfdbfe", title: "#1e40af", text: "#1e3a8a" },
    warn: { bg: "#fffbeb", border: "#fde68a", title: "#92400e", text: "#78350f" },
    success: { bg: "#ecfdf5", border: "#a7f3d0", title: "#065f46", text: "#064e3b" },
  }[tone];
  return (
    <div style={{ background: styles.bg, border: `1px solid ${styles.border}`, borderRadius: "10px", padding: "14px 16px", margin: "16px 0" }}>
      {title && <div style={{ fontWeight: 700, color: styles.title, marginBottom: "6px", fontSize: "14px" }}>{title}</div>}
      <div style={{ color: styles.text, fontSize: "14px", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre style={{
      background: "#0f172a",
      color: "#e2e8f0",
      padding: "14px 16px",
      borderRadius: "8px",
      fontSize: "13px",
      lineHeight: 1.5,
      overflow: "auto",
      margin: "12px 0",
    }}>
      {children}
    </pre>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ margin: "40px 0 16px", fontSize: "22px", fontWeight: 700, color: "#0f172a", scrollMarginTop: 24 }}>
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ margin: "24px 0 10px", fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 12px", fontSize: "15px", lineHeight: 1.7, color: "#334155" }}>{children}</p>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "0 0 16px", paddingLeft: "20px", color: "#334155", lineHeight: 1.75, fontSize: "15px" }}>
      {items.map((item) => (
        <li key={item} style={{ marginBottom: "6px" }}>{item}</li>
      ))}
    </ul>
  );
}

function ApiTable({ rows }: { rows: { method: string; path: string; desc: string }[] }) {
  return (
    <div style={{ overflowX: "auto", margin: "16px 0", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
        <thead>
          <tr style={{ background: "#f8fafc", textAlign: "left" }}>
            <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", width: "90px" }}>Method</th>
            <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Endpoint</th>
            <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.method}-${r.path}`}>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "#0d9488" }}>{r.method}</td>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", fontFamily: "ui-monospace, monospace", fontSize: "13px" }}>{r.path}</td>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#475569" }}>{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocsContent() {
  return (
    <>
      <section id="overview" style={{ scrollMarginTop: 24 }}>
        <p style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Documentation
        </p>
        <h1 style={{ margin: "0 0 16px", fontSize: "32px", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
          Storm Response Platform
        </h1>
        <P>
          The Storm Response Platform helps electrical storm teams track outages, separate real work into clear lists,
          dispatch technicians faster, and stay aligned during high-pressure operations. The design goal is simple:
          fast, reliable, low-friction use when crews are tired, mobile, and moving quickly.
        </P>
        <Callout title="What you can do with this platform">
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            <li>Track live outage dots on a map</li>
            <li>Keep Outages, Opportunities, and Job Queue separate</li>
            <li>Run routing, clustering, and smart dispatch recommendations</li>
            <li>Monitor tech location, ETA, and automatic arrival updates</li>
          </ul>
        </Callout>
      </section>

      <section id="quickstart" style={{ scrollMarginTop: 24 }}>
        <H2>Quickstart</H2>
        <P>To start using the platform during a storm event, office staff configure storm mode, field techs investigate dots, and dispatch uses the job queue for real work.</P>
        <H3>Office quickstart (5 steps)</H3>
        <Ul items={[
          "Log in with an office, admin, or owner account.",
          "Set Storm Phase (Phase 1, 2, or 3) and Temp-Out mode in Admin.",
          "Confirm data sources (Xcel / Connexus) are enabled.",
          "Monitor Job Queue and Opportunities as separate lists.",
          "Use Assign and Optimize Route when dispatching.",
        ]} />
        <H3>Field tech quickstart (4 steps)</H3>
        <Ul items={[
          "Log in as a field technician.",
          "Open Live Map and tap the nearest unvisited dot.",
          "Complete the investigation form (under 20 seconds when possible).",
          "If sold or actionable, the item moves to the correct downstream list automatically.",
        ]} />
        <Callout tone="success" title="Tip">
          Phase 1 is hunting mode (many dots). Phase 2 prioritizes the job queue. Phase 3 is cleanup and return trips.
        </Callout>
      </section>

      <section id="roles">
        <H2>Roles & Access</H2>
        <P>Each role sees the parts of the system they need. Permissions are enforced on API routes and in the UI.</P>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "16px" }}>
          {[
            { role: "Field Tech", desc: "Investigate dots, add opportunities, update statuses from the map." },
            { role: "Office / Dispatch", desc: "Manage queue, assign techs, run cleanup, export data." },
            { role: "Admin / Owner", desc: "Configure weights, storm settings, guardrails, and integrations." },
          ].map((r) => (
            <div key={r.role} style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px", background: "#fff" }}>
              <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>{r.role}</div>
              <div style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.5 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="workflow">
        <H2>Core Workflow</H2>
        <P>The platform follows a simple operational loop designed for storm speed:</P>
        <ol style={{ margin: "0 0 16px", paddingLeft: "20px", color: "#334155", lineHeight: 1.75, fontSize: "15px" }}>
          <li>Outage dots load on the map from utility sources.</li>
          <li>Techs investigate and tag each location.</li>
          <li>Statuses update marker color, shape, and list placement.</li>
          <li>Office dispatches confirmed jobs from the queue.</li>
          <li>ETA and auto-arrival reduce manual status updates.</li>
        </ol>
      </section>

      <section id="three-lists">
        <H2>The Three Lists</H2>
        <P>Three separate lists prevent mixing hunting work with dispatch-ready jobs.</P>
        <H3>Outages</H3>
        <P>Raw map activity and unvisited storm dots. This is your hunting board during Phase 1.</P>
        <H3>Confirmed Opportunities</H3>
        <P>Damage confirmed and customer contact occurred, but the job is not sold yet. Used for follow-up and sales routing.</P>
        <H3>Job Queue</H3>
        <P>Dispatch-ready work only: call-ins, sold jobs, started jobs, temp power, grounding, and wants-to-proceed.</P>
        <Callout tone="warn" title="Important">
          Opportunities and door hangers do not belong in the Job Queue. Keeping lists separate avoids dispatch confusion during busy storms.
        </Callout>
      </section>

      <section id="investigation">
        <H2>Field Investigation</H2>
        <P>The investigation form is optimized for speed on mobile devices. Techs pick one primary outcome first; additional fields appear only when needed.</P>
        <H3>Primary outcomes</H3>
        <Ul items={["Utility Issue", "No Damage Found", "Opportunity Found"]} />
        <H3>When Opportunity Found is selected</H3>
        <Ul items={[
          "Door Hanger Left (square marker on map)",
          "Job Sold (temp power submenu when applicable)",
          "Job Started (grounding submenu when applicable)",
          "Customer Thinking",
          "Customer Declined",
          "Verbal Price Quoted (stored for office follow-up)",
        ]} />
        <H3>Power status (opportunity flow)</H3>
        <Ul items={[
          "Has Power",
          "No Power — power on line drop",
          "No Power — no power on line drop",
          "Neighborhood Dead",
          "Honey Hole (multi-customer opportunity)",
        ]} />
      </section>

      <section id="map-markers">
        <H2>Map & Markers</H2>
        <P>Markers communicate status at a glance. Office users can hide completed or declined dots to reduce clutter.</P>
        <Ul items={[
          "Color and shape indicate status (including square markers for door hangers).",
          "New utility dots can be highlighted when first seen.",
          "Stale dots can be faded for back-to-back storm visibility.",
          "Territory, priority, and exclusion zones can be drawn and applied.",
        ]} />
      </section>

      <section id="queue-sort">
        <H2>Smart Queue Sort</H2>
        <P>The job queue supports multiple sort modes so dispatch can prioritize by score, distance, or customer value.</P>
        <Ul items={[
          "Priority — highest operational score first.",
          "Distance — closest jobs first (when tech location is available).",
          "Value — higher customer impact first.",
          "Smart — balances score and travel distance.",
        ]} />
      </section>

      <section id="multi-stop">
        <H2>Multi-Stop Routes</H2>
        <P>Multi-stop optimization builds an ordered route from the tech&apos;s current location and selected queue candidates.</P>
        <P>In the Job Queue, click Optimize Route to generate a stop sequence with estimated miles and minutes. Use Go Next Stop to navigate to the first location in the plan.</P>
        <Code>{`POST /api/routing/multi-stop
Body: { origin: { lat, lng }, stops: [...], maxStops: 8 }`}</Code>
      </section>

      <section id="clusters">
        <H2>Cluster Routing</H2>
        <P>Cluster detection finds dense groups of nearby stops so teams can work one hotspot efficiently instead of driving between scattered dots.</P>
        <P>Click Find Clusters in the Job Queue to see hotspot packs ranked by size and average priority, then navigate to the cluster center or top stop.</P>
      </section>

      <section id="auto-dispatch">
        <H2>Auto-Dispatch Recommendations</H2>
        <P>When office clicks Assign on a queue item, the system recommends the best available technician before confirming dispatch.</P>
        <P>The recommendation score considers:</P>
        <Ul items={[
          "Distance to the job",
          "Territory fit (ZIP-based when configured)",
          "Current workload (open assigned jobs)",
          "Return-trip burden",
          "Overtime and load guardrails",
        ]} />
        <P>The result banner shows score, shift hours, load, reasons, and backup alternatives.</P>
        <Code>{`POST /api/jobs/assign
Body: { jobId | outageId, targetLat, targetLng, confirm: false | true }`}</Code>
      </section>

      <section id="eta-arrival">
        <H2>ETA & Auto-Arrival</H2>
        <P>While a tech is on shift, GPS heartbeats run every 30 seconds. The system calculates ETA for assigned jobs and can automatically mark arrival when the tech is within the threshold distance.</P>
        <Ul items={[
          "Job status updates to in_progress on auto-arrival.",
          "A timestamped note is added to the job record.",
          "Linked outage status can update to job_started.",
        ]} />
        <Callout title="Default behavior">
          If GPS or SMS is not configured, the app continues safely without breaking core workflows.
        </Callout>
      </section>

      <section id="storm-controls">
        <H2>Storm Controls</H2>
        <P>Office and admin users control how the operation behaves during a storm.</P>
        <div style={{ overflowX: "auto", margin: "12px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>Setting</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>Values</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Storm Phase", "phase_1, phase_2, phase_3", "Hunting vs dispatch vs cleanup focus"],
                ["Temp-Out Mode", "on / off", "Prioritize temp power workflow for difficult jobs"],
                ["Fetch Interval", "minutes", "How often outage data refreshes"],
                ["Data Sources", "xcel, connexus", "Which feeds are active on the map"],
              ].map(([k, v, m]) => (
                <tr key={k}>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }}>{k}</td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", fontFamily: "ui-monospace, monospace", fontSize: "13px" }}>{v}</td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#64748b" }}>{m}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="guardrails">
        <H2>Crew Guardrails</H2>
        <P>Dispatch guardrails are configurable in Admin under Dispatch Guardrails and used in assignment scoring.</P>
        <div style={{ overflowX: "auto", margin: "12px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>Parameter</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>Default</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>Effect</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["max_jobs_per_tech", "4", "Penalizes techs at load cap"],
                ["overtime_hours_soft_limit", "10", "Soft overtime penalty begins"],
                ["overtime_hours_hard_limit", "14", "Strong penalty at hard limit"],
              ].map(([p, d, e]) => (
                <tr key={p}>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", fontFamily: "ui-monospace, monospace" }}>{p}</td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>{d}</td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#64748b" }}>{e}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="cleanup-export">
        <H2>Cleanup & Export</H2>
        <P>Between storms or during cleanup phases, office can reduce map clutter and export historical data.</P>
        <H3>Map cleanup actions</H3>
        <Ul items={[
          "Remove one marker from the active map.",
          "Sweep completed and declined statuses in bulk.",
          "Archive stale dots older than 48h or 72h.",
        ]} />
        <H3>Data storage & export</H3>
        <P>Primary storage is Supabase Postgres (outages, jobs, investigations, technicians, settings). CSV export is available for outages, jobs, and investigations via Admin or API.</P>
      </section>

      <section id="gps-tracking">
        <H2>Tech GPS Tracking</H2>
        <P>Technician locations refresh on a 30-second interval while the app is open. Map markers animate smoothly between positions so office can see near-live movement.</P>
        <Code>{`POST /api/techs        — update tech lat/lng (field heartbeat)
POST /api/jobs/eta     — ETA + auto-arrival check`}</Code>
      </section>

      <section id="notifications">
        <H2>SMS Notifications</H2>
        <P>Optional Twilio SMS alerts notify techs on dispatch assignment and notify office on auto-arrival.</P>
        <div style={{ overflowX: "auto", margin: "12px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>Variable</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>Required</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["SMS_NOTIFICATIONS_ENABLED", "true"],
                ["TWILIO_ACCOUNT_SID", "yes"],
                ["TWILIO_AUTH_TOKEN", "yes"],
                ["TWILIO_FROM_NUMBER", "yes"],
              ].map(([k, r]) => (
                <tr key={k}>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", fontFamily: "ui-monospace, monospace", fontSize: "13px" }}>{k}</td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>{r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="api-overview">
        <H2>API Endpoints</H2>
        <P>Key backend routes used by the platform. All authenticated routes require a Bearer token unless noted.</P>
        <ApiTable rows={[
          { method: "GET", path: "/api/outages", desc: "Fetch and enrich outage dots for the map and lists." },
          { method: "POST", path: "/api/outages/[id]/investigate", desc: "Submit field investigation results." },
          { method: "GET", path: "/api/jobs/queue", desc: "Dispatch-ready queue with sort and distance." },
          { method: "POST", path: "/api/jobs/assign", desc: "Recommend or confirm tech assignment." },
          { method: "POST", path: "/api/routing/multi-stop", desc: "Build ordered multi-stop route." },
          { method: "POST", path: "/api/routing/clusters", desc: "Detect dense hotspot clusters." },
          { method: "POST", path: "/api/jobs/eta", desc: "ETA calculation and auto-arrival." },
          { method: "GET", path: "/api/ops/metrics", desc: "Operational metrics for dashboard and admin." },
          { method: "GET", path: "/api/ops/export", desc: "CSV export (outages, jobs, investigations)." },
          { method: "POST", path: "/api/outages/cleanup", desc: "Map cleanup and archive actions." },
          { method: "GET", path: "/api/docs/platform", desc: "Documentation metadata (legacy markdown export)." },
        ]} />
      </section>

      <section id="status">
        <H2>Platform Status</H2>
        <P>Current implementation status for storm season operations:</P>
        <Ul items={[
          "Operational: streamlined investigation, three-list separation, map controls.",
          "Operational: routing v1, smart dispatch v2, GPS tracking, auto-arrival.",
          "Operational: storm phase, temp-out, guardrails, SMS hooks (when configured).",
          "Roadmap: deeper route optimization, expanded notifications, advanced scheduling.",
        ]} />
        <p style={{ marginTop: "32px", fontSize: "13px", color: "#94a3b8" }}>Last updated: May 2026</p>
      </section>
    </>
  );
}

export default function PlatformDocs({ variant = "full", onBack, loginHref = "/" }: Props) {
  const allIds = useMemo(() => DOCS_NAV.flatMap((g) => g.items.map((i) => i.id)), []);
  const [activeId, setActiveId] = useState(allIds[0]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => (a.target as HTMLElement).offsetTop - (b.target as HTMLElement).offsetTop);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0.1 }
    );
    allIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [allIds]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

  const shellStyle: React.CSSProperties =
    variant === "full"
      ? { minHeight: "100vh", background: "#fff", fontFamily: "system-ui", color: "#0f172a" }
      : { background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", fontFamily: "system-ui", color: "#0f172a", minHeight: "calc(100vh - 120px)" };

  return (
    <div style={shellStyle}>
      {variant === "full" && (
        <header style={{ borderBottom: "1px solid #e5e7eb", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", position: "sticky", top: 0, background: "#fff", zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg,#0d9488,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: "14px" }}>FM</span>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "15px" }}>Field Map Docs</div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>Storm Response Platform</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link href="/docs/guide" style={{ ...topBtnStyle, textDecoration: "none", display: "inline-block" }}>Site Guide</Link>
            {onBack ? (
              <button type="button" onClick={onBack} style={topBtnStyle}>Back</button>
            ) : (
              <Link href="/" style={{ ...topBtnStyle, textDecoration: "none", display: "inline-block" }}>Home</Link>
            )}
            <Link href={loginHref} style={{ ...topBtnStyle, background: "#0d9488", color: "#fff", border: "none", textDecoration: "none" }}>Login</Link>
          </div>
        </header>
      )}

      <div style={{ display: "flex", maxWidth: variant === "full" ? "1280px" : "100%", margin: "0 auto" }}>
        <aside
          style={{
            width: variant === "full" ? "260px" : "220px",
            flexShrink: 0,
            borderRight: "1px solid #e5e7eb",
            padding: "20px 16px",
            position: variant === "full" ? "sticky" : "relative",
            top: variant === "full" ? 57 : undefined,
            alignSelf: "flex-start",
            maxHeight: variant === "full" ? "calc(100vh - 57px)" : undefined,
            overflowY: "auto",
            background: "#fafafa",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>Documentation</div>
          {DOCS_NAV.map((group) => (
            <div key={group.title} style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                {group.title}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    marginBottom: "2px",
                    border: "none",
                    borderRadius: "6px",
                    background: activeId === item.id ? "#ccfbf1" : "transparent",
                    color: activeId === item.id ? "#0f766e" : "#334155",
                    fontSize: "13px",
                    fontWeight: activeId === item.id ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <main style={{ flex: 1, padding: variant === "full" ? "32px 40px 64px" : "20px 24px", maxWidth: "820px", overflowY: "auto" }}>
          {variant === "embedded" && (
            <div style={{ marginBottom: "16px", padding: "10px 12px", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: "8px", fontSize: "13px", color: "#0f766e", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span>Full platform feature reference.</span>
              <Link href="/docs/guide" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: "#0d9488" }}>Open guide →</Link>
            </div>
          )}
          <DocsContent />
        </main>
      </div>
    </div>
  );
}

const topBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
  cursor: "pointer",
};
