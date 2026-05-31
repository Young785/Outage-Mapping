"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const GUIDE_NAV = [
  {
    title: "Before Login",
    items: [
      { id: "open-app", label: "Open the App" },
      { id: "landing", label: "Landing Page" },
      { id: "login-screen", label: "Login Screen" },
    ],
  },
  {
    title: "After Login",
    items: [
      { id: "layout", label: "Main Layout" },
      { id: "dashboard", label: "Dashboard" },
      { id: "live-map", label: "Live Map" },
      { id: "outages-tab", label: "Outages" },
      { id: "opportunities-tab", label: "Opportunities" },
      { id: "job-queue-tab", label: "Job Queue" },
      { id: "techs-tab", label: "Techs" },
      { id: "territories-tab", label: "Territories" },
      { id: "admin-tab", label: "Admin" },
      { id: "guide-tab", label: "Guide" },
      { id: "profile-tab", label: "Profile" },
    ],
  },
  {
    title: "Login & Database",
    items: [
      { id: "what-is-login", label: "What Is Login?" },
      { id: "roles-table", label: "Roles" },
      { id: "env-dev-prod", label: "Dev vs Prod (.env)" },
      { id: "local-db", label: "Local Database" },
      { id: "prod-db", label: "Production DB" },
    ],
  },
];

type Step = { n: number; title: string; body: string };

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol style={{ margin: "12px 0 20px", padding: 0, listStyle: "none" }}>
      {steps.map((s) => (
        <li key={s.n} style={{ display: "flex", gap: "14px", marginBottom: "16px", alignItems: "flex-start" }}>
          <span style={{
            flexShrink: 0, width: "28px", height: "28px", borderRadius: "50%", background: "#0d9488", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700,
          }}>{s.n}</span>
          <div>
            <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "4px", fontSize: "15px" }}>{s.title}</div>
            <div style={{ fontSize: "14px", color: "#475569", lineHeight: 1.65 }}>{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 24, marginBottom: "8px" }}>
      <h2 style={{ margin: "36px 0 12px", fontSize: "22px", fontWeight: 700, color: "#0f172a" }}>{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 12px", fontSize: "15px", lineHeight: 1.7, color: "#334155" }}>{children}</p>;
}

type Props = { variant?: "full" | "embedded" };

export default function SiteGuideDocs({ variant = "full" }: Props) {
  const allIds = useMemo(() => GUIDE_NAV.flatMap((g) => g.items.map((i) => i.id)), []);
  const [activeId, setActiveId] = useState(allIds[0]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0.1 }
    );
    allIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [allIds]);

  const shellStyle: React.CSSProperties =
    variant === "full"
      ? { minHeight: "100vh", background: "#fff", fontFamily: "system-ui", color: "#0f172a" }
      : { background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", fontFamily: "system-ui", color: "#0f172a", minHeight: "calc(100vh - 120px)" };

  return (
    <div style={shellStyle}>
      {variant === "full" && (
        <header style={{ borderBottom: "1px solid #e5e7eb", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", position: "sticky", top: 0, background: "#fff", zIndex: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "15px" }}>Site Navigation Guide</div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>Step-by-step website walkthrough</div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Link href="/docs" style={btnStyle}>Platform Docs</Link>
            <Link href="/" style={{ ...btnStyle, background: "#0d9488", color: "#fff", border: "none" }}>Login</Link>
          </div>
        </header>
      )}

      <div style={{ display: "flex", maxWidth: variant === "full" ? "1280px" : "100%", margin: "0 auto" }}>
        <aside style={{
          width: variant === "full" ? "260px" : "200px",
          flexShrink: 0,
          borderRight: "1px solid #e5e7eb",
          padding: "16px 12px",
          position: variant === "full" ? "sticky" : "relative",
          top: variant === "full" ? 57 : undefined,
          alignSelf: "flex-start",
          maxHeight: variant === "full" ? "calc(100vh - 57px)" : "calc(100vh - 200px)",
          overflowY: "auto",
          background: "#fafafa",
        }}>
          {GUIDE_NAV.map((group) => (
            <div key={group.title} style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "6px" }}>{group.title}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" })}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "6px 10px", marginBottom: "2px",
                    border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px",
                    background: activeId === item.id ? "#ccfbf1" : "transparent",
                    color: activeId === item.id ? "#0f766e" : "#334155",
                    fontWeight: activeId === item.id ? 600 : 400,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <main style={{ flex: 1, padding: variant === "full" ? "28px 40px 64px" : "16px 20px 32px", maxWidth: "780px", overflowY: "auto" }}>
          {variant === "embedded" && (
            <div style={{ marginBottom: "14px", padding: "10px 12px", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: "8px", fontSize: "13px", color: "#0f766e", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span>Step-by-step navigation, login, and local database setup.</span>
              <Link href="/docs" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: "#0d9488" }}>Platform docs →</Link>
            </div>
          )}
          <p style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>Guide</p>
          <h1 style={{ margin: "0 0 16px", fontSize: "30px", fontWeight: 800 }}>Navigate the Website</h1>
          <P>Follow these steps in order the first time you use the platform. Each section explains what you see on screen and what to click next.</P>

          <Section id="open-app" title="Step 1 — Open the app">
            <Steps steps={[
              { n: 1, title: "Go to the app URL", body: "Local development is usually http://localhost:3000 (or the port you use with npm run dev)." },
              { n: 2, title: "Check the welcome screen", body: "You should see “Storm Response Platform” with buttons for documentation and login." },
            ]} />
          </Section>

          <Section id="landing" title="Step 2 — Landing page">
            <Steps steps={[
              { n: 1, title: "Read Documentation", body: "Opens /docs — full platform feature reference (routing, dispatch, admin)." },
              { n: 2, title: "Site Guide (this page)", body: "Opens /docs/guide — step-by-step clicks through every screen." },
              { n: 3, title: "Continue to Login", body: "Opens the sign-in form when you are ready to work." },
            ]} />
          </Section>

          <Section id="login-screen" title="Step 3 — Login screen">
            <Steps steps={[
              { n: 1, title: "Enter email and password", body: "Use the account created in your database users table." },
              { n: 2, title: "Sign In", body: "The app stores a JWT token in your browser and loads the main workspace." },
              { n: 3, title: "New user?", body: "Switch to Create account, choose role (Tech, Office, Admin), then register. First-time setup often uses Office or Admin." },
            ]} />
          </Section>

          <Section id="layout" title="Main layout (after login)">
            <P>Once signed in, the screen splits into three areas:</P>
            <ul style={{ margin: "0 0 16px", paddingLeft: "20px", lineHeight: 1.75, color: "#334155", fontSize: "15px" }}>
              <li><strong>Left sidebar</strong> — switch tabs and toggle Xcel / Connexus data sources.</li>
              <li><strong>Top bar</strong> — current section name, refresh, and mobile menu.</li>
              <li><strong>Center panel</strong> — dashboard, map, lists, or admin tools.</li>
            </ul>
            <P>Your name at the bottom opens Profile and Log out.</P>
          </Section>

          <Section id="dashboard" title="Dashboard">
            <Steps steps={[
              { n: 1, title: "Click Dashboard", body: "First item in the sidebar." },
              { n: 2, title: "Read the stat cards", body: "Totals for unvisited dots, opportunities, jobs in queue, and customers affected." },
              { n: 3, title: "Use before dispatch", body: "Office staff checks this at storm start to see workload shape." },
            ]} />
          </Section>

          <Section id="live-map" title="Live Map">
            <Steps steps={[
              { n: 1, title: "Open Live Map", body: "Map loads centered on the Twin Cities area by default." },
              { n: 2, title: "Click any dot", body: "Detail panel shows address, status, customers, and actions." },
              { n: 3, title: "Investigate", body: "Opens the field form — pick outcome, power status, notes; submit in seconds." },
              { n: 4, title: "Marker updates", body: "Color and shape change based on status (e.g. square = door hanger)." },
            ]} />
          </Section>

          <Section id="outages-tab" title="Outages list">
            <Steps steps={[
              { n: 1, title: "Open Outages", body: "Badge shows how many dots are on the map." },
              { n: 2, title: "Filter by status", body: "Narrow to unvisited, investigating, etc." },
              { n: 3, title: "Search", body: "Find by street, city, or outage ID." },
            ]} />
          </Section>

          <Section id="opportunities-tab" title="Opportunities">
            <Steps steps={[
              { n: 1, title: "Open Opportunities", body: "Confirmed damage with customer contact — not yet sold or dispatched." },
              { n: 2, title: "Follow up here", body: "Door hangers, thinking customers, verbal quotes stay out of Job Queue until sold." },
            ]} />
          </Section>

          <Section id="job-queue-tab" title="Job Queue">
            <Steps steps={[
              { n: 1, title: "Open Job Queue", body: "Dispatch-ready jobs only." },
              { n: 2, title: "Change sort", body: "Priority, Distance, Value, or Smart." },
              { n: 3, title: "Assign", body: "See recommended tech, score, and reasons → confirm dispatch." },
              { n: 4, title: "Optimize Route", body: "Build stop order from tech GPS." },
              { n: 5, title: "Find Clusters", body: "Target dense hotspot areas." },
            ]} />
          </Section>

          <Section id="techs-tab" title="Techs (office roles)">
            <Steps steps={[
              { n: 1, title: "Open Techs", body: "Visible to office, admin, and owner roles." },
              { n: 2, title: "Monitor crews", body: "Status, load, and last GPS position update every ~30 seconds when app is open." },
            ]} />
          </Section>

          <Section id="territories-tab" title="Territories (office roles)">
            <Steps steps={[
              { n: 1, title: "Open Territories", body: "Manage ZIP lists or polygon zones." },
              { n: 2, title: "Affects dispatch", body: "Assignment scoring prefers techs matching job ZIP territory." },
            ]} />
          </Section>

          <Section id="admin-tab" title="Admin (office roles)">
            <Steps steps={[
              { n: 1, title: "Open Admin", body: "Storm settings, integrations, simulation, exports." },
              { n: 2, title: "Set Storm Phase", body: "Phase 1 hunt → Phase 2 dispatch → Phase 3 cleanup." },
              { n: 3, title: "Temp-Out mode", body: "Prioritize temp power workflow when enabled." },
              { n: 4, title: "Guardrails", body: "Max jobs per tech and overtime limits for assign scoring." },
            ]} />
          </Section>

          <Section id="guide-tab" title="Guide tab">
            <Steps steps={[
              { n: 1, title: "Click Guide", body: "Step-by-step navigation and login/database help inside the app." },
              { n: 2, title: "Open platform docs", body: "Use the link to /docs for full feature reference (routing, dispatch, admin)." },
            ]} />
          </Section>

          <Section id="profile-tab" title="Profile & logout">
            <Steps steps={[
              { n: 1, title: "Click your name", body: "Bottom of sidebar → Profile." },
              { n: 2, title: "Update details", body: "Change name, phone, or password." },
              { n: 3, title: "Log out", body: "Clears token and returns to public landing page." },
            ]} />
          </Section>

          <div style={{ borderTop: "2px solid #e5e7eb", marginTop: "48px", paddingTop: "24px" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, color: "#0d9488", textTransform: "uppercase", letterSpacing: "0.06em" }}>Setup</p>
            <h2 style={{ margin: "8px 0 16px", fontSize: "26px", fontWeight: 800 }}>Login & Database</h2>
          </div>

          <Section id="what-is-login" title="What is Login?">
            <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: "10px", padding: "16px", marginBottom: "16px" }}>
              <div style={{ fontWeight: 700, color: "#065f46", marginBottom: "10px" }}>Default dev logins (after seed.sql)</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #a7f3d0" }}>Email</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #a7f3d0" }}>Password</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #a7f3d0" }}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["admin@outage-mapping.com", "password123", "admin"],
                    ["office@outage-mapping.com", "password123", "office"],
                    ["tech@outage-mapping.com", "password123", "tech"],
                  ].map(([e, p, r]) => (
                    <tr key={e}>
                      <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: "12px" }}>{e}</td>
                      <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{p}</td>
                      <td style={{ padding: "6px 8px" }}>{r}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ margin: "10px 0 0", fontSize: "13px", color: "#047857" }}>Run migrations + <code>supabase/seed.sql</code> on local DB first. Production uses your own users — not these defaults.</p>
            </div>
            <P>Login is <strong>not</strong> a separate Supabase login page. The app uses its own auth API:</P>
            <pre style={{ background: "#0f172a", color: "#e2e8f0", padding: "12px 14px", borderRadius: "8px", fontSize: "13px", overflow: "auto" }}>
{`POST /api/auth
{ "action": "login", "email": "...", "password": "..." }

→ { token, user: { id, email, name, role } }`}
            </pre>
            <P>The browser saves <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>fieldmap_token</code> and sends it on every API request. Passwords are stored hashed in the <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>users</code> table.</P>
          </Section>

          <Section id="roles-table" title="Roles">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", marginBottom: "16px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>Role</th>
                  <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>Access</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["tech", "Map, lists, investigate, profile"],
                  ["office", "Above + Techs, Territories, Admin, dispatch"],
                  ["admin / owner", "Full settings and exports"],
                ].map(([r, a]) => (
                  <tr key={r}>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace" }}>{r}</td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", color: "#475569" }}>{a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section id="env-dev-prod" title="Dev vs Prod in .env">
            <P>Copy <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>.env.example</code> to <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>.env.local</code> and set:</P>
            <pre style={{ background: "#0f172a", color: "#e2e8f0", padding: "12px 14px", borderRadius: "8px", fontSize: "13px" }}>
{`APP_ENV=development   # uses *_DEV keys
APP_ENV=production    # uses *_PROD keys

SUPABASE_URL_DEV=...
SUPABASE_SERVICE_ROLE_KEY_DEV=...
JWT_SECRET_DEV=...

SUPABASE_URL_PROD=...
SUPABASE_SERVICE_ROLE_KEY_PROD=...
JWT_SECRET_PROD=...`}
            </pre>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "14px", marginTop: "12px", fontSize: "14px", color: "#78350f" }}>
              <strong>phpMyAdmin note:</strong> This app uses <strong>PostgreSQL</strong> (Supabase), not MySQL. phpMyAdmin is for MySQL only. For local dev, use <strong>Supabase Studio</strong> at <code>http://127.0.0.1:54323</code> after <code>supabase start</code> — it works like phpMyAdmin for your tables.
            </div>
          </Section>

          <Section id="local-db" title="Local database (development)">
            <Steps steps={[
              { n: 1, title: "Install Supabase CLI", body: "npm install -g supabase" },
              { n: 2, title: "Start local stack", body: "In project folder: supabase start → then supabase status for keys." },
              { n: 3, title: "Paste keys in .env.local", body: "SUPABASE_URL_DEV, SUPABASE_ANON_KEY_DEV, SUPABASE_SERVICE_ROLE_KEY_DEV from status output." },
              { n: 4, title: "Run migrations", body: "Execute SQL files in supabase/migrations/ via Studio SQL Editor (local)." },
              { n: 5, title: "Start app", body: "APP_ENV=development npm run dev — register your first admin user in the UI." },
            ]} />
          </Section>

          <Section id="prod-db" title="Production database">
            <Steps steps={[
              { n: 1, title: "Create Supabase cloud project", body: "Run the same migration SQL in the hosted SQL Editor." },
              { n: 2, title: "Set hosting env vars", body: "APP_ENV=production and all *_PROD Supabase keys + JWT_SECRET_PROD." },
              { n: 3, title: "Never commit secrets", body: ".env and .env.local stay out of git (see .gitignore)." },
            ]} />
            <p style={{ marginTop: "16px", fontSize: "13px", color: "#94a3b8" }}>See also: docs/LOGIN_AND_DATABASE.md and docs/NAVIGATION_GUIDE.md in the repo.</p>
          </Section>
        </main>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "8px",
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
  textDecoration: "none",
};
