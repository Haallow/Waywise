# PlanB — Implementation Plan

**Project title:** PlanB: An Intelligent Location-Based Multi-Errand Optimization Agent  
**Document version:** 1.0 · 2026-11-02  
**Status:** Approved implementation blueprint — code not yet implemented  
**Build constraint:** One-night academic MVP; prioritize a working end-to-end demo over extra features.

---

## 1. Executive summary

PlanB is a browser-based intelligent agent that asks the user for a starting location and **2–4 errand categories**, retrieves **real** nearby establishments using Google Places API (New), obtains road travel estimates using Google Routes API, and **independently selects both the establishments and their visit order**. It evaluates candidate plans against travel time, establishment rating, and preferences; explains its reasoning; displays the selected itinerary on a map; and opens a pre-populated multi-stop directions route in Google Maps.

Example: A user wants **coffee → groceries → church → spa**, but does **not** specify the establishments or the order. PlanB searches candidate cafés, groceries, churches, and spas, chooses one of each, computes a route, and offers a **Navigate with Google Maps** link.

**Primary agent classification:** Type 4, **Utility-Based Agent**, with Type 3 **Goal-Based Agent** behavior and a maintained state model. It is **not** a learning agent and does not require ML, an LLM, or external AI inference.

**Central novelty:** *joint destination selection and route-order optimization*—PlanB does not simply select the nearest place for each errand, nor outsource the planning decision to Google Maps. Google APIs supply data; the project's own algorithm makes the choices.

### One-night scope commitments

- **2–4 errands maximum**, one establishment per errand, **2 shortlisted candidate establishments per errand**; at most 8 candidate places + 1 origin.
- **Driving mode only** in MVP; other travel modes are extensions.
- Live Places + ratings and traffic-aware Routes are the primary path **when credentials and billing are configured**.
- **Explicitly labeled offline demo mode** works without credentials or real API usage.
- Three utility profiles: **Fastest**, **Balanced**, **Best-Rated**.
- Show plan, confidence/limitations, comparison to a baseline, and a Google Maps directions link.
- Manually **skip/remove** an errand, then replan (using cached travel matrix if still valid).
- No login, persistent location history, payments, reservations, weather integration, or live turn-by-turn navigation inside PlanB.

---

## 2. User story and acceptance targets

**Story:** As someone with multiple errands, I want to specify the categories I need and my starting point, so the app chooses a convenient collection of real places and an efficient sequence that I can open directly in Google Maps.

**Definition of done:**

1. User can choose current browser location (permission requested on button click) **or manually set a starting location by clicking the map**. If location permission is denied, manual map selection still works.
2. User can add 2–4 categories chosen from coffee, groceries, church, spa, pharmacy, and restaurant. Default demo example uses coffee/groceries/church/spa.
3. With configured credentials, the app fetches real Google Places for each category. Every displayed live place must come from the returned provider data; no invented names/ratings.
4. The app retrieves a directional road **distance/duration matrix** and computes its own highest-scoring combination + order.
5. The itinerary shows place name, location/address when available, rating with count when available, stop number, estimated total driving distance and duration, and a short **why this route?** explanation.
6. User can switch Fastest/Balanced/Best-Rated and visibly obtain a recomputed plan, when different plans are superior. The ranking must not be hardcoded.
7. A single button opens Google Maps with the selected **origin, intermediate stops, final destination, and driving mode** in the agent-chosen order.
8. Skipping an errand, choosing a different establishment, or changing preferences recalculates the remaining plan without silently changing already completed stops.
9. An offline demo with realistic but clearly **synthetic** data showcases decision-making without API keys or cost.
10. Automated optimizer tests pass; `npm run build` passes; live Google API integration is documented and can be verified by a person with credentials.

### Out of scope (MVP)

Real-time monitoring of store closure/traffic while traveling, weather, automatic church mass or spa appointment availability, road toll budgeting, public transport routing, complex accessibility routing, login, and guaranteed globally optimal routing beyond the limited candidates returned.

---

## 3. PEAS description

| PEAS element | PlanB design |
| --- | --- |
| **Performance measure** | Completion of all errand categories, minimized estimated travel time, preference-weighted establishment quality, zero missing/unreachable legs, explainability. |
| **Environment** | User origin, real-world road network, candidate establishments, provider ratings, traffic-aware estimated driving times, user preferences. |
| **Actuators** | Select places, order stops, emit plan/justification, replan, generate navigation link. (It does not control Google Maps or a vehicle.) |
| **Sensors** | Browser location or map selection; category choices; Places API responses; Routes API matrix; user actions (skip, change mode, mark done). |

### Agent type mapping

- **Goal-Based:** satisfy the set of required errands; one matching destination for each selected category.
- **Utility-Based (primary):** among feasible complete plans, maximize weighted utility for travel efficiency vs. location quality.
- **Model-Based characteristics:** maintain origin, candidates, preferences, itinerary, completed/removed errands, timestamp of travel estimates and prior outcomes. Maintaining state alone does not automatically establish the complete canonical model-based reflex architecture—do not overclaim classification.

### Sense–think–act loop

`Observe (location + errands) → Retrieve candidates → Obtain travel data → Generate feasible plans → Score/compare → Select plan → Explain/visualize → Act on user changes → Replan`

---

## 4. Technology and architecture

### Stack

- **Client:** React, Vite, JavaScript (ES modules), CSS (vanilla CSS or minimal utility styling), Google Maps JavaScript API.
- **Server:** Node.js 20+ and Express, using built-in `fetch` for Google REST API requests.
- **Optimization:** plain JavaScript, independently testable (`src/agent/` or shared library). **No optimization package necessary** at this size.
- **Testing:** Vitest or Node built-in test runner; choose one and keep it simple.
- **Persistence:** React state; optional lightweight settings via localStorage (do not store exact location by default).

### Architecture / trust boundary

```text
Browser (React + Google Map)
  ├─ Browser location permission OR manual map-click origin
  ├─ Errand selection / preference controls
  ├─ Map visualization, itinerary, explanation
  ├─ Public browser-restricted Maps JavaScript key
  │
  └─ POST /api/places       → Express backend → Places API (New)
     POST /api/matrix       → Express backend → Routes Compute Route Matrix
                               (server key stays server-side)

Client-side Agent Engine (pure JavaScript)
  ├─ Normalizes candidates / validates required errands
  ├─ Evaluates all feasible candidates and stop permutations
  ├─ Calculates weighted utility and a nearest-neighbor baseline
  ├─ Produces decision trace and route explanation
  └─ Builds Google Maps directions URL
```

**Separation rationale:** Google Maps JavaScript loads in the client with a **browser/referrer-restricted key**. The server proxies Places/Routes calls using a **separate server key**. Do not place the server key in React source or any `VITE_*` variable. Follow Google key-restriction and API restriction guidance; for localhost-only testing, keep the backend local and credentials in untracked `.env`. For internet deployment, also add backend rate limiting/auth and IP restrictions or an appropriately hardened credential setup.

### Suggested repository tree

```text
planb/
├── AGENTS.md
├── READ.md
├── Implementation_Plan.md
├── .gitignore
├── package.json
├── .env.example
├── client/
│   ├── index.html
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── ErrandSelector.jsx
│       │   ├── LocationPicker.jsx
│       │   ├── MapPanel.jsx
│       │   ├── Preferences.jsx
│       │   ├── Itinerary.jsx
│       │   └── AgentExplanation.jsx
│       ├── agent/
│       │   ├── optimizer.js
│       │   ├── scoring.js
│       │   ├── baseline.js
│       │   └── googleMapsUrl.js
│       ├── services/
│       │   ├── api.js
│       │   └── demoData.js
│       └── styles.css
├── server/
│   ├── package.json
│   ├── index.js
│   ├── googlePlaces.js
│   ├── googleRoutes.js
│   └── validators.js
└── tests/
    ├── optimizer.test.js
    ├── baseline.test.js
    ├── googleMapsUrl.test.js
    └── normalize.test.js
```

The implementing agent may simplify this tree, but preserve a separate testable optimization module, a backend for web-service credentials, and the three root documentation files. Avoid unnecessary package/framework proliferation.

---

## 5. Google Cloud setup and cost controls

### APIs to enable

1. **Maps JavaScript API** — render the interactive map and origin/stop markers.
2. **Places API (New)** — search real nearby establishments and retrieve relevant fields.
3. **Routes API** — route matrix for roads and traffic-aware driving estimates.

**Billing warning:** Google Maps Platform is pay-as-you-go and normally requires a billing-enabled Cloud project; free monthly SKU allowances are **not an automatic hard spending limit**. Never promise "unconditionally free". Quotas plus alerts help prevent overuse, but billing alerts do not block charges. Check current pricing before enabling usage.

**At plan-writing time (2026-11-02), official global pricing lists indicate:**

| Billable SKU | Published monthly no-cost cap | PlanB use |
| --- | ---: | --- |
| Dynamic Maps | 10,000 map loads | Google map display |
| Places API Nearby Search Pro | 5,000 requests | Place discovery **without Enterprise fields** |
| Places API Nearby Search Enterprise | 1,000 requests | Place discovery **with `rating` / `userRatingCount` / hours** |
| Routes: Compute Route Matrix Pro | 5,000 elements | Traffic-aware driving estimates |

These are separate SKU allowances, **not free totals across all products**; providers may change pricing. Requesting `rating` in Nearby Search moves that request into the **Enterprise** SKU. Route matrix usage counts **origin × destination pairs (elements)**, not 1 call = 1 billable unit. `TRAFFIC_AWARE` vs. `TRAFFIC_AWARE_OPTIMAL` have different speed/element-limit implications, and route SKUs depend on request features—verify exact billing when implementing.

**MVP example:** origin + 2 candidates × 4 errands = 9 nodes → a full 9×9 matrix requests **81 elements**, including diagonal entries (which can be locally defined as zero). That is a defensible upper bound for a small single-matrix call; it is **not** 81 API requests. A 5,000-element cap corresponds to ~61 such full calls before that specific free allowance is exhausted, assuming no other usage, no tier changes, and every call bills 81 elements.

### Mandatory cost/abuse controls

- Maximum 4 errands; retrieve **up to 5 results** for each category but shortlist **2 per category** locally; never enlarge without reviewing matrix element cost.
- Max search radius initial **3,000–5,000 meters**, adjustable only within safe predefined bounds.
- No automatic polling, page-load Places searches, or request per keystroke; fetch only on **Find and Optimize**.
- Only **one matrix request for each actual new candidate set/traffic snapshot**; cache locally during preference toggles and simple replans; do not claim freshness if reused.
- Disable repeat optimize submissions while pending; implement server timeout, simple per-IP rate limiting and a practical request budget for the local demo.
- In Google Cloud Console set conservative **daily quotas** (as supported) and **billing alerts**, disable unused APIs, restrict keys. Review **SKU-specific usage** after testing.
- Default to **Demo Mode** when keys are unavailable. Demo Mode makes no provider requests and always states "Sample establishments / simulated travel data".
- Use server-side caching only within provider terms; do not build an unlicensed persistent Google Places database. Store only what is needed transiently for this session.

Official sources: [Pricing](https://developers.google.com/maps/billing-and-pricing/pricing) · [API key security](https://developers.google.com/maps/api-security-best-practices) · [Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search) · [Route Matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix).

---

## 6. User interface specification

Single responsive page; recommended desktop layout: configuration card on left, Google map center/right, itinerary and explanation below/side. Mobile: vertical stack.

### Minimum UI elements

1. **Header:** PlanB name + subtitle "Plan multiple errands intelligently" + visible badge "LIVE GOOGLE DATA" or "DEMO DATA".
2. **Origin:** "Use my current location" action; "Pick starting point on map" alternative; show chosen area/coordinates, not an implied precise address without geocoding.
3. **Errands:** up to four category chips; individual errand removal; prevent blank/duplicate categories as needed.
4. **Preferences:** 3-mode segmented selector and a clear "Driving" label.
5. **Primary action:** "Find Places & Optimize"; show progress: searching, estimating travel, optimizing.
6. **Map:** origin marker, candidate markers optional, numbered selected stop markers, connecting schematic line **clearly labeled straight-line approximation** if no road polyline is fetched. Do not claim a schematic line is a road route.
7. **Itinerary:** selected stop order, real name/address, rating only when known, approximate leg and total travel times, route quality score, "Open in Google Maps".
8. **Agent reasoning:** explanation of chosen plan and route score components; comparison to baseline; note that traffic is a departure-time snapshot.
9. **Replanning:** skip/remove an errand; recompute and show changed itinerary. Reset action.
10. **States:** loading, denied geolocation, no candidates, missing rating, unroutable leg, quota/API error, demo mode.

### Product design tone

Professional student project; approachable and clean. No generic chat interface or false "AI thinking" animation. Make it obvious the agent actually searches and evaluates candidate plans.

---

## 7. Data schemas (conceptual)

Use JSDoc or TypeScript-like documentation, but implementation can stay JavaScript.

```js
// Errand type (user task)
{
  id: 'errand_coffee_1',
  category: 'coffee',
  placeTypes: ['coffee_shop', 'cafe'],
  status: 'pending' // 'pending' | 'completed' | 'skipped'
}

// Normalized place from Google Places (real) OR clearly synthetic demo dataset
{
  placeId: '...google_place_id...',
  name: '...',
  category: 'coffee',
  latitude: 14.0,
  longitude: 121.0,
  address: '...',
  rating: 4.4,              // number | null; never fabricated
  userRatingCount: 185,     // number | null
  dataSource: 'google'      // 'google' | 'demo'
}

// Directional matrix (indexes correspond exactly to nodes[])
{
  nodes: [{ id: 'origin', latitude: 0, longitude: 0 }, /* places */],
  durationSec: [[0, 180], [220, 0]], // null for unreachable/unknown
  distanceMeters: [[0, 1900], [2100, 0]],
  fetchedAt: '2026-11-02T10:00:00.000Z',
  trafficMode: 'TRAFFIC_AWARE',
  dataSource: 'google'
}

// Output plan
{
  selectedStops: [{ errandId: '...', placeId: '...' }], // ordered
  travelDurationSec: 2400,
  travelDistanceMeters: 12000,
  utility: 0.81,
  profile: 'balanced',
  baseline: { travelDurationSec: 3100, utility: 0.65 },
  explanation: ['...', '...'],
  limitations: ['Traffic estimate snapshot, not guaranteed arrival ETA.']
}
```

**Location privacy:** Browser geolocation must happen only after user action; use HTTPS or localhost. Do not silently retain or log identifiable location. Keep live/dummy modes visually distinguishable. If no geocoding is implemented, map-click latitude/longitude is an acceptable manual origin.

---

## 8. Provider integration specifications

### 8.1 Places Nearby Search (New)

**Server-only request** `POST https://places.googleapis.com/v1/places:searchNearby`.

Example for a coffee shop category (illustrative coordinates; do not present as user's location):

```http
POST /v1/places:searchNearby HTTP/1.1
Host: places.googleapis.com
Content-Type: application/json
X-Goog-Api-Key: <SERVER_GOOGLE_MAPS_API_KEY>
X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus

{
  "includedTypes": ["coffee_shop", "cafe"],
  "maxResultCount": 5,
  "rankPreference": "POPULARITY",
  "locationRestriction": {
    "circle": {
      "center": { "latitude": 14.5995, "longitude": 120.9842 },
      "radius": 4000
    }
  }
}
```

- The above `rating` and `userRatingCount` fields request **Enterprise** data; this is deliberate.
- Use `places.id` as the stable Place ID, not the resource name `places.name` (which is `places/PLACE_ID`).
- Validate type mapping against Google's current [Place Types (New)](https://developers.google.com/maps/documentation/places/web-service/place-types). Initial mappings: coffee → `coffee_shop`/`cafe`; groceries → `grocery_store`/`supermarket`; church → `church`; spa → `spa`; pharmacy → `pharmacy`; restaurant → `restaurant`.
- Limit one call/category; take a short candidate pool (up to 5), filter out closed/non-operational or malformed coordinate entries and choose up to 2 diverse candidates (e.g., highly rated vs geographically close). Keep selection deterministic and testable.
- Missing rating is **unknown**, not zero or a made-up rating. Avoid penalizing unrated establishments as if they were low-rated.
- De-duplicate by `placeId`; disallow selecting same actual place twice if it cannot realistically serve both distinct errands.
- Show no-results and suggest a different radius/category. Never invent live establishments.
- Nearby Search is based on search radius around user's origin, not an exact exhaustive list of every relevant venue along the entire itinerary.

### 8.2 Routes API — Compute Route Matrix

**Server-only request** `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`.

Use nodes `[userOrigin, candidatePlace1, ..., candidatePlace8]`. Request matrix with a *consistent* snapshot departure time and the `DRIVE` mode, `TRAFFIC_AWARE` routing preference. **Do not use `TRAFFIC_AWARE_OPTIMAL` unless the element count stays ≤100**, and avoid it by default for faster/cheaper implementation.

Conceptual payload (generate origins/destinations programmatically):

```json
{
  "origins": [
    { "waypoint": { "location": { "latLng": { "latitude": 14.5995, "longitude": 120.9842 } } } }
  ],
  "destinations": [
    { "waypoint": { "location": { "latLng": { "latitude": 14.6001, "longitude": 120.9854 } } } }
  ],
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_AWARE"
}
```

Header: `X-Goog-FieldMask: originIndex,destinationIndex,duration,distanceMeters,status,condition`. The sample contains only one origin/destination as a shape illustration; actual PlanB must build the full node-by-node matrix for its selected candidate pool. Parse each returned element **by `originIndex`/`destinationIndex`** because order is not guaranteed. Durations may be returned as strings such as `"295s"`; parse robustly. Treat an element whose status/condition indicates failure as an **unreachable edge**, not zero seconds. Set the diagonal to zero in local state only when appropriate.

**Important realism note:** All legs in one matrix are evaluated around the **same departure time**, rather than projecting future traffic after time spent at coffee/groceries/etc. Therefore total time is a *planning estimate using a traffic snapshot*, not an exact future arrival time. Explain this openly in UI. Stage 2 can estimate visit dwell times and refresh future legs when traveling; not required tonight.

**Expected budget:** At most 9×9 = 81 matrix elements per candidate set (4 errands × 2 candidates + origin). For exactly 2 candidate places per category and 4 categories: 2⁴ × 4! = **384 complete candidate itineraries** evaluated **locally**, with **no additional Google API calls** during this enumeration.

### 8.3 Google Maps JavaScript API

Use a **separate client key** restricted to authorized website referrers and Maps JavaScript API. Request location permission only on explicit click; on browsers geolocation requires secure context. Display user origin and chosen stops with numeric labels. If a custom road-following polyline is wanted later, request a **Compute Routes** polyline from Google; do not pass off straight marker-to-marker segments as roads.

### 8.4 Open in Google Maps — universal Maps URL

No API key needed for the URL itself.

Base:

```text
https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAST_LAT,LAST_LNG&travelmode=driving&waypoints=STOP1_LAT,STOP1_LNG%7CSTOP2_LAT,STOP2_LNG%7CSTOP3_LAT,STOP3_LNG
```

**Preferred precision:** supply `destination_place_id` and `waypoint_place_ids` alongside required destination/waypoints coordinates or names, when valid Google Place IDs are available. Use `URLSearchParams`, appropriate encoding of the `|`-separated waypoint list, and test output in browser. For 4 errands there are **3 intermediate waypoints** and **1 destination**, which meets Google Maps URLs' documented **mobile browser** three-waypoint support. Google Maps may recalculate the road path/ETA on opening, even though the waypoint order is specified. Some Google Maps clients may treat waypoints differently; display the itinerary in PlanB as a reliable fallback.

References: [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) · [Routes matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix) · [Nearby Search fields](https://developers.google.com/maps/documentation/places/web-service/nearby-search).

---

## 9. Intelligent agent algorithm

### 9.1 Input and constraints

- Input: origin coordinates, 2–4 required errand categories, candidate places (max 2/category), directional driving time + distance matrix, utility profile.
- Each errand category must be matched to exactly one place, unless **explicitly** skipped by user.
- All stops must be unique, properly geolocated, and have reachable directed travel legs.
- No return-to-origin is required for the MVP. A round-trip/return-home toggle is a **later** extension.
- The travel snapshot and candidate pool are valid only within their disclosed age/search scope.

### 9.2 Route enumeration

Pseudocode:

```text
function optimize(origin, pendingErrands, candidateGroups, matrix, profile):
  assert each errand has >=1 candidate
  best = null
  for choice in cartesianProduct(candidateGroups):   // select 1 place per errand
    if duplicate place IDs: continue
    for stops in permutations(choice):               // choose visit order
      legs = [origin, ...stops]
      if any consecutive leg is unreachable: continue
      minutes = sum(durationMatrix[legs[i]][legs[i+1]]) / 60
      km = sum(distanceMatrix[legs[i]][legs[i+1]]) / 1000
      quality = average(robustPlaceQuality(stop) for stop in stops)
      utility = score(minutes, quality, profile)
      if utility beats best, with deterministic tie-break:
        best = { stops, minutes, km, utility, scoreBreakdown }
  return best or an explainable 'No feasible itinerary' state
```

At 4 categories, 2 choices each, up to **384** routes, so **exhaustive search is both simple and credible**. This is *exact within the sampled candidate set and simplified utility model*, not necessarily the globally best route across all available city establishments.

### 9.3 Utility function

Prefer **bounded, normalized scores** so rating and travel time are comparable:

- `timeScore = 1 / (1 + travelMinutes / 30)` (in `(0,1]`, less time is better).
- `placeScore = average(normalizedQuality)` for the selected venues. For rating `r` from 0–5 and count `n`, use a **Bayesian-smoothed** rating with conservative prior `m=3.5`, pseudo-count `k=20`: `(n*r + k*m) / (n+k) / 5`. If rating or count missing, assign **neutral quality** `m/5`, flag "unrated" in explanations; never display it as the actual Google rating.
- `utility = wTime * timeScore + wQuality * placeScore`.
- Unreachable edges or missing errand coverage are **hard failures** (not merely small utility penalties).
- Deterministic tie-break: smaller travel minutes, then total distance, then stable Place IDs.

| Preference | `wTime` | `wQuality` |
| --- | ---: | ---: |
| Fastest | 0.90 | 0.10 |
| Balanced | 0.65 | 0.35 |
| Best-Rated | 0.35 | 0.65 |

Weights are **initial heuristic design choices**, not validated behavioral science. Keep them editable/configurable for experiments, and explain that quality ratings are subjective proxies. "Best-Rated" still respects the hard requirement of completing all errands and feasible routes.

### 9.4 Baseline comparison

Implement a reproducible **nearest-next greedy baseline** for comparison. From the current node, select the closest *reachable* candidate across currently unfulfilled errand categories, commit that errand, then repeat. This baseline is deterministic with tie-breaking. It uses the **same matrix** and **same candidate pool** as the intelligent optimizer; this ensures a fair comparison without extra Google calls.

Report:

- PlanB total travel minutes vs greedy baseline minutes.
- PlanB average place-quality score vs baseline average quality.
- PlanB utility vs baseline utility **using the same selected preference profile**.
- If PlanB's travel time is longer under Balanced/Best-Rated due to rating trade-off, explicitly say so. **Never claim PlanB is always shorter**.
- For Fastest, exhaustive search should never have worse **optimal objective utility** than a valid greedy baseline; minor travel-time differences can occur if quality weight is nonzero.

### 9.5 Decision trace / explainability

Show concrete numeric evidence:

> "PlanB chose Café B instead of Café A because the resulting four-stop itinerary has an estimated 12 fewer driving minutes. Its rating was 4.5 (128 reviews) versus 4.6 (20 reviews). Balanced mode prioritizes both travel time and rating quality. Estimates reflect the traffic snapshot taken at 3:20 PM."

Generate this text only from actual data in the computed plans; do not invent comparisons or figures. If no meaningful difference arises, show the actual resulting scores and note that two profiles may select the same itinerary.

---

## 10. API routes / backend contracts

### `GET /api/health`

Return `{ "ok": true, "mode": "live-capable" | "demo-only" }` without exposing keys.

### `POST /api/places`

Request:

```json
{
  "origin": { "latitude": 14.5995, "longitude": 120.9842 },
  "category": "coffee",
  "radiusMeters": 4000
}
```

Response (normalized):

```json
{
  "category": "coffee",
  "dataSource": "google",
  "places": [
    { "placeId": "...", "name": "...", "latitude": 14.6, "longitude": 120.98, "address": "...", "rating": null, "userRatingCount": null, "dataSource": "google" }
  ]
}
```

Validation: known category allowlist, numeric bounded coordinates, radius clamp, max results and timeout, reject unknown fields if useful, no server-key leaks in errors.

### `POST /api/matrix`

Request:

```json
{
  "nodes": [
    { "id": "origin", "latitude": 14.5995, "longitude": 120.9842 },
    { "id": "place_1", "latitude": 14.6, "longitude": 120.99 }
  ],
  "mode": "DRIVE"
}
```

Response: normalized `nodes`, 2-D `durationSec` and `distanceMeters`, `fetchedAt`, `trafficMode`, `dataSource`. Only accept 3–9 nodes in normal production flow (origin + minimum 2 errands × candidate count; a user may have fewer candidates), or cap at 9. Restrict client-supplied route modes to `'DRIVE'` for MVP. Use backend validated upper limit to avoid arbitrary element amplification.

### Error envelopes

```json
{ "error": { "code": "UPSTREAM_TIMEOUT", "message": "Route estimates are temporarily unavailable." } }
```

Codes: `INVALID_INPUT`, `CONFIG_MISSING`, `UPSTREAM_RATE_LIMITED`, `UPSTREAM_TIMEOUT`, `UPSTREAM_ERROR`, `NO_CANDIDATES`, `UNROUTABLE`. Log only sanitized diagnostics and response codes, not API keys or user's full coordinates.

---

## 11. Build phases and order for Astra

**Do not try to implement every planned enhancement at once.** Finish and validate one checkpoint before moving to the next.

### Phase 0 — Bootstrap and safety

- [x] Initialize `client/` Vite React, `server/` Express, root scripts using npm workspaces **or** a simple `concurrently` script; choose the simpler robust option.
- [x] Create `.gitignore`: `.env`, `.env.*` (except `*.example`), `node_modules`, `dist`, logs, caches.
- [x] Create `.env.example` with documented keys; never include live keys.
- [x] Add `GET /api/health`, basic error handling, and a `npm run dev` command that launches client and backend.
- [x] Verify project starts without credentials in **Demo Mode**.

**Gate:** Dev server starts, app loads, no secrets checked in.

### Phase 1 — Pure agent engine FIRST

- [x] Add tiny, internally consistent synthetic dataset: starting point, 2 candidates for each of 4 errands, directional travel matrix (seconds, meters), and plausible *explicitly fictional* ratings.
- [x] Implement errand groups, permutations, cartesian product, infeasibility checks, score normalization, 3 utility profiles, tie-breaks.
- [x] Implement nearest-next greedy baseline and numerical comparison.
- [x] Unit test the algorithm for correctness before integrating Google API calls.

**Gate:** The selected route is computed—not hardcoded—and changes when dataset/profile changes.

### Phase 2 — UI and Maps URL

- [x] Implement errand selector (2–4), strategy selector, itinerary panel, agent explanation, reset, skip/replan.
- [x] Build Google Maps URL from ordered stops; use Place IDs when valid.
- [x] Display markers on Google Map when browser key is available; otherwise provide a graceful demo map placeholder/list visualization, not a crash. (Implemented; keyed live map remains unverified.)
- [x] Add geolocation button and map-click origin input (when map available). (Implemented; keyed map click remains unverified.)
- [x] Make status "DEMO DATA" highly visible when simulating.

**Gate:** Offline demo shows full choose → optimize → replan → Google Maps link flow, even if only synthetic coordinates are available.

### Phase 3 — Live Places integration

- [x] Create protected server-side Places adapter, config validation, fetch timeout, normalized response.
- [ ] Confirm place types/fields and small radius with one manual API call only after key setup.
- [x] Add category searches and shortlist 2 candidates from up to 5 per category.
- [x] Handle 0 results, missing rating/count, duplicates, and non-operational places without inventing values.
- [x] Display "LIVE GOOGLE DATA" only when real responses are used.

**Gate:** At least two selected categories return real place names + coordinates correctly, with ratings only if provided.

### Phase 4 — Live traffic-aware Routes integration

- [x] Build 1+N node matrix through backend; include status/condition and index mapping.
- [x] Ensure pairs are directional, unreachable legs handled, durations parsed from seconds-string format.
- [x] Reuse matrix for utility profile toggles; do not auto-refetch on each click.
- [x] Show traffic snapshot time and estimate limitation.
- [ ] Test one real 4-errand session end-to-end and verify selected names/IDs in Google Maps.

**Gate:** One live 4-stop itinerary uses actual Google Places and Routes estimates, yields working Google Maps directions URL, with no fake values.

### Phase 5 — Validate, polish, document

- [x] Run all tests, lint if configured, and production build. (No lint script configured.)
- [ ] Check desktop/mobile usability, error/loading/permission-denied states.
- [x] Test at least 3 scenarios and record baseline comparisons in READ.md.
- [x] Update READ.md with exact run commands, current limitations, and what was actually implemented.
- [ ] Print a completion summary: files, tests, build, tested live/demo paths, outstanding blockers. Do not say live tested without live credentials/test call.

**Gate:** Ready for class demo even if Google quota fails, by switching to explicit Demo Mode.

---

## 12. Test plan

### Unit tests (mandatory, no paid APIs)

| Test | Expected result |
| --- | --- |
| 2 errands, 2 places each | All 2² × 2! = 8 complete possible plans enumerated before filtering infeasible legs. |
| 4 errands, 2 places each | All 2⁴ × 4! = 384 complete plans evaluated before filtering. |
| Directional distance/time | A→B may differ from B→A; optimizer respects matrix direction. |
| Unreachable pair | Unreachable plans excluded, no zero-cost fallback. |
| Missing rating | No crash, no fabricated rating, neutral model value used only for internal scoring. |
| Missing required category | Explainable no-feasible-plan state, not silent errand omission. |
| Shared Place ID | Invalid duplicate-place selection rejected. |
| All candidates equal | Stable deterministic tie-break order. |
| Preference profiles | Contrived dataset causes Fastest to favor short route and Best-Rated to favor higher quality; test the expected trade-off. |
| Greedy baseline | Same candidate set/matrix; comparator's reported values are independently calculated. |
| Skip/replan | Removes specified errand and reoptimizes only pending errands. |
| Google Maps URL | Correct origin/waypoints/destination/place ID order, driving mode, and encoded URL. |

### Manual scenarios (mandatory)

1. **Nearby but low-rated vs farther but high-rated:** Balanced and Best-Rated can choose different places, with numeric evidence.
2. **Traffic bottleneck:** Simulated or live directional travel-times cause route order to change even when straight-line distances suggest otherwise.
3. **User skips church:** The remaining coffee/groceries/spa route is newly optimized; no church is present in the outgoing Google Maps URL.
4. **API missing/denied:** Explicit Demo Mode remains working; no fabricated "live" results.
5. **Geolocation denied:** Manual map origin still works (with configured browser map) or user is clearly instructed to choose a demo origin.
6. **Unreachable candidate:** The optimizer excludes invalid path and informs user if every complete plan is unreachable.

### Metrics for the report/defense

- Number of candidate places examined.
- Number of candidate itineraries enumerated and number of feasible plans.
- Agent vs greedy total driving-time estimate, with percentage delta (avoid divide-by-zero).
- Agent vs greedy average modeled quality/utility.
- API elements/request consumption estimate and snapshot timestamp.
- Demonstrated decision change under different utility weights.

**Academic integrity:** Do not claim statistical travel-time superiority without a proper test set. Small demo comparisons are illustrations, not universal performance guarantees.

---

## 13. Fallback and failure policy

| Situation | Required behavior |
| --- | --- |
| No billing-enabled Google project / key | Display Demo Mode; do not call the Google APIs. |
| Geolocation denied | Allow selecting origin on Google map; optional demo origin only with explicit user acknowledgment. |
| Missing Places rating | Display "No rating available"; use neutral internal scoring value clearly distinguished from an actual rating. |
| No establishments for a category | State which category failed; allow user to remove it or increase radius within cap. Never silently omit a required errand. |
| Routes API quota error | Explicitly offer **approximate non-traffic Haversine** backup *only if user chooses it*; distinguish it from real road/traffic estimates. Alternatively stay in Demo Mode. |
| Route matrix has gaps | Treat missing/unreachable edges as unavailable; never substitute 0 or straight line while describing it as traffic ETA. |
| Google Maps opens with different road path/ETA | Expected: destination stop order is passed; Google Maps computes navigation independently. |
| Phone Google Maps ignores some waypoints | Show the PlanB itinerary and link limitation; keep at most 3 intermediate waypoints. |
| API request error | Short, actionable error; no leaked key or raw sensitive upstream response. |

---

## 14. Realistic overnight priorities

**Priority A / must finish:** demo data + optimizer + explanation + clean web UI + Google Maps URL + tests. This is the minimum valid Intelligent Agent project.

**Priority B / full target:** live Places, Google map, live road/traffic matrix, exact requested four-stop flow.

**Priority C / only if time remains:** opening-hours scheduling, dwell times, route road polyline, traffic refresh while underway, detailed timeline, return-home option, saved preferences, weather integration.

Do not substitute a static nearest-place picker or ask Google Maps to optimize the route: **the local utility-maximizing agent is the academic core**.

---

## 15. First instruction to Astra

> Read `AGENTS.md`, `READ.md`, and `Implementation_Plan.md` in full. Implement PlanB in phases. Start by bootstrapping the app, then build and unit-test a pure JavaScript exhaustive-search intelligent agent using clearly labeled synthetic demo data. After that connect Google Places (New), Google Routes Matrix (traffic-aware), and Google Maps JavaScript with a protected Express proxy and two distinct API keys. Keep the exact one-night MVP limits: 2–4 errands, two candidate places per category, driving mode, three weighted utility profiles, baseline comparison, Google Maps ordered-stop navigation URL, and replanning. Execute checks and report what was tested. Do not fabricate live data, expose server keys, or claim a successful live Google test without actual credentials and results. Prefer a fully working smaller MVP to partially implemented extras.

---

## 16. Official verification references (checked 2026-11-02)

- [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/overview)
- [Places Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
- [Supported Place Types (New)](https://developers.google.com/maps/documentation/places/web-service/place-types)
- [Places data fields and SKU](https://developers.google.com/maps/documentation/places/web-service/data-fields)
- [Compute Route Matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix)
- [Routes API usage and limits](https://developers.google.com/maps/documentation/routes/usage-and-billing)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Google Maps API key security](https://developers.google.com/maps/api-security-best-practices)

Always re-check Google documentation if a live call contradicts these specifications or prices change.
