# Waywise implementation plan

## Problem and objectives

People with several errands must choose both suitable venues and a practical visit order. Waywise is a goal and utility based agent: it perceives a starting point, user errands, nearby OpenStreetMap venues, and a directional travel matrix; evaluates complete plans; and acts by presenting a route and opening its ordered stops in Google Maps.

The app optimizes only within the retrieved shortlist and its simplified utility model. Driving is the sole travel mode. There is no live tracking, booking, or traffic prediction. An optional Google Places key adds matched ratings to the Live shortlist.

## PEAS and environment

| Part | Definition |
| --- | --- |
| Performance | Complete every pending errand once, maximize selected strategy utility, use reachable directed legs, communicate uncertainty. |
| Environment | Road network and OSM establishments near a user selected origin; dynamic external data and partially observable availability. |
| Actuators | Show itinerary, explanations, comparisons, map markers, and ordered Maps handoff; locally replan on changes. |
| Sensors | Browser geolocation or manual location, selected errands/strategy, Overpass results, ORS matrix, user completion/skip actions. |

State includes the origin, pending/completed/skipped errands, candidate groups, matrix source and snapshot time, strategy, and any pinned venue choices. Perception collects candidates and one matrix on an explicit Optimize action. Decision enumerates one venue per pending errand and all visit orders. Action displays the best plan and a nearest-next baseline. Strategy, venue, skip, completion, and undo changes replan locally from the existing snapshot.

## Architecture and data contracts

- React/Vite frontend: controls, Leaflet/React-Leaflet map, itinerary, comparison, Google Maps URL.
- Express backend: `/api/health`, `/api/geocode`, `/api/places`, `/api/ratings`, `/api/matrix`, `/api/route`. Only it calls Nominatim, Overpass, OpenPOIService, ORS, and optional Google Places. It guards request size, radius, node count, timeouts, cache, and per-IP rate.
- Pure agent: `client/src/agent/{optimizer,scoring,baseline,googleMapsUrl}.js`.
- Demo data: deterministic, fictional venues and directed synthetic time/distance. No upstream requests.

Normalized venue: `{placeId,name,category,latitude,longitude,address,dataSource:'osm'|'demo'}`. OSM IDs are `type/id`; they are not Google Place IDs. Matrix: `{nodes,durationSec,distanceMeters,fetchedAt,dataSource:'ors'|'approximate'|'demo'}`. Approximate responses also carry a plain-language `fallbackReason` and a `fallbackCode` for missing key, provider limit, or unavailable routing. `durationSec` entries are `null` when unavailable. Road distance and duration entries are `null` for unreachable legs. Approximate fallback has straight-line distances and `null` off-diagonal durations. Never coerce missing data to zero.

## Search and utility

The optional Live-only Highly rated strategy scores a matched Google Places listing with its returned rating and review count. It shrinks each rating toward 3.5 stars using five prior reviews, then weights the resulting rating term at 70% and travel at 30%. A venue without a confident match has a neutral contribution to the rating term, with no displayed or inferred Google rating. If none of the shortlist matches, the rating term is constant and travel decides. ORS travel uses time and distance equally within its 30%; approximate routing uses straight-line distance for that 30%. All complete plans and the nearest-next baseline use the same matrix and utility function.

For 4 errands and 2 candidates each there are `2^4 × 4! = 384` complete plans; 3 candidates each yield 1,944. A venue may appear in more than one category shortlist, but the matrix contains it once and each complete plan must use distinct venues. A completed venue is unavailable to remaining errands until Undo. Reject venues with the wrong errand category, duplicate venues, or missing directed legs in both the exhaustive search and baseline. Compute total time and distance for every feasible ordered plan. Scores use bounded inverse scales: `timeScore=1/(1+minutes/30)`, `distanceScore=1/(1+kilometers/10)`. Fastest weights `(1,0)`, Shortest `(0,1)`, Balanced `(0.5,0.5)`. The plan with maximum weighted utility wins with deterministic tie breaks. With distance-only fallback, travel scoring uses approximate distance and labels the route approximate; no duration is shown. Highly rated uses confirmed Google ratings when available. The nearest-next baseline greedily picks the next reachable venue by time for ORS/demo or distance for approximate, then receives the *same* strategy score as the agent plan.

Completed stops remain fixed in history and become the new planning origin. Skipped stops are removed from the pending set. Removing an errand from an existing snapshot replans locally and retains completion history for the remaining errands. Adding a Live errand requires a new explicit search; that refresh carries completed and skipped venues into the new matrix, searches pending errands near the latest completed stop, and preserves Undo. Undo restores the latest completed stop. A pinned venue that makes the route infeasible can be cleared from the empty state. The agent explains actual comparisons against the baseline and runner-up; it must not claim citywide optimality.

## Development phases and current evidence

| Phase | Scope | Current evidence and remaining check |
| --- | --- | --- |
| 1 | Inspect project and update documents | `AGENTS.md`, this plan, and `READ.md` describe the OSM/ORS architecture and its limits. |
| 2 | Replace Google Cloud and render the map | Leaflet and OSM tiles are in the client; the production dependency and bundle checks found no Google Cloud integration. The user confirmed Live tiles, the offline Demo plot, and starting-point selection by map click in Firefox. |
| 3 | Discover real establishments | The guarded Zurich validation retrieved OSM venues through Overpass. On 2026-11-03, a San Juan City validation retrieved four categories of real OSM venues through OpenPOIService after Overpass timed out. The fallback is limited to 2 km. |
| 4 | Retrieve road estimates | A configured ORS key returned a directional road matrix in live validation. The selected Zurich itinerary's geometry request timed out; the San Juan City itinerary returned 83 road geometry points through the current HeiGIT host. |
| 5 | Implement the local utility agent | Pure tests cover exhaustive enumeration, strategy scores, directed legs, tie breaks, and the nearest-next baseline. |
| 6 | Show itinerary and analysis | The itinerary and analysis components compile in the production build; the user confirmed that the San Juan City Live itinerary appears in Firefox with the 2 km ORS POI fallback notice. Other detailed Live interactions remain to be checked. |
| 7 | Hand off and replan | Tests cover ordered Maps URLs and local replanning after skip, completion, Undo, and refresh. The user confirmed strategy changes, completion, and Undo update the Demo itinerary in Firefox, and that the opened Google Maps tab preserves its stop order. Physical phone handoff remains open. |
| 8 | Demo, failures, tests, build | Demo uses bundled fictional data; mocked provider tests, `npm test`, and `npm run build` pass. |

## Providers and constraints

- Overpass: explicit, bounded category searches using OSM tags and `nwr(around:radius,lat,lon)`, `out center`; shortlist at most 3 valid named, distinct venues per category. Recheck returned tags against the category, including `beauty=spa` for day spas. Cache results, space uncached requests, and back off after failure.
- OpenPOIService fallback: when Overpass fails and an ORS key is configured, request real OSM POI records through HeiGIT's `openpoiservice/v0/pois` endpoint. Its point buffer is limited to 2 km, so return the effective radius and display it if the user requested more. Use OSM IDs and conservative category checks; exclude ambiguous worship sites and beauty shops lacking a spa name. Never present fallback records as Overpass results. If overlapping shortlists cannot assign a distinct venue to every pending errand, report that before requesting a travel matrix.
- ORS: server-only `POST /openrouteservice/v2/matrix/driving-car`, one square matrix per candidate snapshot, metrics `duration` and `distance`. The selected route can request `POST /openrouteservice/v2/directions/driving-car/geojson` for a road polyline. POI, matrix, and geometry calls share a bounded server-wide launch queue spaced by 1.6 seconds. A key is required for road estimates and POI fallback. Reject malformed matrix shapes; preserve null cells as unreachable. If ORS is missing, limited, or unavailable, return labeled straight-line fallback. Its matrix is a planning estimate, not live traffic.
- Google Places: optional server-only key. Text Search (New) checks each shortlisted OSM venue by name with a 200 m location bias and `regionCode: PH`; attach only a nearby exact-name result with a valid rating, review count, and Google Maps URI. Ratings are fetched on explicit search without a long-lived content cache. A failed lookup never blocks the OSM itinerary.
- Nominatim: explicit manual search, no autocomplete, at most one upstream request per second for the entire app, identifying User-Agent, cache. Public Nominatim is for moderate development use; deployment at scale requires an appropriate provider or self hosting.
- OSM tiles: visible `© OpenStreetMap contributors` attribution, HTTPS standard tile URL, normal browser cache, no bulk download or prefetch, valid Referer. Allow tile URL configuration.
- Keyless Google Maps URL: origin, 1–4 ordered stops, at most 3 waypoints, `travelmode=driving`; coordinates only for OSM venues. Google Maps recalculates route and ETA on opening.
- Provider errors: distinguish a timed-out request from a failed connection and a provider rate or quota limit. Do not expose credentials or upstream response bodies to the browser.

## Verification and limits

Unit tests cover complete enumeration, directed legs, strategy effects, stable ties, baseline fairness, skip/complete, provider normalization, approximate fallback, and Maps stop order. API tests mock upstream services and never spend quota. Run `npm test` and `npm run build`. The configured ORS key has been verified against live directional matrices and directions geometry; Nominatim address search returned live results. A full four-errand live flow succeeded with a Zurich origin and a region-specific Overpass instance: 12 nodes, 1,296 feasible plans per strategy, distinct Fastest and Shortest choices, and ordered Maps waypoints. Directions geometry timed out for that selected itinerary, so its map remains a labeled dashed stop-order line. On 2026-11-03, the San Juan City fallback flow succeeded with 3 real OSM venues in each of four categories from OpenPOIService, a 13-node ORS road matrix, 1,944 feasible plans, an ordered Maps URL, and 83 road geometry points. The public Overpass hosts timed out from this machine. The user verified Live tile rendering and map-click origin selection in Firefox. The user confirmed the San Juan City Live itinerary and 2 km fallback notice in Firefox; physical phone handoff and other detailed Live interactions remain unverified. OSM coverage and public provider availability vary; straight-line fallback does not prove road reachability.

Success requires a two-to-four-errand plan with one real venue per pending category in Live Mode, a locally selected order and nearest-next comparison from the same matrix, an ordered keyless Maps URL, and a distinct offline fictional Demo Mode. Road estimates require a working ORS key; otherwise the result must show only approximate straight-line distance. The automated tests and guarded Zurich run prove the calculation and provider portions of those criteria. The remaining browser and physical-phone checks are listed above and in `READ.md`.

## Primary references

- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [ORS API](https://openrouteservice.org/dev/)
- [HeiGIT API host migration](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912)
- [OpenPOIService](https://github.com/GIScience/openpoiservice)
- [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/)
- [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
- [Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)
