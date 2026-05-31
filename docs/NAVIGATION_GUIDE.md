# Website Navigation Guide (Step by Step)

Use this guide to move through the Storm Response Platform from first visit to daily storm operations.

---

## Part A — Before you log in

### Step 1: Open the app
- Go to your app URL (local: `http://localhost:3000` or your deployed domain).
- You land on the **Storm Response Platform** welcome screen.

### Step 2: Read documentation (optional)
- Click **Read Documentation** → opens `/docs` (full platform docs with sidebar).
- Click **Site Guide** on that page (or go to `/docs/guide`) for this step-by-step navigation walkthrough.

### Step 3: Log in
- Click **Continue to Login**.
- Enter **email** and **password**, then **Sign In**.
- First time? Switch to **Create account**, fill name, role, email, password, then register.

### Step 4: Session persistence
- After login, your session is saved in the browser (`fieldmap_token` + `fieldmap_user`).
- Refreshing the page keeps you signed in until you log out from **Profile**.

---

## Part B — Main layout (after login)

| Area | What it does |
|------|----------------|
| **Left sidebar** | Switch between Dashboard, Map, lists, Admin, Docs |
| **Data Sources** | Toggle Xcel / Connexus feeds on the map |
| **Top bar** | Current tab name, refresh, mobile menu |
| **Main panel** | Content for the active tab |
| **User card (bottom)** | Open Profile, see role, log out |

---

## Part C — Sidebar tabs (step by step)

### Dashboard
1. Click **Dashboard** in the sidebar.
2. Review summary cards: total dots, unvisited, opportunities, queue pressure, customers affected.
3. Use this as your morning “storm health” screen before dispatching.

### Live Map
1. Click **Live Map**.
2. Wait for Google Maps to load (requires `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`).
3. **Pan/zoom** to your service area.
4. **Click a dot** → outage detail panel opens.
5. Click **Investigate** → complete the field form (fast path: pick one outcome).
6. Office only: enable **Simulation** in Admin to click the map and add test outages.

### Outages
1. Click **Outages** (badge shows total count).
2. Filter by status (unvisited, investigating, etc.).
3. Search by address, city, or ID.
4. Click a row to focus that location on the map or start investigation.

### Opportunities
1. Click **Opportunities**.
2. See confirmed damage / contact jobs that are **not** dispatch-ready yet.
3. Follow up on door hangers, thinking customers, and verbal quotes here — not in Job Queue.

### Job Queue
1. Click **Job Queue**.
2. Change **sort**: Priority, Distance, Value, or Smart.
3. **Assign** → review recommended tech → confirm dispatch.
4. **Optimize Route** → ordered stops from tech GPS.
5. **Find Clusters** → dense hotspot packs.
6. **Go Next Stop** → opens navigation to the next planned stop.

### Techs (office / admin / owner)
1. Click **Techs**.
2. View technician status, load, and last known location.
3. Use when balancing crews during the storm.

### Territories (office / admin / owner)
1. Click **Territories**.
2. Draw or manage ZIP/polygon territories.
3. Territories affect dispatch scoring when ZIP data is present on jobs.

### Admin (office / admin / owner)
1. Click **Admin**.
2. Set **Storm Phase**, **Temp-Out**, fetch interval, data sources.
3. Configure dispatch weights and **crew guardrails**.
4. Run **cleanup**, **exports**, simulation, and integration settings.

### Docs
1. Click **Docs**.
2. In-app platform documentation (same content family as `/docs`).
3. Use **Open full docs** for the full-page reader.

### Profile
1. Click your name at the bottom of the sidebar (or **Profile**).
2. Update name/phone/password.
3. **Log out** returns you to the public landing screen.

---

## Part D — Field tech vs office (who sees what)

| Tab | Field Tech | Office | Admin / Owner |
|-----|------------|--------|----------------|
| Dashboard | ✓ | ✓ | ✓ |
| Live Map | ✓ | ✓ | ✓ |
| Outages | ✓ | ✓ | ✓ |
| Opportunities | ✓ | ✓ | ✓ |
| Job Queue | ✓ | ✓ | ✓ |
| Techs | — | ✓ | ✓ |
| Territories | — | ✓ | ✓ |
| Admin | — | ✓ | ✓ |
| Docs | ✓ | ✓ | ✓ |
| Profile | ✓ | ✓ | ✓ |

---

## Quick paths during a storm

| Goal | Steps |
|------|--------|
| Investigate a new dot | Live Map → click dot → Investigate → submit |
| Dispatch a sold job | Job Queue → Assign → confirm tech |
| Work a dense area | Job Queue → Find Clusters → navigate to center |
| Clean up old dots | Admin → Cleanup tools |
| Change storm behavior | Admin → Storm Phase + Temp-Out |
