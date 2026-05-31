"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SITE_HELP_OVERVIEW } from "@/lib/field-help";
import { PAGE_HELP, type PageHelpId } from "@/lib/page-help";

type Props = {
  role?: "office" | "tech" | "admin" | "owner";
};

const PAGE_IDS: PageHelpId[] = [
  "dashboard",
  "map",
  "outages",
  "opportunities",
  "queue",
  "techs",
  "territories",
  "admin",
  "guide",
];

export default function SiteHelpLauncher({ role }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isOffice = role === "office" || role === "admin" || role === "owner";

  return (
    <>
      <button
        type="button"
        aria-label="Open site help"
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
          fontSize: "24px",
          fontWeight: 700,
        }}
      >
        ?
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site help"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 901,
            background: "rgba(15,23,42,0.45)",
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
              width: "min(720px, 100%)",
              maxHeight: "min(85vh, 820px)",
              overflow: "auto",
              background: "#fff",
              borderRadius: "16px",
              boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                position: "sticky",
                top: 0,
                background: "#fff",
                borderBottom: "1px solid #e5e7eb",
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
                zIndex: 1,
              }}
            >
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0d9488", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Storm Response Platform
                </div>
                <h2 style={{ margin: "4px 0 0", fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
                  How this site works
                </h2>
                {role && (
                  <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#64748b" }}>
                    Signed in as <strong style={{ textTransform: "capitalize" }}>{role}</strong>
                  </p>
                )}
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
                  fontSize: "18px",
                  color: "#64748b",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "20px" }}>
              {SITE_HELP_OVERVIEW.map((section) => (
                <div key={section.title} style={{ marginBottom: "22px" }}>
                  <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>{section.title}</h3>
                  <p style={{ margin: "0 0 8px", fontSize: "14px", color: "#475569", lineHeight: 1.55 }}>{section.summary}</p>
                  <ul style={{ margin: 0, paddingLeft: "18px", color: "#334155", fontSize: "13px", lineHeight: 1.65 }}>
                    {section.bullets.map((b) => (
                      <li key={b} style={{ marginBottom: "4px" }}>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "18px", marginBottom: "8px" }}>
                <h3 style={{ margin: "0 0 12px", fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>Page-by-page quick reference</h3>
                <div style={{ display: "grid", gap: "10px" }}>
                  {PAGE_IDS.filter((id) => {
                    if (id === "techs" || id === "territories" || id === "admin") return isOffice;
                    return true;
                  }).map((id) => {
                    const p = PAGE_HELP[id];
                    return (
                      <div
                        key={id}
                        style={{
                          padding: "12px 14px",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "10px",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f766e", marginBottom: "4px" }}>{p.title}</div>
                        <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>{p.summary}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "16px" }}>
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
                  Platform docs
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
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
