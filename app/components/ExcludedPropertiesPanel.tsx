/**
 * Permanent excluded-properties manager + MetroGIS land-use scan (R1/R2/R3 target).
 */

"use client";

import { useCallback, useEffect, useState } from "react";

type ExcludedProperty = {
  id: string;
  address?: string | null;
  lat: number;
  lng: number;
  radius_meters?: number | null;
  county_pin?: string | null;
  use_class?: string | null;
  reason?: string | null;
  source?: string | null;
  notes?: string | null;
  duration?: string | null;
  is_active?: boolean | null;
  created_at?: string;
};

type ScanRow = {
  outageId?: string;
  address?: string | null;
  status?: string;
  useClass?: string;
  gisClassification?: string;
  reason?: string | null;
  duration?: string | null;
  countyPin?: string | null;
  numUnits?: number | null;
};

type Props = {
  token: string;
  onSessionExpired?: (message?: string) => void;
  onChanged?: () => void;
};

function apiErrorMessage(res: Response, data: { error?: string }, fallback: string): string {
  if (res.status === 401) return data.error || "Session expired — please sign in again.";
  return data.error || fallback;
}

export default function ExcludedPropertiesPanel({ token, onSessionExpired, onChanged }: Props) {
  const [rows, setRows] = useState<ExcludedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("Permanent exclusion");
  const [scanSummary, setScanSummary] = useState<string | null>(null);
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/excluded-properties", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) onSessionExpired?.(apiErrorMessage(res, data, "Session expired"));
        throw new Error(apiErrorMessage(res, data, "Failed to load exclusions"));
      }
      setRows(data.excludedProperties ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    load();
  }, [load]);

  async function addByAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const geoRes = await fetch("/api/geocode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ address: address.trim() }),
      });
      const geo = await geoRes.json();
      if (!geoRes.ok) throw new Error(geo.error || "Could not geocode address");

      let useClass: string | null = null;
      let countyPin: string | null = null;
      let parcelReason = reason.trim() || "Permanent exclusion";

      try {
        const parcelRes = await fetch("/api/parcels/lookup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ lat: geo.lat, lng: geo.lng }),
        });
        const parcel = await parcelRes.json();
        if (parcel.classification) {
          useClass = parcel.classification.useClassLabel;
          countyPin = parcel.classification.countyPin;
          if (!parcel.classification.isTargetResidential && parcel.classification.excludeReason) {
            parcelReason = parcel.classification.excludeReason;
          }
        }
      } catch {
        /* parcel lookup optional */
      }

      const res = await fetch("/api/excluded-properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          address: geo.formattedAddress || address.trim(),
          lat: geo.lat,
          lng: geo.lng,
          reason: parcelReason,
          source: "manual",
          useClass,
          countyPin,
          radiusMeters: 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) onSessionExpired?.(apiErrorMessage(res, data, "Session expired"));
        throw new Error(apiErrorMessage(res, data, "Failed to save exclusion"));
      }
      setAddress("");
      setSuccess("Property added to permanent exclusions");
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function overrideRow(id: string) {
    if (!confirm("Restore this property to the storm map? This overrides the automatic GIS exclusion.")) return;
    setError(null);
    try {
      const res = await fetch("/api/excluded-properties", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, is_active: false, notes: "Office override of automatic GIS exclusion" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) onSessionExpired?.(apiErrorMessage(res, data, "Session expired"));
        throw new Error(apiErrorMessage(res, data, "Failed to override"));
      }
      setSuccess("Exclusion overridden — property can appear on the map again");
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function removeRow(id: string) {
    if (!confirm("Remove this permanent exclusion?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/excluded-properties?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) onSessionExpired?.(apiErrorMessage(res, data, "Session expired"));
        throw new Error(apiErrorMessage(res, data, "Failed to remove"));
      }
      setSuccess("Exclusion removed");
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function runParcelScan(dryRun: boolean) {
    setScanning(true);
    setError(null);
    setScanSummary(null);
    try {
      const res = await fetch("/api/parcels/classify-outages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ limit: 80, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) onSessionExpired?.(apiErrorMessage(res, data, "Session expired"));
        throw new Error(apiErrorMessage(res, data, "Parcel scan failed"));
      }
      const s = data.summary;
      setScanRows(s.results ?? s.samples ?? []);
      setScanSummary(
        `${dryRun ? "Dry run" : "Scan"}: ${s.scanned} checked · ${s.targetResidential} R1–R3 target · ` +
          `${s.autoExcluded} ${dryRun ? "would exclude" : "excluded"} · ${s.notFound} no parcel · ` +
          `${s.unavailable} MetroGIS unavailable · ${s.alreadyExcluded} already excluded`
      );
      if (!dryRun) {
        setSuccess(`Added ${s.autoExcluded} non-target parcels to permanent exclusions`);
        await load();
        onChanged?.();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "20px",
        marginBottom: "28px",
      }}
    >
      <div style={{ marginBottom: "14px" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1f2937" }}>
          Permanent excluded properties
        </h3>
        <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#6b7280", lineHeight: 1.45 }}>
          Verify GIS exclusions here: which property, why, which land-use class, and whether it is
          permanent. Office can override an incorrect automatic exclusion with Restore to map.
          Red <strong>E</strong> markers on the Live Map are the same list.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 12px",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#dc2626",
            fontSize: "13px",
            marginBottom: "12px",
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            padding: "10px 12px",
            background: "#d1fae5",
            border: "1px solid #a7f3d0",
            borderRadius: "8px",
            color: "#065f46",
            fontSize: "13px",
            marginBottom: "12px",
          }}
        >
          {success}
        </div>
      )}
      {scanSummary && (
        <div
          style={{
            padding: "10px 12px",
            background: "#f0f9ff",
            border: "1px solid #bae6fd",
            borderRadius: "8px",
            color: "#0c4a6e",
            fontSize: "12px",
            marginBottom: "12px",
          }}
        >
          {scanSummary}
        </div>
      )}
      {scanRows.length > 0 && (
        <div
          style={{
            marginBottom: "14px",
            maxHeight: 240,
            overflowY: "auto",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
          }}
        >
          {scanRows.map((row, i) => (
            <div
              key={`${row.outageId ?? i}-${row.status}`}
              style={{
                padding: "8px 10px",
                borderBottom: "1px solid #f3f4f6",
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600, color: "#111827" }}>
                {row.address || `Outage ${row.outageId ?? i + 1}`}
              </div>
              <div style={{ color: "#6b7280", marginTop: 2 }}>
                {[
                  row.status,
                  row.reason,
                  row.gisClassification || row.useClass,
                  row.duration ? `${row.duration} exclusion` : null,
                  row.countyPin ? `PIN ${row.countyPin}` : null,
                  row.numUnits != null ? `${row.numUnits} units` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={addByAddress}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "14px",
          alignItems: "stretch",
        }}
      >
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street address to exclude…"
          required
          style={{
            flex: "1 1 220px",
            padding: "10px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          style={{
            flex: "0 1 180px",
            padding: "10px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        />
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "10px 16px",
            background: saving ? "#9ca3af" : "#0d9488",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {saving ? "Adding…" : "Add exclusion"}
        </button>
      </form>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        <button
          type="button"
          disabled={scanning}
          onClick={() => runParcelScan(true)}
          style={{
            padding: "8px 12px",
            background: "#f3f4f6",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: scanning ? "not-allowed" : "pointer",
            color: "#374151",
          }}
        >
          Dry-run MetroGIS scan
        </button>
        <button
          type="button"
          disabled={scanning}
          onClick={() => runParcelScan(false)}
          style={{
            padding: "8px 12px",
            background: scanning ? "#9ca3af" : "#b45309",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: scanning ? "not-allowed" : "pointer",
          }}
        >
          {scanning ? "Scanning…" : "Auto-exclude non-R1/R2/R3 parcels"}
        </button>
        <a
          href="https://metrocouncil.org/Data-and-Maps/MetroGIS.aspx"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: "12px", color: "#0d9488", alignSelf: "center" }}
        >
          MetroGIS data source
        </a>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280", fontSize: "13px", padding: "12px 0" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: "24px",
            textAlign: "center",
            background: "#f9fafb",
            borderRadius: "10px",
            color: "#9ca3af",
            fontSize: "13px",
          }}
        >
          No permanent exclusions yet. Add an address or run a MetroGIS scan.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: 360, overflowY: "auto" }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                padding: "10px 12px",
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#1f2937" }}>
                  {r.address || `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`}
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: 2 }}>
                  {[
                    r.reason,
                    r.use_class ? `GIS: ${r.use_class}` : null,
                    r.duration === "temporary" ? "Temporary" : "Permanent",
                    r.source,
                    r.county_pin ? `PIN ${r.county_pin}` : null,
                    r.is_active === false ? "Overridden" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {r.is_active !== false && (
                  <button
                    type="button"
                    onClick={() => overrideRow(r.id)}
                    style={{
                      padding: "6px 10px",
                      background: "#fff",
                      border: "1px solid #99f6e4",
                      borderRadius: "6px",
                      color: "#0f766e",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      height: "fit-content",
                    }}
                  >
                    Restore to map
                  </button>
                )}
              <button
                type="button"
                onClick={() => removeRow(r.id)}
                style={{
                  padding: "6px 10px",
                  background: "#fff",
                  border: "1px solid #fecaca",
                  borderRadius: "6px",
                  color: "#dc2626",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  flexShrink: 0,
                  height: "fit-content",
                }}
              >
                Remove
              </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
