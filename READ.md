# PlanB — Project Guide

**PlanB: An Intelligent Location-Based Multi-Errand Optimization Agent**  
**Academic project:** Intelligent Agents · Utility-Based Agent (Type 4), with Goal-Based reasoning (Type 3)  
**Version:** Planning starter package — **implementation has not been written yet**

## What is PlanB?

PlanB is a web-based intelligent errand planner. The user selects a starting location and 2–4 errands—such as **coffee, groceries, church, spa**—and PlanB discovers matching nearby establishments, evaluates **which specific establishments** make the best combined trip, and orders them efficiently. The user can then open the chosen multi-stop route in Google Maps.

Unlike a normal nearby-place search, PlanB does not choose each nearest establishment independently. It compares **whole candidate itineraries** using estimated road travel time, Google place ratings where available, and preferences. If the user skips an errand or changes optimization mode, PlanB recalculates its plan.

Google Maps and Google Places are **data and navigation providers**. PlanB's own utility-based optimizer is the intelligent agent.

## MVP capabilities to build

- Ask permission to use current location, or allow map-click starting point.
- Select **2–4** categories; coffee, groceries, church, spa, pharmacy, restaurant.
- Query real nearby venues and ratings with **Google Places API (New)**.
- Get directional **traffic-aware driving time and road distance** with **Google Routes Compute Route Matrix**.
- Evaluate up to **384** full routes for four errands with two candidate venues each.
- Offer **Fastest / Balanced / Best-Rated** utility profiles.
- Show selected itinerary, map pins, total estimated drive time/distance, the agent's decision explanation, and comparison with greedy nearest-next baseline.
- Open Google Maps with origin + **three intermediate waypoints + final destination** in agent-selected order.
- Skip/remove an errand and replan.
- Run a clearly labeled **Demo Mode** without external keys.

The MVP **does not** include ML, a chatbot, automatic reservations, an in-app turn-by-turn navigation engine, weather, public transit, real-time route monitoring, or actual arrival-time guarantees.

## Quick start for Astra

1. Extract this ZIP into the **root of a new project folder**.
2. Start Astra/your coding agent **inside that directory**.
3. Ask it to **read `AGENTS.md`, `READ.md`, `Implementation_Plan.md` completely before writing code**.
4. Give it this instruction:

```text
Implement the PlanB academic MVP according to AGENTS.md and Implementation_Plan.md.
Begin with a working offline Demo Mode and unit-tested utility-based route optimizer,
then integrate real Google Places, Google Routes Matrix, Google Maps JavaScript API,
and a properly encoded Google Maps directions URL.
Follow the phased gates, keep a protected Express backend for Places/Routes keys,
limit candidate/API usage, run tests and build, and document exactly what works.
Do not invent real venue data or claim live tests without credentials.
```

5. After Astra generates the code, follow the scripts it adds to the repository. The intended tooling is **Node.js 20+**, **npm**, React/Vite client, Express backend, and JavaScript tests.

## Google Cloud setup (user action, not automated by Astra)

A real-data demo normally requires a **Google Cloud billing-enabled project**. Free monthly usage allowances exist, but they do **not** mean that charges are impossible. Set strict API quotas and a billing alert, and check usage during development.

Enable:

1. **Maps JavaScript API**
2. **Places API (New)**
3. **Routes API**

Create **two different API keys**:

- **Browser key:** restrict by allowed website referrers (`http://localhost:5173/*` for local development, plus actual hosted domain if applicable), and restrict allowed APIs to Maps JavaScript API. This one may be used by client-side code.
- **Server key:** keep exclusively in backend `.env`, restrict to Places API (New) and Routes API; apply appropriate server-side application restrictions when feasible for the deployment. Never place it in `VITE_*` variables or commit it to Git.

The coding agent should create environment examples, such as:

```dotenv
# client/.env.example (browser-side; this key is public but MUST be restricted)
VITE_GOOGLE_MAPS_BROWSER_KEY=replace_with_browser_restricted_key

# server/.env.example (server-side ONLY)
GOOGLE_MAPS_SERVER_KEY=replace_with_server_key
PORT=3001
```

Do **not** paste real keys into chat, screenshots, documentation, code samples, or commits. The app must start without API credentials in **Demo Mode**.

## Intended developer commands

These commands are a **target implementation contract**, not something already installed in this ZIP. Astra must create package scripts so they work:

```bash
npm install
npm run dev       # start React and Express locally
npm test          # optimizer and URL logic tests
npm run build     # production build check
```

Expected local browser URL (Vite default): `http://localhost:5173`. The Express server can use `http://localhost:3001`. If actual scripts/ports differ, Astra must update this guide to match working commands. Browser location access should work on localhost; deployed location access requires HTTPS.

## Suggested class demonstration

**Demo A — Real world trip:** Ask for start location, select coffee/groceries/church/spa, optimize, show real Google places + ratings + time/distance, and launch the completed route in Google Maps.

**Demo B — Agent preference change:** Compare Fastest vs Best-Rated. Show how selection or visit order can change when utility weights change; do not force artificial differences if live data produces the same best route.

**Demo C — Adaptation:** Skip the church stop and click Replan. Show the new three-stop itinerary and newly generated Google Maps URL.

**Demo D — Baseline comparison:** Display greedy nearest-next vs PlanB utility and travel estimate, including any quality/travel trade-off. Do not claim PlanB must always be faster under every preference profile.

Offline Demo Mode with documented synthetic data must support all four demonstrations if credentials or connectivity are unavailable.

## Decision logic at a glance

- **Goal:** satisfy every selected errand category using a feasible route.
- **Utility:** weighted combination of a normalized driving-time score and a normalized venue-quality score.
- **Search:** exhaustively evaluate combinations of two venues per errand and permutations of the chosen stops (at most `2^4 × 4! = 384`).
- **Route data:** Google Route Matrix is directional and traffic-aware at a single planning timestamp. Subsequent travel-time conditions may change.
- **Baseline:** deterministic nearest-next greedy strategy using the **same matrix**.
- **Result:** choice of locations + ordered stops + explanation + Google Maps URL.

## Project file guide

| File | Purpose |
| --- | --- |
| `READ.md` | Short project introduction, setup requirements, demo checklist. |
| `Implementation_Plan.md` | Complete architecture, API behavior, algorithm, phases, test cases, acceptance conditions, costs, and references. |
| `AGENTS.md` | Binding development instructions for Astra and other coding agents. |

**Note:** This starter archive intentionally contains **only documentation**. Astra is expected to generate the application source, tests, environment examples, and working scripts **in the same folder**.

## Honest limitations

- A Google billing-enabled project is generally required for live APIs, regardless of free-usage allowances.
- Requesting Google place ratings causes Nearby Search Enterprise billing classification.
- Each Route Matrix origin-to-destination pair consumes a **matrix element**.
- The optimizer finds a best plan *within the candidate establishments it retrieved*, not necessarily the optimal trip among every venue in a city.
- Google Maps may recompute the path and ETA when opened; PlanB provides an ordered set of stops, not a permanent precomputed driving polyline.
- All leg estimates from a single matrix use a planning-time snapshot; they do not precisely forecast traffic later in a multi-hour trip.
- Google service terms and attributions must be followed; do not make a persistent scraped Places dataset.

## Official docs

- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Places Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
- [Places API place types](https://developers.google.com/maps/documentation/places/web-service/place-types)
- [Routes API Compute Route Matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
- [Google Maps API security](https://developers.google.com/maps/api-security-best-practices)
