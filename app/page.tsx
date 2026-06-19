"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";
import InvestigationForm from "./components/InvestigationForm";
import JobForm from "./components/JobForm";
import JobQueue from "./components/JobQueue";
import OpportunitiesList from "./components/OpportunitiesList";
import TechPanel from "./components/TechPanel";
import AdminPanel from "./components/AdminPanel";
import ProfilePanel from "./components/ProfilePanel";
import TerritoryPanel from "./components/TerritoryPanel";
import SiteGuideDocs from "./components/SiteGuideDocs";
import PageHelp from "./components/PageHelp";
import SiteHelpLauncher from "./components/SiteHelpLauncher";
import Link from "next/link";
import type { PageHelpId } from "@/lib/page-help";
import { STATUS_CONFIG, getStatusConfig, getMarkerStyle, statusBadgeStyle, OUTAGE_FILTER_OPTIONS, isUnvisitedOnMap, type OutageStatus } from "@/lib/outage-status";
import { loadSavedVisits, saveFieldVisit, type FieldVisitCache } from "@/lib/field-visit";
import { loadPendingVisit, savePendingVisit, clearPendingVisit, needsInvestigation } from "@/lib/pending-visit";
import { pickNextRouteStop, type RoutingContext } from "@/lib/route-next";
import type { RoutingMode } from "@/lib/routing-mode";
import { territoryFromRow } from "@/lib/territory-match";
import type { FieldDispatchRole, InstallerFallback } from "@/lib/field-dispatch-role";

// ── Types ────────────────────────────────────────────────────────────────────
type Role = "office" | "tech" | "admin" | "owner";

type User = {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: Role;
};

type Outage = {
  id: number | string;
  lat: number;
  lng: number;
  customers: number;
  county: string;
  city?: string;
  state?: string;
  streetAddress?: string;
  outageType?: string;
  cause?: string;
  etr?: string;
  crewStatus?: string;
  outageImpact?: string;
  zipCode?: string | null;
  status: OutageStatus;
  source?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  leadSource?: string | null;
  assignedTechName?: string | null;
  officeNotes?: string | null;
  externalJobStatus?: string | null;
  priorityScore?: number;
  isSimulation?: boolean;
  isNew?: boolean;
  firstSeenAt?: string | null;
  lastUpdatedAt?: string | null;
  isStaleMarker?: boolean;
  isPreviousStormMarker?: boolean;
  stormEventId?: string | null;
  investigationResult?: string;
  customerIntent?: string;
  verbalPrice?: string;
  followUpStatus?: string;
  noContactMade?: boolean;
  needsReturnTrip?: boolean;
  scoreBreakdown?: {
    finalScore: number;
    urgency: number;
    parts: Record<string, number>;
  };
};

type Tech = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: "available" | "working" | "paused" | "offline";
  lat: number | null;
  lng: number | null;
  currentJobName?: string | null;
  updatedAt?: string | null;
  territoryId?: string | null;
  dispatchRole?: FieldDispatchRole;
  installerFallback?: InstallerFallback;
};

type BoundaryZone = {
  id: string;
  name: string;
  type: "zip" | "polygon";
  geometry?: {
    type?: string;
    coordinates?: number[][][];
    properties?: { zoneType?: "territory" | "priority" | "exclusion" };
  } | null;
  zip_codes?: string[] | null;
};

type Tab = PageHelpId;

// ── Config ───────────────────────────────────────────────────────────────────
const CENTER = { lat: 44.9778, lng: -93.265 };
const RADIUS_MILES = 40;

const TECH_STATUS_COLOR = {
  available: "#10b981",
  working:   "#ef4444",
  paused:    "#f59e0b",
  offline:   "#6b7280",
};

// ── Component ────────────────────────────────────────────────────────────────
export default function Page() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authBootstrapping, setAuthBootstrapping] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!(localStorage.getItem("fieldmap_token") && localStorage.getItem("fieldmap_user"));
  });
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [preAuthScreen, setPreAuthScreen] = useState<"landing" | "auth">("landing");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roleSelect, setRoleSelect] = useState<Role>("tech");

  // App state
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [outages, setOutages] = useState<Outage[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSimMode, setIsSimMode] = useState(false);
  const isSimModeRef = useRef(false);
  // Keep ref in sync so the map click closure always reads the latest value
  useEffect(() => { isSimModeRef.current = isSimMode; }, [isSimMode]);
  const [isStale, setIsStale] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [activeSources, setActiveSources] = useState<string[]>(["xcel"]);
  const [connexusEnabled, setConnexusEnabled] = useState(false);
  const [fetchIntervalMins, setFetchIntervalMins] = useState(5);
  const [stormPhase, setStormPhase] = useState<"phase_1" | "phase_2" | "phase_3">("phase_1");
  const [routingMode, setRoutingMode] = useState<RoutingMode>("simple");
  const [tempOutMode, setTempOutMode] = useState(false);
  const [activeCallsInQueue, setActiveCallsInQueue] = useState(0);

  // Manual test outage state (simulation mode map-click)
  const [showManualOutageForm, setShowManualOutageForm] = useState(false);
  const [manualOutageCoords, setManualOutageCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [manualOutageCustomers, setManualOutageCustomers] = useState(1);
  const [manualOutageType, setManualOutageType] = useState("storm");
  const [manualOutageNotes, setManualOutageNotes] = useState("");
  const [manualOutageSubmitting, setManualOutageSubmitting] = useState(false);

  // Responsive state
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<OutageStatus | "all" | "job_sold">("all");
  const [zones, setZones] = useState<BoundaryZone[]>([]);

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const techMarkersRef = useRef<google.maps.Marker[]>([]);
  const techMarkerByUserRef = useRef<Record<string, google.maps.Marker>>({});
  const techAnimByUserRef = useRef<Record<string, number>>({});
  const techDataByUserRef = useRef<Record<string, Tech>>({});
  const zonePolygonsRef = useRef<google.maps.Polygon[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const routeLineRef = useRef<google.maps.Polyline | null>(null);
  // navTargetRef holds the coordinates + user location; navVersion counter triggers the effect.
  // Using a ref (not state) for coords avoids the cleanup-cancels-timer bug.
  // userLoc is bundled at click-time so the route line always has the right value.
  const navTargetRef = useRef<{ lat: number; lng: number; userLoc: { lat: number; lng: number } | null; outage: Outage | null } | null>(null);
  const [navVersion, setNavVersion] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedOutage, setSelectedOutage] = useState<Outage | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<number | string | null>(null);
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");

  // Modals
  const [showInvestigation, setShowInvestigation] = useState(false);
  const [investigatingOutage, setInvestigatingOutage] = useState<Outage | null>(null);
  const [pendingVisitId, setPendingVisitId] = useState<string | null>(null);
  const [showJobForm, setShowJobForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailOutage, setDetailOutage] = useState<Outage | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportLat, setReportLat] = useState<number | null>(null);
  const [reportLng, setReportLng] = useState<number | null>(null);
  const [reportedAddress, setReportedAddress] = useState<string | null>(null);
  const [reportDescription, setReportDescription] = useState("");
  const [reportCustomerName, setReportCustomerName] = useState("");
  const [reportCustomerPhone, setReportCustomerPhone] = useState("");
  const [reportCustomerEmail, setReportCustomerEmail] = useState("");
  const [hideDoneMarkers, setHideDoneMarkers] = useState(true);
  const [hideDeclinedMarkers, setHideDeclinedMarkers] = useState(true);
  const [hideNonCriticalMarkers, setHideNonCriticalMarkers] = useState(true);
  const [showStaleOnMap, setShowStaleOnMap] = useState(true);
  const [stormVisibilityMode, setStormVisibilityMode] = useState<"active_only" | "active_and_previous" | "all">("active_and_previous");
  const [activeStormEvent, setActiveStormEvent] = useState<{ id: string; name: string; started_at: string } | null>(null);
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [reportAddressEdit, setReportAddressEdit] = useState("");
  const [reportStreet, setReportStreet] = useState("");
  const [reportCity, setReportCity] = useState("");
  const [reportState, setReportState] = useState("");
  const [reportZip, setReportZip] = useState("");
  const [reportingLocation, setReportingLocation] = useState(false);
  const [editingAddress, setEditingAddress] = useState("");
  const [editingLat, setEditingLat] = useState("");
  const [editingLng, setEditingLng] = useState("");
  const [pinAdjustLabel, setPinAdjustLabel] = useState<string | null>(null);
  const pinAdjustOutageRef = useRef<Outage | null>(null);

  // ── Session restore — validate token with server before trusting localStorage ──
  useEffect(() => {
    const savedToken = localStorage.getItem("fieldmap_token")?.trim();
    if (!savedToken) {
      setAuthBootstrapping(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${savedToken}`,
          },
          body: JSON.stringify({ action: "me" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Session invalid");
        if (cancelled) return;
        setUser(data.user);
        setToken(savedToken);
        localStorage.setItem("fieldmap_user", JSON.stringify(data.user));
      } catch {
        if (cancelled) return;
        localStorage.removeItem("fieldmap_user");
        localStorage.removeItem("fieldmap_token");
        setUser(null);
        setToken(null);
        setPreAuthScreen("auth");
      } finally {
        if (!cancelled) setAuthBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fetch outages ────────────────────────────────────────────────────────
  const fetchOutages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sources = activeSources.join(",");
      const res = await fetch(`/api/outages?sources=${sources}`, { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to fetch outages");

      setIsStale(data.isStale ?? false);
      setIsSimMode(data.isSimulation ?? false);
      if (data.routingMode === "simple" || data.routingMode === "complicated") {
        setRoutingMode(data.routingMode);
      }
      if (data.activeStormEvent) {
        setActiveStormEvent(data.activeStormEvent);
      }

      const items: Outage[] = (data.features ?? []).map((f: any) => {
        const attrs = f.attributes || f;
        const geom = f.geometry || {};
        const lat = geom.y ?? attrs.lat ?? f.lat;
        const lng = geom.x ?? attrs.lng ?? f.lng;
        if (!lat || !lng) return null;

        // Restore status from localStorage as offline fallback
        const savedVisits = loadSavedVisits();
        const saved = savedVisits[String(attrs.id ?? f.id)] ?? {};

        const serverStatus = (attrs.status ?? f.status) as OutageStatus | undefined;
        const mergedStatus = (serverStatus && serverStatus !== "unvisited"
          ? serverStatus
          : (saved.status as OutageStatus | undefined) ?? serverStatus ?? "unvisited") as OutageStatus;

        return {
          id: attrs.id ?? f.id,
          lat,
          lng,
          customers: attrs.customers ?? f.customers ?? 0,
          county: attrs.county ?? f.county ?? "Unknown",
          city: attrs.city ?? f.city,
          state: attrs.state ?? f.state,
          streetAddress: attrs.streetAddress ?? f.streetAddress ?? saved.streetAddress,
          outageType: attrs.outageType ?? f.outageType ?? "Known Electric Outage",
          cause: attrs.cause ?? f.cause,
          etr: attrs.etr ?? f.etr,
          status: mergedStatus,
          investigationResult: saved.investigationResult,
          customerIntent: saved.customerIntent,
          verbalPrice: saved.verbalPrice,
          followUpStatus: saved.followUpStatus,
          source: attrs.source ?? f.source ?? "xcel",
          customerName: attrs.customerName ?? f.customerName ?? null,
          customerPhone: attrs.customerPhone ?? f.customerPhone ?? null,
          leadSource: attrs.leadSource ?? f.leadSource ?? null,
          assignedTechName: attrs.assignedTechName ?? f.assignedTechName ?? null,
          officeNotes: attrs.officeNotes ?? f.officeNotes ?? null,
          externalJobStatus: attrs.externalJobStatus ?? f.externalJobStatus ?? null,
          priorityScore: attrs.priorityScore ?? f.priorityScore ?? 0,
          isSimulation: data.isSimulation ?? false,
          isNew: attrs.isNew ?? f.isNew ?? false,
          firstSeenAt: attrs.firstSeenAt ?? f.firstSeenAt ?? null,
          lastUpdatedAt: attrs.lastUpdatedAt ?? f.lastUpdatedAt ?? null,
          isStaleMarker: attrs.isStaleMarker ?? f.isStaleMarker ?? false,
          isPreviousStormMarker: attrs.isPreviousStormMarker ?? f.isPreviousStormMarker ?? false,
          stormEventId: attrs.stormEventId ?? f.stormEventId ?? null,
          noContactMade: saved.noContactMade ?? attrs.noContactMade ?? f.noContactMade ?? false,
          needsReturnTrip: attrs.needsReturnTrip ?? f.needsReturnTrip ?? false,
          zipCode: attrs.zipCode ?? f.zipCode ?? null,
        };
      }).filter(Boolean) as Outage[];

      setOutages(items);
      setLastUpdatedAt(new Date());
    } catch (err: any) {
      setError(err.message || "Failed to fetch outages");
    } finally {
      setLoading(false);
    }
  }, [activeSources]);

  // ── Fetch techs ──────────────────────────────────────────────────────────
  const fetchTechs = useCallback(async () => {
    try {
      const res = await fetch("/api/techs", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setTechs(data.techs ?? []);
    } catch {}
  }, [token]);

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch("/api/territories", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setZones(data.territories ?? []);
    } catch {
      setZones([]);
    }
  }, [token]);

  // ── Auto-refresh polling ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const ms = Math.max(2, fetchIntervalMins) * 60_000;
    const id = setInterval(() => {
      fetchOutages();
      fetchTechs();
    }, ms);
    return () => clearInterval(id);
  }, [user, fetchIntervalMins, fetchOutages, fetchTechs]);

  // Real-time tech refresh every 30s for dispatch visibility.
  useEffect(() => {
    if (!user) return;
    fetchTechs();
    const id = setInterval(() => fetchTechs(), 30_000);
    return () => clearInterval(id);
  }, [user, fetchTechs]);

  useEffect(() => {
    if (!user) return;
    fetchOutages();
    fetchTechs();
    fetchZones();
    // Update own location for techs
    if (user.role === "tech" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        if (token) {
          fetch("/api/techs", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ lat: loc.lat, lng: loc.lng }),
          });
        }
      });
    }
  }, [user, fetchOutages, fetchTechs, fetchZones]);

  // Tech GPS heartbeat every 30s so office sees near-live movement.
  useEffect(() => {
    if (!user || user.role !== "tech" || !token || !navigator.geolocation) return;
    let cancelled = false;
    let lastSentAt = 0;
    const updateLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          const now = Date.now();
          if (now - lastSentAt < 28_000) return;
          lastSentAt = now;
          fetch("/api/techs", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ lat: loc.lat, lng: loc.lng }),
          }).catch(() => {});
          fetch("/api/jobs/eta", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ lat: loc.lat, lng: loc.lng }),
          }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 }
      );
    };
    updateLocation();
    const id = setInterval(updateLocation, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.id, user?.role, token]);

  // Load global app settings so every role sees current storm mode.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const s = data?.settings ?? {};
        if (Array.isArray(s.active_sources)) {
          setActiveSources(s.active_sources);
          setConnexusEnabled(s.active_sources.includes("connexus"));
        }
        if (typeof s.simulation_mode === "boolean") setIsSimMode(s.simulation_mode);
        if (typeof s.fetch_interval_minutes === "number") setFetchIntervalMins(s.fetch_interval_minutes);
        if (s.storm_phase === "phase_1" || s.storm_phase === "phase_2" || s.storm_phase === "phase_3") {
          setStormPhase(s.storm_phase);
        }
        if (s.routing_mode === "simple" || s.routing_mode === "complicated") {
          setRoutingMode(s.routing_mode);
        }
        if (typeof s.temp_out_mode === "boolean") setTempOutMode(s.temp_out_mode);
      } catch {
        // non-fatal in field mode
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ── Map init — only while Live Map tab is visible ───────────────────────
  // Google Maps often renders a permanent blank canvas if `new Map()` runs while
  // the container has `display: none` (other tabs). Defer init until `activeTab === "map"`,
  // and trigger `resize` after tab switches so tiles repaint reliably.
  useEffect(() => {
    if (!user || activeTab !== "map") return;

    function triggerMapResize() {
      if (!mapObj.current || typeof google === "undefined") return;
      google.maps.event.trigger(mapObj.current, "resize");
    }

    if (mapObj.current) {
      const timeouts = [0, 80, 250, 600].map((delay) =>
        window.setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(triggerMapResize);
          });
        }, delay)
      );
      return () => timeouts.forEach(clearTimeout);
    }

    if (!mapRef.current) return;

    let cancelled = false;

    async function initMap() {
      try {
        const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!key) { setError("Missing Google Maps API key"); return; }

        await loadGoogleMaps();
        if (cancelled || !mapRef.current || mapObj.current) return;

        const map = new google.maps.Map(mapRef.current, {
          center: CENTER,
          zoom: 10,
          mapTypeId: "roadmap",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
            {
              featureType: "poi.business",
              stylers: [{ visibility: "off" }],
            },
            {
              featureType: "transit",
              elementType: "labels.icon",
              stylers: [{ visibility: "off" }],
            },
            {
              featureType: "landscape.man_made",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
          ],
        });
        mapObj.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();

        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (pinAdjustOutageRef.current && e.latLng) {
            const target = pinAdjustOutageRef.current;
            const newLat = e.latLng.lat();
            const newLng = e.latLng.lng();
            pinAdjustOutageRef.current = null;
            setPinAdjustLabel(null);
            void saveOutageLocation(target.id, newLat, newLng, target.streetAddress ?? null);
            return;
          }
          if (!isSimModeRef.current) return;
          if (!e.latLng) return;
          setManualOutageCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          setManualOutageCustomers(1);
          setManualOutageType("storm");
          setManualOutageNotes("");
          setShowManualOutageForm(true);
        });

        setMapReady(true);

        requestAnimationFrame(() => {
          requestAnimationFrame(triggerMapResize);
        });

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => {}
          );
        }
      } catch (e: any) {
        setError("Map failed to load: " + e.message);
      }
    }

    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || mapObj.current) return;
        initMap();
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [user, activeTab]);

  // ── Sync outage markers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapObj.current || !mapReady) return;
    placeOutageMarkers(outages);
  }, [outages, mapReady, hideDoneMarkers, hideDeclinedMarkers, hideNonCriticalMarkers, showStaleOnMap, stormVisibilityMode]);

  useEffect(() => {
    if (!mapObj.current || !mapReady) return;
    placeZonePolygons(zones);
  }, [zones, mapReady]);

  // ── Sync tech markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapObj.current || !mapReady) return;
    placeTechMarkers(techs);
  }, [techs, mapReady]);

  useEffect(() => {
    if (!mapObj.current || typeof google === "undefined") return;
    mapObj.current.setMapTypeId(mapType);
  }, [mapType]);

  // ── Apply navigation whenever navVersion increments and map is ready ────
  // navTargetRef holds the coords; navVersion (a counter) triggers the effect.
  // We deliberately do NOT set state inside this effect to avoid the
  // cleanup-cancels-timer bug (React cleanup runs before re-run).
  useEffect(() => {
    if (!navTargetRef.current || activeTab !== "map" || !mapObj.current || !mapReady) return;

    const { lat, lng, userLoc } = navTargetRef.current;
    navTargetRef.current = null; // consume — safe: ref mutation, no re-render

    // Small delay lets the CSS display:block and map resize settle
    setTimeout(() => {
      if (!mapObj.current || typeof google === "undefined") return;
      const loc = userLoc;   // captured at click-time — no stale-ref risk
      routeLineRef.current?.setMap(null);
      if (loc) {
        routeLineRef.current = new google.maps.Polyline({
          path: [loc, { lat, lng }],
          geodesic: true,
          strokeColor: "#ef4444",
          strokeOpacity: 0.9,
          strokeWeight: 5,
        });
        routeLineRef.current.setMap(mapObj.current);
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(loc);
        bounds.extend({ lat, lng });
        mapObj.current.fitBounds(bounds);
      } else {
        mapObj.current.setCenter({ lat, lng });
        mapObj.current.setZoom(14);
      }
    }, 350);
    // No cleanup needed — timer draws a route line, not a subscription to tear down.
  }, [navVersion, activeTab, mapReady]);

  // ── Mobile / responsive detection ───────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    setEditingAddress(detailOutage?.streetAddress ?? "");
    setEditingLat(detailOutage?.lat != null ? String(detailOutage.lat) : "");
    setEditingLng(detailOutage?.lng != null ? String(detailOutage.lng) : "");
  }, [detailOutage?.id]);

  async function saveOutageLocation(
    id: number | string,
    lat: number,
    lng: number,
    streetAddress?: string | null
  ) {
    if (!token) return;
    try {
      const res = await fetch("/api/outages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id,
          lat,
          lng,
          ...(streetAddress != null && streetAddress !== "" ? { streetAddress } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save location");
      setOutages((prev) =>
        prev.map((o) =>
          String(o.id) === String(id)
            ? {
                ...o,
                lat,
                lng,
                ...(streetAddress != null && streetAddress !== "" ? { streetAddress } : {}),
              }
            : o
        )
      );
      if (detailOutage && String(detailOutage.id) === String(id)) {
        setDetailOutage((p) =>
          p
            ? {
                ...p,
                lat,
                lng,
                ...(streetAddress != null && streetAddress !== "" ? { streetAddress } : {}),
              }
            : p
        );
        setEditingLat(String(lat));
        setEditingLng(String(lng));
        if (streetAddress != null && streetAddress !== "") setEditingAddress(streetAddress);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not save location");
    }
  }

  function startPinAdjust(outage: Outage) {
    pinAdjustOutageRef.current = outage;
    setPinAdjustLabel(outage.streetAddress?.split(",")[0] ?? `Outage #${outage.id}`);
    setShowDetail(false);
    setActiveTab("map");
  }

  function cancelPinAdjust() {
    pinAdjustOutageRef.current = null;
    setPinAdjustLabel(null);
  }

  // ── Connexus sidebar toggle syncs activeSources ──────────────────────────
  useEffect(() => {
    setActiveSources(connexusEnabled ? ["xcel", "connexus"] : ["xcel"]);
  }, [connexusEnabled]);

  // ── Re-fetch whenever active sources change ───────────────────────────────
  // This is the single source of truth for "sources changed → refetch".
  // The [user] effect above handles initial load; this handles all subsequent
  // source changes (sidebar toggles, AdminPanel save, handleSettingsChanged).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (!user) return;
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    fetchOutages();
  }, [activeSources]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-refresh outages on interval ─────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const ms = Math.max(5, fetchIntervalMins) * 60 * 1000;
    const id = setInterval(() => { fetchOutages(); }, ms);
    return () => clearInterval(id);
  }, [user, fetchIntervalMins, fetchOutages]);

  // ── Called by AdminPanel after saving settings ────────────────────────────
  function handleSettingsChanged(
    sources: string[],
    simMode: boolean,
    stormOps?: {
      stormPhase: "phase_1" | "phase_2" | "phase_3";
      tempOutMode: boolean;
      fetchIntervalMinutes: number;
    }
  ) {
    setActiveSources(sources);                    // triggers the useEffect above
    setConnexusEnabled(sources.includes("connexus"));
    setIsSimMode(simMode);
    if (stormOps) {
      setStormPhase(stormOps.stormPhase);
      setTempOutMode(stormOps.tempOutMode);
      setFetchIntervalMins(stormOps.fetchIntervalMinutes);
    }
    // No setTimeout needed — the activeSources useEffect handles the refetch
  }

  // Keep a lightweight queue count for office storm-phase dashboard.
  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;
    const loadQueueCount = async () => {
      try {
        const res = await fetch("/api/jobs/queue", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled) setActiveCallsInQueue(Number(data?.total ?? 0));
      } catch {
        if (!cancelled) setActiveCallsInQueue(0);
      }
    };
    loadQueueCount();
    const id = setInterval(loadQueueCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, user, activeTab, stormPhase, tempOutMode]);

  useEffect(() => {
    const pending = loadPendingVisit();
    setPendingVisitId(pending?.outageId ?? null);
  }, []);

  useEffect(() => {
    resolvePendingVisitIfCleared();
  }, [outages, pendingVisitId]);

  function markPendingVisit(outage: Outage) {
    if (!user || user.role !== "tech") return;
    if (!needsInvestigation(outage.status)) return;
    savePendingVisit(outage.id);
    setPendingVisitId(String(outage.id));
  }

  function resolvePendingVisitIfCleared() {
    if (!pendingVisitId) return;
    const pending = outages.find((o) => String(o.id) === pendingVisitId);
    if (!pending || !needsInvestigation(pending.status)) {
      clearPendingVisit();
      setPendingVisitId(null);
    }
  }

  function requirePendingInvestigation(): boolean {
    resolvePendingVisitIfCleared();
    if (!pendingVisitId) return true;
    const pending = outages.find((o) => String(o.id) === pendingVisitId);
    if (!pending) {
      clearPendingVisit();
      setPendingVisitId(null);
      return true;
    }
    openInvestigation(pending);
    alert("Submit an investigation for your current stop before routing to the next one.");
    return false;
  }

  function openInvestigation(outage: Outage) {
    if (user?.role === "tech" && pendingVisitId && String(outage.id) !== pendingVisitId) {
      const pending = outages.find((o) => String(o.id) === pendingVisitId);
      if (pending && needsInvestigation(pending.status)) {
        alert("Finish investigating your current stop before opening another.");
        setInvestigatingOutage(pending);
        setShowInvestigation(true);
        return;
      }
    }
    setInvestigatingOutage(outage);
    setShowInvestigation(true);
  }

  const routeBlockedByPending =
    user?.role === "tech" &&
    !!pendingVisitId &&
    (() => {
      const pending = outages.find((o) => String(o.id) === pendingVisitId);
      return !!pending && needsInvestigation(pending.status);
    })();

  function mergeOutageWithVisit(o: Outage, visit?: FieldVisitCache): Outage {
    if (!visit) return o;
    return {
      ...o,
      status: (visit.status as OutageStatus) ?? o.status,
      investigationResult: visit.investigationResult ?? o.investigationResult,
      customerIntent: visit.customerIntent ?? o.customerIntent,
      verbalPrice: visit.verbalPrice ?? o.verbalPrice,
      followUpStatus: visit.followUpStatus ?? o.followUpStatus,
      noContactMade: visit.noContactMade ?? o.noContactMade,
    };
  }

  function markerPathForOutage(outage: Outage): google.maps.SymbolPath | string {
    if (
      outage.source === "office" ||
      outage.source === "crm" ||
      outage.source === "housecall" ||
      outage.leadSource === "office"
    ) {
      return "M 0,-1.2 L 1.1,1.0 L -1.1,1.0 Z";
    }
    if (
      outage.source === "self_generated" ||
      outage.source === "user_reported" ||
      outage.source === "user" ||
      outage.leadSource === "self_generated"
    ) {
      return "M 0 -1 L 1 0 L 0 1 L -1 0 Z";
    }
    return google.maps.SymbolPath.CIRCLE;
  }

  function zoneTypeOf(z: BoundaryZone): "territory" | "priority" | "exclusion" {
    const t = z.geometry?.properties?.zoneType;
    if (t === "priority" || t === "exclusion") return t;
    return "territory";
  }

  function pointInPolygon(lat: number, lng: number, polygonRing: number[][]): boolean {
    // polygonRing shape: [[lng, lat], ...]
    let inside = false;
    for (let i = 0, j = polygonRing.length - 1; i < polygonRing.length; j = i++) {
      const xi = polygonRing[i][0];
      const yi = polygonRing[i][1];
      const xj = polygonRing[j][0];
      const yj = polygonRing[j][1];
      const intersects = ((yi > lat) !== (yj > lat))
        && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function isInZone(outage: Outage, zone: BoundaryZone): boolean {
    const ring = zone.geometry?.coordinates?.[0];
    if (!ring || ring.length < 3) return false;
    return pointInPolygon(outage.lat, outage.lng, ring);
  }

  function zoneColor(kind: "territory" | "priority" | "exclusion"): string {
    if (kind === "exclusion") return "#ef4444";
    if (kind === "priority") return "#f59e0b";
    return "#0d9488";
  }

  function placeZonePolygons(data: BoundaryZone[]) {
    if (typeof google === "undefined" || !mapObj.current) return;
    zonePolygonsRef.current.forEach((p) => p.setMap(null));
    zonePolygonsRef.current = [];

    data.forEach((z) => {
      if (z.type !== "polygon") return;
      const ring = z.geometry?.coordinates?.[0];
      if (!ring || ring.length < 3) return;
      const kind = zoneTypeOf(z);
      const color = zoneColor(kind);
      const paths = ring.map(([plng, plat]) => ({ lat: plat, lng: plng }));
      const poly = new google.maps.Polygon({
        map: mapObj.current!,
        paths,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: kind === "exclusion" ? 0.12 : kind === "priority" ? 0.08 : 0.06,
        clickable: false,
      });
      zonePolygonsRef.current.push(poly);
    });
  }

  // ── Outage markers ───────────────────────────────────────────────────────
  function placeOutageMarkers(data: Outage[]) {
    if (typeof google === "undefined" || !mapObj.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const visible = data.filter((o) => {
      if (o.investigationResult === "not_target") return false;
      if (stormVisibilityMode === "active_only" && o.isPreviousStormMarker) return false;
      if (!showStaleOnMap && o.isStaleMarker && stormVisibilityMode !== "all") return false;
      if (hideDoneMarkers && o.status === "completed") return false;
      if (hideDeclinedMarkers && o.status === "no_opportunity") return false;
      if (hideNonCriticalMarkers) {
        if (o.status === "customer_thinking") return false;
        if (o.status === "temp_power") return false;
        if (o.status === "grounding") return false;
      }
      const excluded = zones.some((z) => z.type === "polygon" && zoneTypeOf(z) === "exclusion" && isInZone(o, z));
      if (excluded) return false;
      return true;
    });

    visible.forEach((outage) => {
      const cfg = getMarkerStyle(outage.status, { noContactMade: outage.noContactMade });

      // Honey hole: opportunity with >1 customer → bigger marker + label
      const isHoneyHole =
        (outage.status === "opportunity" || outage.status === "wants_to_proceed") &&
        outage.customers > 1;
      const inPriorityZone = zones.some((z) => z.type === "polygon" && zoneTypeOf(z) === "priority" && isInZone(outage, z));
      const baseSizeRaw = isHoneyHole
        ? Math.min(22, Math.max(14, 12 + Math.sqrt(outage.customers)))
        : 10;
      const baseSize = inPriorityZone ? baseSizeRaw + 2 : baseSizeRaw;

      // New (unseen) ArcGIS dot: white fill with red outline, high z-index
      const isArcGIS = outage.source === "xcel" || outage.source === "connexus" || outage.source === "arcgis";
      const isNewArcGIS = outage.isNew === true && isArcGIS;
      // Unvisited ArcGIS outages always show white+red outline (utility-confirmed)
      const isUnvisitedArcGIS = outage.status === "unvisited" && isArcGIS;

      const fillColor = (isNewArcGIS || isUnvisitedArcGIS) ? "#ffffff" : cfg.color;
      const faded = outage.isPreviousStormMarker === true || (outage.isStaleMarker === true && stormVisibilityMode !== "all");
      const strokeColor = faded ? "#9ca3af" : ((isNewArcGIS || isUnvisitedArcGIS) ? "#dc2626" : cfg.strokeColor);
      const strokeWeight = isNewArcGIS ? 4 : (isHoneyHole ? 4 : 3);

      const marker = new google.maps.Marker({
        map: mapObj.current!,
        position: { lat: outage.lat, lng: outage.lng },
        title: `${outage.city ?? outage.county} – ${outage.customers} customers`,
        icon: {
          path: markerPathForOutage(outage),
          fillColor,
          fillOpacity: faded ? 0.35 : 1,
          strokeColor,
          strokeWeight,
          scale: baseSize,
        },
        label: isHoneyHole
          ? { text: String(outage.customers), color: "#fff", fontSize: "10px", fontWeight: "700" }
          : undefined,
        zIndex: isNewArcGIS ? 9999 : ((outage.priorityScore ?? 0) + (inPriorityZone ? 1000 : 0)),
      });

      marker.addListener("click", () => {
        infoWindowRef.current?.close();
        if (user?.role === "tech") {
          openInvestigation(outage);
        } else {
          showInfoWindow(outage, marker);
        }
      });

      markersRef.current.push(marker);
    });
  }

  // ── Tech markers (square with initials) ──────────────────────────────────
  function placeTechMarkers(data: Tech[]) {
    const vehiclePath = "M -1.2,-0.4 L 0.4,-0.4 L 0.8,0 L 1.2,0 L 1.2,0.6 L -1.2,0.6 Z";
    const liveIds = new Set<string>();

    data.forEach((tech) => {
      if (!tech.lat || !tech.lng) return;
      const key = tech.userId || tech.id;
      liveIds.add(key);
      techDataByUserRef.current[key] = tech;

      const color = TECH_STATUS_COLOR[tech.status] ?? "#6b7280";
      const initials = tech.name
        .split(" ")
        .map((w: string) => w[0]?.toUpperCase() ?? "")
        .slice(0, 2)
        .join("");
      const icon: google.maps.Symbol = {
        path: vehiclePath,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2,
        scale: 14,
      };

      const existing = techMarkerByUserRef.current[key];
      if (!existing) {
        const marker = new google.maps.Marker({
          map: mapObj.current!,
          position: { lat: tech.lat, lng: tech.lng },
          title: `${tech.name} – ${tech.status}`,
          icon,
          label: { text: initials, color: "#fff", fontSize: "10px", fontWeight: "700" },
          zIndex: 1000,
        });
        marker.addListener("click", () => {
          if (!infoWindowRef.current || !mapObj.current) return;
          const cur = techDataByUserRef.current[key];
          if (!cur) return;
          const statusLabel = cur.status.charAt(0).toUpperCase() + cur.status.slice(1);
          const lastUpdate = cur.updatedAt ? new Date(cur.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Unknown";
          const color2 = TECH_STATUS_COLOR[cur.status] ?? "#6b7280";
          infoWindowRef.current.setContent(`
            <div style="font-family:system-ui;padding:10px;min-width:200px">
              <div style="font-weight:700;font-size:14px;margin-bottom:4px">${cur.name}</div>
              <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${cur.email ?? ""}</div>
              <span style="display:inline-block;padding:3px 10px;background:${color2}22;color:${color2};border-radius:12px;font-size:12px;font-weight:600">${statusLabel}</span>
              <div style="font-size:12px;margin-top:6px;color:#374151"><b>Current job:</b> ${cur.currentJobName ?? "None"}</div>
              <div style="font-size:12px;margin-top:4px;color:#6b7280"><b>Last update:</b> ${lastUpdate}</div>
              ${cur.phone ? `<div style="font-size:12px;margin-top:6px;color:#374151">${cur.phone}</div>` : ""}
            </div>`);
          infoWindowRef.current.open({ map: mapObj.current, anchor: marker });
        });
        techMarkerByUserRef.current[key] = marker;
      } else {
        existing.setTitle(`${tech.name} – ${tech.status}`);
        existing.setIcon(icon);
        existing.setLabel({ text: initials, color: "#fff", fontSize: "10px", fontWeight: "700" });
        const from = existing.getPosition();
        const fromLat = from?.lat() ?? tech.lat;
        const fromLng = from?.lng() ?? tech.lng;
        const toLat = tech.lat;
        const toLng = tech.lng;
        const delta = Math.abs(fromLat - toLat) + Math.abs(fromLng - toLng);
        if (delta > 0.00002) {
          const prior = techAnimByUserRef.current[key];
          if (prior) cancelAnimationFrame(prior);
          const start = performance.now();
          const duration = 900;
          const step = (ts: number) => {
            const t = Math.min(1, (ts - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            existing.setPosition({
              lat: fromLat + (toLat - fromLat) * eased,
              lng: fromLng + (toLng - fromLng) * eased,
            });
            if (t < 1) techAnimByUserRef.current[key] = requestAnimationFrame(step);
          };
          techAnimByUserRef.current[key] = requestAnimationFrame(step);
        }
      }
    });

    // Remove markers for techs that are offline/not returned anymore.
    Object.keys(techMarkerByUserRef.current).forEach((key) => {
      if (liveIds.has(key)) return;
      const marker = techMarkerByUserRef.current[key];
      if (marker) marker.setMap(null);
      delete techMarkerByUserRef.current[key];
      delete techDataByUserRef.current[key];
      const prior = techAnimByUserRef.current[key];
      if (prior) cancelAnimationFrame(prior);
      delete techAnimByUserRef.current[key];
    });

    techMarkersRef.current = Object.values(techMarkerByUserRef.current);
  }

  // ── Info window ──────────────────────────────────────────────────────────
  function showInfoWindow(outage: Outage, marker: google.maps.Marker) {
    if (!infoWindowRef.current || !mapObj.current) return;
    const cfg = getStatusConfig(outage.status);
    const row = (label: string, value: string | number | null | undefined) =>
      value != null && value !== ""
        ? `<div style="font-size:12px;color:#374151;margin-bottom:3px"><b>${label}:</b> ${value}</div>`
        : "";
    const assignedBadge = outage.assignedTechName
      ? `<div style="font-size:12px;color:#0d9488;font-weight:700;margin-bottom:8px;padding:6px 10px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px">Assigned tech: ${outage.assignedTechName}</div>`
      : "";
    const content = `
      <div style="font-family:system-ui;padding:12px;min-width:280px;max-width:320px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="width:10px;height:10px;background:${cfg.color};border-radius:50%;flex-shrink:0;display:inline-block"></span>
          <strong style="font-size:14px;line-height:1.3">${outage.streetAddress?.split(",")[0] ?? outage.city ?? `Outage #${outage.id}`}</strong>
        </div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:8px">${outage.streetAddress ?? "Address resolving…"}</div>
        ${assignedBadge}
        <div style="border-top:1px solid #f0f0f0;padding-top:8px;margin-bottom:8px">
          ${row("Customers affected", outage.customers)}
          ${row("Outage type", outage.outageType)}
          ${row("Customer", outage.customerName)}
          ${row("Phone", outage.customerPhone)}
          ${row("Lead source", outage.leadSource)}
          ${row("Assigned tech", outage.assignedTechName)}
          ${row("Office notes", outage.officeNotes)}
          ${row("Job status", outage.externalJobStatus)}
          ${row("Cause", outage.cause)}
          ${row("Crew status", outage.crewStatus)}
          ${row("Impact", outage.outageImpact)}
          ${row("ETR", outage.etr)}
          ${row("Source", outage.source)}
          ${row("Priority score", Math.round(outage.priorityScore ?? 0))}
          <div style="font-size:12px;color:#374151;margin-bottom:3px"><b>Status:</b> <span style="color:${cfg.badgeText};font-weight:600">${cfg.label}</span></div>
        </div>
        <div style="display:flex;gap:6px">
          <a href="https://www.google.com/maps/dir/?api=1&destination=${outage.lat},${outage.lng}"
             target="_blank"
             style="flex:1;padding:7px;background:#0d9488;color:#fff;text-decoration:none;border-radius:6px;font-size:11px;text-align:center;font-weight:600">
            Google Maps
          </a>
          <a href="https://waze.com/ul?ll=${outage.lat},${outage.lng}&navigate=yes"
             target="_blank"
             style="flex:1;padding:7px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:6px;font-size:11px;text-align:center;font-weight:600">
            Waze
          </a>
        </div>
      </div>`;
    infoWindowRef.current.setContent(content);
    infoWindowRef.current.open({ map: mapObj.current, anchor: marker });
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  // Opens Google Maps for turn-by-turn directions. Must run synchronously inside
  // the click handler so iOS Safari allows the new tab / app handoff.
  function openGoogleMapsDirections(
    destination: { lat: number; lng: number },
    origin?: { lat: number; lng: number } | null
  ) {
    const params = new URLSearchParams({
      api: "1",
      destination: `${destination.lat},${destination.lng}`,
      travelmode: "driving",
    });
    if (origin) params.set("origin", `${origin.lat},${origin.lng}`);
    const a = document.createElement("a");
    a.href = `https://www.google.com/maps/dir/?${params.toString()}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // navTargetRef stores coords; incrementing navVersion triggers the effect.
  // This fires even when activeTab is already "map", fixing repeat-navigate bug.
  function navigateToLatLng(lat: number, lng: number, _label?: string, outage?: Outage) {
    openGoogleMapsDirections({ lat, lng }, userLocation);
    navTargetRef.current = { lat, lng, userLoc: userLocation, outage: outage ?? null };
    if (outage) {
      setSelectedOutage(outage);
      markPendingVisit(outage);
      if (user?.role === "tech" && needsInvestigation(outage.status)) {
        openInvestigation(outage);
      }
    }
    setActiveTab("map");
    setNavVersion((v) => v + 1);
  }

  function routeFromTechToJob(techLat: number, techLng: number, jobLat: number, jobLng: number, _label?: string) {
    navTargetRef.current = { lat: jobLat, lng: jobLng, userLoc: { lat: techLat, lng: techLng }, outage: null };
    setActiveTab("map");
    setNavVersion((v) => v + 1);
  }

  // ── Manual test outage (simulation mode map click) ────────────────────────
  async function submitManualOutage() {
    if (!manualOutageCoords || !token) return;
    setManualOutageSubmitting(true);
    try {
      const res = await fetch("/api/simulation/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lat: manualOutageCoords.lat,
          lng: manualOutageCoords.lng,
          customers: manualOutageCustomers,
          outageType: manualOutageType,
          notes: manualOutageNotes || undefined,
        }),
      });
      if (res.ok) {
        setShowManualOutageForm(false);
        fetchOutages();
      }
    } catch {}
    setManualOutageSubmitting(false);
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportOutagesCSV() {
    const header = ["ID", "Address", "City", "County", "Status", "Customers", "Cause", "Source", "Priority Score", "Lat", "Lng"];
    const rows = outages.map((o) => [
      o.id,
      o.streetAddress ?? "",
      o.city ?? "",
      o.county ?? "",
      o.status,
      o.customers,
      o.cause ?? "",
      o.source ?? "",
      Math.round(o.priorityScore ?? 0),
      o.lat,
      o.lng,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outages-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const myRoutingContext = useMemo((): RoutingContext => {
    const base: RoutingContext = {
      hideStaleMarkers: !showStaleOnMap,
      tempOutMode,
    };
    if (!user || user.role !== "tech") return base;

    const me = techs.find((t) => t.userId === user.id);
    if (!me) return { ...base, dispatchRole: "hunter" };

    let territory = null;
    if (me.territoryId) {
      const zone = zones.find((z) => z.id === me.territoryId);
      if (zone) {
        territory = territoryFromRow({ zip_codes: zone.zip_codes, geometry: zone.geometry });
      }
    }

    return {
      ...base,
      dispatchRole: me.dispatchRole ?? "hunter",
      installerFallback: me.installerFallback ?? "hunter",
      territory,
    };
  }, [user, techs, zones, showStaleOnMap, tempOutMode]);

  function routeToNext() {
    if (!userLocation) {
      alert("Enable location access to use Route to Next.");
      return;
    }
    if (!requirePendingInvestigation()) return;
    const routable = outages.map((o) => ({
      ...o,
      inPriorityZone: zones.some((z) => z.type === "polygon" && zoneTypeOf(z) === "priority" && isInZone(o, z)),
      inExclusionZone: zones.some((z) => z.type === "polygon" && zoneTypeOf(z) === "exclusion" && isInZone(o, z)),
      isHoneyHole: (o.status === "opportunity" || o.status === "wants_to_proceed") && o.customers > 1,
    }));
    const next = pickNextRouteStop(
      routable,
      userLocation,
      stormPhase,
      loadSavedVisits(),
      routingMode,
      myRoutingContext
    );
    if (!next) {
      alert("No actionable stops remaining on the map.");
      return;
    }
    navigateToLatLng(next.lat, next.lng, next.streetAddress ?? next.city, next);
  }

  // ── Status update ────────────────────────────────────────────────────────
  function updateStatus(
    id: number | string,
    status: OutageStatus,
    visit?: FieldVisitCache
  ) {
    const patch: FieldVisitCache = { status, ...visit };
    saveFieldVisit(id, patch);

    setOutages((prev) =>
      prev.map((o) =>
        o.id === id
          ? mergeOutageWithVisit({ ...o, status }, patch)
          : o
      )
    );

    if (selectedOutage?.id === id) {
      setSelectedOutage((p) => p && mergeOutageWithVisit({ ...p, status }, patch));
    }
    if (detailOutage?.id === id) {
      setDetailOutage((p) => p && mergeOutageWithVisit({ ...p, status }, patch));
    }
    if (investigatingOutage?.id === id) {
      setInvestigatingOutage((p) => p && mergeOutageWithVisit({ ...p, status }, patch));
    }

    fetch("/api/outages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ id, status }),
    }).catch(() => {});

    void fetchOutages();
  }

  async function removeMarker(id: number | string) {
    if (!token) return;
    const ok = window.confirm("Remove this dot from active map?");
    if (!ok) return;
    try {
      const res = await fetch("/api/outages/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "deactivate_one", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setOutages((prev) => prev.filter((o) => String(o.id) !== String(id)));
      if (detailOutage && String(detailOutage.id) === String(id)) {
        setShowDetail(false);
        setDetailOutage(null);
      }
    } catch (err: any) {
      alert(err.message || "Could not remove marker");
    }
  }

  // ── Auth handlers ────────────────────────────────────────────────────────
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          authMode === "login"
            ? { action: "login", email, password }
            : { action: "register", email, password, name, phone, role: roleSelect }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Auth failed");
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("fieldmap_user", JSON.stringify(data.user));
      localStorage.setItem("fieldmap_token", data.token);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    setUser(null);
    setToken(null);
    setPreAuthScreen("landing");
    localStorage.removeItem("fieldmap_user");
    localStorage.removeItem("fieldmap_token");
    setOutages([]);
    setTechs([]);
    setEmail(""); setPassword(""); setName(""); setPhone("");
  }

  function handleSessionExpired(message?: string) {
    localStorage.removeItem("fieldmap_user");
    localStorage.removeItem("fieldmap_token");
    setUser(null);
    setToken(null);
    setOutages([]);
    setTechs([]);
    setPreAuthScreen("auth");
    setAuthError(message ?? "Session expired — please sign in again.");
  }

  function handleUserUpdate(updatedUser: User, newToken: string) {
    setUser(updatedUser);
    setToken(newToken);
    localStorage.setItem("fieldmap_user", JSON.stringify(updatedUser));
    localStorage.setItem("fieldmap_token", newToken);
  }

  // ── Report outage ────────────────────────────────────────────────────────
  /**
   * Open the form with empty fields when geolocation is denied/unavailable
   * so the tech can still type an address manually. Center on the
   * map's current center as a coordinate fallback.
   */
  function openManualEntryFallback(message?: string) {
    const center = mapObj.current?.getCenter();
    const lat = center?.lat() ?? CENTER.lat;
    const lng = center?.lng() ?? CENTER.lng;
    setReportLat(lat);
    setReportLng(lng);
    setReportedAddress(" "); // non-empty so the manual address form is shown
    setReportAddressEdit("");
    setReportStreet("");
    setReportCity("");
    setReportState("");
    setReportZip("");
    setReportingLocation(false);
    if (message) alert(message);
  }

  async function getLocationAndReport() {
    if (!navigator.geolocation) {
      openManualEntryFallback("Geolocation not supported. Please enter the address manually.");
      return;
    }
    setReportingLocation(true);

    // Defensive client-side timeout: some browsers never fire either callback
    // when the permission dialog is dismissed without a choice, or when the
    // OS-level geolocation provider stalls. Cap the wait at ~12s.
    let settled = false;
    const watchdog = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      openManualEntryFallback(
        "Could not get your location in time. You can still enter the address manually."
      );
    }, 12_000);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setReportLat(lat); setReportLng(lng);
        try {
          const r = await fetch("/api/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng }),
          });
          const d = await r.json();
          const resolved = d.address?.formattedAddress ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setReportedAddress(resolved);
          setReportAddressEdit(resolved);
          const chunks = String(resolved).split(",").map((p) => p.trim());
          setReportStreet(chunks[0] ?? "");
          setReportCity(chunks[1] ?? "");
          const stateZip = chunks[2] ?? "";
          const [st = "", zp = ""] = stateZip.split(/\s+/);
          setReportState(st);
          setReportZip(zp);
        } catch {
          const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setReportedAddress(fallback);
          setReportAddressEdit(fallback);
          setReportStreet("");
          setReportCity("");
          setReportState("");
          setReportZip("");
        }
        setReportingLocation(false);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        const reason =
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Enter the address manually below."
            : err.code === err.POSITION_UNAVAILABLE
              ? "Your device couldn't determine a location. Enter the address manually below."
              : err.code === err.TIMEOUT
                ? "Location request timed out. Enter the address manually below."
                : "Could not get your location. Enter the address manually below.";
        openManualEntryFallback(reason);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  async function submitReport() {
    if (!user || !reportLat || !reportLng) return;
    if (!reportStreet.trim() || !reportCity.trim() || !reportState.trim() || !reportZip.trim()) {
      alert("Please fill Street, City, State, and ZIP before creating an opportunity.");
      return;
    }
    setReportingLocation(true);
    try {
      const composedAddress = `${reportStreet.trim()}, ${reportCity.trim()}, ${reportState.trim()} ${reportZip.trim()}`;
      // Pin location follows the typed address (same idea as office New Job).
      // Falls back to GPS from "Get My Location" if forward-geocode fails.
      let submitLat = reportLat;
      let submitLng = reportLng;
      let streetForDb = composedAddress;
      try {
        const geoRes = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: composedAddress }),
        });
        const geoData = await geoRes.json().catch(() => ({}));
        if (
          geoRes.ok &&
          geoData?.success &&
          geoData.mode === "forward" &&
          typeof geoData.lat === "number" &&
          typeof geoData.lng === "number"
        ) {
          submitLat = geoData.lat;
          submitLng = geoData.lng;
          if (typeof geoData.formattedAddress === "string" && geoData.formattedAddress.trim()) {
            streetForDb = geoData.formattedAddress.trim();
          }
        } else if (geoRes.status === 404) {
          alert(
            "That address could not be found on the map. The pin will use your GPS location instead."
          );
        }
      } catch {
        /* network error — keep GPS */
      }

      const res = await fetch("/api/user-outages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: submitLat,
          lng: submitLng,
          streetAddress: streetForDb,
          city: reportCity.trim(),
          description: reportDescription,
          customers: 1,
          customerName: reportCustomerName.trim() || null,
          customerPhone: reportCustomerPhone.trim() || null,
          customerEmail: reportCustomerEmail.trim() || null,
          source: "self_generated",
          userId: user.id, userName: user.name, userEmail: user.email,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const newOutage: Outage = {
          id: data?.outage?.id ?? `tmp-${Date.now()}`,
          lat: data?.outage?.lat ?? submitLat,
          lng: data?.outage?.lng ?? submitLng,
          customers: data?.outage?.customers ?? 1,
          customerName: reportCustomerName.trim() || undefined,
          customerPhone: reportCustomerPhone.trim() || undefined,
          county: "Unknown",
          city: reportCity || undefined,
          streetAddress: streetForDb,
          outageType: "Self-generated Opportunity",
          cause: reportDescription || undefined,
          status: "unvisited",
          source: "self_generated",
          leadSource: "self_generated",
          priorityScore: 0,
        };
        setShowReportModal(false);
        setReportedAddress(null);
        setReportAddressEdit("");
        setReportStreet("");
        setReportCity("");
        setReportState("");
        setReportZip("");
        setReportDescription("");
        setReportCustomerName("");
        setReportCustomerPhone("");
        setReportCustomerEmail("");
        // Optimistic add: render the diamond immediately so the tech sees it
        // even before the next /api/outages refresh completes.
        setOutages((prev) => {
          if (prev.some((o) => String(o.id) === String(newOutage.id))) return prev;
          return [...prev, newOutage];
        });
        fetchOutages();
        openInvestigation(newOutage);
      } else {
        alert(data.error ?? "Failed to report");
      }
    } catch { alert("Failed to submit"); }
    setReportingLocation(false);
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = {
    total: outages.length,
    unvisited:       outages.filter((o) => isUnvisitedOnMap(o.status)).length,
    noOpportunity:   outages.filter((o) => o.status === "no_opportunity").length,
    opportunity:     outages.filter((o) => o.status === "opportunity").length,
    doorHanger:      outages.filter((o) => o.status === "door_hanger").length,
    wantsToProceed:  outages.filter((o) => o.status === "wants_to_proceed").length,
    customerThinking: outages.filter((o) => o.status === "customer_thinking").length,
    sold: outages.filter((o) => o.status === "sold").length,
    jobStarted: outages.filter((o) => o.status === "job_started").length,
    tempPower:       outages.filter((o) => o.status === "temp_power").length,
    grounding:       outages.filter((o) => o.status === "grounding").length,
    completed:       outages.filter((o) => o.status === "completed").length,
    // Legacy alias — investigating rows count as unvisited on the map
    investigated: outages.filter((o) => isUnvisitedOnMap(o.status)).length,
    inProgress:   outages.filter((o) => ["opportunity","door_hanger","wants_to_proceed","temp_power","grounding"].includes(o.status)).length,
    totalCustomers: outages.reduce((s, o) => s + (o.customers ?? 0), 0),
  };

  const filteredOutages = outages.filter((o) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "job_sold") return o.status === "sold" || o.status === "wants_to_proceed";
    if (filterStatus === "unvisited") return isUnvisitedOnMap(o.status);
    return o.status === filterStatus;
  });

  // ── Role-based tab visibility ────────────────────────────────────────────
  const isOffice = user?.role === "office" || user?.role === "admin" || user?.role === "owner";
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  const tabs: { id: Tab; label: string; icon: string; officeOnly?: boolean; adminOnly?: boolean }[] = [
    { id: "dashboard", label: "Dashboard", icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
    { id: "map",       label: "Live Map",  icon: "M1 6l7-5 8 5-8 5-7-5zM1 17l7 4 8-4M1 11l7 4 8-4" },
    { id: "outages",   label: "Outages",   icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },
    { id: "opportunities", label: "Opportunities", icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
    { id: "queue",     label: "Job Queue", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", officeOnly: false },
    { id: "techs",       label: "Techs",       icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75", officeOnly: true },
    { id: "territories", label: "Territories", icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7", officeOnly: true },
    { id: "admin",       label: "Admin",       icon: "M12 1l3 6 6.5 1-4.75 4.5 1 6.5-5.75-3-5.75 3 1-6.5L2 8l6.5-1z", adminOnly: false, officeOnly: true },
    { id: "guide",       label: "Guide",       icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
    { id: "profile",   label: "Profile",   icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" },
  ];

  const visibleTabs = tabs.filter((t) => {
    if (t.adminOnly && !isAdmin) return false;
    if (t.officeOnly && !isOffice) return false;
    return true;
  });

  // ── Auth screen ──────────────────────────────────────────────────────────
  if (authBootstrapping) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", color: "#6b7280" }}>
        Checking session…
      </div>
    );
  }

  if (!user) {
    if (preAuthScreen === "landing") {
      return (
        <div style={{ minHeight: "100vh", padding: "32px 20px", background: "linear-gradient(135deg, #0f172a 0%, #0d9488 55%, #0891b2 100%)", fontFamily: "system-ui", color: "#fff" }}>
          <div style={{ maxWidth: "980px", margin: "0 auto" }}>
            <h1 style={{ margin: 0, fontSize: "36px", fontWeight: 800 }}>Storm Response Platform</h1>
            <p style={{ margin: "10px 0 24px", maxWidth: "760px", fontSize: "16px", opacity: 0.95 }}>
              Fast field investigations, clear dispatch lists, routing optimization, and office controls for high-volume storm operations.
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "22px" }}>
              <Link href="/docs" style={{ padding: "11px 16px", background: "#fff", color: "#0f766e", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>
                Read Documentation
              </Link>
              <Link href="/docs/guide" style={{ padding: "11px 16px", background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "8px", fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>
                Site Navigation Guide
              </Link>
              <button onClick={() => setPreAuthScreen("auth")} style={{ padding: "11px 16px", background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}>
                Continue to Login
              </button>
            </div>
            <div style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "12px", padding: "16px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", marginBottom: "8px" }}>What this platform does</div>
              <ul style={{ margin: 0, paddingLeft: "18px", lineHeight: 1.7 }}>
                <li>Separates Outages, Opportunities, and Job Queue</li>
                <li>Supports multi-stop routing, smart dispatch, and cluster targeting</li>
                <li>Tracks tech GPS in near real-time with ETA and auto-arrival updates</li>
                <li>Includes storm phase, temp-out mode, cleanup, exports, and admin controls</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)", fontFamily: "system-ui" }}>
        <div style={{ background: "#fff", padding: "48px", borderRadius: "16px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)", width: "100%", maxWidth: "420px" }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div style={{ width: "60px", height: "60px", background: "linear-gradient(135deg,#0d9488,#0891b2)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <polygon points="1 6 1 22 8 18 16 22 21 18 21 2 16 6 8 2 1 6"/>
              </svg>
            </div>
            <h1 style={{ margin: "0 0 6px", fontSize: "22px", fontWeight: 700, color: "#1f2937" }}>Outage Field Map</h1>
            <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>Xcel + Connexus · Dispatch · Routing</p>
            <button
              onClick={() => setPreAuthScreen("landing")}
              style={{ marginTop: "10px", border: "none", background: "transparent", color: "#0d9488", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}
            >
              ← Back to landing
            </button>
          </div>

          {authError && (
            <div style={{ padding: "12px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px", color: "#dc2626", fontSize: "14px", marginBottom: "16px" }}>
              {authError}
            </div>
          )}

          <form onSubmit={handleAuth}>
            {authMode === "register" && (
              <>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" required style={inputCss} />
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" style={inputCss} />
                <select value={roleSelect} onChange={(e) => setRoleSelect(e.target.value as Role)} style={{ ...inputCss, color: "#1f2937" }}>
                  <option value="tech">Field Technician</option>
                  <option value="office">Office Staff</option>
                </select>
              </>
            )}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required style={inputCss} />
            <div style={{ position: "relative", marginBottom: "12px" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                style={{ ...inputCss, marginBottom: 0, paddingRight: "84px" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "32px",
                  height: "32px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  background: "#fff",
                  color: "#0d9488",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  zIndex: 1,
                }}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.74-2.09 2.1-3.91 3.88-5.32" />
                    <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
                    <path d="M1 1l22 22" />
                    <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.05 11.05 0 0 1-1.67 3.01" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <button type="submit" disabled={authLoading} style={{ width: "100%", padding: "12px", background: authLoading ? "#9ca3af" : "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: 600, cursor: "pointer", marginBottom: "16px" }}>
              {authLoading ? "Please wait..." : authMode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div style={{ textAlign: "center", fontSize: "14px", color: "#6b7280" }}>
            {authMode === "login" ? (
              <>Don't have an account?{" "}
                <button onClick={() => { setAuthMode("register"); setAuthError(null); }} style={linkBtnCss}>Sign up</button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button onClick={() => { setAuthMode("login"); setAuthError(null); }} style={linkBtnCss}>Sign in</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Nav helper — close sidebar on mobile after tab change ────────────────
  function gotoTab(tab: Tab) {
    setActiveTab(tab);
    if (isMobile) setSidebarOpen(false);
  }

  // ── Main app layout ──────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", display: "flex", fontFamily: "system-ui,-apple-system,sans-serif", background: "#f3f4f6", overflow: "hidden" }}>

      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 40, backdropFilter: "blur(1px)" }}
        />
      )}

      {/* Sidebar */}
      <div style={{
        width: "260px",
        background: "#fff",
        borderRight: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        // Mobile: fixed drawer off-screen by default
        ...(isMobile ? {
          position: "fixed",
          top: 0,
          left: 0,
          height: "100%",
          zIndex: 50,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
          boxShadow: sidebarOpen ? "4px 0 20px rgba(0,0,0,0.15)" : "none",
        } : {}),
      }}>
        {/* Logo */}
        <div style={{ padding: "18px 16px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", background: "linear-gradient(135deg,#0d9488,#0891b2)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <polygon points="1 6 1 22 8 18 16 22 21 18 21 2 16 6 8 2 1 6"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#1f2937" }}>Field Map</div>
              <div style={{ fontSize: "11px", color: "#6b7280" }}>Outage Response</div>
            </div>
          </div>
        </div>

        {/* Source toggles */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Data Sources</div>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", cursor: "pointer" }}
            onClick={() => setActiveSources((prev) => prev.includes("xcel") ? prev.filter((s) => s !== "xcel") : [...prev, "xcel"])}>
            <span style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>Xcel Outages</span>
            <div style={toggleCss(activeSources.includes("xcel"), "#0d9488")}><div style={toggleKnobCss(activeSources.includes("xcel"))} /></div>
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
            onClick={() => setConnexusEnabled(!connexusEnabled)}>
            <span style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>Connexus Outages</span>
            <div style={toggleCss(connexusEnabled, "#0d9488")}><div style={toggleKnobCss(connexusEnabled)} /></div>
          </label>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af", margin: "12px 0 8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Map Layers</div>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", cursor: "pointer" }}
            onClick={() => setHideDoneMarkers((v) => !v)}>
            <span style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>Hide Done</span>
            <div style={toggleCss(hideDoneMarkers, "#6b7280")}><div style={toggleKnobCss(hideDoneMarkers)} /></div>
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", cursor: "pointer" }}
            onClick={() => setHideDeclinedMarkers((v) => !v)}>
            <span style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>Hide Declined</span>
            <div style={toggleCss(hideDeclinedMarkers, "#6b7280")}><div style={toggleKnobCss(hideDeclinedMarkers)} /></div>
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", cursor: "pointer" }}
            onClick={() => setHideNonCriticalMarkers((v) => !v)}>
            <span style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>Hide non-critical markers</span>
            <div style={toggleCss(hideNonCriticalMarkers, "#6b7280")}><div style={toggleKnobCss(hideNonCriticalMarkers)} /></div>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "6px" }}>
            <span style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>Storm visibility</span>
            <select
              value={stormVisibilityMode}
              onChange={(e) => setStormVisibilityMode(e.target.value as typeof stormVisibilityMode)}
              style={{ padding: "7px 8px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px", color: "#374151" }}
            >
              <option value="active_only">Active storm only</option>
              <option value="active_and_previous">Active + previous (faded)</option>
              <option value="all">All storms</option>
            </select>
          </label>
          {activeStormEvent && (
            <div style={{ fontSize: "11px", color: "#0d9488", marginBottom: "6px", fontWeight: 600 }}>
              Active: {activeStormEvent.name}
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
            onClick={() => setShowStaleOnMap((v) => !v)}>
            <span style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>Show 48h+ stale dots</span>
            <div style={toggleCss(showStaleOnMap, "#6b7280")}><div style={toggleKnobCss(showStaleOnMap)} /></div>
          </label>
        </div>

        {/* Sim mode banner */}
        {isSimMode && (
          <div style={{ margin: "0", padding: "8px 16px", background: "#fff7ed", borderBottom: "1px solid #fed7aa" }}>
            <div style={{ fontSize: "11px", color: "#92400e", fontWeight: 700 }}>⚡ SIMULATION MODE</div>
            <div style={{ fontSize: "11px", color: "#b45309" }}>Synthetic storm data active</div>
          </div>
        )}
        {isStale && (
          <div style={{ padding: "6px 16px", background: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
            <div style={{ fontSize: "11px", color: "#78350f", fontWeight: 600 }}>⚠ Stale data (API offline)</div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ padding: "12px 10px", flex: 1, overflowY: "auto" }}>
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => gotoTab(tab.id)}
              style={{
                width: "100%",
                padding: "9px 12px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: activeTab === tab.id ? "#ccfbf1" : "transparent",
                color: activeTab === tab.id ? "#0d9488" : "#374151",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: "pointer",
                marginBottom: "2px",
                textAlign: "left",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={tab.icon}/>
              </svg>
              {tab.label}
              {tab.id === "outages" && (
                <span style={{ marginLeft: "auto", background: "#0d9488", color: "#fff", padding: "1px 6px", borderRadius: "10px", fontSize: "11px" }}>
                  {outages.length}
                </span>
              )}
              {tab.id === "opportunities" && (
                <span style={{ marginLeft: "auto", background: "#f97316", color: "#fff", padding: "1px 6px", borderRadius: "10px", fontSize: "11px" }}>
                  {stats.opportunity + stats.doorHanger + stats.customerThinking}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* User card → Profile */}
        <div style={{ padding: "14px 16px", borderTop: "1px solid #e5e7eb" }}>
          <button
            onClick={() => gotoTab("profile")}
            style={{
              width: "100%", textAlign: "left", background: activeTab === "profile" ? "#f0fdf4" : "transparent",
              border: activeTab === "profile" ? "1px solid #bbf7d0" : "1px solid transparent",
              borderRadius: "8px", padding: "8px 10px", cursor: "pointer", marginBottom: "8px",
              display: "flex", alignItems: "center", gap: "10px",
            }}
          >
            {/* Mini avatar */}
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
              background: isAdmin ? "#7c3aed" : isOffice ? "#0891b2" : "#0d9488",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "12px", fontWeight: 700,
            }}>
              {user.name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#1f2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
              <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "capitalize" }}>{user.role}</div>
            </div>
          </button>
          <button onClick={handleLogout} style={{ width: "100%", padding: "7px", background: "transparent", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px", color: "#6b7280", cursor: "pointer" }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Header */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: isMobile ? "10px 12px" : "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            {/* Hamburger — mobile only */}
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(true)}
                style={{ background: "none", border: "none", padding: "4px", cursor: "pointer", color: "#374151", flexShrink: 0, display: "flex", alignItems: "center" }}
                aria-label="Open menu"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="3" y1="6"  x2="21" y2="6"/>
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
            )}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: isMobile ? "16px" : "18px", fontWeight: 700, color: "#1f2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {visibleTabs.find((t) => t.id === activeTab)?.label ?? "Dashboard"}
              </h1>
              {!isMobile && (
                <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#6b7280" }}>
                  {outages.length} outages · {RADIUS_MILES}mi radius · {stats.totalCustomers.toLocaleString()} customers affected
                </p>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
            {isOffice && (
              <button onClick={() => setShowJobForm(true)} style={btnCss("#7c3aed")}>
                {isMobile ? "+" : "+ New Job"}
              </button>
            )}
            {user.role === "tech" && (
              <button onClick={() => setShowReportModal(true)} style={btnCss("#ef4444")}>
                {isMobile ? "◇" : "Add Opportunity"}
              </button>
            )}
            {activeTab === "map" && (
              <button
                onClick={routeToNext}
                disabled={routeBlockedByPending}
                title={routeBlockedByPending ? "Submit investigation for current stop first" : undefined}
                style={{
                  ...btnCss("#0d9488"),
                  ...(routeBlockedByPending ? { opacity: 0.45, cursor: "not-allowed" } : {}),
                }}
              >
                {isMobile ? "→" : "Route to Next"}
              </button>
            )}
            {lastUpdatedAt && !isMobile && (
              <span style={{ fontSize: "12px", color: "#9ca3af", alignSelf: "center", whiteSpace: "nowrap" }}>
                Updated {lastUpdatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button onClick={() => { fetchOutages(); fetchTechs(); }} style={{ padding: "7px 10px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "13px", color: "#374151", cursor: "pointer" }}>
              ↻
            </button>
          </div>
        </div>

        {/* Simulation mode banner — prominent, always visible when sim is active */}
        {isSimMode && (
          <div style={{ padding: "10px 20px", background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#fff", flexShrink: 0 }} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>
                TEST MODE ACTIVE — Showing synthetic data. Live outages are NOT shown.
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>
              {activeTab === "map" && isOffice ? "Click map to add test outage" : "Disable in Admin → Simulation"}
            </span>
          </div>
        )}

        {(routingMode === "complicated" && (stormPhase || tempOutMode)) && (
          <div style={{ padding: "10px 20px", background: tempOutMode ? "#fff7ed" : "#ecfeff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: tempOutMode ? "#9a3412" : "#155e75" }}>
                {stormPhase === "phase_1" ? "PHASE 1 — HUNTING MODE" : stormPhase === "phase_2" ? "PHASE 2 — CAPTURE / DISPATCH MODE" : "PHASE 3 — CLEANUP MODE"}
              </span>
              {tempOutMode && (
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", background: "#f97316", borderRadius: "999px", padding: "2px 8px" }}>
                  TEMP-OUT ON
                </span>
              )}
            </div>
            <div style={{ fontSize: "11px", color: "#374151", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <span>Active calls: <b>{activeCallsInQueue}</b></span>
              <span>Sold: <b>{stats.sold}</b></span>
              <span>Confirmed opps: <b>{stats.opportunity + stats.customerThinking + stats.doorHanger}</b></span>
              <span>Temp-out pending return: <b>{stats.tempPower + stats.grounding}</b></span>
            </div>
          </div>
        )}

        {routingMode === "simple" && (
          <div style={{ padding: "10px 20px", background: "#f0fdf4", borderBottom: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#166534" }}>
              SIMPLE ROUTING — nearest stop with basic status priority
            </span>
            <div style={{ fontSize: "11px", color: "#374151", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <span>Active calls: <b>{activeCallsInQueue}</b></span>
              <span>Sold: <b>{stats.sold}</b></span>
            </div>
          </div>
        )}

        {pinAdjustLabel && activeTab === "map" && (
          <div style={{ padding: "10px 20px", background: "#eff6ff", borderBottom: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#1d4ed8" }}>
              Tap the map to set the pin for {pinAdjustLabel}
            </span>
            <button
              type="button"
              onClick={cancelPinAdjust}
              style={{ padding: "6px 12px", background: "#fff", border: "1px solid #bfdbfe", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "#1e40af" }}
            >
              Cancel
            </button>
          </div>
        )}

        {pendingVisitId && user?.role === "tech" && activeTab === "map" && (
          <div style={{ padding: "10px 20px", background: "#fef3c7", borderBottom: "1px solid #fcd34d", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#92400e" }}>
              Investigation required — clear your current stop before Route to Next
            </span>
            <button
              type="button"
              onClick={() => {
                const pending = outages.find((o) => String(o.id) === pendingVisitId);
                if (pending) openInvestigation(pending);
              }}
              style={{ padding: "6px 12px", background: "#d97706", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
            >
              Open investigation
            </button>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "12px" : "20px 24px" }}>
          {/* ── DASHBOARD ─────────────────────────────────────────────── */}
          {activeTab === "dashboard" && (
            <div>
              <PageHelp pageId="dashboard" />
              {/* Stat Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "14px", marginBottom: "24px" }}>
                {[
                  { label: "Total Outages",     value: stats.total,          color: "#374151", bg: "#f9fafb" },
                  { label: "Unvisited",         value: stats.unvisited,      color: "#9ca3af", bg: "#f9fafb" },
                  { label: "Opportunities",     value: stats.opportunity + stats.wantsToProceed, color: "#f97316", bg: "#fff7ed" },
                  { label: "Active Calls in Queue", value: activeCallsInQueue, color: "#2563eb", bg: "#eff6ff" },
                  { label: "Sold Jobs",         value: stats.sold,           color: "#16a34a", bg: "#f0fdf4" },
                  { label: "Confirmed Opportunities", value: stats.opportunity + stats.customerThinking + stats.doorHanger, color: "#ea580c", bg: "#fff7ed" },
                  { label: "Temp-Out Pending Return", value: stats.tempPower + stats.grounding, color: "#ca8a04", bg: "#fffbeb" },
                  { label: "Door Hangers",      value: stats.doorHanger,     color: "#eab308", bg: "#fefce8" },
                  { label: "Follow-Up Needed",  value: stats.tempPower + stats.grounding, color: "#22c55e", bg: "#f0fdf4" },
                  { label: "Completed",         value: stats.completed,      color: "#10b981", bg: "#ecfdf5" },
                  { label: "Customers Affected",value: stats.totalCustomers.toLocaleString(), color: "#7c3aed", bg: "#f5f3ff" },
                ].map((s) => (
                  <div key={s.label} style={{ background: "#fff", borderRadius: "10px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", borderLeft: `4px solid ${s.color}` }}>
                    <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>{s.label}</div>
                    <div style={{ fontSize: "26px", fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {error && <div style={{ padding: "12px", background: "#fee2e2", borderRadius: "8px", color: "#dc2626", marginBottom: "16px", fontSize: "14px" }}>{error}</div>}

              {/* Tech summary on dashboard */}
              {techs.length > 0 && (
                <div style={{ background: "#fff", borderRadius: "10px", padding: "16px", marginBottom: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#1f2937", marginBottom: "10px" }}>Technician Status</div>
                  <div style={{ display: "flex", gap: "16px" }}>
                    {(["available", "working", "paused", "offline"] as const).map((s) => (
                      <div key={s} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "10px", height: "10px", background: TECH_STATUS_COLOR[s], borderRadius: "50%" }} />
                        <span style={{ fontSize: "13px", color: "#374151" }}>{techs.filter((t) => t.status === s).length} {s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent outages table */}
              <div style={{ background: "#fff", borderRadius: "10px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, color: "#1f2937", fontSize: "14px" }}>
                  Recent Outages (Top 10 by Priority)
                </div>
                <div style={{ overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {["Location", "Status", "Customers", "Source", "Score", "Actions"].map((h) => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: h === "Customers" || h === "Score" ? "center" : "left", fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...outages].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0)).slice(0, 10).map((o) => {
                        const cfg = getStatusConfig(o.status);
                        return (
                          <tr key={o.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "12px 16px" }}>
                              <div style={{ fontWeight: 500, color: "#1f2937", fontSize: "13px" }}>{o.streetAddress?.split(",")[0] ?? `Outage #${o.id}`}</div>
                              <div style={{ fontSize: "11px", color: "#9ca3af" }}>{o.streetAddress ?? "Address unavailable"}</div>
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={statusBadgeStyle(cfg)}>{cfg.label}</span>
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, color: "#1f2937", fontSize: "13px" }}>{o.customers}</td>
                            <td style={{ padding: "12px 16px", fontSize: "11px", color: "#6b7280", textTransform: "uppercase" }}>{o.source ?? "xcel"}</td>
                            <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, color: "#0d9488", fontSize: "13px" }}>{Math.round(o.priorityScore ?? 0)}</td>
                            <td style={{ padding: "12px 16px" }}>
                              <button onClick={() => { setDetailOutage(o); setShowDetail(true); }} style={{ padding: "5px 10px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                                View
                              </button>
                              {isOffice && (
                                <button
                                  onClick={() => removeMarker(o.id)}
                                  style={{ marginLeft: "6px", padding: "5px 10px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                                >
                                  Remove
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "map" && <PageHelp pageId="map" />}

          {/* ── MAP — always mounted so the Google Maps instance is never detached ── */}
          <div style={{ display: activeTab === "map" ? "block" : "none" }}>
            <div style={{ background: "#fff", borderRadius: isMobile ? "8px" : "12px", padding: isMobile ? "4px" : "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", height: isMobile ? "calc(100vh - 110px)" : "calc(100vh - 140px)", position: "relative" }}>
              {!mapReady && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
                  Loading map...
                </div>
              )}
              <div ref={mapRef} style={{ width: "100%", height: "100%", borderRadius: "8px" }} />

              {/* Legend — collapsible; hidden on mobile to save space */}
              {!isMobile && (
                <div style={{
                  position: "absolute", top: "20px", left: "20px",
                  background: "rgba(255,255,255,0.97)", borderRadius: "10px",
                  padding: legendCollapsed ? "6px 10px" : "10px 14px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.12)", fontSize: "11px",
                  maxHeight: legendCollapsed ? undefined : "calc(100vh - 180px)",
                  overflowY: legendCollapsed ? "visible" : "auto",
                }}>
                  <button
                    type="button"
                    onClick={() => setLegendCollapsed((v) => !v)}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      background: "none", border: "none", cursor: "pointer",
                      padding: 0, fontWeight: 700, color: "#1f2937", fontSize: "12px",
                    }}
                  >
                    <span style={{ fontSize: "10px", color: "#6b7280" }}>{legendCollapsed ? "▶" : "▼"}</span>
                    Legend
                  </button>
                  {!legendCollapsed && (
                    <>
                      <div style={{ fontSize: "10px", color: "#6b7280", margin: "6px 0" }}>Shape = Lead source, color/ring = status</div>
                      <div style={{ borderTop: "1px solid #e5e7eb", marginTop: "2px", paddingTop: "6px", fontWeight: 700, color: "#1f2937", marginBottom: "4px", fontSize: "12px" }}>
                        Lead Source / Shape
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#fff", border: "2px solid #dc2626", flexShrink: 0, display: "inline-block" }} />
                          <span style={{ fontSize: "11px", color: "#374151" }}>ArcGIS — unvisited (utility-confirmed)</span>
                        </div>
                        <div style={{ fontSize: "11px", color: "#374151" }}>● ArcGIS / Xcel (circle)</div>
                        <div style={{ fontSize: "11px", color: "#374151" }}>▲ Office / Call-in (triangle)</div>
                        <div style={{ fontSize: "11px", color: "#374151" }}>◆ Tech-generated (diamond)</div>
                      </div>
                      <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "6px", marginBottom: "4px" }}>
                        Map layer toggles are in the sidebar under Map Layers.
                      </div>
                      <div style={{ borderTop: "1px solid #e5e7eb", marginTop: "4px", paddingTop: "6px", fontWeight: 700, color: "#1f2937", marginBottom: "4px", fontSize: "12px" }}>
                        Status / Color
                      </div>
                      {Object.entries(STATUS_CONFIG).filter(([k]) => !["opportunity", "wants_to_proceed", "investigating"].includes(k)).map(([k, v]) => (
                        <div key={k} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <div style={{
                            width: "12px", height: "12px", borderRadius: "50%",
                            background: v.color,
                            border: `2px solid ${v.strokeColor}`,
                            flexShrink: 0,
                          }} />
                          <span style={{ color: "#374151" }}>{v.label}</span>
                        </div>
                      ))}
                      <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "4px", marginBottom: "6px" }}>
                        Larger orange = honey hole (multi-customer)
                      </div>
                      <div style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "6px" }}>
                        Shape never changes (lead source). Faded = previous storm — toggle in sidebar.
                      </div>
                      <div style={{ borderTop: "1px solid #e5e7eb", marginTop: "4px", paddingTop: "6px", fontWeight: 700, color: "#1f2937", marginBottom: "4px", fontSize: "12px" }}>Technicians</div>
                      {(["available", "working", "paused"] as const).map((s) => (
                        <div key={s} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <div style={{ width: "12px", height: "12px", background: TECH_STATUS_COLOR[s], borderRadius: "2px", flexShrink: 0 }} />
                          <span style={{ color: "#374151", textTransform: "capitalize" }}>{s}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* Map controls */}
              <div style={{ position: "absolute", top: "20px", right: "20px", display: "flex", gap: "8px" }}>
                <button
                  onClick={() => {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition((pos) => {
                        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        setUserLocation(loc);
                        mapObj.current?.setCenter(loc);
                        mapObj.current?.setZoom(14);
                      }, () => alert("Location denied"));
                    }
                  }}
                  style={mapBtnCss}
                >
                  My Location
                </button>
                <button onClick={() => { routeLineRef.current?.setMap(null); setSelectedOutage(null); }} style={mapBtnCss}>
                  Clear Route
                </button>
                <button onClick={() => setMapType((m) => (m === "roadmap" ? "satellite" : "roadmap"))} style={mapBtnCss}>
                  {mapType === "roadmap" ? "Satellite" : "Roadmap"}
                </button>
              </div>

            </div>
          </div>

          {/* ── OUTAGES LIST ───────────────────────────────────────────── */}
          {activeTab === "outages" && (
            <div>
              <PageHelp pageId="outages" />
              {/* Filters + CSV export */}
              <div style={{ background: "#fff", borderRadius: "10px", padding: "14px 18px", marginBottom: "16px", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>Filter:</span>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as OutageStatus | "all" | "job_sold")} style={{ padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "13px" }}>
                  {OUTAGE_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <span style={{ fontSize: "13px", color: "#6b7280" }}>{filteredOutages.length} results</span>
                <button onClick={exportOutagesCSV} style={{ marginLeft: "auto", padding: "7px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px", fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                  Export CSV
                </button>
              </div>

              {loading && <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>Loading outages...</div>}
              {error && <div style={{ padding: "12px", background: "#fee2e2", borderRadius: "8px", color: "#dc2626", marginBottom: "16px" }}>{error}</div>}

              {!loading && filteredOutages.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af", background: "#fff", borderRadius: "10px" }}>No outages found</div>
              )}

              {!loading && filteredOutages.length > 0 && (
                isMobile ? (
                  /* ── Mobile card list ── */
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {filteredOutages.map((o) => {
                      const cfg = getStatusConfig(o.status);
                      return (
                        <div key={o.id} style={{ background: "#fff", borderRadius: "10px", padding: "14px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", borderLeft: `4px solid ${cfg.strokeColor}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 600, color: "#1f2937", fontSize: "14px", marginBottom: "2px" }}>{o.streetAddress?.split(",")[0] ?? o.city ?? `Outage #${o.id}`}</div>
                              <div style={{ fontSize: "11px", color: "#9ca3af" }}>{o.county} · {o.customers} customers · Score {Math.round(o.priorityScore ?? 0)}</div>
                            </div>
                            <span style={{ ...statusBadgeStyle(cfg), flexShrink: 0, marginLeft: "8px" }}>{cfg.label}</span>
                          </div>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <button onClick={() => { setDetailOutage(o); setShowDetail(true); }} style={smBtnCss("#0d9488")}>View</button>
                            <button onClick={() => navigateToLatLng(o.lat, o.lng, o.streetAddress, o)} style={smBtnCss("#0ea5e9")}>Navigate</button>
                            <button onClick={() => openInvestigation(o)} style={smBtnCss("#7c3aed")}>Investigate</button>
                            <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value as OutageStatus)}
                              style={{ padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "11px", cursor: "pointer", flex: 1 }}>
                              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── Desktop table ── */
                  <div style={{ background: "#fff", borderRadius: "10px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          {["Location", "Status", "Customers", "Cause", "ETR", "Score", "Actions"].map((h) => (
                            <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOutages.map((o) => {
                          const cfg = getStatusConfig(o.status);
                          return (
                            <tr key={o.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                              <td style={{ padding: "12px 16px" }}>
                                <div style={{ fontWeight: 500, color: "#1f2937", fontSize: "13px" }}>{o.streetAddress?.split(",")[0] ?? o.city ?? `Outage #${o.id}`}</div>
                                <div style={{ fontSize: "11px", color: "#9ca3af" }}>{o.county ?? "Unknown county"} · {o.source?.toUpperCase()}</div>
                              </td>
                              <td style={{ padding: "12px 16px" }}>
                                <span style={statusBadgeStyle(cfg)}>{cfg.label}</span>
                              </td>
                              <td style={{ padding: "12px 16px", fontWeight: 600, fontSize: "13px", color: "#1f2937" }}>{o.customers}</td>
                              <td style={{ padding: "12px 16px", fontSize: "12px", color: "#6b7280" }}>{o.cause ?? "—"}</td>
                              <td style={{ padding: "12px 16px", fontSize: "12px", color: "#6b7280" }}>{o.etr ?? "TBD"}</td>
                              <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0d9488", fontSize: "13px" }}>{Math.round(o.priorityScore ?? 0)}</td>
                              <td style={{ padding: "12px 16px" }}>
                                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                                  <button onClick={() => { setDetailOutage(o); setShowDetail(true); }} style={smBtnCss("#0d9488")}>View</button>
                                  <button onClick={() => navigateToLatLng(o.lat, o.lng, o.streetAddress, o)} style={smBtnCss("#0ea5e9")}>Go</button>
                                  <button onClick={() => openInvestigation(o)} style={smBtnCss("#7c3aed")}>Investigate</button>
                                  <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value as OutageStatus)}
                                    style={{ padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "11px", cursor: "pointer" }}>
                                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                  </select>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          )}

          {/* ── CONFIRMED OPPORTUNITIES ───────────────────────────────── */}
          {activeTab === "opportunities" && (
            <div>
              <PageHelp pageId="opportunities" />
              <OpportunitiesList
                outages={outages}
                token={token}
                isOffice={isOffice}
                onUpdated={fetchOutages}
                onNavigate={(lat, lng, addr) => {
                  navigateToLatLng(lat, lng, addr);
                  gotoTab("map");
                }}
                onInvestigate={(o) => openInvestigation(o as Outage)}
              />
            </div>
          )}

          {/* ── JOB QUEUE ─────────────────────────────────────────────── */}
          {activeTab === "queue" && token && (
            <>
            <PageHelp pageId="queue" />
            <JobQueue
              token={token}
              role={user.role}
              routingMode={routingMode}
              userLocation={userLocation}
              onNavigate={(lat, lng, addr) => navigateToLatLng(lat, lng, addr)}
              onShowJobForm={() => setShowJobForm(true)}
            />
            </>
          )}

          {/* ── TECHS ─────────────────────────────────────────────────── */}
          {activeTab === "techs" && isOffice && token && (
            <>
            <PageHelp pageId="techs" />
            <TechPanel
              token={token}
              onNavigateToTech={(lat, lng, name) => navigateToLatLng(lat, lng, name)}
              onNavigate={(lat, lng, label) => navigateToLatLng(lat, lng, label)}
              onRouteFromTech={routeFromTechToJob}
            />
            </>
          )}

          {/* ── TERRITORIES ───────────────────────────────────────────── */}
          {activeTab === "territories" && isOffice && token && (
            <div style={{ padding: isMobile ? "0" : "0", overflowY: "auto", flex: 1 }}>
              <PageHelp pageId="territories" />
              <TerritoryPanel token={token} role={user?.role ?? "office"} onSessionExpired={handleSessionExpired} />
            </div>
          )}

          {/* ── ADMIN ─────────────────────────────────────────────────── */}
          {activeTab === "admin" && isOffice && token && (
            <>
            <PageHelp pageId="admin" />
            <AdminPanel
              token={token}
              role={user.role}
              routingMode={routingMode}
              onRoutingModeChanged={(mode) => {
                setRoutingMode(mode);
                void fetchOutages();
              }}
              onSettingsChanged={handleSettingsChanged}
            />
            </>
          )}

          {/* ── PROFILE ───────────────────────────────────────────────── */}
          {activeTab === "profile" && token && (
            <div style={{ padding: isMobile ? "0" : "0", overflowY: "auto", flex: 1 }}>
              <PageHelp pageId="profile" />
              <ProfilePanel
                user={user}
                token={token}
                onUserUpdate={handleUserUpdate}
              />
            </div>
          )}

          {/* ── DOCS ──────────────────────────────────────────────────── */}
          {activeTab === "guide" && (
            <>
              <PageHelp pageId="guide" />
              <SiteGuideDocs variant="embedded" role={user.role} />
            </>
          )}
        </div>
      </div>

      {/* ── MODALS ────────────────────────────────────────────────────────── */}
      {/* Investigation Form */}
      {showInvestigation && investigatingOutage && (
        <InvestigationForm
          outage={investigatingOutage}
          token={token}
          required={
            user?.role === "tech" &&
            !!pendingVisitId &&
            String(investigatingOutage.id) === pendingVisitId &&
            needsInvestigation(investigatingOutage.status)
          }
          onClose={() => { setShowInvestigation(false); setInvestigatingOutage(null); }}
          onSubmitted={(id, newStatus, visit) => {
            updateStatus(id, newStatus as OutageStatus, visit);
            if (String(id) === pendingVisitId) {
              clearPendingVisit();
              setPendingVisitId(null);
            }
          }}
        />
      )}

      {/* Office Job Form */}
      {showJobForm && token && (
        <JobForm
          token={token}
          onClose={() => setShowJobForm(false)}
          onCreated={() => {
            setShowJobForm(false);
            // Refresh the shared outages cache immediately so the new office
            // triangle shows up on the Live Map and in the Outages list
            // without waiting for the 2-minute auto-refresh tick.
            fetchOutages();
            if (activeTab !== "queue") setActiveTab("queue");
          }}
        />
      )}

      {/* Outage Detail Modal */}
      {showDetail && detailOutage && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 2000, padding: isMobile ? "0" : "20px" }}>
          <div style={{ background: "#fff", borderRadius: isMobile ? "16px 16px 0 0" : "16px", maxWidth: "580px", width: "100%", maxHeight: isMobile ? "92vh" : "90vh", overflow: "auto", boxShadow: "0 -4px 30px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 700 }}>Outage #{detailOutage.id}</h2>
                <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>{detailOutage.streetAddress ?? detailOutage.city}</p>
              </div>
              <button onClick={() => setShowDetail(false)} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <span style={{ ...statusBadgeStyle(getStatusConfig(detailOutage.status)), padding: "5px 14px", fontSize: "13px" }}>
                {getStatusConfig(detailOutage.status).label}
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "16px", marginBottom: "16px" }}>
                {[
                  { label: "Customers", value: detailOutage.customers },
                  { label: "Priority Score", value: Math.round(detailOutage.priorityScore ?? 0) },
                  { label: "Outage Type", value: detailOutage.outageType ?? "—" },
                  { label: "Cause", value: detailOutage.cause ?? "Under Investigation" },
                  { label: "ETR", value: detailOutage.etr ?? "TBD" },
                  { label: "Source", value: (detailOutage.source ?? "xcel").toUpperCase() },
                ].map((f) => (
                  <div key={f.label} style={{ padding: "12px", background: "#f9fafb", borderRadius: "8px" }}>
                    <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>{f.label}</div>
                    <div style={{ fontWeight: 600, color: "#1f2937", fontSize: "14px" }}>{f.value}</div>
                  </div>
                ))}
              </div>
              {detailOutage.scoreBreakdown && (
                <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "11px", color: "#334155", fontWeight: 700, marginBottom: "8px" }}>SCORE BREAKDOWN</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 10px", fontSize: "12px", color: "#475569" }}>
                    {Object.entries(detailOutage.scoreBreakdown.parts)
                      .filter(([, v]) => Math.abs(v) > 0.01)
                      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                      .slice(0, 8)
                      .map(([k, v]) => (
                        <>
                          <span key={`${k}-k`}>{k.replace(/_/g, " ")}</span>
                          <span key={`${k}-v`} style={{ fontWeight: 700, color: v >= 0 ? "#0f766e" : "#b91c1c" }}>
                            {v >= 0 ? "+" : ""}{Math.round(v)}
                          </span>
                        </>
                      ))}
                  </div>
                </div>
              )}
              <div style={{ padding: "12px", background: "#f0fdfa", borderRadius: "8px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "#0d9488", fontWeight: 600, marginBottom: "6px" }}>LOCATION</div>
                <input
                  value={editingAddress}
                  onChange={(e) => setEditingAddress(e.target.value)}
                  placeholder="Street address"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", color: "#374151", marginBottom: "8px" }}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                  <input
                    value={editingLat}
                    onChange={(e) => setEditingLat(e.target.value)}
                    placeholder="Latitude"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", color: "#374151" }}
                  />
                  <input
                    value={editingLng}
                    onChange={(e) => setEditingLng(e.target.value)}
                    placeholder="Longitude"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", color: "#374151" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={async () => {
                      const lat = Number(editingLat);
                      const lng = Number(editingLng);
                      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                        alert("Enter valid latitude and longitude.");
                        return;
                      }
                      await saveOutageLocation(detailOutage.id, lat, lng, editingAddress);
                    }}
                    style={{ padding: "7px 10px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Save location
                  </button>
                  <button
                    type="button"
                    onClick={() => startPinAdjust(detailOutage)}
                    style={{ padding: "7px 10px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Tap map to move pin
                  </button>
                </div>
              </div>
              {detailOutage.needsReturnTrip && (
                <div style={{ padding: "10px 12px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "8px", marginBottom: "16px", fontSize: "12px", fontWeight: 600, color: "#92400e" }}>
                  Return trip required — Finisher priority target
                </div>
              )}
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { navigateToLatLng(detailOutage.lat, detailOutage.lng, detailOutage.streetAddress, detailOutage); setShowDetail(false); }} style={{ flex: 1, padding: "11px", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Navigate</button>
                <button onClick={() => { setShowDetail(false); openInvestigation(detailOutage); }} style={{ flex: 1, padding: "11px", background: "#0d9488", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Investigate</button>
                {isOffice && (
                  <button onClick={() => removeMarker(detailOutage.id)} style={{ flex: 1, padding: "11px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                    Remove Dot
                  </button>
                )}
                <select value={detailOutage.status} onChange={(e) => { updateStatus(detailOutage.id, e.target.value as OutageStatus); setDetailOutage((p) => p && { ...p, status: e.target.value as OutageStatus }); }} style={{ padding: "11px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px" }}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Outage Modal */}
      {showReportModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 2000, padding: isMobile ? "0" : "20px" }}>
          <div style={{ background: "#fff", borderRadius: isMobile ? "16px 16px 0 0" : "16px", maxWidth: "480px", width: "100%", maxHeight: isMobile ? "92vh" : "unset", overflow: "auto", boxShadow: "0 -4px 30px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Add Opportunity</h2>
              <button onClick={() => {
                setShowReportModal(false);
                setReportedAddress(null);
                setReportAddressEdit("");
                setReportStreet("");
                setReportCity("");
                setReportState("");
                setReportZip("");
                setReportDescription("");
                setReportCustomerName("");
                setReportCustomerPhone("");
                setReportCustomerEmail("");
              }} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px 24px" }}>
              {!reportedAddress ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <p style={{ color: "#374151", marginBottom: "20px", fontSize: "14px", lineHeight: 1.5 }}>Create a self-generated lead near your current location</p>
                  <button onClick={getLocationAndReport} disabled={reportingLocation} style={{ padding: "12px 24px", background: reportingLocation ? "#9ca3af" : "#ef4444", color: "#fff", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: 600, cursor: "pointer" }}>
                    {reportingLocation ? "Getting Location..." : "Get My Location"}
                  </button>
                </div>
              ) : (
                <div style={{ fontFamily: "inherit" }}>
                  {/* Address details */}
                  <div style={{ padding: "14px", background: "#f0fdfa", border: "1px solid #ccfbf1", borderRadius: "10px", marginBottom: "16px" }}>
                    <div style={{ fontSize: "11px", letterSpacing: "0.04em", color: "#0d9488", fontWeight: 700, marginBottom: "10px", textTransform: "uppercase" }}>Address Details</div>
                    <p style={{ fontSize: "11px", color: "#6b7280", margin: "0 0 12px", lineHeight: 1.45 }}>
                      The map pin is placed from this address (same as office jobs). If the address cannot be found, your GPS location is used instead.
                    </p>

                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Street</label>
                    <input
                      value={reportStreet}
                      onChange={(e) => setReportStreet(e.target.value)}
                      placeholder="Street number and street name"
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", marginBottom: "12px", fontSize: "14px", fontWeight: 500, color: "#1f2937", background: "#fff", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                    />

                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>City</label>
                    <input
                      value={reportCity}
                      onChange={(e) => setReportCity(e.target.value)}
                      placeholder="City"
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", marginBottom: "12px", fontSize: "14px", color: "#1f2937", background: "#fff", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                    />

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>State / Region</label>
                        <input
                          value={reportState}
                          onChange={(e) => setReportState(e.target.value.toUpperCase())}
                          placeholder="ST"
                          maxLength={20}
                          style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", color: "#1f2937", background: "#fff", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>ZIP / Postal</label>
                        <input
                          value={reportZip}
                          onChange={(e) => setReportZip(e.target.value)}
                          placeholder="ZIP"
                          style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", color: "#1f2937", background: "#fff", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>
                  </div>

                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Customer name <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span></label>
                  <input value={reportCustomerName} onChange={(e) => setReportCustomerName(e.target.value)} placeholder="Name" style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "8px", marginBottom: "12px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Phone</label>
                      <input type="tel" value={reportCustomerPhone} onChange={(e) => setReportCustomerPhone(e.target.value)} style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "8px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Email</label>
                      <input type="email" value={reportCustomerEmail} onChange={(e) => setReportCustomerEmail(e.target.value)} style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "8px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                  </div>

                  {/* Description */}
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Notes <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span></label>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="Describe the outage…"
                    rows={3}
                    style={{ width: "100%", padding: "10px 12px", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "8px", marginBottom: "20px", resize: "vertical", outline: "none", fontFamily: "inherit", color: "#1f2937", background: "#fff", boxSizing: "border-box", lineHeight: 1.5 }}
                  />

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => {
                      setReportedAddress(null);
                      setReportStreet("");
                      setReportCity("");
                      setReportState("");
                      setReportZip("");
                    }} style={{ flex: 1, padding: "12px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", fontWeight: 500, color: "#374151", cursor: "pointer", fontFamily: "inherit" }}>Back</button>
                    <button onClick={submitReport} disabled={reportingLocation} style={{ flex: 2, padding: "12px", background: reportingLocation ? "#9ca3af" : "#ef4444", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      {reportingLocation ? "Submitting..." : "Create Opportunity"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Manual Test Outage Form (simulation mode map-click) ──────────── */}
      {showManualOutageForm && manualOutageCoords && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "14px", maxWidth: "400px", width: "100%", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1f2937" }}>Place Test Outage</h3>
              <button onClick={() => setShowManualOutageForm(false)} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}>×</button>
            </div>
            <div style={{ padding: "10px 12px", background: "#f9fafb", borderRadius: "8px", marginBottom: "16px", fontSize: "12px", color: "#6b7280" }}>
              {manualOutageCoords.lat.toFixed(5)}, {manualOutageCoords.lng.toFixed(5)}
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Customers affected</label>
              <input
                type="number" min={1} max={100} value={manualOutageCustomers}
                onChange={(e) => setManualOutageCustomers(parseInt(e.target.value) || 1)}
                style={{ width: "100px", padding: "8px 12px", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "8px", outline: "none" }}
              />
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Outage type</label>
              <select value={manualOutageType} onChange={(e) => setManualOutageType(e.target.value)} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "8px", outline: "none" }}>
                <option value="storm">Storm Damage</option>
                <option value="Known Electric Outage">Known Electric Outage</option>
                <option value="User Reported Outage">User Reported Outage</option>
                <option value="Partial Outage">Partial Outage</option>
              </select>
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Notes (optional)</label>
              <input
                type="text" value={manualOutageNotes} onChange={(e) => setManualOutageNotes(e.target.value)}
                placeholder="Edge case description..."
                style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "1px solid #e5e7eb", borderRadius: "8px", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setShowManualOutageForm(false)} style={{ flex: 1, padding: "11px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
              <button onClick={submitManualOutage} disabled={manualOutageSubmitting} style={{ flex: 2, padding: "11px", background: manualOutageSubmitting ? "#9ca3af" : "#f59e0b", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 700, cursor: manualOutageSubmitting ? "default" : "pointer" }}>
                {manualOutageSubmitting ? "Placing…" : "Place Test Outage"}
              </button>
            </div>
          </div>
        </div>
      )}
      <SiteHelpLauncher role={user.role} activePage={activeTab} />
    </div>
  );
}

// ── Style helpers ──────────────────────────────────────────────────────────
const inputCss: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  fontSize: "15px",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  marginBottom: "12px",
  outline: "none",
  boxSizing: "border-box",
};

const linkBtnCss: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#0d9488",
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  fontSize: "14px",
};

function btnCss(bg: string): React.CSSProperties {
  return {
    padding: "7px 14px",
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  };
}

function smBtnCss(bg: string): React.CSSProperties {
  return {
    padding: "5px 9px",
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
  };
}

const mapBtnCss: React.CSSProperties = {
  padding: "9px 14px",
  background: "rgba(255,255,255,0.95)",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
};

function toggleCss(on: boolean, color: string): React.CSSProperties {
  return {
    width: "36px",
    height: "20px",
    background: on ? color : "#d1d5db",
    borderRadius: "10px",
    position: "relative",
    transition: "background 0.2s",
    flexShrink: 0,
    cursor: "pointer",
  };
}

function toggleKnobCss(on: boolean): React.CSSProperties {
  return {
    width: "16px",
    height: "16px",
    background: "#fff",
    borderRadius: "50%",
    position: "absolute",
    top: "2px",
    left: on ? "18px" : "2px",
    transition: "left 0.2s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  };
}
