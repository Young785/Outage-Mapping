"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { parseAddressComponents } from "@/lib/parseAddress";

export type AddressValue = {
  street: string;
  city: string;
  state: string;
  zip: string;
  lat?: number | null;
  lng?: number | null;
};

type Props = {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  /** Show inline mini-map to pick location */
  enableMapPicker?: boolean;
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: "14px",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  outline: "none",
  boxSizing: "border-box",
};

export default function AddressFields({
  value,
  onChange,
  enableMapPicker = true,
}: Props) {
  const streetRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  const [placesReady, setPlacesReady] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  const patch = useCallback(
    (partial: Partial<AddressValue>) => onChange({ ...value, ...partial }),
    [onChange, value]
  );

  // Google Places autocomplete on street field
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !streetRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const loader = new Loader({
          apiKey: key,
          version: "weekly",
          libraries: ["places"],
        });
        await loader.load();
        if (cancelled || !streetRef.current) return;

        const ac = new google.maps.places.Autocomplete(streetRef.current, {
          componentRestrictions: { country: "us" },
          fields: ["address_components", "formatted_address", "geometry"],
          types: ["address"],
        });

        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place.address_components) return;
          const parsed = parseAddressComponents(
            place.address_components as Parameters<typeof parseAddressComponents>[0]
          );
          const lat = place.geometry?.location?.lat();
          const lng = place.geometry?.location?.lng();
          onChangeRef.current({
            street: parsed.street || place.formatted_address?.split(",")[0]?.trim() || "",
            city: parsed.city,
            state: parsed.state,
            zip: parsed.zip,
            lat: lat ?? null,
            lng: lng ?? null,
          });
        });

        autocompleteRef.current = ac;
        setPlacesReady(true);
      } catch {
        /* autocomplete optional if API unavailable */
      }
    })();

    return () => {
      cancelled = true;
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      autocompleteRef.current = null;
    };
  }, []);

  // Mini map for click-to-set address
  useEffect(() => {
    if (!showMap || !mapDivRef.current) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;

    let cancelled = false;
    setMapLoading(true);

    (async () => {
      try {
        const loader = new Loader({ apiKey: key, version: "weekly" });
        await loader.load();
        if (cancelled || !mapDivRef.current) return;

        const center =
          value.lat != null && value.lng != null
            ? { lat: value.lat, lng: value.lng }
            : { lat: 44.9778, lng: -93.265 };

        const map = new google.maps.Map(mapDivRef.current, {
          center,
          zoom: value.lat != null ? 14 : 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapObjRef.current = map;

        if (value.lat != null && value.lng != null) {
          markerRef.current = new google.maps.Marker({ map, position: center });
        }

        map.addListener("click", async (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          markerRef.current?.setMap(null);
          markerRef.current = new google.maps.Marker({ map, position: { lat, lng } });
          patch({ lat, lng });

          setGeoBusy(true);
          try {
            const res = await fetch("/api/geocode", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lat, lng }),
            });
            const data = await res.json();
            if (res.ok && data.address) {
              const a = data.address;
              const streetFromFormatted =
                a.formattedAddress?.split(",")[0]?.trim() || value.street;
              onChange({
                street: streetFromFormatted,
                city: a.city ?? value.city,
                state: a.state ?? value.state,
                zip: a.postalCode ?? value.zip,
                lat,
                lng,
              });
            }
          } finally {
            setGeoBusy(false);
          }
        });
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapObjRef.current = null;
    };
  }, [showMap, value.lat, value.lng, patch, onChange, value.street, value.city, value.state, value.zip]);

  return (
    <div>
      <div style={{ marginBottom: "12px" }}>
        <label style={labelStyle}>
          Street Address <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <input
          ref={streetRef}
          type="text"
          value={value.street}
          onChange={(e) => patch({ street: e.target.value })}
          placeholder={placesReady ? "Start typing to search…" : "123 Main St"}
          required
          style={inputStyle}
          autoComplete="off"
        />
        {placesReady && (
          <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#6b7280" }}>
            Live address search — selects city, state, and ZIP automatically
          </p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", gap: "10px", marginBottom: "12px" }}>
        <div>
          <label style={labelStyle}>City <span style={{ color: "#ef4444" }}>*</span></label>
          <input
            type="text"
            value={value.city}
            onChange={(e) => patch({ city: e.target.value })}
            required
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>State <span style={{ color: "#ef4444" }}>*</span></label>
          <input
            type="text"
            value={value.state}
            onChange={(e) => patch({ state: e.target.value.toUpperCase() })}
            maxLength={2}
            required
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>ZIP <span style={{ color: "#ef4444" }}>*</span></label>
          <input
            type="text"
            value={value.zip}
            onChange={(e) => patch({ zip: e.target.value.replace(/\D/g, "").slice(0, 5) })}
            required
            style={inputStyle}
            maxLength={5}
            inputMode="numeric"
          />
        </div>
      </div>

      {enableMapPicker && (
        <div style={{ marginBottom: "16px" }}>
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            style={{
              padding: "8px 14px",
              background: showMap ? "#e5e7eb" : "#f0fdfa",
              color: "#0d9488",
              border: "1px solid #99f6e4",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {showMap ? "Hide map" : "Pick location on map"}
          </button>
          {geoBusy && (
            <span style={{ marginLeft: "10px", fontSize: "12px", color: "#6b7280" }}>Looking up address…</span>
          )}
          {showMap && (
            <div
              ref={mapDivRef}
              style={{
                marginTop: "10px",
                height: "200px",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                background: mapLoading ? "#f3f4f6" : undefined,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
