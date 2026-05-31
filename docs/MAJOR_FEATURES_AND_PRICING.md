# Major features (not in current fix batch) — scope & pricing guide

This document covers **larger builds** the client requested that were **not** included in the storm-UX fix pass. Use it for scoping, quotes, and Phase 2+ planning.

**Pricing assumptions (USD):** Independent contractor / small agency rates at **$85–125/hr**. Ranges include design, implementation, testing, and one round of client feedback. Hosting and third-party API costs (Google Maps, Supabase) are **not** included.

---

## 1. Storm phase & temp-out controls (Section 1)

**What it is:** Office/admin manually sets storm mode: Phase 1 (hunting), Phase 2 (dispatch), Phase 3 (cleanup), plus a **Temp-Out ON/OFF** toggle that changes field guidance. Dashboard shows queue depth, sold jobs, confirmed opportunities, and temp-out jobs pending return.

**Why it’s major:** New settings model, UI on admin, banners on field map, and later hooks into routing priority—not just a form tweak.

| Item | Estimate |
|------|----------|
| DB: `storm_phase`, `temp_out_mode`, timestamps, who changed it | 4–6 hrs |
| Admin controls + audit log | 8–12 hrs |
| Field banners + read-only stats strip | 6–8 hrs |
| Wire phase into queue/routing (minimal v1: sort only) | 12–20 hrs |
| **Total** | **$2,500 – $5,500** (30–55 hrs) |

---

## 2. Draw-on-map boundaries / zones (Section 6)

**What it is:** Admin draws polygons for **territories**, **priority zones**, and **permanent exclusion zones** (e.g. downtown Minneapolis, industrial parks)—not ZIP-only.

**Why it’s major:** Map drawing toolkit, polygon storage (PostGIS or GeoJSON), point-in-polygon for every outage/job, admin editor, and performance at thousands of dots.

| Item | Estimate |
|------|----------|
| Polygon CRUD API + storage | 12–16 hrs |
| Admin map editor (draw/edit/delete) | 16–24 hrs |
| Apply exclusions on ingest + live map filter | 10–14 hrs |
| Territory assignment to 2-person teams | 12–18 hrs |
| **Total** | **$4,500 – $8,500** (50–72 hrs) |

**Optional add-on:** County parcel / zoning auto-exclude — **+$3,000 – $6,000** (data licensing + matching pipeline).

---

## 3. Map cleanup & storm reset (Section 7)

**What it is:** Manual dot removal, bulk sweep, archive prior storm, **stale** markers (faded/gray) when back-to-back storms hit.

**Why it’s major:** Needs a **storm event** concept (or equivalent), not just toggling `is_active`.

| Item | Estimate |
|------|----------|
| `storm_events` session model + “current storm” pointer | 8–12 hrs |
| Archive / bulk deactivate API | 6–10 hrs |
| Office UI: remove dot, bulk select, “end storm” | 12–18 hrs |
| Stale visual state on map + list filters | 6–10 hrs |
| **Total** | **$2,800 – $5,500** (32–50 hrs) |

---

## 4. Full 3-phase routing engine (from routing doc)

**What it is:** Phase 1 = nearest unvisited dot; Phase 2 = job queue over hunting; Phase 3 = cleanup/temp-return priority; office trigger when queue ≥ N jobs.

**Why it’s major:** Ongoing rules, territory overrides, temp-out mode, and “bird in hand” logic.

| Item | Estimate |
|------|----------|
| Phase-aware sort + “next job” on map (in-app) | 20–30 hrs |
| Office phase switch + auto threshold | 8–12 hrs |
| Territory + exclusion respect in routing | 12–20 hrs (after zones exist) |
| **Total v1 (usable)** | **$3,500 – $6,500** |
| **Total v2 (polished)** | **$8,000 – $14,000** |

---

## 5. CRM integration (deferred by client)

**What it is:** Push customer/job/investigation data to new CRM via API.

| Item | Estimate |
|------|----------|
| Per CRM (Housecall, ServiceTitan, etc.) | **$2,500 – $7,000** each (depends on API quality) |

---

## 6. Data / analytics & export (Section 8) — clarification only

**Where data lives today**

| Data | Storage |
|------|---------|
| Outages / map dots | Supabase `outages` |
| Field investigations | Supabase `investigations` (+ notes blob for extra fields) |
| Office jobs / queue | Supabase `jobs` |
| Geocoded addresses | Supabase `geocode_cache` |
| Tech locations | Supabase `technicians` |
| Snapshots (ArcGIS raw) | Cron + optional `snapshots` / adapter layer |

**Export today**

- Outages tab → CSV export (client-side) on main map page.
- Supabase dashboard → full SQL export.
- **Not yet:** packaged “storm report” PDF, BI dashboard, or automated analytics.

**Analytics build (if requested later)**

| Item | Estimate |
|------|----------|
| Historical storm export API + CSV templates | 8–12 hrs |
| Simple admin analytics page (counts by zone/status) | 12–20 hrs |
| Warehouse / BI hookup | **$5,000+** depending on tool |

---

## Fix batch completed in codebase (reference)

These were implemented as **fixes** (fast storm UX), not the major items above:

- Streamlined **field investigation** (3 outcomes → nested actions, power status, verbal price, job scope, optional section collapsed).
- **Job queue** limited to call-ins + sold/started/temp/grounding/wants-to-proceed (no raw opportunities/door hangers).
- New **Opportunities** sidebar list.
- **Office job form**: split address, phone, email; job type removed from UI.
- **Add opportunity**: customer fields; duplicate “homes affected” removed (honey hole only in investigation).
- **Map**: door hanger = square marker; hide completed/declined toggles.
- Click marker → investigation (already present).

---

## Suggested package for “operational by storm season”

| Package | Includes | Ballpark |
|---------|----------|----------|
| **A — Fixes only** | Above fix batch | **Included in current engagement** |
| **B — Operational** | A + Phase 1 routing in-map + storm event archive (light) | **$4,000 – $7,000** |
| **C — Full office control** | B + Phase 2/3 controls + drawn zones + exclusions | **$12,000 – $22,000** |

Exact quotes should be confirmed after the client sends the **routing logic document** and confirms CRM timeline.

---

*Last updated: May 2026*
