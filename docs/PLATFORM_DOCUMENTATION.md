# Storm Response Platform Documentation

> **In-app docs:** `/docs` (platform features) · `/docs/guide` (step-by-step navigation + login/DB setup) · **Docs** tab when logged in.  
> **Env setup:** Copy `.env.example` → `.env.local` with `APP_ENV=development` and `*_DEV` Supabase keys. See `docs/LOGIN_AND_DATABASE.md`.

This document explains how the platform works in plain language, what each feature does, and how teams should use it during storm operations.

---

## 1) What this platform is

This platform is a storm operations system for electrical service teams.

It helps your business:
- track outage dots on a live map
- separate work into the right lists (Outages, Opportunities, Job Queue)
- dispatch the right tech faster
- keep office and field teams aligned in high-pressure storm conditions

Main goal: **fast, reliable, low-friction operations** when teams are tired, mobile, and moving quickly.

---

## 2) Who uses it

- **Field Techs**
  - investigate outage dots
  - mark outcomes quickly
  - update power status and opportunity details

- **Office / Dispatch**
  - manage queue and priorities
  - assign techs
  - control storm phase and temp-out mode
  - clean up map and export data

- **Admin / Owner**
  - configure settings and scoring weights
  - adjust dispatch guardrails
  - review metrics and operational history

---

## 3) Core workflow (simple view)

1. Outage dots load on map from utility sources.
2. Techs investigate dots in the field.
3. Each investigation updates marker status (opportunity, sold, no opportunity, etc.).
4. Qualified items move into the right list:
   - Opportunities list (not sold yet)
   - Job Queue (dispatch-ready jobs)
5. Office dispatches jobs and monitors progress.
6. ETA/arrival logic updates jobs automatically when tech gets close.

---

## 4) The 3 main lists (important)

### Outages
Raw map activity and unworked storm dots.

### Confirmed Opportunities
Damage/opportunity found, customer interaction happened, but not sold yet.

### Job Queue
Dispatch-ready work only (call-ins + sold/started/temp/grounding/wants-to-proceed).

This separation reduces confusion and keeps routing priorities clear.

---

## 5) Investigation form (field side)

The investigation flow is optimized for speed.

### Primary outcomes
Tech chooses one:
- Utility Issue
- No Damage Found
- Opportunity Found

### Opportunity branch options
- Door Hanger Left
- Job Sold
- Job Started
- Customer Thinking
- Customer Declined
- Verbal Price Quoted (captured in form)

### Power status capture
- Has Power
- No Power (power on line drop / no power on line drop)
- Neighborhood Dead
- Honey Hole

This data supports smarter routing and prioritization later.

---

## 6) Map behavior and visuals

- Status-specific marker colors and shapes
- Door hanger markers shown as squares
- Priority and stale visual handling
- Toggle controls to hide completed/declined dots
- Optional stale-dot visibility toggle
- Boundary zones supported (territory / priority / exclusion)

---

## 7) Routing and dispatch features (implemented)

### Smart queue sorting
Sorts by a practical score that balances value and distance.

### Multi-stop route optimization (v1)
Builds an ordered stop sequence from current location and queue candidates.

### Density cluster routing (v1)
Finds grouped hotspots so teams can work dense areas efficiently.

### Auto-dispatch recommendation (v2)
Recommends best tech using:
- distance
- territory fit
- active workload
- return-trip burden
- overtime/load guardrails

Recommendation includes reason text and alternatives.

---

## 8) Crew guardrails and overtime protection

Dispatch now respects configurable safety/load settings:
- `max_jobs_per_tech`
- `overtime_hours_soft_limit`
- `overtime_hours_hard_limit`

These settings are editable in Admin panel and used in recommendation scoring.

---

## 9) Real-time tech tracking

- Tech GPS updates every 30 seconds
- Tech markers animate smoothly on the map
- Office sees near-live movement and status changes

This improves dispatch confidence and ETA quality.

---

## 10) ETA and automatic arrival logging

The system calculates ETA for assigned jobs using tech GPS heartbeats.

If a tech is within arrival threshold:
- job auto-updates to `in_progress`
- note is logged with auto-arrival timestamp
- linked outage can update to `job_started`

This reduces manual status clicks during active operations.

---

## 11) Notifications (SMS)

SMS pipeline is wired with Twilio support for:
- dispatch assigned alerts
- auto-arrival alerts

Graceful behavior:
- if SMS env vars are not configured, app continues safely without failure

Required env vars:
- `SMS_NOTIFICATIONS_ENABLED`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

---

## 12) Storm controls (office/admin)

Admin can manage:
- Storm Phase (`phase_1`, `phase_2`, `phase_3`)
- Temp-Out Mode (on/off)
- Data source settings
- Fetch intervals
- Dispatch guardrails

These controls shape operational behavior as storm conditions change.

---

## 13) Cleanup, storage, and exports

### Map cleanup tools
- remove one marker
- sweep completed/declined
- archive stale markers

### Data storage
Primary backend: Supabase/Postgres tables (`outages`, `jobs`, `investigations`, `technicians`, etc.)

### Export
CSV export endpoints for outages/jobs/investigations and operational metrics.

---

## 14) API feature summary (plain meaning)

- `/api/outages`: fetch/enrich outage dots
- `/api/outages/[id]/investigate`: save field investigation
- `/api/jobs/queue`: dispatch-ready queue data
- `/api/jobs/assign`: recommendation + assignment
- `/api/routing/multi-stop`: ordered multi-stop route
- `/api/routing/clusters`: dense hotspot clusters
- `/api/jobs/eta`: ETA + auto-arrival updates
- `/api/ops/metrics`: dashboard operations metrics
- `/api/ops/export`: CSV export
- `/api/outages/cleanup`: map cleanup actions

---

## 15) Current platform status

The platform is now operational with:
- fast field investigation workflow
- clear list separation
- map and status controls
- practical dispatch/routing v1-v2
- real-time tracking + auto-arrival
- SMS pipeline hooks
- admin guardrails

Remaining future work is mostly advanced refinement (deeper optimization, expanded notification channels, broader scheduling logic).

---

## 16) Quick start for operations team

1. Office sets storm phase and temp-out mode.
2. Techs run investigations from map dots.
3. Office uses Opportunities + Queue as separate work streams.
4. Use Optimize Route / Find Clusters for efficient movement.
5. Use Assign recommendations to dispatch with guardrails.
6. Use cleanup/export tools at end of shift/day.

---

*Last updated: May 2026*

