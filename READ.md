# Waywise — intelligent multi-errand planning

Waywise is a single-page Intelligent Agents project. It chooses **one establishment per errand and the visit order** with its own exhaustive utility search. It compares that plan with a nearest-next greedy baseline and opens the selected ordered stops in Google Maps using a keyless URL. Google Maps is only the navigation handoff; it does not make Waywise's decision.

## Run locally

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Express runs at `http://127.0.0.1:3001`; Vite proxies `/api`. The default **Demo Mode** needs no account, key, or provider request. Its Leaflet coordinate plot uses no remote tiles and has a locally drawn grid and an in-map offline label. `S` is the start, numbered markers are chosen stops, unnumbered dots are other candidates, and the dashed line shows stop order rather than roads. Demo venues, coordinates, and directional travel values are fictional and labeled as such.

```bash
npm test
npm run build
npm start       # built app at http://127.0.0.1:3001
npm run validate:live -- --confirm-live  # bounded four-errand provider check
```

The validation command defaults to a Manila sample origin. To test another region, pass `--origin=LAT,LNG`. For example, a Zurich run can use the region-specific Swiss instance without changing the app's default provider:

```powershell
$env:OVERPASS_URL='https://overpass.osm.ch/api/interpreter'
npm run validate:live -- --confirm-live --origin=47.3769,8.5417
```

## Live setup

## Security and deployment guardrails

The server applies a 24 KB JSON body limit, per-IP request windows, endpoint-specific limits, bounded provider queues, upstream timeouts, and a per-IP daily Google Places budget (`GOOGLE_DAILY_REQUEST_LIMIT`, default 40). Repeated Google or ORS quota/network failures open a short circuit breaker so retries do not amplify provider costs. Google and ORS credentials remain server-only; never place them in a `VITE_` variable or log them. The browser cannot choose arbitrary upstream URLs, and venue categories, coordinates, radii, candidate counts, and matrix sizes are allowlisted and bounded. There is no SQL layer; if persistence is added, use parameterized queries and least-privilege credentials.

For deployment, put Express behind HTTPS and a reverse proxy with connection/request timeouts, proxy-level rate limiting, HSTS, and access logs that omit keys and exact coordinates. Set `TRUST_PROXY` only for a proxy you control. The app emits CSP, `X-Content-Type-Options`, and `Referrer-Policy` headers. Set `REDIS_URL` to use the shared Redis-backed limiter/cache for multi-process deployments; without it, the safe local fallback is process-local. Public OSM/Overpass/Nominatim services have no production availability guarantee, so monitor provider latency, errors, quota, and billing, configure alerts, rotate restricted keys, and keep backups and an incident/key-rotation procedure outside the app.

See [deploy/README.md](deploy/README.md) and [deploy/nginx.conf.example](deploy/nginx.conf.example) for the production proxy, TLS, Redis, quota, and monitoring checklist.

### Google Places live discovery and ratings

Enable Places API (New), add `GOOGLE_PLACES_API_KEY=your_server_key_here` to the root `.env`, then restart Express. The key stays on the server. Live searches query Google Places first for each category using the selected origin and radius, retain at most three nearby distinct candidates, and carry their names, addresses, ratings, review counts, and Place IDs into the itinerary. If Google is unavailable or returns fewer than two usable candidates, only that category falls back to real OpenStreetMap venues through Overpass/ORS. Google venues are labeled `Google Places`; fallback venues are labeled `OpenStreetMap`. `/api/ratings` is used only to enrich fallback OSM venues, so Google venues are never queried twice. Google billing setup and an API-restricted key are required even when usage remains inside the free monthly allowance.

[Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search) · [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)

### OSM and ORS setup

Live establishment searches use OpenStreetMap via Overpass. When Overpass fails and an ORS key is configured, the backend uses HeiGIT's OpenPOIService for real OSM venues. Its point search is limited to 2 km; the app displays the actual searched radius when it is smaller than requested. The backend calls public venue and geocoding services only after an explicit user action. Enter an address with the Search button, click the map, provide coordinates, or request browser location permission. Select 2–4 errand categories and a 1–5 km search radius, then click **Find places & optimize**.

For road travel time, distance, and a solid road route, create a free OpenRouteService key and put it in a root `.env` copied from [.env.example](.env.example):

```text
ORS_API_KEY=your_server_key_here
```

The key stays in Express and also enables the OpenPOIService venue fallback. Never place it in a `VITE_` variable. Restart the server after editing `.env`. Without a key, or when ORS road routing fails, Live Mode retains **real OSM venues** if Overpass is available and optimizes clearly labeled **approximate straight-line distance only**. If both venue sources are unavailable, Live Mode cannot produce a real route. It names the fallback cause: missing key, provider rate or quota limit, or unavailable routing. It shows no driving time, road distance, or traffic claim. Numbered map markers show the chosen stops; small dots show other considered venues. The dashed map line indicates stop order; with available ORS geometry a solid line follows the road. Public tiles need no key; [client/.env.example](client/.env.example) shows an optional replaceable tile URL.

The public [OSM tile service](https://operations.osmfoundation.org/policies/tiles/) requires visible attribution and forbids bulk prefetching. [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) permits moderate user-triggered searches with a one-request-per-second application limit, identifying agent, and caching; the app uses a server proxy, explicit Search button, and cache. These community endpoints have no availability guarantee. For a larger deployment, configure suitable providers or self-host them. Overpass queries are bounded and cached for 15 minutes, with a five-minute cooldown after upstream failure; geocoding is cached for a day; matrix and road geometry are cached for five minutes. Cached successful venue searches and road geometry remain usable during a provider cooldown. OpenPOIService, ORS matrix, and ORS geometry requests share a server-wide 1.6-second launch spacing and a three-request pending cap; excess matrix requests fall back to approximate distance. Failed ORS geometry requests also get a 30-second cooldown. The local per-IP limit is a lightweight development guard, not production abuse protection. ORS now uses the [current HeiGIT API host](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912); [.env.example](.env.example) shows optional provider URL overrides.

Provider error messages distinguish a timeout, a failed connection, and a provider rate or quota limit. A timed-out Overpass venue search now names the errand and provider. A browser request to an unavailable or unreadable local API has a separate message. Geolocation errors distinguish permission denial, timeout, and an unavailable position, each with manual-start alternatives. ORS [documents](https://giscience.github.io/openrouteservice/v9.10.0/frequently-asked-questions) HTTP 403 for a daily quota and 429 for a minute limit; both produce a labeled distance-only fallback. Demo Mode remains available when community services cannot be reached.

## Class demonstration

1. Start in Demo Mode with coffee, groceries, church, and spa. Waywise evaluates **384** full candidate plans (2 choices per errand × 4! orders) locally. All example venues and times are synthetic.
2. Change Fastest, Shortest, and Balanced. Each recomputes from the same snapshot using normalized time and distance; it does not re-query a provider. In the Bottleneck scenario, a fictional slow directed leg can change visit order.
3. Skip or remove a stop, restore a skipped stop, mark the next stop complete, and undo completion. The optimizer replans pending errands from the latest completed stop; removing an errand uses the existing snapshot and keeps other completed stops. Adding a Live errand requires **Find places & optimize** again; the previous route remains visible and is labeled incomplete until the new search, with navigation and completion held. The new search is centered near the latest completed stop and retains completed history and Undo. Pin a different venue through **Venue choice** to see another local plan. If that choice makes the trip infeasible, use **Clear venue choices** in the empty state.
4. Open detailed comparison for the evaluated-plan count, scoring terms, next best plan, and nearest-next baseline. Use **Open ordered route in Google Maps** to show the selected stop order. Google Maps may recalculate its own path and ETA.
5. For live data, choose Live OSM and an origin, then optimize. OSM venue names and coordinates are real provider data. If an ORS key is configured, time and distance are road estimates at calculation time, without live traffic prediction. Otherwise only approximate straight-line distance is displayed.

## Agent model

Waywise is a **model-based, utility-based goal agent**. It maintains a snapshot of the origin, pending/completed errands, venue candidates, and one directional travel matrix; it must reach one distinct venue for each pending errand; and it selects the plan with the highest utility. It is not a learning agent and does not claim to find the globally best city route: it optimizes within the bounded shortlist returned by the providers.

Its perception–decision–action loop is: (1) perceive the origin, errands, strategy, completion state, radius, Google/OSM candidates, and ORS matrix; (2) model and normalize venues and travel values, rejecting malformed or duplicate venues; (3) enumerate venue assignments and visit permutations, rejecting duplicate venues and missing legs; and (4) act by presenting the itinerary, explanation, map, baseline comparison, and ordered Google Maps handoff. Skip, complete, Undo, and strategy changes replan locally from the current snapshot.

For plan (P=(v_1,\ldots,v_n)) with origin (v_0), the directional totals are:

```text
T(P) = Σ t(vᵢ, vᵢ₊₁)       D(P) = Σ d(vᵢ, vᵢ₊₁)
timeScore(P) = 1 / (1 + minutes(T(P)) / 30)
distanceScore(P) = 1 / (1 + kilometers(D(P)) / 10)
```

Travel utility is (U_{travel}=w_t\,timeScore+w_d\,distanceScore): Fastest uses ((1,0)), Shortest ((0,1)), and Balanced ((0.5,0.5)). If ORS time is unavailable, the agent uses distance-only scoring rather than inventing driving time. Highly rated uses confidently matched Google ratings with review-count shrinkage:

```text
ratingScore = (r·c + 3.5·5) / (c + 5) / 5
U(P) = 0.30·Utravel(P) + 0.70·mean(ratingScore of rated stops)
```

Unmatched venues are neutral in the rating term and never receive a fabricated rating. The nearest-next baseline greedily chooses the closest reachable next venue using the same matrix, then receives the same strategy score.

## Verified status and limitations

Current implementation verification (2026-11-04): `npm test` passes all 30 tests and `npm run build` succeeds. The tests include Google-first discovery normalization, three-candidate/radius limits, Place ID preservation, and category-specific timeout fallback.

The longer historical verification paragraph below records earlier provider checks; its older 27-test count is superseded by the current 30-test result above.

`npm test` (27 passing) and `npm run build` passed on 2026-11-03. Tests mock upstream calls and cover OSM normalization, explicit spa qualification, ORS directional matrix normalization, fallback, strategy scoring, 8/384/1,944 route enumeration, a greedy dead end, skip/completion, retained completed/skipped venues across refresh and Undo, preservation of the previous route while a new Live errand awaits search, overlapping OSM categories and one matrix node per venue, baseline comparison and category qualification, Express validation, provider timeout/network/quota errors (including ORS daily HTTP 403 and stalled response bodies), road geometry, and ordered Maps URL. With the configured ORS key, a live three-point matrix returned directional road time and distance, and a live directions request returned 62 geometry points. A live Nominatim address search returned five results. The guarded four-errand Zurich run used real OSM venues from the Swiss Overpass instance and a real ORS 12-node matrix: 1,296 feasible plans per strategy, different Fastest and Shortest choices, a 6.8-minute Balanced route, a 7.5-minute nearest-next baseline, and three correctly ordered Maps waypoints. The selected route's optional geometry request timed out; later direct directions requests returned a gateway error or timed out, while the matrix endpoint remained available. The app therefore shows a labeled dashed stop-order line for that run. The default global Overpass instance was at capacity during testing; the Swiss instance covers Switzerland, not Manila. The user confirmed in Firefox that the Demo markers, new grid and offline label, and Live OSM tiles render, and that clicking the Live map updates the starting coordinates. The San Juan City Live itinerary later appeared in the user's Firefox browser; physical-phone handoff remains unverified. Impeccable's source and rendered detector returned no primary findings at 320, 390, 768, and 1440 px after the Demo plot update; it flagged the grid as an advisory despite the plot being a coordinate surface. Provider availability and OSM coverage vary by location. Straight-line fallback does not establish road reachability. Matrix values are estimates for planning at calculation time; they do not predict traffic or arrival time at later stops.

The user also confirmed in Firefox that changing strategy updates the Demo route, marking the first stop complete and using Undo change and restore the itinerary, and opening Google Maps preserves the Demo itinerary's stop order. The Maps URL uses the documented `api=1` directions format and at most three intermediate waypoints. On 2026-11-03, a San Juan City coffee venue request to the default global Overpass instance returned a timeout; even a tiny location-free query to that host timed out, as did one to an alternate global instance. Nominatim and ORS were reachable. This points to current Overpass access or availability, not a failed local optimizer; the precise network or server cause is unknown. The current independent design critique and technical audit are recorded in [DESIGN_AUDIT.md](DESIGN_AUDIT.md). They scored 30/40 and 15/20, respectively. Remaining design token cleanup is cosmetic; the interaction checks below are separate verification work.

The San Juan City live validation on 2026-11-03 succeeded through OpenPOIService after the public Overpass hosts timed out: three real OSM venues for each of coffee, groceries, church, and spa within the disclosed 2 km fallback radius, a 13-node ORS road matrix, 1,944 feasible complete plans, a 5.7-minute Balanced road estimate versus a 6.6-minute nearest-next baseline, 83 road geometry points, and a correctly ordered Google Maps URL. The user then confirmed in Firefox that the Live itinerary appears with the ORS POI 2 km notice.

A guarded live Google Places Text Search check also succeeded for a San Juan coffee venue, returning a 4.6 rating and 229 user ratings through the server-side `/api/ratings` path. The Google key was not printed or sent to the client.

## Future improvements

- Exercise geolocation denial, keyboard focus, text zoom, and detailed Live itinerary interactions in a browser; check the ordered Maps handoff on a phone. The user confirmed the Demo plot, Live OSM tiles, map-click origin selection, Demo replanning, ordered desktop Maps handoff, and the San Juan City Live itinerary with its 2 km fallback notice in Firefox. The connected desktop browser check was stopped by a tool URL policy limitation, so the remaining interactions are not claimed as verified.
- Use a suitable Overpass and geocoding provider, or self-host them, if the project is deployed beyond moderate development use. The current public endpoints can be at capacity.
- Consider a broader candidate shortlist or a second nearby search when overlapping OSM categories leave fewer than two distinct venues; keep the optimizer's small search bound and the real-data-only Live Mode rule.

## References

- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [OpenRouteService API](https://openrouteservice.org/dev/)
- [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/)
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
