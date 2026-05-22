"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type ZipSuggestion = { zip: string; label: string };

type Props = {
  value: string[];
  onChange: (zips: string[]) => void;
  placeholder?: string;
};

export default function ZipCodePicker({ value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ZipSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const addZip = useCallback(
    (zip: string) => {
      const z = zip.replace(/\D/g, "").slice(0, 5);
      if (z.length !== 5 || value.includes(z)) return;
      onChange([...value, z]);
      setQuery("");
      setSuggestions([]);
      setOpen(false);
    },
    [onChange, value]
  );

  const removeZip = (zip: string) => onChange(value.filter((z) => z !== zip));

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/zip-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSuggestions(data.zips ?? []);
        setOpen((data.zips?.length ?? 0) > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      const direct = query.replace(/\D/g, "").slice(0, 5);
      if (direct.length === 5) addZip(direct);
      else if (suggestions[0]) addZip(suggestions[0].zip);
    }
  }

  return (
    <div ref={wrapRef}>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
          {value.map((z) => (
            <span
              key={z}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                background: "#ecfdf5",
                color: "#047857",
                borderRadius: "16px",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {z}
              <button
                type="button"
                onClick={() => removeZip(z)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#059669",
                  fontSize: "16px",
                  lineHeight: 1,
                  padding: 0,
                }}
                aria-label={`Remove ${z}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Search zip code (e.g. 80201)…"}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            fontSize: "14px",
            boxSizing: "border-box",
          }}
          autoComplete="off"
        />
        {loading && (
          <span
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: "11px",
              color: "#9ca3af",
            }}
          >
            …
          </span>
        )}

        {open && suggestions.length > 0 && (
          <ul
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "100%",
              margin: "4px 0 0",
              padding: 0,
              listStyle: "none",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              maxHeight: "220px",
              overflowY: "auto",
              zIndex: 50,
            }}
          >
            {suggestions.map((s) => (
              <li key={s.zip}>
                <button
                  type="button"
                  onClick={() => addZip(s.zip)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: "14px",
                    color: "#1f2937",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "#f0fdfa";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <strong>{s.zip}</strong>
                  <span style={{ color: "#6b7280", marginLeft: "8px", fontSize: "12px" }}>
                    {s.label.replace(/^\d{5}(?:-\d{4})?,?\s*/, "")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#6b7280" }}>
        Type to search US zip codes, press Enter to add, or click a suggestion
      </p>
    </div>
  );
}
