# AGENTS.md — Waywise coding instructions

Read this file, `Implementation_Plan.md`, and `README.md` before edits. Waywise is a React/Vite and Express intelligent errand planner. The agent selects one venue for each of 1–4 errands and the visit order using exhaustive local search.

## Boundaries

- Keep the optimizer pure and independent of React and provider calls. Use one consistent directional matrix for every compared plan and nearest-next baseline.
- Live establishments come from OpenStreetMap via Overpass, with OpenPOIService's real OSM records as a server-side fallback when Overpass is unavailable and the existing ORS key is configured. The fallback covers at most 2 km and must disclose that limit. Driving time and road distance come from OpenRouteService (ORS) when configured. Without ORS, calculate only approximate straight-line **distance**, never invented driving time or traffic. Never fabricate live venues or ratings.
- The browser uses Leaflet with attributed OpenStreetMap tiles. Google Maps is used for the keyless final ordered Directions URL and server-side Places ratings use a restricted Google Places API key.
- Keep 1–4 errands and at most 3 candidates per category. Start with no errands selected and require at least one before Live optimization. Choose venue combinations and permutations locally. Recompute locally on strategy changes and skip/complete/undo actions.
- Strategies are Fastest (time), Shortest (distance), Balanced (both), and Live-only Highly rated (matched Google ratings plus travel). Normalize metrics before combining them. If time is unavailable, say so and score approximate distance for the travel term. Unmatched venues have no claimed rating.
- Keep a fully offline, clearly fictional Demo Mode. Never mix demo data into Live Mode.
- Keep ORS and Google credentials server-only. Bound requests, time out upstream calls, throttle public services, avoid long-lived Google content caching, and report source failures clearly. Do not print keys or personal coordinates to logs.
- Preserve the calm teal and orange design unless the user requests a redesign.

## Workflow

1. Inspect existing work before changing it.
2. Implement and test pure agent behavior, then provider normalization and UI.
3. Run `npm test` and `npm run build`; verify no Google Cloud dependencies or secrets enter the client bundle.
4. Update `README.md` with actual setup, verified status, and limitations. Do not claim a live route was tested unless it was.

For live provider behavior, consult current official documentation and respect OSM tile, Overpass, Nominatim, and ORS limits. Do not use live requests in unit tests. Google Maps may recalculate its own route after handoff.
