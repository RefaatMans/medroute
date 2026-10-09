# MedRoute — Complete Knowledge Base

> **For Claude (or any AI assistant) reading this file:** this is the authoritative reference for the MedRoute project. Answer questions about MedRoute from this document. When something is not covered here, say so instead of guessing. Keep three things clear in every answer:
> 1. **What is real vs. simulated.** Hospital names and map locations are real. Bed counts, specialties, ER crowding numbers, sensors and ambulance trips are simulated demo data.
> 2. **What is built vs. planned.** Section 17 lists what is not built yet.
> 3. **Business figures.** This document contains no market-size, revenue or medical-outcome statistics. If asked for them, say they must be researched and do not invent numbers.
>
> Last updated: 10 October 2026.

---

## Table of contents

1. [One-paragraph summary](#1-one-paragraph-summary)
2. [The problem](#2-the-problem)
3. [The solution and how it works for each user](#3-the-solution-and-how-it-works-for-each-user)
4. [Business view](#4-business-view)
5. [Technology stack](#5-technology-stack)
6. [System architecture](#6-system-architecture)
7. [Data model (Firestore)](#7-data-model-firestore)
8. [The bed lifecycle (state machine)](#8-the-bed-lifecycle-state-machine)
9. [The hospital-ranking algorithm](#9-the-hospital-ranking-algorithm)
10. [The reservation guarantee (no double-booking)](#10-the-reservation-guarantee-no-double-booking)
11. [ER crowding and the AI camera](#11-er-crowding-and-the-ai-camera)
12. [Pages and user interface](#12-pages-and-user-interface)
13. [Security model](#13-security-model)
14. [Demo data](#14-demo-data)
15. [Every configuration value](#15-every-configuration-value)
16. [Testing and verification](#16-testing-and-verification)
17. [Status, deviations from the original spec, and known limitations](#17-status-deviations-from-the-original-spec-and-known-limitations)
18. [Setup, running, and deployment](#18-setup-running-and-deployment)
19. [Complete file-by-file reference](#19-complete-file-by-file-reference)
20. [Demo script for the presentation](#20-demo-script-for-the-presentation)
21. [Future work](#21-future-work)
22. [FAQ (technical and business)](#22-faq-technical-and-business)
23. [Glossary](#23-glossary)

---

## 1. One-paragraph summary

**MedRoute** is a web app that sends each ambulance to the hospital that can treat its patient **fastest**, in real time. Each hospital's beds report whether they are occupied (pressure sensors, simulated in this version), and an **AI camera** in the ER waiting room counts people to measure crowding. When a paramedic taps **GO**, the app scores every hospital on **travel time**, **free beds of the right type**, **ability to treat the case**, and **ER crowding**. It then **reserves one specific bed** using an atomic database transaction. Even if 5 ambulances ask at the same instant and only 3 beds are free, exactly 3 get beds and the other 2 are sent to the next best hospital. The hospital sees incoming ambulances live on its dashboard.

- **Working name:** MedRoute (set in one constant, `APP_NAME`, in `src/config/app.ts`).
- **Tagline:** "Every ambulance to the right hospital, fastest."
- **Closing line for presentations:** *"Sensors detect beds, AI detects crowding, and MedRoute sends every ambulance to the hospital that can treat the patient fastest."*
- **Built for:** a competition demo, based on Greater Beirut, Lebanon.
- **Code:** private GitHub repository `RefaatMans/medroute` (branch `main`), deployed on Netlify. It runs on Firebase's free Spark plan.

---

## 2. The problem

Today, an ambulance crew usually decides which hospital to drive to from experience, habit or phone calls. Several things can go wrong:

- **The nearest hospital may be full.** The ambulance arrives and the patient waits in the corridor, or is sent on to a second hospital. That costs critical minutes.
- **The nearest hospital may not have the right specialty.** For example, it may have no cardiac unit for a heart attack, no stroke team, or no burns unit.
- **The emergency room may be overcrowded,** even if beds technically exist upstairs. Staff are stretched, so the patient waits longer.
- **Two ambulances can race for the same last bed** without knowing about each other. Only one gets it.
- **Hospitals get no warning.** Staff learn about an incoming critical patient only when the ambulance pulls in.
- **Bed status is updated by hand,** so it's often out of date: a bed is "free" in the system but someone is in it, or it hasn't been cleaned.

MedRoute addresses each of these: live bed status from sensors, an explicit cleaning step, matching of specialty and bed type, a measured ER crowding level, atomic reservation, and a live incoming feed for the hospital.

---

## 3. The solution and how it works for each user

There are three roles. Each person registers with one role.

### 3.1 Paramedic (role `ambulance`), the ambulance crew

The flow is deliberately minimal for use in a moving vehicle, with large touch targets:

1. **START**: a large red round button on the idle screen.
2. **Case type**: 8 large buttons: General, Cardiac, Stroke, Trauma, Burns, Respiratory, Pediatric, Maternity.
3. **Severity**: Critical (red), Urgent (orange), Stable (green).
4. **Location**: comes from the phone's GPS automatically. On a laptop without GPS there's a quick-location list (Hamra, Achrafieh, Baabda, Hazmieh, Jounieh, Downtown Beirut), or "Pick on map" to drop a pin.
5. **GO**: the app ranks all hospitals, **picks the best one automatically**, and **reserves a specific bed**. If that bed is taken by another ambulance in the same instant, it **automatically tries the next best hospital**.
6. **Trip screen:**
   - The hospital name and the reserved bed ("🛏️ ICU-3 reserved for you").
   - An ETA countdown.
   - A **"Why this hospital"** box listing the reasons, for example "≈ 2 min away", "2 ICU beds free", "ER crowding: LOW (6 people waiting) — +2 min penalty".
   - **Open navigation**, which opens Google Maps directions.
   - The status line: "Hospital notified", then "Hospital has seen your trip ✓".
   - A map with a line from the ambulance to the hospital.
   - The **Arrived** and **Cancel trip** buttons, and a small **"Choose a different hospital"** link as a manual override.
7. If the trip ends without arrival (the reservation expired, or an admin force-cancelled it), a red alert explains why. The case type and severity are kept, and one tap on GO re-routes.

The paramedic's position is written to the database every 30 seconds so the admin map can show it.

### 3.2 Hospital staff (role `hospital`), the ER charge nurse at one hospital

The **Hospital dashboard** shows:

- **Header:** the hospital name, plus a **Diversion** switch with a confirm dialog. When it's on, a red banner reads "ON DIVERSION — not receiving ambulances", and the ranking excludes this hospital.
- **KPI row:**
  - Available beds per type (for example "ICU 2/10", with "FULL" in red at 0).
  - The number of incoming ambulances.
  - The ER waiting count with a crowding badge, its source (AI camera or manual entry), the last update time, and a link to the AI camera.
- **Incoming ambulances panel** (live):
  - A **beep** and a blue highlight for every new ambulance. Browsers only allow sound after one click on the page.
  - Each row shows the call sign, case type, severity badge, reserved bed, ETA countdown and time since dispatch.
  - Two buttons: **Mark as seen**, and **Patient admitted** (which marks the bed occupied and closes the trip).
  - **Hospitals cannot reject an ambulance.** A hospital that can't take more patients turns on **Diversion**.
- **Bed board:** tiles grouped by ward (General Ward, Intensive Care, Pediatrics, Maternity). Each tile shows the label, status (colour + icon + text) and time in that status. Clicking a tile shows **only the actions valid for that status**: Mark cleaned, Patient admitted, Out of service, Back in service.
- **ER chart:** the waiting-room count over the last hour (one point per minute while the camera runs), with a dashed "comfortable capacity" line, a hover tooltip and a table view.
- **Manual ER count:** a fallback input for when the camera is off.
- **AI camera page:** counts people from a webcam or a video file. Only the number leaves the device.

### 3.3 Admin (role `admin`), the demo operator or dispatch supervisor

- **Admin overview:**
  - A **live map** of all hospitals (green OK, yellow strained, red unavailable) and ambulances (white idle, blue en route, with a dashed line to the destination).
  - A **hospital table**: beds per type, incoming count, ER crowding, last update, and links to each dashboard and camera.
  - An **Active trips** table with **Force cancel**.
  - Buttons: **Seed demo data**, **Reset demo**, **Recompute bed summaries**.
- **Simulator** (demo control panel):
  - **Pressure sensor toggles** for every bed. These call the same function a real sensor would.
  - **Random activity**: one random sensor flips every 10 s.
  - An **ER count slider** from 0 to 60.
  - The **Stress test**: "5 ambulances, 3 beds".
- Admins can also open any hospital's dashboard and camera through a hospital picker.

---

## 4. Business view

### 4.1 Value proposition

| For | Value |
|---|---|
| Patients | Faster time to definitive care. They go to a hospital that has a free bed of the right type and the right specialty, and fewer are turned away on arrival. |
| Paramedics | One decision fewer: START → case → severity → GO. The bed is guaranteed before they drive, and directions are one tap away. |
| Hospitals | Advance notice of every incoming patient, with case type, severity, ETA and an assigned bed. Load is spread across hospitals. Crowding is measured, not guessed. |
| Health authorities / dispatch centres | A live city-wide view of bed availability, ER pressure and ambulance positions, and a basis for mass-casualty coordination (future work). |

### 4.2 What makes it different

1. **Atomic bed reservation:** it doesn't just *show* availability, it *holds* a specific bed. It is proven not to double-book (Section 10).
2. **Specialty-aware matching:** the case type maps to the required capability and bed type (Section 9).
3. **ER crowding from an AI camera that never transmits images.** Privacy by design: only a number is sent.
4. **"Cleaning" is a real state.** A bed a patient just left is not offered to the next ambulance until staff confirm it's clean.
5. **Explainable decisions:** every choice comes with human-readable reasons.
6. **Low-cost stack:** runs on Firebase's free tier and in a browser. No servers to run, and phones and laptops act as the "devices".

### 4.3 Business model options (not validated; ideas for discussion)

- A subscription for hospitals or hospital groups (per bed or per site).
- A licence to a national or regional ambulance or dispatch authority (for example the Red Cross or Civil Defense in Lebanon).
- Hardware plus software bundles: bed pressure sensors (ESP32 + force-sensitive resistor) and camera kits.
- Data and analytics services: occupancy trends and bed-demand forecasting (future work).

> No pricing, market size, customer interviews or partnerships exist yet. Treat any such figure as unknown.

### 4.4 Adoption risks and how the design responds

| Risk | Response |
|---|---|
| Hospitals reluctant to share live capacity | Start with a pilot group. Only aggregate counts are visible to ambulances. Diversion gives hospitals control. |
| Sensor cost and installation | The sensor interface is one function (`applySensorReading`). Staff can always mark beds manually as a fallback. |
| Privacy concerns about cameras | Processing happens on the device. No video or image is stored or sent, only a count. A privacy notice is always visible. |
| Integration with hospital systems | Future HL7 FHIR integration (Section 21). |
| Liability for routing decisions | The paramedic can always override ("Choose a different hospital"). Reasons are shown for every choice. |

---

## 5. Technology stack

| Area | Choice | Version used |
|---|---|---|
| Language | TypeScript (strict mode) | 5.6.3 |
| UI framework | React | 18.3.1 |
| Build tool / dev server | Vite | 5.4.21 (+ `@vitejs/plugin-react` 4.7.0) |
| Styling | Tailwind CSS (+ PostCSS, Autoprefixer) | 3.4.19 |
| Routing | react-router-dom | 6.28.0 |
| Database | Cloud Firestore (Firebase JS SDK, modular API) | firebase 11.10.0 |
| Authentication | Firebase Authentication (email + password) | (same SDK) |
| Maps | Leaflet + react-leaflet with OpenStreetMap tiles (free, no API key) | leaflet 1.9.4, react-leaflet 4.2.1 |
| AI camera | TensorFlow.js + COCO-SSD object detection (in the browser, WebGL backend) | @tensorflow/tfjs 4.22.0, @tensorflow-models/coco-ssd 2.2.3 |
| Notifications | react-hot-toast | 2.4.1 |
| Tests | Vitest | 2.1.9 |
| HTTPS for phone testing on LAN | @vitejs/plugin-basic-ssl | 1.2.0 |
| Hosting | Netlify (static site, auto-deploys from GitHub) | — |
| Source control | Git + GitHub (private repo) | — |
| Runtime used in development | Node.js | 24 locally; Netlify builds with Node 20 |

**Explicit constraints from the original spec (still honoured):**
- **No Cloud Functions,** because they need the paid Blaze plan. All logic runs in the browser, and Firestore **transactions** make critical operations atomic.
- **No patient personal data:** no names, IDs or photos. Only case type and severity are stored.
- **No images leave the device:** the camera sends only a number.
- **Responsive:** the paramedic page is designed for phones (checked at 375 px width).
- **All tunable numbers live in `src/config/*`,** never hard-coded in components.

---

## 6. System architecture

```
┌──────────────────────────── Browser (phone / laptop) ────────────────────────────┐
│                                                                                   │
│  React pages ──► hooks (live data via onSnapshot) ◄── Firestore realtime stream   │
│      │                                                                            │
│      ▼                                                                            │
│  services/*  (the ONLY code that writes to Firestore; transactions live here)     │
│      │                                                                            │
│      ▼                                                                            │
│  lib/*  (pure logic, no Firebase: scoring, bed state machine, crowding, geo …)   │
│                                                                                   │
│  AI camera: TensorFlow.js + COCO-SSD runs locally → only a number is uploaded     │
└──────────────────────────────────┬────────────────────────────────────────────────┘
                                   │ HTTPS (Firebase JS SDK)
                    ┌──────────────┴───────────────┐
                    │  Firebase (Google Cloud)     │
                    │  • Authentication            │
                    │  • Cloud Firestore + rules   │
                    └──────────────────────────────┘
   Static files (HTML/JS/CSS) are served by Netlify; map tiles come from OpenStreetMap.
   Optional: OSRM public server for real driving times (off by default).
```

### 6.1 Layering rules (enforced by convention)

1. **`src/lib/*` is pure.** No Firebase imports and no clock reads (the current time is passed in). This makes the core logic fully unit-testable.
2. **`src/services/*` is the only place that writes to Firestore.** Components never write directly.
3. **`src/hooks/*` provide live data** using Firestore `onSnapshot` listeners. Each returns `{ data, loading, error, fromCache }` and unsubscribes on unmount.
4. **`src/config/*` holds every tunable number and label.**
5. **`src/types.ts` holds all shared types.** It deliberately avoids Firebase types: a structural `TimestampLike` interface stands in for Firestore's `Timestamp`.

### 6.2 Real-time behaviour

Every screen that shows live data uses Firestore realtime listeners. A change made anywhere (a sensor flip in the simulator, a reservation from a phone, a staff action) appears on every open screen within about a second, without refreshing.

### 6.3 "No server" consequences

- **Expiry sweeper:** with no server cron job, open browser tabs (hospital dashboard, admin page, simulator) run `releaseExpiredDispatches()` every 60 s. The paramedic's own trip screen also expires its own trip if overdue. The operation is idempotent, so many tabs running it at once is safe.
- **Transactions run in the browser,** so the security rules must let ambulances write to bed and hospital documents. That's acceptable for a demo; in production it would move into Cloud Functions (Section 13).

### 6.4 Bundle and performance notes

- The TensorFlow.js and COCO-SSD code is **lazy-loaded** only when the camera page opens. The model itself (~2 MB) downloads from Google's model storage the first time.
- The production build has some chunks over 500 kB (Vite warns, which is harmless).
- Firestore queries use **equality filters only** and sort in the browser, so **no composite indexes are required** (Section 17).

---

## 7. Data model (Firestore)

Collection names are exact. Timestamps are written with `serverTimestamp()`. When reading, pending server timestamps are estimated locally so freshly written documents never show empty times.

### 7.1 Enumerations

| Concept | Values |
|---|---|
| Bed types | `general`, `icu`, `pediatric`, `maternity` |
| Hospital capabilities | `general`, `cardiac`, `stroke`, `trauma`, `burns`, `pediatric`, `maternity` (every hospital has `general`) |
| Case types | `general`, `cardiac`, `stroke`, `trauma`, `burns`, `respiratory`, `pediatric`, `maternity` |
| Severities | `critical`, `urgent`, `stable` |
| Bed statuses | `available`, `reserved`, `occupied`, `cleaning`, `out_of_service` |
| Bed events | `SENSOR_OCCUPIED`, `SENSOR_EMPTY`, `STAFF_MARK_CLEANED`, `STAFF_PATIENT_ADMITTED`, `STAFF_OUT_OF_SERVICE`, `STAFF_BACK_IN_SERVICE`, `RESERVE`, `RELEASE`, `AMBULANCE_ARRIVED` |
| Crowding levels | `low`, `medium`, `high` (displayed as `unknown` when the camera is offline) |
| ER count source | `camera`, `manual` |
| Roles | `ambulance`, `hospital`, `admin` |
| Ambulance status | `idle`, `en_route` |
| Dispatch status | `en_route`, `arrived`, `cancelled`, `declined`, `expired` (`declined` is kept for compatibility but no longer produced; see Section 17) |

### 7.2 `hospitals/{hospitalId}`

```ts
{
  name: string;
  address: string;
  phone: string;                         // empty in the demo seed on purpose
  location: { lat: number; lng: number };
  capabilities: Capability[];
  diverting: boolean;                    // manual "do not send ambulances" switch
  erComfortCapacity: number;             // people the waiting room handles comfortably
  erWaitingCount: number;                // latest (smoothed) people count
  erCrowdingLevel: 'low' | 'medium' | 'high';
  erCountUpdatedAt: Timestamp | null;
  erCountSource: 'camera' | 'manual';
  bedSummary: {                          // cached counters, updated in the SAME transaction as any bed change
    [bedType]?: { total, available, reserved, occupied, cleaning, out_of_service }
  };
  incomingCount: number;                 // en-route ambulances heading here
  updatedAt: Timestamp;
}
```

**Why `bedSummary` exists:** the ranking needs free-bed counts for every hospital, live. Reading every bed of every hospital on each change would be slow and expensive. Instead, each hospital document carries counters that are always updated inside the same transaction as the bed change, so they can't drift. An admin "Recompute bed summaries" tool rebuilds them from the real beds if ever needed.

### 7.3 `hospitals/{hospitalId}/beds/{bedId}`

```ts
{
  label: string;                // e.g. "ICU-3"
  type: BedType;
  ward: string;                 // "General Ward" | "Intensive Care" | "Pediatrics" | "Maternity"
  status: BedStatus;
  sensorOccupied: boolean;      // last raw reading from the pressure sensor
  lastSensorAt: Timestamp | null;
  reservedByDispatchId: string | null;   // the "reservation flag"
  updatedAt: Timestamp;         // also used as "time in current status"
}
```

Bed document IDs look like `icu-3`, `gen-12`, `ped-2`, `mat-5`.

### 7.4 `hospitals/{hospitalId}/erReadings/{readingId}`

The history behind the ER chart, written at most once a minute while the camera runs: `{ count, level, at }`.

### 7.5 `ambulances/{ambulanceId}`

```ts
{
  callSign: string;             // "AMB-01", "SIM-03"
  location: { lat, lng } | null;
  locationUpdatedAt: Timestamp | null;
  status: 'idle' | 'en_route';
  activeDispatchId: string | null;   // at most one active trip per ambulance
  simulated: boolean;           // true for stress-test ambulances
}
```

### 7.6 `dispatches/{dispatchId}`, one ambulance trip

```ts
{
  ambulanceId, ambulanceCallSign,
  hospitalId, hospitalName,
  bedId, bedLabel, bedType,
  caseType, severity,
  status: 'en_route' | 'arrived' | 'cancelled' | 'declined' | 'expired';
  etaMinutes: number;
  origin: { lat, lng };
  createdAt: Timestamp;
  expiresAt: Timestamp;         // createdAt + etaMinutes + 20 min buffer
  acknowledgedAt: Timestamp | null;   // hospital tapped "Mark as seen"
  closedAt: Timestamp | null;
  closedReason: string | null;  // e.g. "Reservation expired: the ambulance did not arrive in time"
}
```

### 7.7 `users/{uid}`

```ts
{
  displayName, email,
  role: 'ambulance' | 'hospital' | 'admin';
  hospitalId: string | null;    // required for hospital staff
  ambulanceId: string | null;   // required for paramedics
  createdAt: Timestamp;
}
```

### 7.8 Case rules (which capability and bed type a case needs)

| Case type | Required capability | Bed if **critical** | Bed otherwise |
|---|---|---|---|
| general | general | icu | general |
| cardiac | cardiac | icu | general |
| stroke | stroke | icu | general |
| trauma | trauma | icu | general |
| burns | burns | icu | general |
| respiratory | general | icu | general |
| pediatric | pediatric | pediatric | pediatric |
| maternity | maternity | maternity | maternity |

This is implemented as the pure function `getRequirements(caseType, severity)` in `src/config/caseRules.ts`.

---

## 8. The bed lifecycle (state machine)

A bed counts as **available to ambulances only when its status is `available`**: empty (sensor), clean (staff confirmed), and not reserved.

The pure function `nextBedStatus(current, event)` in `src/lib/bedMachine.ts` has every transition unit-tested:

| Event | Allowed from | Goes to | Side effects |
|---|---|---|---|
| `SENSOR_OCCUPIED` (pressure detected) | available, reserved, cleaning | occupied | If it was **reserved**, the linked trip closes as `arrived` |
| `SENSOR_EMPTY` (no pressure) | occupied | **cleaning** | The patient left, so the bed must be cleaned before reuse |
| `STAFF_MARK_CLEANED` | cleaning | available | |
| `STAFF_PATIENT_ADMITTED` | reserved, available | occupied | Manual fallback without a sensor. Closes the trip if reserved |
| `STAFF_OUT_OF_SERVICE` | available, occupied, cleaning | out_of_service | Not allowed on a reserved bed (it would strand an ambulance) |
| `STAFF_BACK_IN_SERVICE` | out_of_service | cleaning | Must be cleaned before use |
| `RESERVE` | available | reserved | Sets `reservedByDispatchId` |
| `RELEASE` | reserved | available | Clears `reservedByDispatchId` |
| `AMBULANCE_ARRIVED` | reserved | occupied | |

**Rules:**
- Any event not allowed from the current status returns `INVALID_TRANSITION`, and **nothing is written**.
- **Sensor events never fail.** A reading that doesn't change the status (for example "occupied" on an already occupied bed) is a **no-op**, but the raw reading (`sensorOccupied`, `lastSensorAt`) is still recorded.
- Leaving `reserved` by any route clears `reservedByDispatchId`.
- **Only `RESERVE` can ever produce a reserved bed,** and **an occupied bed can never become available without passing through cleaning**. Both properties are covered by tests.

**Helpers in the same file:**
- `completesTrip(from, event)`: true when an arrival-type event hits a reserved bed.
- `staffActionsFor(status)`: the staff actions shown on the bed board. Invalid actions are hidden, not just disabled.
- `pathTo(from, 'available' | 'occupied')`: the sequence of valid events that walks a bed to a target state. The stress-test "Prepare" tool uses it, so it never bypasses the rules.

**How a bed change is written:** `applyBedEvent(hospitalId, bedId, event)` in `src/services/bedService.ts` runs **one Firestore transaction** that:
1. Reads the bed and the hospital.
2. Computes the new status.
3. Updates the bed.
4. Moves one count between the `bedSummary` counters.
5. If a reserved bed just received its patient, also closes the trip as `arrived`, decrements `incomingCount`, and sets the ambulance back to idle.

All of this happens together or not at all.

`applySensorReading(hospitalId, bedId, occupied)` is the single entry point a real sensor (or the simulator) calls.

---

## 9. The hospital-ranking algorithm

The pure function `recommendHospitals({ origin, caseType, severity, hospitals, now, travelMinutesOverride? })` lives in `src/lib/scoring.ts`. It returns `{ ranked, excluded }`.

### 9.1 Steps

1. `{ capability, bedType } = getRequirements(caseType, severity)`.
2. **Exclude** a hospital if (checked in this order):
   - it is on diversion: "Hospital is on diversion";
   - it lacks the capability: "Cannot treat {caseType}";
   - it has no free beds of the required type: "No {bedType} beds free".
3. **Travel time** (`src/lib/geo.ts`):
   - `distanceKm` = haversine (great-circle) distance from the ambulance to the hospital.
   - `travelMinutes = distanceKm × 1.4 (road factor) ÷ 40 km/h × 60`.
   - **Optional:** real driving times from the public **OSRM** routing server, fetched with a 3-second timeout and a fallback to the formula. This is **off by default** (`USE_OSRM = false`).
4. **Crowding penalty** (in minutes):
   - `ratio = erWaitingCount ÷ erComfortCapacity`. If the camera is offline (stale), the ratio is treated as **0.8**.
   - `penalty = min(ratio × 15, 30)`.
   - For **critical** patients the penalty is **halved** (× 0.5): they skip the waiting room, but crowding still strains staff.
5. **Scarcity penalty:** **+3 min** if only **1** bed of that type is free. This avoids grabbing a hospital's very last bed when alternatives are similar.
6. **Score = travel minutes + crowding penalty + scarcity penalty.** Lower is better. The sort is stable, so ties keep their input order.
7. **Reasons** are generated for display, for example:
   - "≈ 8 min away"
   - "3 ICU beds free", or "Only 1 general bed free — +3 min penalty"
   - "ER crowding: HIGH (30 people waiting) — +23 min penalty"
   - "Camera offline — crowding unknown"
   - "Closest hospital with a cardiac unit" (or "Closest suitable hospital" for general cases)

### 9.2 Worked example

From Hamra, Cardiac, Critical, using the seed data:

1. **Clemenceau Medical Center:** ≈ 2 min, 2 ICU beds free, ER LOW (6 waiting) → +2 min.
2. **AUBMC:** ≈ 1 min, 3 ICU beds free, ER MEDIUM (28 waiting) → +6 min.
3. **Hôtel-Dieu de France:** ≈ 8 min.

AUBMC is closer, but its busier ER makes Clemenceau the better overall choice. This is a good presentation moment.

### 9.3 What "GO" does with the ranking

`AmbulancePage.onGo()` computes the ranking, then calls `createDispatch` on #1. If the result is `NO_BED` or `DIVERTING`, because another ambulance or a staff change got there first, it **tries #2, #3, …** until one succeeds. The toast says when the first choice had just filled up. If no hospital is suitable, the screen lists every hospital with its exclusion reason.

---

## 10. The reservation guarantee (no double-booking)

**The core promise: a bed can only ever be reserved by one trip.**

### 10.1 How `createDispatch` works (`src/services/dispatchService.ts`)

Firestore web transactions **cannot run queries**, so it works in two phases:

1. Determine the bed type from the case rules.
2. **Outside** any transaction: query the hospital's beds where `type == bedType AND status == 'available'`, up to 5. These are the **candidates**.
3. Pre-generate the new trip's document ID.
4. For each candidate, run **one transaction** that:
   - reads the **ambulance** and aborts with `AMBULANCE_BUSY` if it already has an active trip;
   - reads the **hospital** and aborts with `DIVERTING` if it's on diversion;
   - reads the **bed**, and if it's **no longer `available`**, aborts with `BED_TAKEN` and moves to the next candidate;
   - otherwise writes, all at once:
     - bed → `reserved` with `reservedByDispatchId`;
     - hospital `bedSummary`: available −1, reserved +1, and `incomingCount` +1;
     - the new trip document (`en_route`, with `expiresAt`);
     - ambulance → `en_route` with `activeDispatchId`.
5. If every candidate fails with `BED_TAKEN` (or there were none), it returns `NO_BED`.

### 10.2 Why two ambulances can never get the same bed

Firestore transactions are **optimistic**. When a transaction commits, Firestore checks that none of the documents it read have changed since. If one has, the commit is rejected and the transaction **re-runs with fresh data**.

So if two ambulances both read bed ICU-1 as `available` and both try to commit, only the first succeeds. The second re-runs, now sees ICU-1 as `reserved`, gets `BED_TAKEN`, and moves on to ICU-2 (or gets `NO_BED`).

The hospital document is part of every transaction too, so its counters always stay consistent. The retry limit is raised from the SDK default of 5 to **20 attempts**, so heavy contention (many ambulances hitting one hospital at once) never fails spuriously.

### 10.3 Closing a trip

`closeDispatch(id, status, reason)` is one transaction. It first checks that the trip is still `en_route`, so it's safe if two people act at once: the second click does nothing. It then:
- releases the bed (`RELEASE` → available) or occupies it (`AMBULANCE_ARRIVED` → occupied), but **only if the bed is still held for this trip**;
- updates the counters and decrements `incomingCount`;
- sets the trip status, `closedAt` and `closedReason`;
- frees the ambulance.

The public functions are:
- `cancelDispatch(id, reason)`: the paramedic cancels.
- `forceCancelDispatch(id)`: an admin cancels. The paramedic is told "cancelled by the dispatch admin".
- `markArrived(id)`
- `expireDispatch(id)`
- `acknowledgeDispatch(id)`: sets `acknowledgedAt` ("Mark as seen").
- `releaseExpiredDispatches(hospitalId?)`: the sweeper. Hospital staff sweep only their own hospital, because the security rules only let them modify their own; admins sweep everything.

### 10.4 Proof: the stress test

The simulator's **Stress test** runs the spec's acceptance test: "5 ambulances, 3 beds".

1. **Prepare** sets exactly 3 beds of the chosen type to available and the rest to occupied, using only valid bed events. It also frees the simulated ambulances and turns diversion off.
2. **Fire** sends `createDispatch` for N simulated ambulances (SIM-01…SIM-10) **at the same instant** (`Promise.all`).
3. It shows each result and a PASS/CHECK verdict. Expected: exactly 3 successes on 3 different beds, N−3 `NO_BED`, and the hospital shows 0 available, 3 reserved, incoming 3.
4. **Clean up** cancels the test trips.

**Live results against the real Firestore database (October 2026):**
- 5 ambulances on a hospital with 1 free ICU bed → exactly 1 success; the counters were correct and cleanup restored everything.
- **5 ambulances, 3 ICU beds, run 5 times in a row → 5/5 PASS.** Every run had 3 winners on 3 different beds (ICU-1, ICU-2, ICU-3 in varying order), 2 `NO_BED`, and the hospital showing 0 available, 3 reserved, 3 incoming. A batch of 5 simultaneous requests took about 3.3–6.2 s because of the contention retries.

---

## 11. ER crowding and the AI camera

### 11.1 Crowding levels (`src/lib/crowding.ts`)

```
ratio = erWaitingCount / erComfortCapacity
low     if ratio < 0.6
medium  if 0.6 ≤ ratio ≤ 1.0
high    if ratio > 1.0
```

- A **camera** count older than **10 minutes** is **stale**. It's shown as "Unknown (camera offline)" and scored as ratio 0.8.
- A **manual** count does **not** go stale by default (`MANUAL_COUNT_STALE_MINUTES = null`). Staff type a manual count because there is no camera, and otherwise every hospital would show "unknown" 10 minutes after seeding. This is configurable.
- A comfort capacity of 0 treats anyone waiting as overcrowded.

### 11.2 The camera page (`/hospital/camera`)

- **Privacy banner (always visible):** "People are counted on this device. No video or images are stored or sent — only the number."
- **Sources:** **Webcam** (`getUserMedia`, preferring the rear camera on phones) or a **video file** (for example a crowded waiting-room clip for the demo).
- **Model:** COCO-SSD with the `lite_mobilenet_v2` base, on the TensorFlow.js **WebGL** backend. It's loaded once and disposed when leaving the page.
- **Detection loop:**
  - Runs `model.detect(video)` about every **700 ms**, never overlapping.
  - Counts objects with class `person` and confidence ≥ **0.5**, up to 60 per frame.
  - Keeps the **last 10 counts**; the displayed count is their **median**, which removes flicker.
  - The loop uses a timer rather than `requestAnimationFrame` so counting continues while the tab is in the background (`requestAnimationFrame` stops in hidden tabs).
- **Overlay:** green boxes and the live count are drawn on a `<canvas>` over the video. Nothing is ever saved.
- **Uploads** (`updateErCount(hospitalId, count, 'camera')`):
  - when the smoothed count **changes**, at most every **5 s**;
  - plus a **heartbeat every 30 s** even if unchanged, so the hospital never looks offline;
  - one history point (`appendErReading`) every **60 s** for the chart.
- **Readout:** the smoothed count, crowding badge, comfort capacity, people in the current frame, detections per second, and upload status ("Uploading ✓ last sent 3 s ago").
- **Cleanup on leaving:** stops the camera tracks, the loop and the model.
- Camera and GPS need a **secure context** (HTTPS or `localhost`). Netlify provides HTTPS.

**Test status:** the camera page is built and type-checked, but the owner hasn't tested it with a real webcam yet (no camera was available). The smoothing and upload-timing logic is unit-tested.

---

## 12. Pages and user interface

### 12.1 Routes and access

| Path | Page | Who can open it |
|---|---|---|
| `/` | Redirects to the user's home page, or to `/login` | everyone |
| `/login` | Log in | everyone |
| `/register` | Register (name, email, password, role + hospital / ambulance / admin code) | everyone |
| `/ambulance` | Paramedic app | `ambulance` |
| `/hospital` | Hospital dashboard (admins get a hospital picker, kept in the URL as `?h=…`) | `hospital`, `admin` |
| `/hospital/camera` | AI camera | `hospital`, `admin` |
| `/simulator` | Demo simulator and stress test | `admin` |
| `/admin` | Admin overview | `admin` |

`ProtectedRoute` checks the signed-in user's role and redirects anyone else. After login, users go to: paramedic → `/ambulance`, hospital → `/hospital`, admin → `/admin`. The nav bar shows only the links for the user's role, plus their name, role and **Log out**.

### 12.2 UI rules applied everywhere

- **Colours:** green = available or low crowding, yellow = medium, red = full, high crowding or diverting, blue = reserved or en route, grey = out of service or unknown.
- **Colour is never used alone:** every status also has an icon and a text label.
- Large touch targets, high contrast, visible keyboard focus, labelled form fields, and accessible dialogs (Escape closes them, focus moves in and back).
- "Last updated X min ago" wherever live data appears.
- A **toast** for every action's success or failure, with friendly error messages (for example "Wrong email or password", "Permission denied. Have the Firestore security rules been published?").
- A **setup banner** when Firebase isn't configured.
- A **demo notice** in the footer of every page: "Demo: hospital names and locations are real; beds, ER crowding and ambulance trips are simulated and do not reflect the real hospitals."
- The paramedic header shows an **online/offline dot**, based on the browser's network status and whether Firestore data is coming from cache.

### 12.3 Maps

Leaflet with OpenStreetMap tiles; no API key needed.
- Hospitals are coloured circle markers with tooltips; the best choice is larger with a permanent label.
- Ambulances are labelled 🚑 badges: red for "You", white for idle, blue for en route.
- Routes are dashed straight lines.
- Leaflet's default marker icons are re-pointed for Vite bundling (a known issue).

---

## 13. Security model

### 13.1 Firestore security rules (`firestore.rules`, demo-grade)

| Collection | Read | Write |
|---|---|---|
| `users/{uid}` | the user themselves, or an admin | create: only your own document, with a valid role. Update: admin, or yourself without changing your role |
| `hospitals/{hid}` | **anyone** (see note) | create/delete: admin. Update: admin, that hospital's staff, or any paramedic |
| `hospitals/{hid}/beds/*` | signed-in users | create/delete: admin. Update: admin, that hospital's staff, or any paramedic |
| `hospitals/{hid}/erReadings/*` | signed-in users | create: admin or that hospital's staff |
| `ambulances/{aid}` | **anyone** (see note) | create/delete: admin. Update: admin, any paramedic, any hospital staff (closing a trip frees the ambulance) |
| `dispatches/{did}` | signed-in users | create: admin or paramedic. Update: admin, paramedic, or staff of the trip's hospital |

**Note:** hospitals and ambulances are publicly readable so the Register page can list them before the user has an account. They contain no patient data.

### 13.2 Honest limitations (important for judges' questions)

- **Admin registration is protected only by an admin code checked in the browser.** The code is built into the website's JavaScript, so a determined person could find it and register as admin. Planned fix (offered, **not yet applied**): once the real admin exists, change the rules so nobody can self-register as `admin`.
- **Paramedics can write to hospital and bed documents,** because reservations run as browser-side transactions. In production, `createDispatch` and the bed transactions would move into **Cloud Functions** (server code), and the rules would be tightened so clients can't write capacity data directly.
- The expiry sweeper runs in open browser tabs, not on a server.
- The Firebase web config (API key, project ID) is **public by design**. Every Firebase website ships it to the browser, and access is controlled by the rules. Netlify's secret scanner is told to ignore those six values (`SECRETS_SCAN_OMIT_KEYS` in `netlify.toml`).
- **No patient personal data** is stored at any point.

---

## 14. Demo data

### 14.1 Hospitals (real names and locations, simulated capacity)

Locations are OpenStreetMap building centroids, cross-checked with Wikidata in October 2026. Ten of the twelve agree across two sources within about 20–110 m. Sahel General and Al Rasoul Al Aazam rely on OpenStreetMap only. Phone numbers are **empty on purpose**, so the "Call hospital" button is hidden and a demo tap can't ring a real switchboard.

| ID | Hospital | Area | Lat, Lng | Capabilities (simulated) | Beds G/ICU/Ped/Mat (simulated) | ER comfort cap. | Seed ER count |
|---|---|---|---|---|---|---|---|
| `h-aubmc` | American University of Beirut Medical Center | Ras Beirut | 33.8980, 35.4859 | general, cardiac, stroke, trauma, pediatric, maternity | 30/12/8/6 | 35 | 28 |
| `h-cmc` | Clemenceau Medical Center | Clemenceau | 33.8975, 35.4900 | general, cardiac, stroke, trauma | 18/8/0/0 | 20 | 6 |
| `h-rhuh` | Rafik Hariri University Hospital | Bir Hassan / Jnah | 33.8636, 35.4913 | all seven incl. **burns** | 30/10/8/6 | 35 | 30 |
| `h-sahel` | Sahel General Hospital | Airport Rd, Ghobeiry | 33.8580, 35.5037 | general, cardiac, trauma, pediatric, maternity | 18/5/5/5 | 20 | 18 |
| `h-rasoul` | Al Rasoul Al Aazam Hospital | Airport Rd, Bourj el-Barajneh | 33.8431, 35.4987 | general, cardiac, trauma, pediatric, maternity | 20/6/5/5 | 25 | 22 |
| `h-makassed` | Makassed General Hospital | Tariq el Jdideh | 33.8753, 35.5041 | general, cardiac, trauma, pediatric, maternity | 20/6/5/5 | 25 | 12 |
| `h-hdf` | Hôtel-Dieu de France | Achrafieh | 33.8819, 35.5190 | general, cardiac, stroke, trauma, pediatric, maternity | 25/10/6/6 | 30 | 14 |
| `h-rizk` | LAU Medical Center – Rizk Hospital | Achrafieh | 33.8853, 35.5151 | general, cardiac, stroke, pediatric, maternity | 15/6/4/6 | 18 | 9 |
| `h-stgeorge` | Saint George Hospital University Medical Center | Rmeil, Achrafieh | 33.8940, 35.5239 | general, cardiac, stroke, trauma, pediatric, maternity | 25/10/6/5 | 30 | 35 (high) |
| `h-geitaoui` | Lebanese Hospital Geitaoui UMC | Achrafieh | 33.8940, 35.5309 | general, cardiac, trauma, **burns**, pediatric, maternity | 18/6/4/4 | 20 | 8 |
| `h-mlh` | Mount Lebanon Hospital | Hazmieh | 33.8602, 35.5281 | general, cardiac, stroke, trauma, pediatric, maternity | 20/8/5/5 | 25 | 10 |
| `h-bellevue` | Bellevue Medical Center | Mansourieh | 33.8483, 35.5595 | general, cardiac, stroke, trauma, pediatric, maternity | 18/6/4/4 | 20 | 5 |

**Total: 12 hospitals, 467 beds.** Burns cases can go to Geitaoui or Rafik Hariri.

**Initial bed states:** generated deterministically with a fixed pseudo-random seed (the mulberry32 algorithm, seeded per hospital ID), so every reset is identical. Per bed type, `floor(70 %)` of beds start occupied (sensor on) and about 10 % cleaning, and **at least one bed of every type is always available**. The beds are then shuffled. Labels are `GEN-1…`, `ICU-1…`, `PED-1…`, `MAT-1…`.

### 14.2 Ambulances

- Real: `amb-01` AMB-01, `amb-02` AMB-02, `amb-03` AMB-03. Paramedics link to one of these when they register.
- Simulated for the stress test: `sim-01` … `sim-10` (SIM-01…), parked in a small grid around Downtown Beirut.

### 14.3 Quick locations for the paramedic

Hamra (33.8968, 35.4823) · Achrafieh (33.8869, 35.5200) · Baabda (33.8339, 35.5442) · Hazmieh (33.8530, 35.5390) · Jounieh (33.9808, 35.6178) · Downtown Beirut (33.8955, 35.5050).

### 14.4 Seeding and reset

- **Seed demo data** writes everything with fixed document IDs, so re-running resets instead of duplicating. It also deletes hospitals left over from an older seed list, along with their beds. Writes are batched in chunks of 450, under Firestore's 500-per-batch limit.
- **Reset demo** cancels every open trip, then re-seeds.
- **Important:** run Reset from the **current** version of the website (hard refresh, Ctrl+Shift+R). An old cached page would re-seed the old hospital list.

---

## 15. Every configuration value

All are in `src/config/`. Change them there; never inside components.

### `routing.ts`
| Constant | Value | Meaning |
|---|---|---|
| `ROAD_FACTOR` | 1.4 | straight-line km × this ≈ road km |
| `AVG_SPEED_KMH` | 40 | average ambulance speed in city traffic with sirens |
| `CROWD_WEIGHT_MIN` | 15 | penalty minutes per 1.0 of crowd ratio |
| `CROWD_PENALTY_CAP_MIN` | 30 | maximum crowding penalty |
| `CRITICAL_CROWD_MULTIPLIER` | 0.5 | critical patients' crowding penalty is halved |
| `STALE_CROWD_RATIO` | 0.8 | ratio assumed when the camera is offline |
| `LAST_BED_PENALTY_MIN` | 3 | penalty for taking a hospital's last bed of that type |
| `USE_OSRM` | false | use real driving times from OSRM |
| `OSRM_BASE_URL` | `https://router.project-osrm.org/route/v1/driving` | public demo routing server |
| `OSRM_TIMEOUT_MS` | 3000 | fall back to the formula after 3 s |

### `crowding.ts`
| Constant | Value |
|---|---|
| `LOW_MAX_RATIO` | 0.6 |
| `HIGH_MIN_RATIO` | 1.0 |
| `CAMERA_STALE_MINUTES` | 10 |
| `MANUAL_COUNT_STALE_MINUTES` | null (never) |

### `dispatch.ts`
| Constant | Value | Meaning |
|---|---|---|
| `DISPATCH_EXPIRY_BUFFER_MIN` | 20 | a reservation expires at ETA + 20 min |
| `SWEEPER_INTERVAL_SEC` | 60 | how often open tabs release expired reservations |
| `CANDIDATE_BED_LIMIT` | 5 | free beds tried per hospital before `NO_BED` |
| `LOCATION_UPLOAD_INTERVAL_SEC` | 30 | paramedic GPS upload frequency |
| `STRESS_TEST_DEFAULT_AMBULANCES` | 5 | |
| `STRESS_TEST_FREE_BEDS` | 3 | |

### `camera.ts`
| Constant | Value |
|---|---|
| `MODEL_BASE` | `lite_mobilenet_v2` |
| `DETECT_INTERVAL_MS` | 700 |
| `PERSON_MIN_SCORE` | 0.5 |
| `SMOOTHING_WINDOW` | 10 (median of the last 10 counts) |
| `UPLOAD_MIN_INTERVAL_MS` | 5 000 |
| `HEARTBEAT_MS` | 30 000 |
| `READING_INTERVAL_MS` | 60 000 |
| `MAX_DETECTIONS` | 60 |
| `ER_READINGS_LIMIT` | 60 (chart points) |

### `simulator.ts`
`RANDOM_ACTIVITY_INTERVAL_MS` 10 000 · `ER_SLIDER_MAX` 60 · `ER_SLIDER_DEBOUNCE_MS` 400.

### `ui.ts`
- Status colours and icons for beds and crowding.
- Map colours: best `#15803d`, suitable `#16a34a`, medium `#ca8a04`, full `#b91c1c`, reserved `#1d4ed8`, unknown `#64748b`.
- `RELATIVE_TIME_REFRESH_MS` 15 000.

### Other config
- **`app.ts`:** `APP_NAME`, `APP_TAGLINE`, `DEMO_NOTICE`, `ROLE_HOME`, `ROLE_LABELS`.
- **`caseRules.ts`:** the case rules table and `getRequirements`.
- **`labels.ts`:** display names (bed types, wards, label prefixes, case types, severities, statuses, events, crowding).
- **`demoLocations.ts`:** quick locations, plus the map centre (33.872, 35.515) at zoom 12.
- **In code:** the transaction retry limit is 20 (`dispatchService.ts`), and new incoming ambulances stay highlighted for 15 s (`IncomingPanel.tsx`).

---

## 16. Testing and verification

### 16.1 Automated unit tests (Vitest)

**118 tests in 8 files, all passing.** Run them with `npm run test`. Type checking (`npm run typecheck`) passes with TypeScript strict mode.

| Test file | What it proves |
|---|---|
| `bedMachine.test.ts` | Every valid transition. Sensor no-ops. A dozen invalid transitions are rejected. Only RESERVE creates a reserved bed. Occupied never jumps straight to available. Trip completion. Staff actions per status. `pathTo` reaches every target through valid events only |
| `scoring.test.ts` | Case rules. Exclusions (diverting, capability, no beds, missing bed type). Closer ranks first. **A crowded hospital ranks below a slightly farther calm one.** Score formula. 30-min cap. **The critical halving.** A stale camera scores as 0.8. Last-bed penalty. **Stable sort.** OSRM overrides. Reason texts |
| `geo.test.ts` | Haversine: zero distance, 1° latitude ≈ 111.19 km, symmetry, Downtown Beirut→Jounieh ≈ 14 km. Travel-time formula |
| `crowding.test.ts` | Ratio (including zero capacity), level thresholds at the exact boundaries, staleness (camera vs manual vs missing), median |
| `cameraLogic.test.ts` | Rolling window, median smoothing ignores one missed detection, upload throttle (5 s), heartbeat (30 s), history every 60 s |
| `demoData.test.ts` | Deterministic seed. Correct bed counts per hospital. Unique IDs. About 70 % occupied and about 10 % cleaning. ≥1 free bed per type. Summary matches beds. 3 real + 10 simulated ambulances |
| `time.test.ts` | "X min ago", durations, countdowns ("overdue 3 min"), natural sort of bed labels |
| `hospitalStatus.test.ts` | The admin map's OK / strained / unavailable rule |

### 16.2 Live tests against the real Firestore database

1. **Bed transactions:** one bed went occupied → (sensor empty) cleaning → (mark cleaned) available → (sensor occupied) occupied. After each step the hospital's counters exactly matched a full recount of the beds. A repeated sensor reading was a no-op, and an invalid event (RELEASE on a cleaning bed) was rejected.
2. **Concurrency:** 5 simultaneous requests for 1 free bed gave exactly 1 winner.
3. **The acceptance test:** 5 ambulances on 3 beds, **5 runs, 5 PASS** (Section 10.4).
4. **Ranking sanity check** on the real hospital list (Section 9.2).

### 16.3 Manually tested by the owner

Login and registration for all three roles, seeding, the bed board and sensor simulator in two tabs, the diversion switch, the ER slider, and the Netlify deployment. **Not yet tested by the owner:** the AI camera with a real webcam.

---

## 17. Status, deviations from the original spec, and known limitations

### 17.1 Build milestones

| Milestone | Status |
|---|---|
| M0 Project setup | ✅ |
| M1 Types, pure logic, tests | ✅ |
| M2 Auth, seed, rules | ✅ |
| M3 Bed service, hospital dashboard, sensor simulator | ✅ (verified live) |
| M4 AI camera | ✅ built; not yet tested with a real webcam |
| M5 Recommendations | ✅ (later redesigned into the auto-pick flow) |
| M6 Dispatch and the reservation flag | ✅ (verified live) |
| M7 Stress test and admin overview | ✅ (5/5 live passes) |
| M8 Polish | ⏳ **Not done yet.** It includes: a dedicated offline banner component (only the paramedic's online/offline dot exists so far), a final pass over loading and error states, a formal 375 px mobile check, and a complete README with screenshots and the demo script |

### 17.2 Deliberate deviations from the original spec (decided by the owner)

1. **The paramedic gets an automatic choice.** The spec showed the top 3 hospitals and let the paramedic pick. Now it's START → case → severity → **GO**, the app picks and reserves, falls back automatically to the next best hospital, and keeps a manual "Choose a different hospital" override.
2. **Hospitals cannot decline ambulances.** The spec had a Decline button with a reason. Now staff can only "Mark as seen" and "Patient admitted"; overloaded hospitals use **Diversion**. Admins can still force-cancel.
3. **Real hospital names** instead of the six fictional ones in the spec (Section 14).
4. **No composite indexes needed:** queries use equality filters and sort in the browser.
5. **Hospitals and ambulances are publicly readable** (for the Register dropdowns).
6. **Manual ER counts never go stale** (configurable).
7. The camera loop uses a timer instead of `requestAnimationFrame`, so it keeps counting in background tabs.
8. **Hosting was added** (Netlify) although the original spec said "no hosting"; the owner decided this.
9. The spec's geo test expected Beirut→Jounieh to be "10–12 km". With the spec's own coordinates the real straight-line distance is about 14 km, so the test checks for about 14 km.

### 17.3 Known limitations

- **Security is demo-grade** (Section 13.2). Admin self-registration is not yet locked down.
- **Sensors are simulated.** There's no physical hardware yet.
- **Travel time is an estimate** (distance × 1.4 at 40 km/h), unless OSRM is switched on. Live traffic isn't considered.
- **Expiry relies on an open browser tab** (dashboard, admin, simulator, or the paramedic's own trip screen).
- **Bed counts and ER crowding are not connected to the real hospitals.**
- No push notifications: the hospital must have the dashboard open to hear the beep.
- English UI only.
- No audit log or analytics yet.

---

## 18. Setup, running, and deployment

### 18.1 Local development

1. Create a Firebase project (the free Spark plan is enough). Add a Web app and copy its config.
2. Copy `.env.example` to `.env` and fill in the 6 `VITE_FIREBASE_*` values and `VITE_ADMIN_CODE`. `.env` is never committed.
3. In the Firebase console:
   - enable **Authentication → Email/Password**;
   - create a **Firestore database** in production mode;
   - **publish the rules** (paste `firestore.rules` into the Rules tab, or run `npx firebase-tools deploy --only firestore:rules`).
4. `npm install`, then `npm run dev`, and open `http://localhost:5173`.
5. Register an **admin** with the admin code, click **Seed demo data**, then register hospital staff (pick a hospital) and a paramedic (pick AMB-01/02/03).

### 18.2 Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | dev server on port 5173 |
| `npm run dev:phone` | dev server over HTTPS on the LAN (self-signed certificate) so a phone can use the camera and GPS |
| `npm run build` | type-check, then production build to `dist/` |
| `npm run preview` | serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | `vitest run` |

### 18.3 GitHub

The private repository `github.com/RefaatMans/medroute`, branch `main`. `.env`, `node_modules` and `dist` are ignored.

### 18.4 Netlify

- `netlify.toml`:
  - build command `npm run build`, publish folder `dist`, Node 20;
  - a catch-all redirect `/* → /index.html (200)` so app routes like `/hospital` work on refresh;
  - `SECRETS_SCAN_OMIT_KEYS` lists the six public Firebase config keys.
- Environment variables are set in **Netlify → Site configuration → Environment variables** (the same 7 as `.env`). They're **baked in at build time**, so a redeploy is needed after changing them.
- **Every push to `main` redeploys automatically.**
- The Netlify domain must be added in **Firebase → Authentication → Settings → Authorized domains**, or login fails.

**History:** the first deploy failed because Netlify's secret scanner flagged the Firebase project ID in `.firebaserc`. This was fixed by declaring the public Firebase keys as non-secret.

---

## 19. Complete file-by-file reference

### Root
| File | Purpose |
|---|---|
| `package.json` | scripts and dependencies |
| `vite.config.ts` | React plugin; HTTPS plugin only in `phone` mode; Vitest config (tests in `tests/`, Node environment) |
| `tsconfig.json` | strict TypeScript, bundler resolution, includes `src`, `tests`, `vite.config.ts` |
| `tailwind.config.js`, `postcss.config.js` | styling pipeline |
| `index.html` | HTML shell, favicon, theme colour |
| `firebase.json` | points the Firebase CLI at the rules and indexes (no hosting) |
| `.firebaserc` | default Firebase project ID |
| `firestore.rules` | security rules (Section 13) |
| `firestore.indexes.json` | composite index definitions from the spec (not currently required) |
| `netlify.toml` | Netlify build, redirect and secret-scan config |
| `.env.example` | template for the environment variables |
| `README.md` | setup guide, demo data, spec changes, limitations |
| `SPEC.md` | the original full build specification |
| `docs/MedRoute-Knowledge-Base.md` | this document |

### `src/` top level
| File | Purpose |
|---|---|
| `main.tsx` | mounts React with the router and `AuthProvider`; imports the Leaflet CSS |
| `App.tsx` | routes, role guards, nav bar, setup banner, demo-notice footer, toaster |
| `firebase.ts` | initialises the Firebase app, Auth and Firestore from env vars; `isFirebaseConfigured`; `ADMIN_CODE` |
| `types.ts` | all domain types and enumerations (Firebase-free) |
| `index.css` | Tailwind layers and the global focus outline |
| `vite-env.d.ts` | types for the `VITE_*` env vars |

### `src/config/`
`app.ts`, `caseRules.ts`, `labels.ts`, `routing.ts`, `crowding.ts`, `dispatch.ts`, `camera.ts`, `simulator.ts`, `ui.ts`, `demoLocations.ts` (see Section 15).

### `src/lib/` (pure logic, unit-tested)
| File | Exports |
|---|---|
| `bedMachine.ts` | `TRANSITIONS`, `nextBedStatus`, `completesTrip`, `staffActionsFor`, `pathTo`, `STAFF_EVENTS` |
| `bedSummary.ts` | `emptyCounts`, `summarizeBeds`, `applyStatusChange` |
| `scoring.ts` | `recommendHospitals` (+ `RecommendInput` / `RecommendResult` types) |
| `geo.ts` | `haversineKm`, `estimateTravelMinutes` |
| `crowding.ts` | `crowdRatio`, `crowdingLevel`, `isCountStale`, `getCrowding` |
| `median.ts` | `median` |
| `cameraLogic.ts` | `pushWindow`, `smoothedCount`, `uploadDecision`, `readingDue` |
| `demoData.ts` | `SEED_HOSPITALS`, `SEED_AMBULANCES`, `mulberry32`, `buildSeedBeds`, `buildDemoHospitals` |
| `hospitalStatus.ts` | `overviewStatus` (admin map colour rule) |
| `time.ts` | `formatAgo`, `formatDuration`, `formatCountdown`, `compareLabels` |

### `src/services/` (the only Firestore writers)
| File | Exports |
|---|---|
| `db.ts` | typed converters and refs: `hospitalsCol`, `hospitalDoc`, `bedsCol`, `bedDoc`, `erReadingsCol`, `ambulancesCol`, `ambulanceDoc`, `dispatchesCol`, `dispatchDoc`, `userDoc` |
| `authService.ts` | `register`, `login`, `logout`, `errorMessage`, `UserFacingError`. Registration validates the role fields and the admin code, and deletes a half-created account if the profile write fails |
| `bedService.ts` | `applyBedEvent`, `applySensorReading`, `recomputeBedSummary` |
| `dispatchService.ts` | `createDispatch`, `cancelDispatch`, `forceCancelDispatch`, `FORCE_CANCEL_REASON`, `markArrived`, `expireDispatch`, `acknowledgeDispatch`, `releaseExpiredDispatches` |
| `hospitalService.ts` | `setDiverting`, `updateErCount`, `appendErReading` |
| `ambulanceService.ts` | `updateAmbulanceLocation` |
| `routingService.ts` | `fetchDrivingMinutes` (optional OSRM) |
| `seed.ts` | `seedDemoData`, `resetDemo` |
| `stressTest.ts` | `prepareStressTest`, `fireStressTest`, `cleanUpStressTest`, `STRESS_CASE` |

### `src/hooks/`
| File | Purpose |
|---|---|
| `useLive.ts` | generic `useLiveQuery` and `useLiveDoc` (onSnapshot, with the `fromCache` flag) |
| `useAuth.tsx` | `AuthProvider` + `useAuth()`: Firebase user + `users/{uid}` profile |
| `useHospitals.ts` | `useHospitals()`, `useHospital(id)` |
| `useBeds.ts` | `useBeds(hospitalId)` |
| `useAmbulances.ts` | `useAmbulances()`, `useAmbulance(id)` |
| `useDispatches.ts` | `useIncomingDispatches(hid)`, `useOpenDispatches()`, `useActiveDispatch(ambulanceId)` (keeps tracking a trip after it closes so the paramedic sees why), `useDispatchSweeper(scope?)` |
| `useErReadings.ts` | the last N ER readings |
| `useInterval.ts` | `useInterval(cb, ms)`, `useNow(ms)` |
| `useGeolocation.ts` | `watchPosition` wrapper |
| `useOnline.ts` | `navigator.onLine` |
| `useBeep.ts` | Web Audio double beep, unlocked on the first click or key press |
| `useSelectedHospital.ts` | staff are locked to their hospital; admins choose one via `?h=` |

### `src/components/`
| File | Purpose |
|---|---|
| `layout/NavBar.tsx` | role-aware navigation, user name, logout |
| `layout/ProtectedRoute.tsx` | role guard |
| `layout/SetupBanner.tsx` | shown when Firebase isn't configured |
| `map/HospitalMap.tsx` | Leaflet map: hospital markers, ambulance badges, route lines, click-to-pin, fit-to-bounds |
| `CaseTypePicker.tsx`, `SeverityPicker.tsx` | large pressable buttons |
| `TripView.tsx` | the paramedic's active trip screen, including "Why this hospital" and "Choose a different hospital" |
| `IncomingPanel.tsx`, `IncomingDispatchRow.tsx` | the hospital's live incoming list with beep and highlight; Mark as seen and Patient admitted |
| `BedBoard.tsx`, `BedTile.tsx` | ward-grouped bed tiles and the action dialog |
| `StatusBadge.tsx`, `CrowdBadge.tsx`, `SeverityBadge.tsx` | icon + text + colour badges |
| `ErChart.tsx` | SVG line chart with comfort line, hover tooltip and table view |
| `StressTestPanel.tsx` | the prepare / fire / clean-up stress test UI |
| `HospitalPicker.tsx` | admin hospital dropdown |
| `LastUpdated.tsx` | "Last updated X ago" |
| `Modal.tsx` | accessible dialog |
| `FormField.tsx`, `Spinner.tsx` | form layout and loading indicator |

### `src/pages/`
`LoginPage.tsx`, `RegisterPage.tsx`, `AmbulancePage.tsx`, `HospitalDashboard.tsx`, `CameraPage.tsx`, `SimulatorPage.tsx`, `AdminPage.tsx` (Section 12).

### `tests/`
The 8 test files from Section 16, plus `helpers.ts` (a fake hospital builder and a fake timestamp).

---

## 20. Demo script for the presentation

**Setup:** a laptop with two browser windows side by side (one normal, one incognito, so two different users can be logged in), plus optionally a phone. Shortly before presenting, click **Reset demo** on the Admin page, after a hard refresh.

1. **Hospital dashboard** (admin or staff window): show the live beds by ward, the KPI row and the ER crowding.
2. **AI camera** (if a webcam is available): point it at the audience or play a crowded-room video. The count rises and the hospital's crowding badge turns red. Stress the privacy point: "only a number leaves this laptop". Without a camera, use the **Simulator → ER slider** instead.
3. **Paramedic** (the other window or the phone): START → **Cardiac** → **Critical** → location **Hamra** → **GO**. The app picks **Clemenceau Medical Center** over the slightly closer AUBMC because AUBMC's ER is busier, and the "Why this hospital" box explains it. A bed is reserved instantly.
4. **Back on the dashboard** for that hospital: a **beep**, the ambulance appears under Incoming, and the bed turns **blue (Reserved)**. Click **Mark as seen**, and the paramedic sees "Hospital has seen your trip ✓".
5. **Stress test** (Simulator): Prepare (3 free ICU beds) → **Fire 5 simultaneous requests** → ✅ PASS: 3 reserved, 2 redirected. Say: *"No two ambulances can ever get the same bed."* Then Clean up.
6. **Sensor simulator:** a patient leaves (sensor → empty) and the bed goes to **Cleaning**, not Available. Staff tap **Mark cleaned**, and only then does it become Available.
7. **Paramedic taps Arrived:** the bed turns red (Occupied) and the trip closes.
8. **Closing line:** *"Sensors detect beds, AI detects crowding, and MedRoute sends every ambulance to the hospital that can treat the patient fastest."*

---

## 21. Future work

- **Real pressure sensors** (ESP32 + force-sensitive resistor) writing through `applySensorReading`.
- **Integration with hospital admission systems** via **HL7 FHIR**.
- **Moving transactions into Cloud Functions** for proper security (clients would no longer write capacity data).
- **AI prediction of bed availability** from historical data.
- **Mass-casualty mode** that spreads patients across several hospitals.
- **Arabic and French UI.**
- Also natural next steps (not in the original spec): live traffic-aware routing (turn on OSRM or a commercial routing API), push notifications for hospitals, an audit log and analytics, locking down admin registration, and an M8-style offline banner and polish.

---

## 22. FAQ (technical and business)

**Q: How does MedRoute decide which hospital is best?**
It removes hospitals that are diverting, can't treat the case, or have no free bed of the needed type. For the rest it computes score = estimated travel minutes + an ER-crowding penalty (up to 30 min, halved for critical patients) + 3 min if it would take the last bed. The lowest score wins. See Section 9.

**Q: Why not just send the ambulance to the closest hospital?**
The closest one may be full, lack the specialty, or have an overcrowded ER. The score trades a few extra minutes of driving against faster treatment on arrival.

**Q: Can two ambulances get the same bed?**
No. Each reservation is a Firestore transaction that re-reads the bed and only reserves it if it's still available, and Firestore rejects and retries any transaction whose data changed underneath it. This was proven live: 5 simultaneous ambulances on 3 beds gave exactly 3 reservations, 5 out of 5 runs. See Section 10.

**Q: What happens if the ambulance never arrives?**
The reservation expires 20 minutes after the ETA. The bed is released automatically and the paramedic is told why.

**Q: Can a hospital refuse an ambulance?**
Not individually, by design. A hospital that can't accept patients turns on **Diversion**, which removes it from all rankings for new trips. Ambulances already en route keep their beds.

**Q: Is the bed and crowding data real?**
No. The hospital **names and locations** are real; **beds, specialties, ER counts and trips are simulated** for the demo, and a notice on every page says so.

**Q: Does the AI camera record people?**
No. Video is processed inside the browser on the device, and only the people count is uploaded. Nothing is stored, and the bounding boxes are drawn but never saved.

**Q: How accurate is the people count?**
COCO-SSD lite detects "person" objects with ≥ 50 % confidence. The median of the last 10 counts smooths out flicker. Accuracy drops with heavy occlusion, poor lighting or extreme angles. It's a crowding indicator, not an exact headcount, and no accuracy benchmark has been run.

**Q: What does it cost to run?**
The demo runs on Firebase's free Spark plan, Netlify's free tier and free OpenStreetMap tiles. Production costs would depend on Firestore reads and writes, Cloud Functions (if adopted) and hardware; they haven't been estimated.

**Q: Does it work without internet?**
Firestore caches data, and the paramedic sees an online/offline indicator. But reservations need a connection, because the transaction must reach the server.

**Q: Why Firestore and not a traditional SQL database with a server?**
Realtime listeners give every screen live updates with no server code. Transactions give the atomic reservation. And it runs on a free tier with no infrastructure to manage.

**Q: What is the biggest security weakness, and how would you fix it?**
Clients write capacity data directly, and the admin code is checked in the browser. The fix: move reservations and bed changes into Cloud Functions, tighten the rules to read-only for clients, and assign admin roles server-side.

**Q: How would real sensors connect?**
A device (for example an ESP32 with a force-sensitive resistor under the mattress) would call the same `applySensorReading(hospitalId, bedId, occupied)` function, or a Cloud Function wrapping it. The simulator already uses exactly that path.

**Q: How is patient privacy handled?**
No personal data is collected at all, only the case type and severity per trip.

**Q: What if GPS isn't available?**
The paramedic can choose a quick location or tap the map. GPS needs HTTPS, which Netlify provides.

**Q: How fast is it?**
Live updates reach other screens in about a second. A single reservation takes a fraction of a second. Under deliberate contention (5 at once on one hospital) a batch takes about 3–6 s.

**Q: What testing has been done?**
118 automated unit tests, plus live tests against the real database: bed transactions, the concurrency test, and the 5/5 stress-test runs. See Section 16.

**Q: Who is the customer?**
Possible buyers are ambulance services and dispatch centres, hospitals and hospital groups, and health authorities. This hasn't been validated with customers yet.

**Q: What is not finished?**
M8 polish (offline banner, final error and loading pass, 375 px check, final README), the admin lock-down, real-webcam testing, and everything in Section 21.

---

## 23. Glossary

| Term | Meaning |
|---|---|
| **Dispatch / trip** | One ambulance's journey to a reserved bed (a document in `dispatches`) |
| **Reservation flag** | `bed.reservedByDispatchId`: the bed is held for exactly one trip |
| **Transaction** | A group of database reads and writes that succeed or fail together; Firestore retries it if the data it read changed |
| **Optimistic concurrency** | Don't lock; check at commit time whether anything changed, and retry if so |
| **bedSummary** | Cached per-hospital bed counters, kept in sync inside every bed transaction |
| **Diversion** | A hospital's "send ambulances elsewhere" switch |
| **ER comfort capacity** | The number of people a waiting room handles comfortably; crowding is measured against it |
| **Stale camera** | A camera count older than 10 minutes, shown as "unknown" |
| **Sweeper** | Browser-side job that expires overdue reservations every 60 s |
| **Haversine** | Formula for great-circle distance between two GPS points |
| **Road factor** | Multiplier (1.4) converting straight-line distance to road distance |
| **OSRM** | Open Source Routing Machine: optional real driving-time service |
| **COCO-SSD** | A pre-trained object-detection model that recognises 80 object types, including "person" |
| **TensorFlow.js** | Machine-learning library that runs models in the browser |
| **Median smoothing** | Using the middle value of recent counts to ignore momentary errors |
| **onSnapshot** | Firestore realtime listener that pushes updates to the browser |
| **Security rules** | Firestore's server-enforced access-control rules |
| **Seed / Reset demo** | Write the demo data / cancel open trips and re-write the demo data |
| **Spark plan** | Firebase's free tier |
| **SPA redirect** | Netlify rule that serves `index.html` for every path so client-side routes work |
| **HL7 FHIR** | Healthcare data-exchange standard for future hospital-system integration |
