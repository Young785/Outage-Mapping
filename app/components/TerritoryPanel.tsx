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
import ExcludedPropertiesPanel from "./ExcludedPropertiesPanel";
import {
  DISPATCH_ROLE_LABELS,
  type FieldDispatchRole,
  type InstallerFallback,
} from "@/lib/field-dispatch-role";
import { isAssignableTerritory, assignableTerritoryLabel } from "@/lib/territory-match";

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
  dispatchRole: FieldDispatchRole;
  installerFallback: InstallerFallback;
};

type Props = {
  token: string;
  role: string;
  onSessionExpired?: (message?: string) => void;
  onExclusionsChanged?: () => void;
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

function apiErrorMessage(res: Response, data: { error?: string }, fallback: string): string {
  if (res.status === 401) {
    return data.error || "Session expired — please sign in again.";
  }
  return data.error || fallback;
}

export default function TerritoryPanel({
  token,
  role,
  onSessionExpired,
  onExclusionsChanged,
}: Props) {
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
  const [assigningRole, setAssigningRole] = useState<string | null>(null);
  const [assignTerritory, setAssignTerritory] = useState<string>("");
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [showLayerTerritory, setShowLayerTerritory] = useState(true);
  const [showLayerPriority, setShowLayerPriority] = useState(true);
  const [showLayerExclusion, setShowLayerExclusion] = useState(true);
  const [overviewMode, setOverviewMode] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<google.maps.Map | null>(null);
  const editablePolyRef = useRef<google.maps.Polygon | null>(null);
  const previewPolylineRef = useRef<google.maps.Polyline | null>(null);
  const drawClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const pathListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const draftVerticesRef = useRef<LatLng[]>([]);
  const draftMarkersRef = useRef<google.maps.Marker[]>([]);
  const polygonDragListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const contextPolysRef = useRef<google.maps.Polygon[]>([]);
  const contextLabelsRef = useRef<google.maps.Marker[]>([]);
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
          dispatchRole: t.dispatchRole ?? "hunter",
          installerFallback: t.installerFallback ?? "hunter",
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
    mapObj.current?.setOptions({
      draggable: true,
      draggableCursor: null,
      draggingCursor: null,
      disableDoubleClickZoom: false,
    });
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

  function clearContextOverlays() {
    contextPolysRef.current.forEach((p) => p.setMap(null));
    contextPolysRef.current = [];
    contextLabelsRef.current.forEach((m) => m.setMap(null));
    contextLabelsRef.current = [];
  }

  function teardownMap() {
    stopDrawingMode();
    clearPathListeners();
    clearContextOverlays();
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
    setOverviewMode(false);
  }

  function resetForm() {
    setEditingId(null);
    setTName("");
    setTMode("zip");
    setTZoneType("territory");
    setTZips([]);
    setPolygonPath([]);
    setMapExpanded(false);
    setMapLoadError(null);
    setOverviewMode(false);
    stopDrawingMode();
    clearPathListeners();
    clearContextOverlays();
    if (editablePolyRef.current) {
      editablePolyRef.current.setMap(null);
      editablePolyRef.current = null;
    }
  }

  function ringCentroid(path: LatLng[]): LatLng | null {
    if (path.length === 0) return null;
    let lat = 0;
    let lng = 0;
    for (const p of path) {
      lat += p.lat;
      lng += p.lng;
    }
    return { lat: lat / path.length, lng: lng / path.length };
  }

  function syncContextOverlays() {
    if (!mapObj.current || !mapReady) return;
    clearContextOverlays();
    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;

    for (const t of territories) {
      if (t.type !== "polygon") continue;
      const zt = zoneTypeOf(t);
      if (zt === "territory" && !showLayerTerritory) continue;
      if (zt === "priority" && !showLayerPriority) continue;
      if (zt === "exclusion" && !showLayerExclusion) continue;
      if (editingId && t.id === editingId) continue;

      const rings = t.geometry?.coordinates as number[][][] | undefined;
      const ring = rings?.[0];
      if (!ring || ring.length < 3) continue;

      const path = ring.map((pt) => ({ lat: pt[1], lng: pt[0] }));
      // Drop closing duplicate if present
      if (
        path.length > 1 &&
        path[0].lat === path[path.length - 1].lat &&
        path[0].lng === path[path.length - 1].lng
      ) {
        path.pop();
      }
      if (path.length < 3) continue;

      const color = zoneColor(zt);
      const poly = new google.maps.Polygon({
        map: mapObj.current,
        paths: path,
        editable: false,
        draggable: false,
        clickable: false,
        fillColor: color,
        fillOpacity: zt === "exclusion" ? 0.22 : 0.12,
        strokeColor: color,
        strokeOpacity: 0.85,
        strokeWeight: 2,
        zIndex: zt === "exclusion" ? 1 : 0,
      });
      contextPolysRef.current.push(poly);
      path.forEach((p) => {
        bounds.extend(p);
        hasBounds = true;
      });

      const center = ringCentroid(path);
      if (center) {
        const label = new google.maps.Marker({
          map: mapObj.current,
          position: center,
          clickable: false,
          optimized: false,
          zIndex: 3,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 0,
            fillOpacity: 0,
            strokeOpacity: 0,
          },
          label: {
            text: t.name.slice(0, 28),
            color: color,
            fontSize: "11px",
            fontWeight: "700",
          },
        });
        contextLabelsRef.current.push(label);
      }
    }

    if (hasBounds && (mapExpanded || overviewMode)) {
      mapObj.current.fitBounds(bounds, 48);
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

  const mapVisible = (showForm && tMode === "polygon") || overviewMode;

  // Initialize polygon draw / overview map
  useEffect(() => {
    if (!mapVisible) {
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
            gestureHandling: "greedy",
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
  }, [mapVisible, tZoneType]);

  // Show all territories / priority / exclusions under the editor
  useEffect(() => {
    if (!mapReady) return;
    syncContextOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mapReady,
    territories,
    showLayerTerritory,
    showLayerPriority,
    showLayerExclusion,
    editingId,
    mapExpanded,
    overviewMode,
  ]);

  // Resize map when expanding or window changes
  useEffect(() => {
    if (!mapReady || !mapObj.current) return;
    const delays = [0, 80, 250];
    const timers = delays.map((ms) =>
      window.setTimeout(() => triggerMapResize(mapObj.current), ms)
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [mapExpanded, mapReady, showForm, tMode, overviewMode]);

  useEffect(() => {
    if (!mapExpanded && !overviewMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (overviewMode) {
          setOverviewMode(false);
          setMapExpanded(false);
          teardownMap();
        } else {
          setMapExpanded(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapExpanded, overviewMode]);

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
      disableDoubleClickZoom: true,
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

    // Double-click finishes the polygon when at least 3 points exist
    google.maps.event.addListenerOnce(mapObj.current, "dblclick", () => {
      if (draftVerticesRef.current.length >= 3) {
        finishPolygonDraw();
      }
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
      if (!res.ok) {
        if (res.status === 401) onSessionExpired?.(apiErrorMessage(res, data, "Session expired"));
        throw new Error(apiErrorMessage(res, data, "Failed to save boundary"));
      }

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
      if (!res.ok) {
        if (res.status === 401) onSessionExpired?.(apiErrorMessage(res, data, "Session expired"));
        throw new Error(apiErrorMessage(res, data, "Failed to delete"));
      }
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
      if (!res.ok) {
        if (res.status === 401) onSessionExpired?.(apiErrorMessage(res, data, "Session expired"));
        throw new Error(apiErrorMessage(res, data, "Failed to assign territory"));
      }
      setSuccess("Territory assigned");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigningTech(null);
      setAssignTerritory("");
    }
  }

  async function assignDispatchRole(
    techId: string,
    role: FieldDispatchRole,
    fallback?: InstallerFallback
  ) {
    setAssigningRole(techId);
    setError(null);
    try {
      const res = await fetch("/api/techs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "assign_dispatch_role",
          techId,
          dispatchRole: role,
          ...(fallback !== undefined ? { installerFallback: fallback } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) onSessionExpired?.(apiErrorMessage(res, data, "Session expired"));
        throw new Error(apiErrorMessage(res, data, "Failed to assign dispatch role"));
      }
      setSuccess("Dispatch role updated");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigningRole(null);
    }
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: "48px", color: "#6b7280" }}>Loading boundaries…</div>;
  }

  const mapHeight = mapExpanded ? "calc(100vh - 140px)" : "min(560px, 58vh)";

  return (
    <div style={{ maxWidth: (showForm && tMode === "polygon") || overviewMode ? "none" : "900px", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#1f2937" }}>Boundaries & Territories</h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>
            Draw/edit custom polygons for territories, priority zones, and permanent exclusions.
          </p>
        </div>
        {isOffice && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                resetForm();
                teardownMap();
                setShowForm(false);
                setOverviewMode(true);
                setMapExpanded(true);
                setTMode("polygon");
              }}
              style={{
                padding: "8px 14px",
                background: "#f3f4f6",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              View all zones
            </button>
            <button
              onClick={() => {
                const next = !showForm;
                setShowForm(next);
                setOverviewMode(false);
                if (!next) {
                  resetForm();
                  teardownMap();
                  setMapExpanded(false);
                }
              }}
              style={{ padding: "8px 16px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              + New Boundary
            </button>
          </div>
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

      {overviewMode && isOffice && !showForm && (
        <div
          style={
            mapExpanded
              ? {
                  position: "fixed",
                  inset: 0,
                  zIndex: 950,
                  background: "#fff",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  boxSizing: "border-box",
                  marginBottom: 0,
                }
              : {
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "24px",
                }
          }
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#1f2937" }}>
                All territories & exclusions
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: 2 }}>
                Teal = territory · Amber = priority · Red = exclusion
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              {(
                [
                  ["Territory", showLayerTerritory, setShowLayerTerritory, "#0d9488"],
                  ["Priority", showLayerPriority, setShowLayerPriority, "#f59e0b"],
                  ["Exclusion", showLayerExclusion, setShowLayerExclusion, "#ef4444"],
                ] as const
              ).map(([label, on, setOn, color]) => (
                <label
                  key={label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
                  {label}
                </label>
              ))}
              <button
                type="button"
                onClick={() => syncContextOverlays()}
                style={{
                  padding: "7px 12px",
                  background: "#f3f4f6",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Fit all
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverviewMode(false);
                  setMapExpanded(false);
                  teardownMap();
                }}
                style={{
                  padding: "7px 12px",
                  background: "#0d9488",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
          <div
            ref={mapRef}
            style={{
              width: "100%",
              height: mapExpanded ? "calc(100vh - 120px)" : "min(560px, 58vh)",
              minHeight: 360,
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              background: "#e5e7eb",
              flex: mapExpanded ? 1 : undefined,
            }}
          />
          {!mapReady && !mapLoadError && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>Loading map…</div>
          )}
          {mapLoadError && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#b91c1c" }}>{mapLoadError}</div>
          )}
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
                    <button
                      type="button"
                      onClick={() => setMapExpanded((v) => !v)}
                      disabled={!mapReady}
                      title={mapExpanded ? "Exit large map (Esc)" : "Open large map for drawing"}
                      style={{
                        padding: "7px 12px",
                        background: mapReady ? (mapExpanded ? "#0f766e" : "#f3f4f6") : "#e5e7eb",
                        color: mapReady ? (mapExpanded ? "#fff" : "#374151") : "#9ca3af",
                        border: `1px solid ${mapExpanded ? "#0d9488" : "#d1d5db"}`,
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: mapReady ? "pointer" : "not-allowed",
                      }}
                    >
                      {mapExpanded ? "Exit large map" : "Large map"}
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
                <div
                  style={
                    mapExpanded
                      ? {
                          position: "fixed",
                          inset: 0,
                          zIndex: 950,
                          background: "#fff",
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          boxSizing: "border-box",
                        }
                      : { position: "relative" }
                  }
                >
                  {mapExpanded && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "12px", flexShrink: 0, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "15px", fontWeight: 700, color: "#1f2937" }}>
                          Draw boundary — large map
                        </div>
                        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: 2 }}>
                          Click corners · double-click or Finish to close · all existing zones shown below
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        {(
                          [
                            ["Territory", showLayerTerritory, setShowLayerTerritory, "#0d9488"],
                            ["Priority", showLayerPriority, setShowLayerPriority, "#f59e0b"],
                            ["Exclusion", showLayerExclusion, setShowLayerExclusion, "#ef4444"],
                          ] as const
                        ).map(([label, on, setOn, color]) => (
                          <label
                            key={label}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              color,
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
                            {label}
                          </label>
                        ))}
                        <button
                          type="button"
                          onClick={() => syncContextOverlays()}
                          style={{
                            padding: "8px 12px",
                            background: "#f3f4f6",
                            border: "1px solid #d1d5db",
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Fit all
                        </button>
                        <button
                          type="button"
                          onClick={() => setMapExpanded(false)}
                          style={{
                            padding: "8px 14px",
                            background: "#0d9488",
                            color: "#fff",
                            border: "none",
                            borderRadius: "8px",
                            fontSize: "13px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Done (Esc)
                        </button>
                      </div>
                    </div>
                  )}
                  <div
                    ref={mapRef}
                    style={{
                      width: "100%",
                      height: mapHeight,
                      minHeight: mapExpanded ? 400 : 360,
                      borderRadius: "10px",
                      border: "1px solid #d1d5db",
                      background: "#e5e7eb",
                      flex: mapExpanded ? 1 : undefined,
                    }}
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
                {!mapExpanded && (
                  <div style={{ marginTop: "6px", fontSize: "11px", color: "#6b7280" }}>
                    {isDrawingPolygon
                      ? `${polygonPath.length} point${polygonPath.length === 1 ? "" : "s"} — drag handles, Ctrl+Z undo, then Finish Polygon (min 3). Use Large map for more room.`
                      : polygonPath.length > 0
                        ? `${polygonPath.length} vertices — drag corners or move the whole shape`
                        : "No polygon drawn yet — click Draw Polygon, then click corners. Use Large map if the view is too small."}
                  </div>
                )}
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
            Assign Techs — Territory & Dispatch Role
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {techs.map((tech) => {
              const current = territories.find((t) => t.id === tech.territoryId);
              const roleMeta = DISPATCH_ROLE_LABELS[tech.dispatchRole];
              return (
                <div key={tech.userId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 16px" }}>
                  <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "#1f2937" }}>{tech.name}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>
                      {current ? `Territory: ${current.name}` : "No territory"} · Role: {roleMeta.title}
                    </div>
                  </div>
                  <select
                    value={assigningTech === tech.userId ? assignTerritory : tech.territoryId ?? ""}
                    onChange={(e) => {
                      setAssignTerritory(e.target.value);
                      assignTechTerritory(tech.userId, e.target.value);
                    }}
                    disabled={assigningTech === tech.userId}
                    style={{ padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: "7px", fontSize: "13px", color: "#374151", minWidth: "140px" }}
                  >
                    <option value="">— Territory —</option>
                    {territories.filter((t) => isAssignableTerritory(t)).map((t) => (
                      <option key={t.id} value={t.id}>{assignableTerritoryLabel(t)}</option>
                    ))}
                  </select>
                  {territories.filter((t) => isAssignableTerritory(t)).length === 0 && (
                    <span style={{ fontSize: "11px", color: "#b45309" }}>
                      No assignable zones — create a Territory or Priority boundary (not Exclusion).
                    </span>
                  )}
                  <select
                    value={tech.dispatchRole}
                    onChange={(e) => assignDispatchRole(tech.userId, e.target.value as FieldDispatchRole)}
                    disabled={assigningRole === tech.userId}
                    title={roleMeta.description}
                    style={{ padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: "7px", fontSize: "13px", color: "#374151", minWidth: "120px" }}
                  >
                    {(Object.keys(DISPATCH_ROLE_LABELS) as FieldDispatchRole[]).map((r) => (
                      <option key={r} value={r}>{DISPATCH_ROLE_LABELS[r].title}</option>
                    ))}
                  </select>
                  {tech.dispatchRole === "installer" && (
                    <select
                      value={tech.installerFallback}
                      onChange={(e) =>
                        assignDispatchRole(tech.userId, "installer", e.target.value as InstallerFallback)
                      }
                      disabled={assigningRole === tech.userId}
                      title="Fallback when no sold-job targets remain"
                      style={{ padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: "7px", fontSize: "12px", color: "#6b7280", minWidth: "130px" }}
                    >
                      <option value="hunter">Fallback: Hunter</option>
                      <option value="seller">Fallback: Seller</option>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isOffice && (
        <details
          style={{
            marginTop: 28,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "4px 8px 8px",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
              color: "#374151",
              padding: "12px 8px",
              listStyle: "none",
            }}
          >
            Excluded Properties (collapsible)
          </summary>
          <ExcludedPropertiesPanel
            token={token}
            onSessionExpired={onSessionExpired}
            onChanged={onExclusionsChanged}
          />
        </details>
      )}
    </div>
  );
}
