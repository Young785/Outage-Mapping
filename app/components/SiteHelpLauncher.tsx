"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PAGE_HELP, pagesForRole, type PageHelpId } from "@/lib/page-help";

type Props = {
  role?: "office" | "tech" | "admin" | "owner";
  /** Current sidebar tab — help opens focused on this page */
  activePage: PageHelpId;
};

function HelpSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: "18px" }}>
      <h4 style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {title}
      </h4>
      <ul style={{ margin: 0, paddingLeft: "18px", color: "#334155", fontSize: "14px", lineHeight: 1.65 }}>
        {items.map((item) => (
          <li key={item} style={{ marginBottom: "6px" }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SiteHelpLauncher({ role, activePage }: Props) {
  const [open, setOpen] = useState(false);
  const [viewPage, setViewPage] = useState<PageHelpId>(activePage);
  const [showAllPages, setShowAllPages] = useState(false);

  useEffect(() => {
    if (open) setViewPage(activePage);
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

  return (
    <>
      <button
        type="button"
        aria-label="Help for this page"
        title="What does this page do?"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: "20px",
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
              width: "min(640px, 100%)",
              maxHeight: "min(88vh, 780px)",
              overflow: "auto",
              background: "#fff",
              borderRadius: "16px",
              boxShadow: "0 24px 48px rgba(0,0,0,0.22)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                position: "sticky",
                top: 0,
                background: "linear-gradient(180deg, #f0fdfa 0%, #fff 100%)",
                borderBottom: "1px solid #e5e7eb",
                padding: "18px 20px",
                zIndex: 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#0d9488", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {isCurrentTab ? "You are here" : "Page help"} · {page.title}
                  </div>
                  <h2 style={{ margin: "6px 0 0", fontSize: "22px", fontWeight: 800, color: "#0f172a", lineHeight: 1.25 }}>
                    {page.layman.headline}
                  </h2>
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
            </div>

            <div style={{ padding: "20px" }}>
              <p style={{ margin: "0 0 20px", fontSize: "15px", color: "#475569", lineHeight: 1.65 }}>
                {page.layman.plainEnglish}
              </p>

              <HelpSection title="What you'll see on this page" items={page.layman.onThisPage} />
              <HelpSection title="What to try" items={page.layman.tryThis} />

              <details
                style={{
                  marginTop: "8px",
                  padding: "12px 14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "13px", color: "#334155" }}>
                  More detail
                </summary>
                <ul style={{ margin: "10px 0 0", paddingLeft: "18px", fontSize: "13px", color: "#475569", lineHeight: 1.6 }}>
                  {page.bullets.map((b) => (
                    <li key={b} style={{ marginBottom: "4px" }}>
                      {b}
                    </li>
                  ))}
                </ul>
              </details>

              <div style={{ borderTop: "1px solid #e5e7eb", marginTop: "20px", paddingTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setShowAllPages((v) => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#0d9488",
                    cursor: "pointer",
                    marginBottom: showAllPages ? "12px" : 0,
                  }}
                >
                  {showAllPages ? "Hide other pages ▲" : "Help for other pages ▼"}
                </button>
                {showAllPages && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {allowedPages.map((id) => {
                      const p = PAGE_HELP[id];
                      const active = id === viewPage;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setViewPage(id)}
                          style={{
                            padding: "8px 12px",
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
                          {id === activePage ? " · current" : ""}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "20px" }}>
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
