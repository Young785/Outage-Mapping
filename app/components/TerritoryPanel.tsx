/**
 * TerritoryPanel — boundaries/zones management
 *
 * Supports:
 * - zip territories
 * - polygon zones (territory / priority / exclusion)
 * - click-to-draw + editable polygon boundaries (no deprecated DrawingManager)
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { loadGoogleMaps, triggerMapResize } from "@/lib/google-maps";
import ZipCodePicker from "./ZipCodePicker";

type ZoneType = "territory" | "priority" | "exclusion";
type LatLng = { lat: number; lng: number };

type Territory = {
  id: string;
  name: string;
  type: "zip" | "polygon";
  geometry?: any;
  zip_codes: string[] | null;
  created_at: string;
};

type Tech = {
  userId: string;
  name: string;
  email: string;
  status: string;
  territoryId: string | null;
};

type Props = {
  token: string;
  role: string;
};

const MAP_CENTER = { lat: 44.9778, lng: -93.265 };

function zoneTypeOf(t: Territory): ZoneType {
  const z = t.geometry?.properties?.zoneType;
  if (z === "priority" || z === "exclusion") return z;
  return "territory";
}

function zoneColor(z: ZoneType): string {
  if (z === "exclusion") return "#ef4444";
  if (z === "priority") return "#f59e0b";
  return "#0d9488";
}

export default function TerritoryPanel({ token, role }: Props) {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tName, setTName] = useState("");
  const [tMode, setTMode] = useState<"zip" | "polygon">("zip");
  const [tZoneType, setTZoneType] = useState<ZoneType>("territory");
  const [tZips, setTZips] = useState<string[]>([]);
  const [polygonPath, setPolygonPath] = useState<LatLng[]>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [assigningTech, setAssigningTech] = useState<string | null>(null);
  const [assignTerritory, setAssignTerritory] = useState<string>("");
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<google.maps.Map | null>(null);
  const editablePolyRef = useRef<google.maps.Polygon | null>(null);
  const previewPolylineRef = useRef<google.maps.Polyline | null>(null);
  const drawClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const pathListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const draftVerticesRef = useRef<LatLng[]>([]);
  const draftMarkersRef = useRef<google.maps.Marker[]>([]);
  const polygonDragListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const mapInitGen = useRef(0);

  const isOffice = role === "office" || role === "admin" || role === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, techRes] = await Promise.all([
        fetch("/api/territories", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/techs", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const tData = await tRes.json();
      const techData = await techRes.json();
      setTerritories(tData.territories ?? []);
      setTechs(
        (techData.techs ?? []).map((t: any) => ({
          userId: t.userId,
          name: t.name,
          email: t.email,
          status: t.status,
          territoryId: t.territoryId ?? null,
        }))
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function clearPathListeners() {
    pathListenersRef.current.forEach((l) => google.maps.event.removeListener(l));
    pathListenersRef.current = [];
  }

  function attachPathSyncListeners(polygon: google.maps.Polygon) {
    clearPathListeners();
    const syncPath = () => {
      const path =
        polygon
          .getPath()
          .getArray()
          .map((p) => ({ lat: p.lat(), lng: p.lng() })) ?? [];
      setPolygonPath(path);
    };
    const path = polygon.getPath();
    pathListenersRef.current = [
      google.maps.event.addListener(path, "insert_at", syncPath),
      google.maps.event.addListener(path, "set_at", syncPath),
      google.maps.event.addListener(path, "remove_at", syncPath),
    ];
    syncPath();
  }

  function clearDraftMarkers() {
    draftMarkersRef.current.forEach((m) => m.setMap(null));
    draftMarkersRef.current = [];
  }

  function refreshDraftOverlay() {
    const verts = draftVerticesRef.current;
    setPolygonPath([...verts]);
    previewPolylineRef.current?.setPath(verts);
  }

  function stopDrawingMode() {
    setIsDrawingPolygon(false);
    mapObj.current?.setOptions({ draggable: true, draggableCursor: null, draggingCursor: null });
    if (drawClickListenerRef.current) {
      google.maps.event.removeListener(drawClickListenerRef.current);
      drawClickListenerRef.current = null;
    }
    if (previewPolylineRef.current) {
      previewPolylineRef.current.setMap(null);
      previewPolylineRef.current = null;
    }
    clearDraftMarkers();
    draftVerticesRef.current = [];
  }

  function teardownMap() {
    stopDrawingMode();
    clearPathListeners();
    if (polygonDragListenerRef.current) {
      google.maps.event.removeListener(polygonDragListenerRef.current);
      polygonDragListenerRef.current = null;
    }
    if (editablePolyRef.current) {
      editablePolyRef.current.setMap(null);
      editablePolyRef.current = null;
    }
    mapObj.current = null;
    setMapReady(false);
  }

  function resetForm() {
    setEditingId(null);
    setTName("");
    setTMode("zip");
    setTZoneType("territory");
    setTZips([]);
    setPolygonPath([]);
    setMapLoadError(null);
    stopDrawingMode();
    clearPathListeners();
    if (editablePolyRef.current) {
      editablePolyRef.current.setMap(null);
      editablePolyRef.current = null;
    }
  }

  function createEditablePolygon(path: LatLng[]) {
    if (!mapObj.current || path.length < 3) return;
    stopDrawingMode();
    if (polygonDragListenerRef.current) {
      google.maps.event.removeListener(polygonDragListenerRef.current);
      polygonDragListenerRef.current = null;
    }
    if (editablePolyRef.current) {
      editablePolyRef.current.setMap(null);
      editablePolyRef.current = null;
    }
    mapObj.current.setOptions({ draggable: true });
    const color = zoneColor(tZoneType);
    editablePolyRef.current = new google.maps.Polygon({
      map: mapObj.current,
      paths: path,
      editable: true,
      draggable: true,
      fillColor: color,
      fillOpacity: 0.15,
      strokeColor: color,
      strokeOpacity: 0.95,
      strokeWeight: 2,
    });
    attachPathSyncListeners(editablePolyRef.current);
    polygonDragListenerRef.current = google.maps.event.addListener(
      editablePolyRef.current,
      "dragend",
      () => {
        if (!editablePolyRef.current) return;
        const synced =
          editablePolyRef.current
            .getPath()
            .getArray()
            .map((p) => ({ lat: p.lat(), lng: p.lng() })) ?? [];
        setPolygonPath(synced);
      }
    );
  }

  // Initialize polygon draw map when form is visible
  useEffect(() => {
    if (!showForm || tMode !== "polygon") {
      return;
    }

    const gen = ++mapInitGen.current;
    let cancelled = false;
    setMapLoadError(null);
    setMapReady(false);

    async function initTerritoryMap() {
      try {
        await loadGoogleMaps();
        if (cancelled || gen !== mapInitGen.current || !mapRef.current) return;

        if (!mapObj.current) {
          mapObj.current = new google.maps.Map(mapRef.current, {
            center: MAP_CENTER,
            zoom: 10,
            mapTypeId: "roadmap",
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: false,
          });
        }

        if (editablePolyRef.current) {
          editablePolyRef.current.setOptions({
            fillColor: zoneColor(tZoneType),
            strokeColor: zoneColor(tZoneType),
          });
        }
        if (previewPolylineRef.current) {
          previewPolylineRef.current.setOptions({ strokeColor: zoneColor(tZoneType) });
        }

        if (cancelled || gen !== mapInitGen.current) return;

        setMapReady(true);
        const resizeDelays = [0, 100, 300];
        resizeDelays.forEach((ms) => {
          window.setTimeout(() => {
            if (gen === mapInitGen.current) triggerMapResize(mapObj.current);
          }, ms);
        });
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Map failed to load";
          setMapLoadError(msg);
        }
      }
    }

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) initTerritoryMap();
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [showForm, tMode, tZoneType]);

  // Restore polygon when editing
  useEffect(() => {
    if (!showForm || tMode !== "polygon" || !mapReady || !mapObj.current || polygonPath.length < 3) return;
    if (editablePolyRef.current || isDrawingPolygon) return;

    createEditablePolygon(polygonPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, tMode, mapReady, polygonPath.length, isDrawingPolygon]);

  function addDraftVertex(point: LatLng, index: number) {
    if (!mapObj.current) return;
    const color = zoneColor(tZoneType);
    const marker = new google.maps.Marker({
      position: point,
      map: mapObj.current,
      draggable: true,
      optimized: false,
      zIndex: 2,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#fff",
        fillOpacity: 1,
        strokeColor: color,
        strokeWeight: 2,
      },
    });
    marker.addListener("drag", () => {
      const pos = marker.getPosition();
      if (!pos) return;
      draftVerticesRef.current[index] = { lat: pos.lat(), lng: pos.lng() };
      refreshDraftOverlay();
    });
    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (!pos) return;
      draftVerticesRef.current[index] = { lat: pos.lat(), lng: pos.lng() };
      refreshDraftOverlay();
    });
    draftMarkersRef.current[index] = marker;
  }

  function undoLastPolygonPoint() {
    if (draftVerticesRef.current.length === 0) return;
    draftVerticesRef.current.pop();
    const removed = draftMarkersRef.current.pop();
    removed?.setMap(null);
    refreshDraftOverlay();
    setError(null);
  }

  function startPolygonDraw() {
    if (!mapObj.current || !mapReady) {
      setError("Map is still loading. Wait a moment, then try Draw Polygon again.");
      return;
    }
    if (editablePolyRef.current) {
      editablePolyRef.current.setMap(null);
      editablePolyRef.current = null;
    }
    if (polygonDragListenerRef.current) {
      google.maps.event.removeListener(polygonDragListenerRef.current);
      polygonDragListenerRef.current = null;
    }
    clearPathListeners();
    stopDrawingMode();

    const color = zoneColor(tZoneType);
    draftVerticesRef.current = [];
    setPolygonPath([]);
    setIsDrawingPolygon(true);
    mapObj.current.setOptions({
      draggable: false,
      draggableCursor: "crosshair",
      draggingCursor: "crosshair",
    });

    previewPolylineRef.current = new google.maps.Polyline({
      map: mapObj.current,
      path: [],
      strokeColor: color,
      strokeOpacity: 0.95,
      strokeWeight: 2,
      clickable: false,
    });

    drawClickListenerRef.current = mapObj.current.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const point = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      const index = draftVerticesRef.current.length;
      draftVerticesRef.current = [...draftVerticesRef.current, point];
      addDraftVertex(point, index);
      refreshDraftOverlay();
    });
  }

  // Ctrl+Z / Cmd+Z — undo last corner while drawing
  useEffect(() => {
    if (!isDrawingPolygon) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undoLastPolygonPoint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawingPolygon]);

  function finishPolygonDraw() {
    if (draftVerticesRef.current.length < 3) {
      setError("Add at least 3 points before finishing the polygon.");
      return;
    }
    setError(null);
    createEditablePolygon(draftVerticesRef.current);
  }

  function cancelPolygonDraw() {
    stopDrawingMode();
    setPolygonPath([]);
    if (editablePolyRef.current) {
      editablePolyRef.current.setMap(null);
      editablePolyRef.current = null;
    }
    clearPathListeners();
  }

  async function saveTerritory(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (!tName.trim()) throw new Error("Territory name is required");

      const payload: Record<string, unknown> = {
        name: tName.trim(),
        type: tMode,
      };

      if (tMode === "zip") {
        const zipCodes = tZips.filter((z) => /^\d{5}$/.test(z));
        if (zipCodes.length === 0) throw new Error("Add at least one valid 5-digit zip code");
        payload.zipCodes = zipCodes;
        payload.geometry = { properties: { zoneType: tZoneType } };
      } else {
        if (polygonPath.length < 3) throw new Error("Draw a polygon with at least 3 points");
        const ring = polygonPath.map((p) => [p.lng, p.lat]);
        ring.push([polygonPath[0].lng, polygonPath[0].lat]);
        payload.geometry = {
          type: "Polygon",
          coordinates: [ring],
          properties: { zoneType: tZoneType },
        };
        payload.zipCodes = null;
      }

      const method = editingId ? "PATCH" : "POST";
      const body = editingId ? { ...payload, id: editingId } : payload;
      const res = await fetch("/api/territories", {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess(editingId ? "Boundary updated." : "Boundary created.");
      resetForm();
      setShowForm(false);
      teardownMap();
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTerritory(id: string) {
    if (!confirm("Delete this boundary?")) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/territories?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setSuccess("Boundary deleted.");
      if (editingId === id) {
        resetForm();
        setShowForm(false);
        teardownMap();
      }
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(t: Territory) {
    setShowForm(true);
    setEditingId(t.id);
    setTName(t.name);
    setTMode(t.type);
    setTZips(t.zip_codes ?? []);
    setTZoneType(zoneTypeOf(t));
    stopDrawingMode();
    clearPathListeners();
    if (editablePolyRef.current) {
      editablePolyRef.current.setMap(null);
      editablePolyRef.current = null;
    }
    if (t.type === "polygon" && t.geometry?.coordinates?.[0]) {
      const path = (t.geometry.coordinates[0] as number[][])
        .slice(0, -1)
        .map(([lng, lat]) => ({ lat, lng }));
      setPolygonPath(path);
    } else {
      setPolygonPath([]);
    }
  }

  async function assignTechTerritory(techId: string, territoryId: string) {
    setAssigningTech(techId);
    setError(null);
    try {
      const res = await fetch("/api/techs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "assign_territory", techId, territoryId: territoryId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to assign territory");
      setSuccess("Territory assigned");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigningTech(null);
      setAssignTerritory("");
    }
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: "48px", color: "#6b7280" }}>Loading boundaries…</div>;
  }

  return (
    <div style={{ maxWidth: "900px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#1f2937" }}>Boundaries & Territories</h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>
            Draw/edit custom polygons for territories, priority zones, and permanent exclusions.
          </p>
        </div>
        {isOffice && (
          <button
            onClick={() => {
              const next = !showForm;
              setShowForm(next);
              if (!next) {
                resetForm();
                teardownMap();
              }
            }}
            style={{ padding: "8px 16px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            + New Boundary
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px", color: "#dc2626", fontSize: "13px", marginBottom: "16px" }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: "12px 16px", background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: "8px", color: "#065f46", fontSize: "13px", marginBottom: "16px" }}>
          {success}
        </div>
      )}

      {showForm && isOffice && (
        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "20px", marginBottom: "24px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 600, color: "#1f2937" }}>
            {editingId ? "Edit Boundary" : "Create Boundary"}
          </h3>
          <form onSubmit={saveTerritory}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "10px", marginBottom: "12px" }}>
              <input
                value={tName}
                onChange={(e) => setTName(e.target.value)}
                required
                placeholder="Boundary name"
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" }}
              />
              <select value={tMode} onChange={(e) => setTMode(e.target.value as "zip" | "polygon")} style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px" }}>
                <option value="zip">ZIP Boundary</option>
                <option value="polygon">Polygon Boundary</option>
              </select>
              <select value={tZoneType} onChange={(e) => setTZoneType(e.target.value as ZoneType)} style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px" }}>
                <option value="territory">Territory</option>
                <option value="priority">Priority Zone</option>
                <option value="exclusion">Exclusion Zone</option>
              </select>
            </div>

            {tMode === "zip" ? (
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
                  Zip codes
                </label>
                <ZipCodePicker
                  value={tZips}
                  onChange={setTZips}
                  placeholder="Search zip code (e.g. 55401)…"
                />
              </div>
            ) : (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", gap: "8px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>
                    Click corners, drag handles to adjust, Ctrl+Z to undo. After Finish — drag shape or corners.
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={startPolygonDraw}
                      disabled={!mapReady || isDrawingPolygon}
                      style={{
                        padding: "7px 12px",
                        background: mapReady && !isDrawingPolygon ? "#0ea5e9" : "#9ca3af",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: mapReady && !isDrawingPolygon ? "pointer" : "not-allowed",
                      }}
                    >
                      Draw Polygon
                    </button>
                    {isDrawingPolygon && (
                      <>
                        <button
                          type="button"
                          onClick={finishPolygonDraw}
                          disabled={polygonPath.length < 3}
                          style={{
                            padding: "7px 12px",
                            background: polygonPath.length >= 3 ? "#0d9488" : "#9ca3af",
                            color: "#fff",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: polygonPath.length >= 3 ? "pointer" : "not-allowed",
                          }}
                        >
                          Finish Polygon
                        </button>
                        <button
                          type="button"
                          onClick={undoLastPolygonPoint}
                          disabled={polygonPath.length === 0}
                          title="Undo last point (Ctrl+Z)"
                          style={{
                            padding: "7px 12px",
                            background: polygonPath.length > 0 ? "#f3f4f6" : "#e5e7eb",
                            color: "#374151",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: polygonPath.length > 0 ? "pointer" : "not-allowed",
                          }}
                        >
                          Undo
                        </button>
                        <button
                          type="button"
                          onClick={cancelPolygonDraw}
                          style={{
                            padding: "7px 12px",
                            background: "#e5e7eb",
                            color: "#374151",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ position: "relative" }}>
                  <div
                    ref={mapRef}
                    style={{ width: "100%", height: "320px", borderRadius: "10px", border: "1px solid #d1d5db", background: "#e5e7eb" }}
                  />
                  {!mapReady && !mapLoadError && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(255,255,255,0.85)",
                        borderRadius: "10px",
                        fontSize: "14px",
                        color: "#6b7280",
                      }}
                    >
                      Loading map…
                    </div>
                  )}
                  {mapLoadError && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "16px",
                        background: "#fef2f2",
                        borderRadius: "10px",
                        fontSize: "13px",
                        color: "#b91c1c",
                        textAlign: "center",
                      }}
                    >
                      {mapLoadError}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: "6px", fontSize: "11px", color: "#6b7280" }}>
                  {isDrawingPolygon
                    ? `${polygonPath.length} point${polygonPath.length === 1 ? "" : "s"} — drag handles, Ctrl+Z undo, then Finish Polygon (min 3)`
                    : polygonPath.length > 0
                      ? `${polygonPath.length} vertices — drag corners or move the whole shape`
                      : "No polygon drawn yet — click Draw Polygon, then click corners on the map"}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "8px" }}>
              <button type="submit" disabled={saving} style={{ padding: "9px 18px", background: saving ? "#9ca3af" : "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Boundary"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                  teardownMap();
                }}
                style={{ padding: "9px 18px", background: "#e5e7eb", border: "none", borderRadius: "8px", fontSize: "14px", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ marginBottom: "28px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>
          Boundaries ({territories.length})
        </h3>
        {territories.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", background: "#f9fafb", borderRadius: "12px", color: "#9ca3af", fontSize: "14px" }}>
            No boundaries defined yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {territories.map((t) => {
              const assignedTechs = techs.filter((tech) => tech.territoryId === t.id);
              const zt = zoneTypeOf(t);
              return (
                <div key={t.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "14px", color: "#1f2937" }}>{t.name}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                        {t.type === "zip"
                          ? `ZIP: ${t.zip_codes?.join(", ") || "—"}`
                          : `Polygon boundary (${t.geometry?.coordinates?.[0]?.length ? t.geometry.coordinates[0].length - 1 : 0} points)`}
                      </div>
                      {assignedTechs.length > 0 && (
                        <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {assignedTechs.map((tech) => (
                            <span key={tech.userId} style={{ fontSize: "12px", padding: "3px 10px", background: "#eff6ff", color: "#1d4ed8", borderRadius: "12px" }}>
                              {tech.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "11px", padding: "3px 8px", background: "#f3f4f6", color: zoneColor(zt), borderRadius: "12px", fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        {zt}
                      </span>
                      {isOffice && (
                        <>
                          <button type="button" onClick={() => beginEdit(t)} style={{ padding: "6px 10px", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}>
                            Edit
                          </button>
                          <button type="button" onClick={() => deleteTerritory(t.id)} style={{ padding: "6px 10px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isOffice && techs.length > 0 && (
        <div>
          <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" }}>
            Assign Techs to Territories
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {techs.map((tech) => {
              const current = territories.find((t) => t.id === tech.territoryId);
              return (
                <div key={tech.userId} style={{ display: "flex", alignItems: "center", gap: "12px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 16px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "#1f2937" }}>{tech.name}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>
                      {current ? `Currently: ${current.name}` : "No territory assigned"}
                    </div>
                  </div>
                  <select
                    value={assigningTech === tech.userId ? assignTerritory : tech.territoryId ?? ""}
                    onChange={(e) => {
                      setAssignTerritory(e.target.value);
                      assignTechTerritory(tech.userId, e.target.value);
                    }}
                    disabled={assigningTech === tech.userId}
                    style={{ padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: "7px", fontSize: "13px", color: "#374151", minWidth: "160px" }}
                  >
                    <option value="">— Unassigned —</option>
                    {territories.filter((t) => zoneTypeOf(t) === "territory").map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
