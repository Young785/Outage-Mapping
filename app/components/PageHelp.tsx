"use client";

import { useState } from "react";
import { PAGE_HELP, type PageHelpId } from "@/lib/page-help";

type Props = {
  pageId: PageHelpId;
};

export default function PageHelp({ pageId }: Props) {
  const help = PAGE_HELP[pageId];
  const storageKey = `page_help_collapsed_${pageId}`;
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(storageKey) === "1";
  });

  if (!help) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(storageKey, next ? "1" : "0");
  };

  return (
    <div
      style={{
        marginBottom: "16px",
        background: "#f0fdfa",
        border: "1px solid #99f6e4",
        borderRadius: "10px",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={toggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          padding: "12px 16px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span
            style={{
              flexShrink: 0,
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              background: "#0d9488",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden
          >
            ?
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f766e" }}>
              How this page works — {help.title}
            </div>
            {!collapsed && (
              <div style={{ fontSize: "13px", color: "#047857", marginTop: "2px", lineHeight: 1.45 }}>
                {help.summary}
              </div>
            )}
          </div>
        </div>
        <span style={{ fontSize: "12px", color: "#0d9488", fontWeight: 600, flexShrink: 0 }}>
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>
      {!collapsed && (
        <div style={{ padding: "0 16px 14px 44px", color: "#065f46", fontSize: "13px", lineHeight: 1.65 }}>
          <p style={{ margin: "0 0 10px", color: "#047857" }}>{help.layman.plainEnglish}</p>
          <ol style={{ margin: "0 0 12px", paddingLeft: "18px" }}>
            {help.steps.map((s, i) => (
              <li key={s.title} style={{ marginBottom: "6px" }}>
                <strong>{i + 1}. {s.title}</strong> — {s.detail}
              </li>
            ))}
          </ol>
          <div style={{ fontSize: "11px", color: "#0d9488", fontWeight: 600 }}>
            Tip: use the help button (bottom-right) — Overview, Steps, and Inputs for what you can see on this page.
          </div>
        </div>
      )}
    </div>
  );
}
