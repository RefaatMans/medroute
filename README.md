# MedRoute

MedRoute helps ambulances find the best hospital for a patient in real time. It ranks hospitals by travel time, free beds of the right type, the hospital's ability to treat the case, and ER crowding (measured by an in-browser AI camera). When a paramedic picks a hospital, MedRoute **reserves a specific bed** in an atomic Firestore transaction, so two ambulances can never get the same bed.

> Status: under construction. This README is completed in milestone M8. See [SPEC.md](SPEC.md) for the full specification.

## Tech stack

React + TypeScript (Vite), Tailwind CSS, react-router-dom, Cloud Firestore and Firebase Authentication, Leaflet with OpenStreetMap tiles, TensorFlow.js with COCO-SSD, and Vitest.

## Quick start

1. Create a Firebase project at <https://console.firebase.google.com> (the free Spark plan is enough).
2. Add a **Web app** to the project and copy its config values.
3. Copy `.env.example` to `.env` and paste the values in. Set `VITE_ADMIN_CODE` to a secret word of your choice.
4. Enable **Authentication → Sign-in method → Email/Password**.
5. Create a **Firestore database** (production mode).
6. Publish the security rules and indexes, using **one** of these:
   - **Console (easiest):** Firestore Database → **Rules** tab → replace everything with the contents of [firestore.rules](firestore.rules) → **Publish**. Indexes are only needed from the dispatch milestone on; when one is missing, Firestore's error message contains a link that creates it in one click.
   - **CLI:** `npx firebase-tools login`, then `npx firebase-tools deploy --only firestore:rules,firestore:indexes` (the project ID is already set in `.firebaserc`).
7. Install and run:

   ```bash
   npm install
   npm run dev
   ```

   Open <http://localhost:5173>.
8. **Register an admin:** Register → role **Admin** → enter your `VITE_ADMIN_CODE`. On the Admin page, click **Seed demo data**.
9. Log out, then register a **Hospital staff** user (pick a hospital) and a **Paramedic** user (pick AMB-01, 02 or 03). Use a different email for each.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server on <http://localhost:5173> |
| `npm run dev:phone` | Start the dev server over HTTPS on your LAN, for a phone demo (camera and GPS need HTTPS) |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run test` | Run the unit tests once with Vitest |

## Using the app

_Coming in later milestones._

## Demo script

_Coming in M8._

## Demo data

The seed uses 12 **real hospitals in Greater Beirut** (AUBMC, Clemenceau Medical Center, Rafik Hariri University Hospital, Sahel General, Al Rasoul Al Aazam, Makassed, Hôtel-Dieu de France, LAU Medical Center – Rizk, Saint George UMC, Geitaoui, Mount Lebanon Hospital, Bellevue Medical Center). Their **names and locations are real**: OpenStreetMap building centroids, cross-checked with Wikidata (checked October 2026). Their **beds, specialties, ER counts and trips are simulated**, and the app says so in a notice on every page. Phone numbers are left empty on purpose, so a demo tap on "Call" can't ring a real hospital. Edit the list in [src/lib/demoData.ts](src/lib/demoData.ts).

## Changes from the original spec

- **Real hospital names** instead of the spec's fictional ones (see *Demo data*).

- **Paramedic flow is automatic.** START → case type → severity → **GO**: the app picks the best hospital (travel time + free beds of the right type + ability to treat + ER crowding), reserves a bed and goes straight to the trip screen showing why. If that bed is taken at the same instant, it automatically tries the next best hospital. "Choose a different hospital" on the trip screen is a manual override.
- **Hospitals cannot decline an ambulance.** Staff can only mark a trip as *seen* and *patient admitted*. A hospital that can't take more patients switches on **Diversion**, which stops new ambulances being sent there. Admins can still force-cancel a trip.
- **No composite indexes needed.** Queries use equality filters only and sort in the browser, so there's nothing to deploy beyond the rules. `firestore.indexes.json` is kept for larger deployments.

## Known limitations

- **Demo-grade security.** The admin code is checked only in the browser, so anyone who reads the bundled JavaScript could register as admin. Ambulances can write to hospital and bed documents because bed reservations run as client-side transactions; in production these would move into Cloud Functions.
- Hospital and ambulance documents are publicly readable so the Register page can list them before sign-in. They contain no patient data.

_More in M8._

## Future work

_Coming in M8._
