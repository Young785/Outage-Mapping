"use client";

import { useEffect, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";

export type MapSearchHit = {
  id: string | number;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
};

type Props = {
  /** Existing map markers to search by address / customer name / phone */
  markers: MapSearchHit[];
  onSelectMarker: (hit: MapSearchHit) => void;
  /** Geocode an address that isn't already a marker — zoom map there */
  onGeocodeLocation?: (loc: { lat: number; lng: number; label: string }) => void;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export default function MapSearchBar({ markers, onSelectMarker, onGeocodeLocation }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [placesReady, setPlacesReady] = useState(false);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const q = normalize(query);
  const localHits =
    q.length < 2
      ? []
      : markers
          .filter((m) => {
            const hay = normalize(`${m.label} ${m.sublabel ?? ""}`);
            return hay.includes(q) || q.split(" ").every((tok) => hay.includes(tok));
          })
          .slice(0, 8);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !inputRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const loader = new Loader({ apiKey: key, version: "weekly", libraries: ["places"] });
        await loader.load();
        if (cancelled || !inputRef.current) return;
        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          fields: ["geometry", "formatted_address", "name"],
          componentRestrictions: { country: "us" },
        });
        autocompleteRef.current = ac;
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const loc = place.geometry?.location;
          if (!loc) return;
          const lat = loc.lat();
          const lng = loc.lng();
          const label = place.formatted_address || place.name || "Selected location";
          // Prefer an existing marker near this place
          const near = markers.find(
            (m) => Math.abs(m.lat - lat) < 0.0008 && Math.abs(m.lng - lng) < 0.0008
          );
          if (near) {
            onSelectMarker(near);
          } else {
            onGeocodeLocation?.({ lat, lng, label });
          }
          setQuery(label);
          setOpen(false);
        });
        setPlacesReady(true);
      } catch {
        /* Places optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markers, onGeocodeLocation, onSelectMarker]);

  async function searchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (localHits[0]) {
      onSelectMarker(localHits[0]);
      setOpen(false);
      return;
    }
    if (!query.trim() || !onGeocodeLocation) return;
    setBusy(true);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: query.trim() }),
      });
      const data = await res.json();
      if (data?.lat != null && data?.lng != null) {
        onGeocodeLocation({
          lat: data.lat,
          lng: data.lng,
          label: data.formattedAddress || query.trim(),
        });
        setOpen(false);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 420 }}>
      <form onSubmit={searchSubmit} style={{ display: "flex", gap: 6 }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placesReady ? "Search address or customer…" : "Search markers…"}
          style={{
            flex: 1,
            padding: "10px 14px",
            fontSize: 13,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "rgba(255,255,255,0.97)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "10px 14px",
            background: "#0d9488",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "…" : "Go"}
        </button>
      </form>
      {open && localHits.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "#fff",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          {localHits.map((hit) => (
            <button
              key={String(hit.id)}
              type="button"
              onClick={() => {
                onSelectMarker(hit);
                setQuery(hit.label);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                border: "none",
                borderBottom: "1px solid #f3f4f6",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{hit.label}</div>
              {hit.sublabel && (
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{hit.sublabel}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
