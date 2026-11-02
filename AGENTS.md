# AGENTS.md — Instructions for Astra / Coding Agents

## Authority and mission

You are implementing **PlanB: An Intelligent Location-Based Multi-Errand Optimization Agent**, an overnight academic Intelligent Agents project. Read **all three** root Markdown documents before editing files:

1. `AGENTS.md` (this file): non-negotiable implementation constraints and coding workflow.
2. `Implementation_Plan.md`: detailed functional specification, architecture, integration contracts, cost controls, test plan.
3. `READ.md`: project explanation and intended end-user setup/demo.

**Priority if instructions conflict:** protect secrets/costs/correctness first; then this AGENTS.md; then Implementation_Plan.md; then READ.md. If a specification conflicts with current official Google API behavior, consult official docs, implement correctly, and document the discrepancy.

The project is **documentation-only at handoff**. Create the app source, scripts, environment examples, and tests in **this same project directory**. Do not assert the app already works before implementing and testing it.

## Primary target

Build a polished **utility-based intelligent agent** that (a) retrieves or simulates candidate venues for 2–4 errands; (b) gets or simulates a directional road travel-time matrix; (c) **selects both one place per errand and the best visit order in the app's own optimization algorithm**; (d) explains trade-offs; and (e) opens Google Maps with ordered navigation stops.

**Minimum feasible result tonight:** offline Demo Mode + real optimizer + explanation + complete itinerary + working Maps URL + unit tests. **Full desired result:** live Google Places + ratings, traffic-aware Routes estimates, map markers, and working navigation handoff.

## Non-negotiable scope

- A single responsive web app. Use **React/Vite + JavaScript** for client, **Node.js/Express** for protected server. Node.js 20+.
- **2–4 errand categories maximum** in normal UI, no more than **2 selected candidate places per category**. Up to 5 raw Places results/category may be fetched before shortlisting.
- Driving mode only in MVP; no transit/rain integrations, no booking integrations, no in-app navigation SDK, no login, no ML, no chat agents.
- Utility profiles: **Fastest, Balanced, Best-Rated**; configuration changes must run a **real local recomputation**, not simply swap UI labels.
- App chooses establishment + visit order with exhaustive search (at most 384 complete configurations with 4 categories × 2 candidates).
- Include nearest-next greedy baseline comparison using exactly the same candidates/matrix.
- Replan on an errand skipped/removed; preserve explicitly completed errands and never imply live tracking without permission.
- Support **Demo Mode with completely fictional/labeled data**, no upstream requests. **Live Mode must contain no fabricated establishments, reviews, travel times, or traffic status.**
- Clearly distinguish **actual Google road/traffic estimate** from Haversine/straight-line or synthetic values.

## Code structure and boundaries

- Make the agent pure functions (`agent/optimizer.js`, `scoring.js`, `baseline.js`, `googleMapsUrl.js`) with zero React, network, and UI dependencies. Keep inputs/outputs documented.
- The backend alone calls Places API (New) and Routes Compute Route Matrix. Client calls **only local backend endpoints** for Places/Routes.
- Browser only receives the browser-restricted Maps JS key. Never expose server API credentials in `VITE_*`, bundle output, client logs, provider error messages, Git, or docs.
- Normalize provider responses into internally consistent types. Distinguish null values from 0.
- Handle same-origin vs cross-origin in Vite dev via a proxy. Use robust timeouts and simple throttling/rate limiting in Express.
- Be practical. Prefer a small, well-tested codebase to fancy architecture (no Redux, database, Docker, WebSocket, queue worker, or multistage pipeline unless strictly necessary).

## Required agent correctness

1. For each pending errand, require exactly one qualifying candidate in each complete plan.
2. Check unique Place IDs and all directed legs; reject unreachable/missing routes, don't silently put `0` for absent data.
3. Enumerate combinations × permutations and choose maximum utility with deterministic tie-break.
4. Use score normalization: `timeScore = 1/(1+minutes/30)`; smoothed quality `(n*rating+20*3.5)/(n+20)/5` when rating/count are present, neutral 3.5/5 internally otherwise. Do not show smoothed/internal quality as a real Google user rating.
5. Profiles: Fastest `(0.90 time,0.10 quality)`, Balanced `(0.65,0.35)`, Best-Rated `(0.35,0.65)`.
6. Surface reasons in terms of actual compared plans and score terms. If no comparison data, explain only what is grounded. Show baseline travel and score honestly—even if baseline travels faster under high-quality preference.
7. Matrix is directional; matrix response ordering is arbitrary. Use `originIndex` and `destinationIndex` to rebuild it.
8. For time durations, safely parse Google strings like `"245s"`; only numeric nonnegative durations in normalized engine data.
9. Record snapshot time and label ETA as an **estimate at calculation time**, not guaranteed later-arrival traffic.
10. Exhaustive search is optimal only over the retrieved shortlists and the simplified utility model; do not claim citywide global optimality.

## Google integration and cost rules

- Use **Places API (New)**, not Legacy Nearby Search. `POST https://places.googleapis.com/v1/places:searchNearby` with a **specific `X-Goog-FieldMask`** and `includedTypes`, locationRestriction circle, result limit. Don't request `*` field masks.
- `places.rating` / `places.userRatingCount` produce a **Nearby Search Enterprise** SKU; cost is a real consideration. `places.id`, `places.location`, and display name are important. Treat missing ratings as unknown.
- Use **Routes API** `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`, travel mode `DRIVE`, `routingPreference: TRAFFIC_AWARE`; request `originIndex,destinationIndex,duration,distanceMeters,status,condition` field mask. Respect up to 9 nodes/81 elements for MVP.
- Do not call Google APIs on every render, keystroke, preference change, or every permutation. One Places search per category upon explicit action, one route matrix per new candidate snapshot; optimize hundreds of plans locally without repeated Google calls.
- Do not perform real API tests automatically unless server key is configured **and** user explicitly opts into live validation; default CI/unit tests never incur charges.
- Billing-enabled Google Cloud project may be required despite free monthly allowances. Do not promise no cost. Do not create a billing-enabled project or enter payment details for the user.
- Google Maps URLs don't need an API key and accept up to 3 intermediate waypoints on mobile browsers; use up to 4 errand stops (3 waypoints + destination), preserve the agent-selected order. Use `destination_place_id` / `waypoint_place_ids` where valid; URL encode correctly.
- Google Maps recalculates path/ETA after handoff. Do not pretend to import a fixed traffic snapshot or pre-calculated line into Google navigation.
- Restrict browser and backend keys appropriately, apply minimal backend rate limits, create `.env.example` and `.gitignore`, avoid printing keys on errors.

## Execution workflow (follow the phases)

### Checkpoint 0 — inspect and scaffold

1. Inspect existing repository; do not overwrite user work without checking.
2. Read three root docs fully.
3. Define package scripts for `npm run dev`, `npm test`, `npm run build`; set up Vite/Express.
4. Add `.gitignore`, `.env.example`, `/api/health`, and Demo Mode fallback.
5. Verify dev startup. Do not invent success messages.

### Checkpoint 1 — pure optimizer

1. Build clearly synthetic dataset of origin + two candidates/category for coffee, groceries, church, spa and directional matrix.
2. Implement full combinatorial selection, scoring, baseline, decision trace, skip/replan.
3. Write tests verifying 8 and 384 combinations (before infeasibility filters), unreachable legs, missing ratings, deterministic ties, profile changes, directional asymmetry, baseline fairness, and URL builder.
4. Run tests and fix failures before API work.

### Checkpoint 2 — UI and navigation handoff

1. Build clean responsive React UI, location controls, categories, modes, map markers or clearly-labeled fallback display, itinerary, metrics, explanation, baseline panel.
2. Implement Google Maps directions URL with ordered waypoints, including test coverage.
3. Make all four demonstration scenarios available in Demo Mode; mark demo data as synthetic.

### Checkpoint 3 — live data adapters

1. Integrate Places API via backend; validate request and response, quota/rate limits and proper field masking.
2. Integrate full directional Google Routes matrix via backend, handle status errors and durations.
3. Transform same data into optimizer inputs; only declare LIVE if both required real venue and travel data are actually real. If road matrix fails, optional estimated-distance fallback must be visibly labeled approximate and not described as current traffic.
4. Integrate browser Google Map with restricted public key and manual marker origin.

### Checkpoint 4 — verification and handoff

1. Run `npm test`, `npm run build`, and any lint checks if configured.
2. Inspect runtime errors, ensure key segregation, no exposed secrets, no API calls in Demo Mode.
3. Manually verify URL structure; if actual live API credential supplied, test limited live flow with user consent. Do not substitute mock data for a live success claim.
4. Update `READ.md` for actual scripts, tested status, and known limitations.
5. In final summary, state exactly: **implemented**, **tested**, **not tested**, **blocked / requires user credentials**.

## Priority / time management

- Prioritize correctness and completeness of the **agent** above decorative features.
- If time or API access blocks completion, retain all working Demo Mode functionality and explain what requires real keys.
- Never leave the repository broken in pursuit of optional features.
- Do not postpone work waiting for confirmation about minor unspecified details: choose simple documented defaults. Ask only for truly external requirements such as user's Google Cloud keys or billing activation when necessary to validate live data.
- Do not promise to deliver code later. Execute tasks and tests within the current coding session.

## Definition of success for class defense

The user can demonstrate the agent receives 4 errands, selects real or explicitly synthetic venues, evaluates many complete sequences, identifies the best weighted plan, explains what made the chosen plan better, responds to a changed preference or skipped errand, and launches a properly ordered route in Google Maps.

**Failure conditions:** static/hardcoded route, only choosing nearest independently, using Google Maps directions as the agent's decision engine, labeling fictional places as Google results, fabricating traffic data, exposing API keys, or claiming tests not performed.

## References

Use official URLs listed in `Implementation_Plan.md` rather than relying on memory for API field names, billing SKUs, restrictions, and limits.
