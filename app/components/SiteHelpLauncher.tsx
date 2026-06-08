"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PAGE_HELP, pagesForRole, type PageHelpId } from "@/lib/page-help";

type Props = {
  role?: "office" | "tech" | "admin" | "owner";
  /** Current sidebar tab — help opens focused on this page */
  activePage: PageHelpId;
};

type HelpSection = "overview" | "steps" | "inputs" | "access";

const SECTION_LABELS: Record<HelpSection, string> = {
  overview: "Overview",
  steps: "Steps",
  inputs: "Inputs",
  access: "Roles",
};

function roleLabel(role?: string): string {
  if (role === "admin" || role === "owner") return "Admin / Owner";
  if (role === "office") return "Office";
  return "Field Tech";
}

function matchesUserRole(accessRole: string, userRole?: string): boolean {
  if (!userRole) return false;
  if (accessRole === "Field Tech") return userRole === "tech";
  if (accessRole === "Office") return userRole === "office";
  if (accessRole === "Admin / Owner") return userRole === "admin" || userRole === "owner";
  return false;
}

export default function SiteHelpLauncher({ role, activePage }: Props) {
  const [open, setOpen] = useState(false);
  const [viewPage, setViewPage] = useState<PageHelpId>(activePage);
  const [section, setSection] = useState<HelpSection>("overview");

  const openHelp = () => {
    setViewPage(activePage);
    setSection("overview");
    setOpen(true);
  };

  useEffect(() => {
    if (open) {
      setViewPage(activePage);
    }
  }, [open, activePage]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const allowedPages = pagesForRole(role);
  const page = PAGE_HELP[viewPage] ?? PAGE_HELP.dashboard;
  const isCurrentTab = viewPage === activePage;
  const yourRole = roleLabel(role);

  return (
    <>
      <button
        type="button"
        aria-label={`Help for ${PAGE_HELP[activePage]?.title ?? "this page"}`}
        title={`Help: ${PAGE_HELP[activePage]?.title ?? "this page"}`}
        onClick={openHelp}
        style={{
          position: "fixed",
          left: "20px",
          bottom: "20px",
          zIndex: 900,
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          border: "none",
          background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)",
          color: "#fff",
          boxShadow: "0 6px 20px rgba(13,148,136,0.45)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Help: ${page.title}`}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 901,
            background: "rgba(15,23,42,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(680px, 100%)",
              maxHeight: "min(90vh, 820px)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              background: "#fff",
              borderRadius: "16px",
              boxShadow: "0 24px 48px rgba(0,0,0,0.22)",
              border: "1px solid #e5e7eb",
            }}
          >
            {/* Header */}
            <div
              style={{
                flexShrink: 0,
                background: "linear-gradient(180deg, #f0fdfa 0%, #fff 100%)",
                borderBottom: "1px solid #e5e7eb",
                padding: "18px 20px 0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#0d9488", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {isCurrentTab ? "You are here" : "Page help"} · {page.title}
                  </div>
                  <h2 style={{ margin: "6px 0 0", fontSize: "22px", fontWeight: 800, color: "#0f172a", lineHeight: 1.25 }}>
                    {page.layman.headline}
                  </h2>
                  <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#64748b" }}>
                    Signed in as <strong style={{ color: "#334155" }}>{yourRole}</strong>
                    {isCurrentTab ? " · help matches this screen" : " · viewing help for another page"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close help"
                  style={{
                    border: "none",
                    background: "#f1f5f9",
                    borderRadius: "8px",
                    width: "36px",
                    height: "36px",
                    cursor: "pointer",
                    fontSize: "20px",
                    color: "#64748b",
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>

              {/* Section tabs */}
              <div style={{ display: "flex", gap: "4px", overflowX: "auto", paddingBottom: "0" }}>
                {(Object.keys(SECTION_LABELS) as HelpSection[]).map((key) => {
                  const active = section === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSection(key)}
                      style={{
                        padding: "10px 16px",
                        border: "none",
                        borderBottom: active ? "2px solid #0d9488" : "2px solid transparent",
                        background: "transparent",
                        color: active ? "#0f766e" : "#64748b",
                        fontSize: "13px",
                        fontWeight: active ? 700 : 500,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        marginBottom: "-1px",
                      }}
                    >
                      {SECTION_LABELS[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
              {section === "overview" && (
                <>
                  <p style={{ margin: "0 0 16px", fontSize: "15px", color: "#334155", lineHeight: 1.7 }}>
                    {page.layman.plainEnglish}
                  </p>
                  <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#475569", lineHeight: 1.65 }}>
                    {page.summary}
                  </p>

                  {page.prioritization && page.prioritization.length > 0 && (
                    <div style={{ marginBottom: "16px" }}>
                      <h4 style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Prioritization on this page
                      </h4>
                      {page.prioritization.map((block) => (
                        <div
                          key={block.phase}
                          style={{
                            marginBottom: "10px",
                            padding: "12px 14px",
                            background: "#f0fdfa",
                            border: "1px solid #99f6e4",
                            borderRadius: "10px",
                          }}
                        >
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f766e", marginBottom: "6px" }}>
                            {block.phase}
                          </div>
                          <ol style={{ margin: 0, paddingLeft: "20px", color: "#334155", fontSize: "13px", lineHeight: 1.6 }}>
                            {block.rules.map((rule) => (
                              <li key={rule} style={{ marginBottom: "4px" }}>
                                {rule}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginBottom: "12px" }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      What you&apos;ll see on this page
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: "18px", color: "#334155", fontSize: "14px", lineHeight: 1.65 }}>
                      {page.layman.onThisPage.map((item) => (
                        <li key={item} style={{ marginBottom: "6px" }}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      What to try first
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: "18px", color: "#334155", fontSize: "14px", lineHeight: 1.65 }}>
                      {page.layman.tryThis.map((item) => (
                        <li key={item} style={{ marginBottom: "6px" }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {section === "steps" && (
                <ol style={{ margin: 0, paddingLeft: "0", listStyle: "none", color: "#334155", fontSize: "14px", lineHeight: 1.65 }}>
                  {page.steps.map((s, i) => (
                    <li
                      key={s.title}
                      style={{
                        marginBottom: "14px",
                        padding: "14px 16px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        display: "flex",
                        gap: "14px",
                        alignItems: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          background: "#0d9488",
                          color: "#fff",
                          fontSize: "13px",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>{s.title}</div>
                        <div style={{ color: "#475569" }}>{s.detail}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {section === "inputs" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {page.inputs.map((inp) => (
                    <div key={inp.name} style={{ padding: "14px 16px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>{inp.name}</div>
                      <div style={{ fontSize: "14px", color: "#475569", lineHeight: 1.55 }}>{inp.description}</div>
                    </div>
                  ))}
                </div>
              )}

              {section === "access" && (
                <>
                  <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#475569", lineHeight: 1.6 }}>
                    What each role can do on <strong>{page.title}</strong>. Your role is highlighted.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {page.access.map((a) => {
                      const isYou = matchesUserRole(a.role, role);
                      return (
                        <div
                          key={a.role}
                          style={{
                            padding: "14px 16px",
                            borderRadius: "10px",
                            border: isYou ? "2px solid #0d9488" : "1px solid #e2e8f0",
                            background: isYou ? "#f0fdfa" : "#f8fafc",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <span style={{ fontWeight: 700, color: "#0f766e", fontSize: "14px" }}>{a.role}</span>
                            {isYou && (
                              <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", background: "#0d9488", padding: "2px 8px", borderRadius: "10px" }}>
                                You
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "14px", color: "#475569", lineHeight: 1.55 }}>{a.permissions}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                flexShrink: 0,
                borderTop: "1px solid #e5e7eb",
                padding: "14px 20px",
                background: "#fafafa",
              }}
            >
              {!isCurrentTab && (
                <button
                  type="button"
                  onClick={() => { setViewPage(activePage); setSection("overview"); }}
                  style={{
                    width: "100%",
                    marginBottom: "10px",
                    padding: "8px 12px",
                    background: "#ccfbf1",
                    border: "1px solid #99f6e4",
                    borderRadius: "8px",
                    color: "#0f766e",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ← Back to help for {PAGE_HELP[activePage]?.title ?? "current page"}
                </button>
              )}

              <details style={{ marginBottom: "10px" }}>
                <summary style={{ cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                  Browse help for other pages
                </summary>
                <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {allowedPages.map((id) => {
                    const p = PAGE_HELP[id];
                    const active = id === viewPage;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => { setViewPage(id); setSection("overview"); }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "20px",
                          border: `1px solid ${active ? "#0d9488" : "#e2e8f0"}`,
                          background: active ? "#ccfbf1" : "#fff",
                          color: active ? "#0f766e" : "#475569",
                          fontSize: "12px",
                          fontWeight: active ? 700 : 500,
                          cursor: "pointer",
                        }}
                      >
                        {p.title}
                        {id === activePage ? " · here" : ""}
                      </button>
                    );
                  })}
                </div>
              </details>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Link
                  href="/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "10px 16px",
                    background: "#0d9488",
                    color: "#fff",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  Full platform docs
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    padding: "10px 16px",
                    background: "#f1f5f9",
                    color: "#334155",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
