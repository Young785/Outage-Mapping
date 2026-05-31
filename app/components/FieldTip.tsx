"use client";

import { useId, useState } from "react";

type Props = {
  text: string;
  /** Wider tooltip for longer admin copy */
  wide?: boolean;
};

export default function FieldTip({ text, wide }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: "5px" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Field help"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          border: "1px solid #99f6e4",
          background: open ? "#0d9488" : "#f0fdfa",
          color: open ? "#fff" : "#0f766e",
          fontSize: "11px",
          fontWeight: 700,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            bottom: "calc(100% + 8px)",
            transform: "translateX(-50%)",
            zIndex: 50,
            width: wide ? "min(320px, 85vw)" : "min(260px, 80vw)",
            padding: "10px 12px",
            background: "#0f172a",
            color: "#e2e8f0",
            fontSize: "12px",
            lineHeight: 1.55,
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            fontWeight: 400,
            textAlign: "left",
            pointerEvents: "none",
          }}
        >
          {text}
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              bottom: "-5px",
              transform: "translateX(-50%) rotate(45deg)",
              width: "10px",
              height: "10px",
              background: "#0f172a",
            }}
          />
        </span>
      )}
    </span>
  );
}

export function LabelWithTip({
  label,
  tip,
  style,
}: {
  label: string;
  tip: string;
  style?: React.CSSProperties;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", ...style }}>
      {label}
      <FieldTip text={tip} />
    </span>
  );
}

export function SectionTitleWithTip({
  title,
  tip,
}: {
  title: string;
  tip: string;
}) {
  return (
    <h3
      style={{
        margin: "0 0 16px",
        fontSize: "16px",
        fontWeight: 700,
        color: "#1f2937",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "2px",
      }}
    >
      {title}
      <FieldTip text={tip} wide />
    </h3>
  );
}
