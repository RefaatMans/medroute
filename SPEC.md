# MedRoute — Full Build Specification

> **To Claude Code:** This document is the complete spec for a web app. Build it from scratch in this folder, following the milestones in section 14 in order. After each milestone, run the type check and tests, then stop and summarize what works before moving on. Do not add hosting or deployment. If something in this spec is impossible or unclear, ask before deviating.

---

## 1. What the app does (one paragraph)

MedRoute helps ambulances find the best hospital for a patient in real time. Each hospital's beds report whether they're occupied (via pressure sensors, simulated in this version), and an **AI camera** in the ER waiting room counts people to measure crowding. When a paramedic asks "where should I go?", the app ranks hospitals by travel time, available beds of the right type, the hospital's ability to treat the case, and ER crowding. When the paramedic picks a hospital, the app **reserves a specific bed** using an atomic database transaction, so if 5 ambulances ask at once and only 3 beds are free, exactly 3 get beds and the other 2 are redirected. The hospital sees incoming ambulances live.

Working name: **MedRoute** (easy to rename; keep the name in one constant `APP_NAME` in `src/config/app.ts`).

---

## 2. Tech stack and constraints

| Area | Choice |
|---|---|
| Frontend | React + TypeScript, built with **Vite** |
| Styling | **Tailwind CSS** |
| Routing | **react-router-dom** |
| Database | **Cloud Firestore** (Firebase JS SDK, modular v10+ API) |
| Auth | **Firebase Authentication** (email + password) |
| Maps | **Leaflet** + **react-leaflet** with OpenStreetMap tiles (free, no API key). Use the react-leaflet major version compatible with the installed React version. |
| AI camera | **TensorFlow.js** + **@tensorflow-models/coco-ssd** (runs fully in the browser) |
| Tests | **Vitest** |
| Dates | native `Date` / Firestore `Timestamp` (no extra date library needed) |

**Constraints**
- **No hosting.** The app runs locally with `npm run dev`. Do not add Firebase Hosting, Vercel, Netlify, or Docker.
- **No Cloud Functions** (they require the paid Blaze plan). All logic runs client-side, using Firestore transactions for anything that must be atomic.
- **No patient personal data.** Never store patient names, IDs or photos. Only case type and severity.
- **No images leave the device.** The camera page processes video frames locally and only sends a number (people count) to Firestore.
- Must be **responsive**: the ambulance page must work well on a phone screen.
- All tunable numbers (weights, speeds, thresholds, timeouts) live in `src/config/*`, never hard-coded inside components.

---

## 3. User roles

| Role | What they do | Main page |
|---|---|---|
| `ambulance` | Paramedic. Enters case type + severity, gets hospital recommendations, dispatches, marks arrival or cancels. | `/ambulance` |
| `hospital` | ER staff / charge nurse for **one** hospital. Sees beds and incoming ambulances, marks beds cleaned, declines incoming, toggles diversion, runs the AI camera. | `/hospital`, `/hospital/camera` |
| `admin` | Demo operator. Seeds data, simulates bed sensors, runs the stress test, sees everything on a map. | `/admin`, `/simulator` |

---

## 4. Core concepts and rules

### 4.1 Bed types
`general`, `icu`, `pediatric`, `maternity`

### 4.2 Hospital capabilities
`cardiac`, `stroke`, `trauma`, `burns`, `pediatric`, `maternity`, `general`
(every hospital has `general`)

### 4.3 Case types and severities
Case types: `general`, `cardiac`, `stroke`, `trauma`, `burns`, `respiratory`, `pediatric`, `maternity`
Severities: `critical`, `urgent`, `stable`

### 4.4 Case rules (put in `src/config/caseRules.ts`)

| Case type | Required capability | Bed type if `critical` | Bed type otherwise |
|---|---|---|---|
| general | general | icu | general |
| cardiac | cardiac | icu | general |
| stroke | stroke | icu | general |
| trauma | trauma | icu | general |
| burns | burns | icu | general |
| respiratory | general | icu | general |
| pediatric | pediatric | pediatric | pediatric |
| maternity | maternity | maternity | maternity |

Export a pure function: `getRequirements(caseType, severity) => { capability, bedType }`.

### 4.5 Bed status lifecycle (the heart of the system)

Bed statuses: `available`, `reserved`, `occupied`, `cleaning`, `out_of_service`

A bed counts as **available for ambulances only when its status is `available`**. That means it's empty (sensor), clean (staff confirmed), and not already reserved by another ambulance.

Events and transitions (implement as a **pure function** `nextBedStatus(current, event)` in `src/lib/bedMachine.ts`, fully unit tested):

| Event | From status | To status | Notes |
|---|---|---|---|
| `SENSOR_OCCUPIED` (pressure detected) | available, reserved, cleaning | occupied | If it was `reserved`, also complete the linked dispatch (status `arrived`). |
| `SENSOR_EMPTY` (no pressure) | occupied | cleaning | Patient left; bed needs cleaning before reuse. |
| `STAFF_MARK_CLEANED` | cleaning | available | |
| `STAFF_PATIENT_ADMITTED` | reserved, available | occupied | Manual fallback if there's no sensor. Completes linked dispatch if reserved. |
| `STAFF_OUT_OF_SERVICE` | any except reserved | out_of_service | |
| `STAFF_BACK_IN_SERVICE` | out_of_service | cleaning | Must be cleaned before use. |
| `RESERVE` (dispatch created) | available | reserved | Sets `reservedByDispatchId`. |
| `RELEASE` (dispatch cancelled / declined / expired) | reserved | available | Clears `reservedByDispatchId`. |
| `AMBULANCE_ARRIVED` | reserved | occupied | |

Any event not allowed from the current status returns an error (`INVALID_TRANSITION`) and nothing is written. Sensor events that don't change anything (e.g. `SENSOR_OCCUPIED` on an already occupied bed) are a no-op, not an error.

### 4.6 The reservation flag (no double-booking)

This is the most important rule in the app: **a bed can only ever be reserved by one dispatch.** Achieve this with Firestore transactions (section 7.2). The hospital document also keeps a live `incomingCount` so everyone sees how many ambulances are on the way.

### 4.7 ER crowding (from the AI camera)

Each hospital has `erComfortCapacity` (the number of people the waiting room handles comfortably, set per hospital). Then:

```
crowdRatio = erWaitingCount / erComfortCapacity
level = 'low'    if crowdRatio < 0.6
        'medium' if 0.6 <= crowdRatio <= 1.0
        'high'   if crowdRatio > 1.0
```

If the camera hasn't reported for more than `CAMERA_STALE_MINUTES` (default 10), the crowding is shown as **"unknown (camera offline)"** and treated as `medium` for scoring.

Thresholds live in `src/config/crowding.ts`.

---

## 5. Firestore data model

Use these exact collection names. Timestamps are Firestore `Timestamp` (use `serverTimestamp()` on writes).

### 5.1 `hospitals/{hospitalId}`
```ts
{
  name: string;
  address: string;
  phone: string;
  location: { lat: number; lng: number };
  capabilities: Capability[];            // e.g. ['general','cardiac','trauma']
  diverting: boolean;                    // true = hospital refuses ambulances (manual toggle)
  erComfortCapacity: number;             // e.g. 20
  erWaitingCount: number;                // latest smoothed count from AI camera
  erCrowdingLevel: 'low'|'medium'|'high';
  erCountUpdatedAt: Timestamp | null;
  erCountSource: 'camera' | 'manual';
  bedSummary: {                          // cached counters, updated in the same transaction as any bed change
    [bedType in BedType]?: {
      total: number; available: number; reserved: number;
      occupied: number; cleaning: number; out_of_service: number;
    }
  };
  incomingCount: number;                 // active dispatches heading here
  updatedAt: Timestamp;
}
```

### 5.2 `hospitals/{hospitalId}/beds/{bedId}`
```ts
{
  label: string;                // e.g. "ICU-3"
  type: BedType;
  ward: string;                 // e.g. "Intensive Care"
  status: BedStatus;
  sensorOccupied: boolean;      // last raw reading from the pressure sensor
  lastSensorAt: Timestamp | null;
  reservedByDispatchId: string | null;
  updatedAt: Timestamp;
}
```

### 5.3 `hospitals/{hospitalId}/erReadings/{readingId}`
History of camera counts for a small chart (written at most once per minute).
```ts
{ count: number; level: CrowdingLevel; at: Timestamp }
```

### 5.4 `ambulances/{ambulanceId}`
```ts
{
  callSign: string;             // e.g. "AMB-12"
  location: { lat: number; lng: number } | null;
  locationUpdatedAt: Timestamp | null;
  status: 'idle' | 'en_route';
  activeDispatchId: string | null;
  simulated: boolean;           // true for stress-test ambulances
}
```

### 5.5 `dispatches/{dispatchId}`
```ts
{
  ambulanceId: string;
  ambulanceCallSign: string;
  hospitalId: string;
  hospitalName: string;
  bedId: string;
  bedLabel: string;
  bedType: BedType;
  caseType: CaseType;
  severity: Severity;
  status: 'en_route' | 'arrived' | 'cancelled' | 'declined' | 'expired';
  etaMinutes: number;
  origin: { lat: number; lng: number };
  createdAt: Timestamp;
  expiresAt: Timestamp;         // createdAt + etaMinutes + DISPATCH_EXPIRY_BUFFER_MIN
  acknowledgedAt: Timestamp | null;  // hospital tapped "Acknowledge"
  closedAt: Timestamp | null;
  closedReason: string | null;  // e.g. "Declined by hospital: no ICU staff"
}
```

### 5.6 `users/{uid}`
```ts
{
  displayName: string;
  email: string;
  role: 'ambulance' | 'hospital' | 'admin';
  hospitalId: string | null;    // required if role = hospital
  ambulanceId: string | null;   // required if role = ambulance
  createdAt: Timestamp;
}
```

### 5.7 Shared TypeScript types
Put all of the above in `src/types.ts` and use them everywhere. Write small converter helpers (`withConverter`) so Firestore reads are typed.

---

## 6. Recommendation algorithm (the routing "brain")

Implement as a **pure function** in `src/lib/scoring.ts` with no Firebase imports so it's easy to unit test:

```ts
recommendHospitals(input: {
  origin: { lat, lng };
  caseType: CaseType;
  severity: Severity;
  hospitals: Hospital[];
  now: Date;
}) => {
  ranked: Recommendation[];      // eligible, sorted best first
  excluded: { hospital, reason }[];  // shown greyed-out with the reason
}
```

### Steps
1. `{ capability, bedType } = getRequirements(caseType, severity)`.
2. For each hospital:
   - Exclude if `diverting` → reason "Hospital is on diversion".
   - Exclude if it lacks the capability → reason "Cannot treat {caseType}".
   - `available = bedSummary[bedType]?.available ?? 0`. Exclude if 0 → reason "No {bedType} beds free".
3. **Travel time** (`src/lib/geo.ts`):
   - `distanceKm = haversine(origin, hospital.location)`
   - `travelMinutes = distanceKm * ROAD_FACTOR / AVG_SPEED_KMH * 60`
   - Defaults: `ROAD_FACTOR = 1.4`, `AVG_SPEED_KMH = 40` (urban traffic with sirens).
   - Optional enhancement (behind a config flag `USE_OSRM`, default `false`): fetch real driving time from the public OSRM demo server `https://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=false`, with a 3-second timeout and automatic fallback to the formula. This must be done outside the pure function (pre-compute travel times and pass them in).
4. **Crowding penalty** (minutes):
   - `crowdRatio` as in 4.7 (stale camera → use ratio 0.8).
   - `crowdPenalty = min(crowdRatio * CROWD_WEIGHT_MIN, CROWD_PENALTY_CAP_MIN)`, defaults `CROWD_WEIGHT_MIN = 15`, `CROWD_PENALTY_CAP_MIN = 30`.
   - If `severity === 'critical'`, multiply by `CRITICAL_CROWD_MULTIPLIER = 0.5` (critical patients skip the waiting room, but crowding still strains staff).
5. **Scarcity penalty**: if `available === 1`, add `LAST_BED_PENALTY_MIN = 3` (prefer not to grab the very last bed when alternatives are similar).
6. `score = travelMinutes + crowdPenalty + scarcityPenalty`. Lower is better. Sort ascending.
7. For each ranked hospital, produce human-readable **reasons** (shown on the card), for example:
   - "≈ 8 min away"
   - "3 ICU beds free"
   - "ER crowding: HIGH (27 people waiting) — +11 min penalty"
   - "Closest hospital with a cardiac unit"
   - "Camera offline — crowding unknown"

### Output type
```ts
interface Recommendation {
  hospital: Hospital;
  bedType: BedType;
  availableBeds: number;
  distanceKm: number;
  travelMinutes: number;
  crowdPenalty: number;
  score: number;
  crowdingLevel: CrowdingLevel | 'unknown';
  reasons: string[];
}
```

All constants live in `src/config/routing.ts`.

---

## 7. Services (all Firestore writes go through these)

Components must **never** write to Firestore directly. Every write goes through a function in `src/services/`.

### 7.1 `bedService.ts`
```ts
applyBedEvent(hospitalId, bedId, event, opts?) : Promise<void>
```
Runs a **Firestore transaction** that:
1. Reads the bed doc and the hospital doc.
2. Computes the new status with `nextBedStatus`. If invalid, throw `INVALID_TRANSITION`. If no-op, return.
3. Updates the bed (`status`, `updatedAt`, plus `sensorOccupied`/`lastSensorAt` for sensor events, plus `reservedByDispatchId` for reserve/release).
4. Updates `hospital.bedSummary[type]`: decrement the old status counter, increment the new one.
5. If the bed was `reserved` and the event completes the trip (`SENSOR_OCCUPIED`, `STAFF_PATIENT_ADMITTED`, `AMBULANCE_ARRIVED`): set the linked dispatch to `arrived`, set `closedAt`, decrement `hospital.incomingCount`, and set that ambulance to `idle` with `activeDispatchId = null`.

Also export:
- `applySensorReading(hospitalId, bedId, occupied: boolean)` → maps to `SENSOR_OCCUPIED` / `SENSOR_EMPTY` (this is what a real pressure sensor or the simulator calls).
- `recomputeBedSummary(hospitalId)` → admin repair tool: reads all beds, rebuilds `bedSummary` from scratch.

### 7.2 `dispatchService.ts` — the reservation flag

```ts
createDispatch({ ambulanceId, hospitalId, caseType, severity, origin, etaMinutes })
  : Promise<{ ok: true, dispatchId, bedLabel } | { ok: false, code: 'NO_BED' | 'DIVERTING' | 'AMBULANCE_BUSY' }>
```

Algorithm (Firestore web transactions can't run queries, so do it in two phases):
1. Determine `bedType` from case rules.
2. **Outside** the transaction: query `hospitals/{hospitalId}/beds` where `type == bedType` and `status == 'available'`, limit 5. These are candidates.
3. Pre-generate a new dispatch doc ref (`doc(collection(db,'dispatches'))`).
4. For each candidate bed, try a transaction:
   - Read the ambulance doc → if `activeDispatchId` is set, abort with `AMBULANCE_BUSY`.
   - Read the hospital doc → if `diverting`, abort with `DIVERTING`.
   - Read the bed doc → **if its status is no longer `available`, throw `BED_TAKEN` and try the next candidate.**
   - Write: bed → `reserved` with `reservedByDispatchId`; hospital `bedSummary` counters (available −1, reserved +1); `incomingCount` +1; new dispatch doc (status `en_route`, `expiresAt`); ambulance → `en_route`, `activeDispatchId`.
5. If every candidate fails with `BED_TAKEN` (or there were none), return `NO_BED`.

Because Firestore transactions automatically retry when a document they read changes, two ambulances can never both reserve the same bed. **This is the core guarantee and must be covered by the stress test (section 9.4).**

Also export (each one is a transaction that re-checks `status === 'en_route'` first, so it's safe if two clients do it at once):
- `cancelDispatch(dispatchId, reason)` → status `cancelled`, bed `RELEASE`, `incomingCount` −1, ambulance → idle.
- `declineDispatch(dispatchId, reason)` → same but status `declined` (called by hospital staff).
- `markArrived(dispatchId)` → status `arrived`, bed `AMBULANCE_ARRIVED`, `incomingCount` −1, ambulance → idle.
- `acknowledgeDispatch(dispatchId)` → sets `acknowledgedAt`.
- `releaseExpiredDispatches()` → queries dispatches with `status == 'en_route'` and `expiresAt < now`, and expires each one (status `expired`, release bed, etc.).

Config in `src/config/dispatch.ts`: `DISPATCH_EXPIRY_BUFFER_MIN = 20`, `SWEEPER_INTERVAL_SEC = 60`.

### 7.3 Expiry sweeper
There's no server, so a hook `useDispatchSweeper()` calls `releaseExpiredDispatches()` every `SWEEPER_INTERVAL_SEC` seconds. Mount it on the hospital dashboard, the admin page, and the simulator. It's idempotent, so multiple open tabs running it is fine.

### 7.4 `hospitalService.ts`
- `setDiverting(hospitalId, diverting: boolean)`
- `updateErCount(hospitalId, count, source: 'camera'|'manual')` → computes level, writes `erWaitingCount`, `erCrowdingLevel`, `erCountUpdatedAt`, `erCountSource`.
- `appendErReading(hospitalId, count, level)` (throttled by the caller to once per minute).

### 7.5 `ambulanceService.ts`
- `updateAmbulanceLocation(ambulanceId, {lat,lng})`

### 7.6 `authService.ts`
- `register({ email, password, displayName, role, hospitalId?, ambulanceId?, adminCode? })`
- `login(email, password)`, `logout()`

### 7.7 `seed.ts`
- `seedDemoData()` → writes the data in section 11 using batched writes. Idempotent: uses fixed document IDs so running it twice resets the demo instead of duplicating.
- `resetDemo()` → cancels all open dispatches, resets beds to the seed state, resets ambulances to idle, then re-seeds.

---

## 8. Realtime hooks (`src/hooks/`)

All use `onSnapshot` so the UI updates live without refresh. Each returns `{ data, loading, error }` and unsubscribes on unmount.

- `useAuth()` — Firebase user + their `users/{uid}` profile.
- `useHospitals()` — all hospitals.
- `useHospital(hospitalId)`
- `useBeds(hospitalId)`
- `useIncomingDispatches(hospitalId)` — status `en_route`, ordered by `createdAt` desc.
- `useActiveDispatch(ambulanceId)` — listens to the ambulance doc, then to its active dispatch.
- `useAmbulances()` — for the admin map.
- `useErReadings(hospitalId, limit = 60)`
- `useInterval(callback, ms)`
- `useDispatchSweeper()`
- `useGeolocation()` — wraps `navigator.geolocation.watchPosition`, returns position or error.

---

## 9. Pages and UI

General UI rules:
- Clean, high-contrast, large touch targets (paramedics use this in a moving vehicle).
- Colors: green = available / low crowding, yellow = medium, red = full / high crowding / diverting, blue = reserved, grey = out of service / unknown.
- Never rely on color alone: always pair with a text label or icon.
- Show "Last updated X min ago" wherever live data appears.
- Show a toast for every success/failure of an action.
- Show a small banner if Firestore is offline (use `navigator.onLine` plus snapshot metadata `fromCache`).

### 9.1 `/login` and `/register`
- Register form: name, email, password, role.
  - If role = `hospital` → dropdown of hospitals (from Firestore).
  - If role = `ambulance` → dropdown of non-simulated ambulances.
  - If role = `admin` → an "Admin code" field that must match `VITE_ADMIN_CODE` from `.env`. (This is demo-grade protection only; note it in the README.)
- After login, redirect by role: ambulance → `/ambulance`, hospital → `/hospital`, admin → `/admin`.
- `ProtectedRoute` component that checks role and redirects otherwise.

### 9.2 `/ambulance` — Paramedic app (mobile-first)

**State A: No active trip**
1. Header: call sign, online/offline dot.
2. **Case type**: grid of big buttons with icons (general, cardiac, stroke, trauma, burns, respiratory, pediatric, maternity).
3. **Severity**: 3 big buttons (Critical red, Urgent orange, Stable green).
4. **Location**:
   - Default: live GPS via `useGeolocation`, also written to the ambulance doc every 30 s.
   - Fallback (laptop demo): "Set location on map" — tap the map to drop a pin.
   - Quick presets dropdown with a few demo locations from the seed file.
5. **"Find best hospital"** button (disabled until case type + severity + location are set).
6. **Results** (update live, since `useHospitals` is realtime):
   - Map: ambulance pin + hospital markers colored by status, the #1 pick highlighted.
   - Top 3 recommendation cards: name, ETA, distance, "X {bedType} beds free", ER crowding badge with people count, reasons list, **"Send here"** button.
   - Collapsible "Not suitable" section listing excluded hospitals with their reason.
7. On "Send here": call `createDispatch`.
   - Success → switch to State B.
   - `NO_BED` → toast "Those beds were just taken. Updated recommendations below." and re-rank automatically.
   - `DIVERTING` → similar message.

**State B: Active trip**
- Big card: hospital name, bed label reserved (e.g. "ICU-3 reserved for you"), ETA countdown, hospital phone as a `tel:` link.
- "Open navigation" button → `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}` in a new tab.
- Status line: "Hospital notified", and "Hospital acknowledged ✓" once `acknowledgedAt` is set.
- Map with route line (straight line is fine) from ambulance to hospital.
- Buttons: **"Arrived"** (calls `markArrived`), **"Cancel trip"** (confirm dialog, calls `cancelDispatch`).
- If the dispatch becomes `declined` or `expired`: show a red alert with `closedReason`, then return to State A with the same case type/severity pre-filled and immediately show new recommendations.

### 9.3 `/hospital` — ER dashboard (desktop-first, also works on tablet)

1. **Header**: hospital name, Diversion toggle (confirm dialog; when ON, show a red banner "ON DIVERSION — not receiving ambulances").
2. **KPI row**:
   - Available beds per type (e.g. General 4/20, ICU 1/6, Pediatric 2/5).
   - Incoming ambulances count.
   - ER waiting: count + crowding badge + "camera/manual" source + last update time. Link "Open AI camera".
3. **Incoming ambulances panel** (realtime):
   - New dispatch → play a short beep (only after the user has clicked anywhere once, due to browser autoplay rules) and highlight the row.
   - Each row: call sign, case type, severity badge, reserved bed label, ETA countdown, time since dispatch.
   - Buttons: **Acknowledge**, **Patient admitted** (→ `STAFF_PATIENT_ADMITTED` on that bed), **Decline** (asks for a reason, calls `declineDispatch`).
4. **Bed board**: tiles grouped by ward, each showing label + status + time in status. Click a tile → actions valid for its current status only (Mark cleaned, Out of service, Back in service, Patient admitted). Invalid actions are hidden, not just disabled.
5. **ER crowding chart**: small line chart of the last 60 `erReadings` (a simple SVG or a lightweight chart library such as Recharts).
6. **Manual ER count** input as a fallback when the camera is off (calls `updateErCount` with source `manual`).
7. Mounts `useDispatchSweeper()`.

### 9.4 `/simulator` — Demo control panel (admin only)

1. **Hospital picker**.
2. **Pressure sensor simulator**: the selected hospital's beds as tiles, each with a toggle "Sensor: occupied / empty". Toggling calls `applySensorReading` (the exact same function a real sensor would use). Show the resulting status change live.
3. **"Random activity" switch**: every 10 s, randomly flips 1 sensor in the selected hospital (for a lively demo).
4. **ER count slider** (0–60) that calls `updateErCount` with source `manual`.
5. **Stress test — "the 5 ambulances, 3 beds test"**:
   - Inputs: hospital, bed type, number of ambulances N (default 5).
   - Button "Prepare": sets exactly 3 beds of that type to `available` in that hospital (others occupied) — via `applyBedEvent`/admin tools.
   - Button "Fire N simultaneous requests": uses N seeded simulated ambulances (`simulated: true`), calls `createDispatch` for all of them at the same moment with `Promise.all`.
   - Show results table: ambulance, result (✅ bed X reserved / ❌ NO_BED). **Expected: exactly 3 successes, N−3 failures, and the hospital shows 0 available, 3 reserved, incomingCount 3.**
   - Button "Clean up" cancels those dispatches.
6. Mounts `useDispatchSweeper()`.

### 9.5 `/hospital/camera` — AI camera (hospital staff or admin)

1. **Privacy banner** (always visible): "People are counted on this device. No video or images are stored or sent — only the number."
2. Source selector: **Webcam** (`getUserMedia`) or **Video file** (upload a local video of a crowded waiting room — useful for the demo).
3. Load the model once: `cocoSsd.load({ base: 'lite_mobilenet_v2' })`, show a loading state. Use the WebGL backend.
4. Detection loop:
   - Run `model.detect(video)` about every 700 ms (throttled `requestAnimationFrame` loop, never overlapping calls).
   - Count detections with `class === 'person'` and `score >= PERSON_MIN_SCORE` (0.5).
   - Keep the last 10 counts in a rolling buffer; the **smoothed count = median** of the buffer (removes flicker).
   - Draw bounding boxes and the live count on a `<canvas>` overlay (boxes only, never saved).
5. Upload to Firestore via `updateErCount(hospitalId, smoothed, 'camera')`:
   - When the smoothed count changes, but no more often than every 5 s.
   - Plus a heartbeat every 30 s even if unchanged (so the "last updated" stays fresh and the hospital isn't marked stale).
6. Every 60 s, `appendErReading` for the chart.
7. Big readout: smoothed count, crowding level badge, comfort capacity, FPS, status ("Uploading ✓ 3 s ago").
8. Clean up on unmount: stop the camera tracks, cancel the loop, dispose the model.
9. Config in `src/config/camera.ts`: `DETECT_INTERVAL_MS`, `PERSON_MIN_SCORE`, `SMOOTHING_WINDOW`, `UPLOAD_MIN_INTERVAL_MS`, `HEARTBEAT_MS`, `READING_INTERVAL_MS`.

### 9.6 `/admin` — Overview
- Full-screen map: all hospitals (colored by availability / diversion / crowding) and all ambulances (idle vs en route, with a line to their destination).
- Table of hospitals: beds per type, incoming, ER count, crowding, diverting, last update.
- Table of active dispatches with a "Force cancel" button.
- Buttons: **Seed demo data**, **Reset demo**, **Recompute bed summaries**.
- Links to the simulator and to each hospital's camera page.

---

## 10. Security rules (`firestore.rules`)

Demo-grade but sensible. In a real deployment, the dispatch and bed transactions would move into Cloud Functions so ambulances wouldn't need write access to hospital data — mention this in the README under "Known limitations".

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function me() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
    function isAdmin() { return signedIn() && me().role == 'admin'; }
    function isAmbulance() { return signedIn() && me().role == 'ambulance'; }
    function isStaffOf(hid) { return signedIn() && me().role == 'hospital' && me().hospitalId == hid; }

    match /users/{uid} {
      allow read: if signedIn() && (request.auth.uid == uid || isAdmin());
      allow create: if signedIn() && request.auth.uid == uid
                    && request.resource.data.role in ['ambulance', 'hospital', 'admin'];
      allow update: if isAdmin()
                    || (request.auth.uid == uid && request.resource.data.role == resource.data.role);
    }

    match /hospitals/{hid} {
      allow read: if signedIn();
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || isStaffOf(hid) || isAmbulance();

      match /beds/{bedId} {
        allow read: if signedIn();
        allow create, delete: if isAdmin();
        allow update: if isAdmin() || isStaffOf(hid) || isAmbulance();
      }
      match /erReadings/{rid} {
        allow read: if signedIn();
        allow create: if isAdmin() || isStaffOf(hid);
      }
    }

    match /ambulances/{aid} {
      allow read: if signedIn();
      allow create, delete: if isAdmin();
      allow update: if isAdmin() || isAmbulance()
                    || (signedIn() && me().role == 'hospital');
    }

    match /dispatches/{did} {
      allow read: if signedIn();
      allow create: if isAdmin() || isAmbulance();
      allow update: if isAdmin() || isAmbulance() || isStaffOf(resource.data.hospitalId);
    }
  }
}
```

(Hospital staff need to update ambulance docs because declining a dispatch sets that ambulance back to idle.)

### Indexes (`firestore.indexes.json`)
- `beds` (collection group not needed; subcollection query): `type ASC, status ASC`
- `dispatches`: `hospitalId ASC, status ASC, createdAt DESC`
- `dispatches`: `status ASC, expiresAt ASC`

If Firestore reports a missing index at runtime, its error message contains a link to create it; add it to `firestore.indexes.json` too.

### `firebase.json` (rules + indexes only, no hosting)
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

---

## 11. Seed data (`src/services/seed.ts`)

Fictional hospitals placed around Greater Beirut so the map looks realistic. Use these fixed IDs.

| id | name | lat | lng | capabilities | beds (general / icu / pediatric / maternity) | erComfortCapacity |
|---|---|---|---|---|---|---|
| `h-cedar` | Cedar General Hospital | 33.8960 | 35.4820 | general, cardiac, trauma, stroke | 20 / 6 / 0 / 0 | 25 |
| `h-olive` | Olive Tree Medical Center | 33.8880 | 35.5200 | general, cardiac, pediatric, maternity | 15 / 4 / 6 / 5 | 20 |
| `h-harbor` | Harbor Emergency Hospital | 33.8990 | 35.5150 | general, trauma, burns | 12 / 5 / 0 / 0 | 15 |
| `h-hills` | Hills University Hospital | 33.8560 | 35.5400 | general, cardiac, stroke, trauma, pediatric | 25 / 8 / 6 / 0 | 30 |
| `h-valley` | Valley Community Hospital | 33.8340 | 35.5440 | general, maternity | 10 / 2 / 0 / 6 | 12 |
| `h-coast` | Coastline Medical Center | 33.9800 | 35.6200 | general, cardiac, burns, pediatric | 18 / 5 / 4 / 0 | 20 |

Beds: generate labels like `GEN-1…GEN-20`, `ICU-1…ICU-6`, `PED-1…`, `MAT-1…`, with wards "General Ward", "Intensive Care", "Pediatrics", "Maternity". Initial state: about 70% `occupied` (sensorOccupied true), 10% `cleaning`, rest `available`, with a fixed pseudo-random seed so the demo is repeatable. Compute `bedSummary` from the generated beds.

Initial ER counts: vary them so crowding differs (e.g. Cedar 8, Olive 22, Harbor 4, Hills 12, Valley 3, Coast 9) with `erCountSource: 'manual'`.

Ambulances:
- Real: `amb-01` "AMB-01", `amb-02` "AMB-02", `amb-03` "AMB-03" (`simulated: false`).
- Simulated for stress test: `sim-01` … `sim-10` (`simulated: true`).

Demo location presets (for the paramedic's location dropdown):
- "Hamra" 33.8968, 35.4823
- "Achrafieh" 33.8869, 35.5200
- "Baabda" 33.8339, 35.5442
- "Hazmieh" 33.8530, 35.5390
- "Jounieh" 33.9808, 35.6178
- "Downtown Beirut" 33.8955, 35.5050

---

## 12. Project structure

```
medroute/
├─ .env.example
├─ .gitignore              (include .env)
├─ README.md
├─ firebase.json
├─ firestore.rules
├─ firestore.indexes.json
├─ index.html
├─ package.json
├─ tailwind.config.js / postcss.config.js
├─ tsconfig.json
├─ vite.config.ts
└─ src/
   ├─ main.tsx
   ├─ App.tsx                     (routes)
   ├─ firebase.ts                 (init app, auth, db from env vars)
   ├─ types.ts
   ├─ config/
   │  ├─ app.ts
   │  ├─ caseRules.ts
   │  ├─ routing.ts
   │  ├─ crowding.ts
   │  ├─ dispatch.ts
   │  ├─ camera.ts
   │  └─ demoLocations.ts
   ├─ lib/                        (pure logic, no Firebase imports)
   │  ├─ geo.ts                   (haversine, travel time)
   │  ├─ scoring.ts               (recommendHospitals)
   │  ├─ bedMachine.ts            (nextBedStatus)
   │  ├─ crowding.ts              (ratio → level, staleness)
   │  └─ median.ts
   ├─ services/
   │  ├─ authService.ts
   │  ├─ bedService.ts
   │  ├─ dispatchService.ts
   │  ├─ hospitalService.ts
   │  ├─ ambulanceService.ts
   │  └─ seed.ts
   ├─ hooks/                      (see section 8)
   ├─ components/
   │  ├─ layout/NavBar.tsx, ProtectedRoute.tsx, OfflineBanner.tsx
   │  ├─ map/HospitalMap.tsx      (Leaflet; fix default marker icons for Vite)
   │  ├─ CaseTypePicker.tsx, SeverityPicker.tsx
   │  ├─ RecommendationCard.tsx
   │  ├─ CrowdBadge.tsx, StatusBadge.tsx
   │  ├─ BedTile.tsx, BedBoard.tsx
   │  ├─ IncomingDispatchRow.tsx
   │  ├─ ErChart.tsx
   │  └─ Toast.tsx (or use a small library like react-hot-toast)
   └─ pages/
      ├─ LoginPage.tsx, RegisterPage.tsx
      ├─ AmbulancePage.tsx
      ├─ HospitalDashboard.tsx
      ├─ CameraPage.tsx
      ├─ SimulatorPage.tsx
      └─ AdminPage.tsx
tests/
   ├─ geo.test.ts
   ├─ scoring.test.ts
   ├─ bedMachine.test.ts
   └─ crowding.test.ts
```

Remember: `import 'leaflet/dist/leaflet.css'`, and fix Leaflet's default marker icon paths (a known issue with Vite bundling).

---

## 13. Environment and setup

### `.env.example`
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_ADMIN_CODE=change-me
```

### README must explain (step by step, beginner friendly)
1. Create a Firebase project at console.firebase.google.com (free Spark plan is enough).
2. Add a Web app, copy the config values into `.env`.
3. Enable **Authentication → Email/Password**.
4. Create a **Firestore database** (production mode).
5. Deploy rules and indexes, either:
   - `npx firebase-tools login` then `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <id>`, or
   - paste `firestore.rules` into the console's Rules tab manually.
6. `npm install` then `npm run dev`, open `http://localhost:5173`.
7. Register an admin (using `VITE_ADMIN_CODE`), click **Seed demo data**, then register a hospital user and an ambulance user.
8. **Phone demo on the same Wi-Fi:** camera and GPS require HTTPS outside localhost. Add `@vitejs/plugin-basic-ssl` to `vite.config.ts` and run `npm run dev -- --host`, then open `https://<laptop-ip>:5173` on the phone and accept the certificate warning.
9. Known limitations (demo security, client-side expiry sweeper, sensors simulated).

### Scripts in `package.json`
`dev`, `build`, `preview`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `lint` (optional).

---

## 14. Build milestones (do these in order)

Each milestone ends with: `npm run typecheck` and `npm run test` passing, plus a short summary of what to try manually.

**M0 — Project setup**
Vite + React + TS + Tailwind + router + Firebase init from env + Vitest. Placeholder pages for every route. README skeleton.
✅ `npm run dev` shows a nav with links to all pages.

**M1 — Types, pure logic, tests**
`types.ts`, all `config/*`, all `lib/*` with unit tests:
- `bedMachine`: every valid transition and several invalid ones.
- `geo`: haversine Beirut→Jounieh ≈ 10–12 km.
- `scoring`: excludes diverting / no capability / no beds; crowded hospital ranked below a slightly farther uncrowded one; critical severity halves crowd penalty; stale camera handled; stable sort.
- `crowding`: thresholds and staleness.
✅ All tests green.

**M2 — Auth, seed, rules**
Register/login/logout, role redirect, `ProtectedRoute`, `seedDemoData`, `resetDemo`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`.
✅ Admin can seed; data visible in the Firestore console; hospital and ambulance users can register.

**M3 — Bed service + hospital dashboard + sensor simulator**
`bedService` transactions, realtime hooks, bed board, KPI row, diversion toggle, manual ER count, simulator sensor toggles and random activity.
✅ Toggling a sensor in the simulator changes the tile on the hospital dashboard in another tab within ~1 s; counters stay correct; occupied → empty goes to cleaning, not available.

**M4 — AI camera**
Camera page with webcam and video-file sources, detection loop, median smoothing, overlay, throttled uploads, heartbeat, readings history, chart on dashboard.
✅ Walking in front of the webcam changes the count on the hospital dashboard; crowding badge changes color; no image data is ever written anywhere.

**M5 — Recommendations**
Ambulance page State A: pickers, GPS + map-click + presets, results with map and cards, excluded list, live re-ranking.
✅ Raising the ER count of the nearest hospital (simulator slider) pushes it down the list with a visible reason.

**M6 — Dispatch and the reservation flag**
`createDispatch` and the rest of `dispatchService`, ambulance State B, incoming panel with beep, acknowledge / admit / decline, sweeper, `NO_BED` re-ranking, declined/expired handling.
✅ Dispatch reserves a specific bed (blue tile) and appears on the hospital dashboard instantly; cancel/decline releases it; expiry works (temporarily set the buffer to 1 min to test).

**M7 — Stress test and admin overview**
Simulator stress test and admin map/tables.
✅ "5 ambulances, 3 beds" gives exactly 3 successes and 2 `NO_BED`, every time (run it 5 times).

**M8 — Polish**
Loading and error states everywhere, offline banner, toasts, mobile layout check of the ambulance page at 375 px width, accessibility (labels, focus states, color + text), README complete with screenshots placeholders and the demo script below.

---

## 15. Demo script (for the competition presentation)

1. **Hospital dashboard** (laptop, tab 1): show live beds and ER crowding.
2. **AI camera** (tab 2): point the webcam at the audience or play a crowded-room video → the count rises → that hospital turns red on the dashboard.
3. **Ambulance app** (phone): choose "Cardiac", "Critical", location "Achrafieh" → the crowded hospital is ranked lower with the reason shown → tap "Send here".
4. Back on the **dashboard**: the incoming ambulance appears with a beep, and a bed turns blue (reserved).
5. **Stress test** (simulator): 5 ambulances, 3 beds → 3 reserved, 2 redirected. Explain: "No two ambulances can ever get the same bed."
6. **Sensor simulator**: patient leaves → bed goes to "cleaning", not "available" → staff taps "Cleaned" → it becomes available again.
7. Closing line: *"Sensors detect beds, AI detects crowding, and MedRoute sends every ambulance to the hospital that can treat the patient fastest."*

---

## 16. Future work (mention in README, do not build)
- Real pressure sensors (ESP32 + force-sensitive resistor) writing through `applySensorReading`.
- Integration with hospital admission systems via HL7 FHIR.
- Moving transactions into Cloud Functions for proper security.
- AI prediction of bed availability from historical data.
- Mass-casualty mode that spreads patients across several hospitals.
- Arabic / French UI.
