"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";

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

/** Twin Cities metro bias for Places autocomplete + forward geocode. */
const SERVICE_CENTER = { lat: 44.9778, lng: -93.265 };
const SERVICE_RADIUS_M = 70_000; // ~43 miles

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreLocalHit(m: MapSearchHit, q: string): number {
  const name = normalize(m.sublabel?.split(" · ")[0] ?? "");
  const label = normalize(m.label);
  const hay = normalize(`${m.label} ${m.sublabel ?? ""}`);
  if (!q) return 0;
  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  if (name.includes(q)) return 80;
  if (label.includes(q)) return 60;
  if (hay.includes(q)) return 50;
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length > 1 && tokens.every((tok) => hay.includes(tok))) return 40;
  return 0;
}

export default function MapSearchBar({ markers, onSelectMarker, onGeocodeLocation }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [placesReady, setPlacesReady] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const onSelectRef = useRef(onSelectMarker);
  onSelectRef.current = onSelectMarker;
  const onGeocodeRef = useRef(onGeocodeLocation);
  onGeocodeRef.current = onGeocodeLocation;

  const q = normalize(query);
  const localHits =
    q.length < 2
      ? []
      : markers
          .map((m) => ({ m, score: scoreLocalHit(m, q) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map((x) => x.m);

  useEffect(() => {
    if (!inputRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        // Reuse the shared Maps loader so Places does not conflict with the main map.
        await loadGoogleMaps();
        if (cancelled || !inputRef.current) return;
        if (!window.google?.maps?.places) {
          setPlacesError("Places library unavailable");
          return;
        }
        const circle = new google.maps.Circle({
          center: SERVICE_CENTER,
          radius: SERVICE_RADIUS_M,
        });
        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          fields: ["geometry", "formatted_address", "name"],
          componentRestrictions: { country: "us" },
          bounds: circle.getBounds() ?? undefined,
          strictBounds: false,
        });
        autocompleteRef.current = ac;
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const loc = place.geometry?.location;
          if (!loc) return;
          const lat = loc.lat();
          const lng = loc.lng();
          const label = place.formatted_address || place.name || "Selected location";
          const near = markersRef.current.find(
            (m) => Math.abs(m.lat - lat) < 0.0008 && Math.abs(m.lng - lng) < 0.0008
          );
          if (near) {
            onSelectRef.current(near);
          } else {
            onGeocodeRef.current?.({ lat, lng, label });
          }
          setQuery(label);
          setOpen(false);
        });
        setPlacesReady(true);
        setPlacesError(null);
      } catch (err) {
        setPlacesError(err instanceof Error ? err.message : "Maps search unavailable");
      }
    })();
    return () => {
      cancelled = true;
      if (autocompleteRef.current && window.google?.maps?.event) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      autocompleteRef.current = null;
    };
  }, []);

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
        body: JSON.stringify({
          address: query.trim(),
          bias: SERVICE_CENTER,
          region: "us",
        }),
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
          placeholder={placesReady ? "Search customer name, address, phone…" : "Search markers or address…"}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            fontSize: 14,
            outline: "none",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
          aria-label="Search map"
        />
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "10px 14px",
            background: "#0d9488",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 13,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "…" : "Go"}
        </button>
      </form>
      {placesError && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#b45309" }}>
          Address suggestions limited — {placesError}. Marker / customer search still works.
        </div>
      )}
      {open && localHits.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 50,
            maxHeight: 280,
            overflow: "auto",
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
                padding: "10px 12px",
                border: "none",
                borderBottom: "1px solid #f3f4f6",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{hit.label}</div>
              {hit.sublabel && (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{hit.sublabel}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
