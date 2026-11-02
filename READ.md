# PlanB — Project Guide

PlanB is a single-page Intelligent Agents project. Its utility-based agent chooses **one venue per errand and the visit order**, then hands the ordered stops to Google Maps. The search is exhaustive over a small shortlist (up to 384 complete four-errand plans). Google supplies live place and road data when configured; PlanB makes the planning decision locally.

## Run locally

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The Express API listens on `http://127.0.0.1:3001`, and Vite proxies `/api` calls to it. The app starts in **Demo Mode** without credentials. Demo Mode has fictional venues, simulated directional travel times, and a clearly labeled schematic straight-line map. It makes no Google API requests.

```bash
npm test
npm run build
npm start        # serve the built app at http://127.0.0.1:3001
```

The test suite uses local synthetic data only. It does not incur Google API charges.

## Class demonstration

1. Start with coffee, groceries, church, and spa. Show that PlanB evaluates **384** complete candidate itineraries, selects a full route, and offers a Google Maps link with the chosen stop order. On mobile, the route preview and Maps link appear above the planner.
2. Switch **Fastest** to **Best-Rated**. The synthetic data produces a different venue choice and route; scores are recomputed from the cached matrix. Select the **Bottleneck** demo scenario in Fastest mode to show a fictional slow coffee → groceries leg reverse the chosen visit order.
3. Click **Skip** on church. PlanB recalculates a route for the remaining pending errands; **Restore Church** brings it back using the same snapshot. **Mark Juniper Cup complete** preserves the completed stop and replans from there; **Undo Juniper Cup completion** restores it. Use **Venue choice** to constrain a pending errand to the other candidate and recompute its route.
4. Open **Show detailed comparison** to inspect the selected route and **Nearest-next baseline**. Both use the same candidates, directed matrix, and profile weights. The chosen route may take longer if its venue quality raises its utility.

All demo establishments and travel values are fictional. The sample coordinates are for a visualization and Maps URL demonstration, not a claim that those venues exist there.

The following values come from running the local optimizer on the fictional demo snapshot. They illustrate the class scenarios; they are not measured Google travel times.

| Demo scenario | Preference | Selected visit order | Agent drive | Greedy drive | Agent / greedy utility |
| --- | --- | --- | ---: | ---: | ---: |
| Standard | Fastest | Juniper Cup → Lantern Market → Willow Chapel → Moss Day Spa | 20.1 min | 20.1 min | 60.3% / 60.3% |
| Standard | Best-Rated | Cobalt Coffee Room → Cedar & Stone Grocer → Harborlight Church → Orchid Hour Spa | 42.2 min | 20.1 min | 77.0% / 62.7% |
| Bottleneck | Fastest | Lantern Market → Juniper Cup → Willow Chapel → Moss Day Spa | 18.6 min | 23.9 min | 62.0% / 56.5% |
| Standard, church skipped | Balanced | Juniper Cup → Lantern Market → Moss Day Spa | 15.8 min | 15.8 min | 64.8% / 64.8% |

The full four-errand examples each enumerate 384 complete plans. Skipping church leaves 48. The bottleneck case saves 5.3 simulated driving minutes against the nearest-next baseline; the Best-Rated case accepts a longer drive for higher modeled venue quality.

## Live Google setup

A Google Cloud project with billing enabled may be required. Free allowances are not a guarantee of zero cost. Set conservative quotas and a billing alert. Enable **Places API (New)**, **Routes API**, and **Maps JavaScript API**.

Create two distinct keys:

- Put a server key restricted to Places API (New) and Routes API in a root `.env` copied from [.env.example](.env.example). It stays in Express and must never use a `VITE_` prefix.
- Put a browser key restricted by website referrers and to Maps JavaScript API in `client/.env`, copied from [client/.env.example](client/.env.example). Allow `http://127.0.0.1:5173/*` for local testing.

Restart the dev server after changing environment files. Choose **Live Google**, click the map, enter coordinates, or use **Use my current location**, then **Find places & optimize**. Live searches happen only on that button press: one Nearby Search per category (up to five raw results, two shortlisted), followed by one directional Route Matrix for up to nine nodes / 81 elements. Profile changes and simple replans use the current matrix locally.

Ratings in Nearby Search trigger an Enterprise SKU. The interface displays real ratings only when Google supplies them; missing ratings remain unknown. The traffic-aware matrix is a snapshot at calculation time. Later legs and Google Maps navigation can have different conditions and ETAs. If live requests fail, the app reports the error and users can switch to Demo Mode; it does not substitute synthetic places or traffic into Live Mode.

The backend has a ten-second upstream timeout, per-IP request throttling, an element budget, bounded inputs, and sanitized error envelopes. For any public deployment, add appropriate authentication and stronger abuse controls for paid endpoints; the local development limits alone are not sufficient protection.

## What is implemented and verified

- React/Vite UI, Express API, pure optimizer modules, synthetic demo data, next-best-plan comparison, greedy baseline, skip/restore and complete/undo replanning, mobile route preview, optional browser Google map markers, and ordered Google Maps URL.
- Pure unit tests cover 8 and 384 enumerations, directed routes, unreachable and duplicate plans, missing ratings, profile trade-offs, deterministic ties, baseline scoring, completed/skipped state, duration parsing, provider normalization, and Maps URL order.
- `npm test` (15 passing tests), `npm run build`, local dev startup, built-app serving, `/api/health`, and credential-missing API errors were checked on 2026-11-02. Impeccable's rendered detector was run at 320, 390, 768, and 1440 px widths after styling changes.
- Headless Chrome screenshots at 390 and 1440 px were visually reviewed. At 390 px, browser actions confirmed a profile-driven venue change, skip/restore, completion, no horizontal overflow, and zero Google requests in Demo Mode. A separate no-key Live Mode check confirmed permission-denied recovery, manual coordinates, loading feedback, a missing-key error, and reset to Demo Mode. These checks do not substitute for physical-device or keyed Google testing.
- Impeccable's independent design critique is archived in `.impeccable/critique/` (24/40 before the follow-up refinements); the source detector reported zero findings. The mobile route preview, completion Undo, errand-limit hint, short comparison, and detailed disclosure address its priority findings. The disclosure was built and source-checked but its click interaction was not browser-tested after an automatic tool-policy rejection.

## Not yet verified with credentials

No real Google Places, Routes, or browser Maps key was supplied, so no billable live API call or complete live route has been tested. Map click behavior with a configured browser key and Google Maps handoff behavior on physical phones remain unverified. The offline demo and normalized-adapter tests do not prove a live Google session.

PlanB finds the best plan **within the retrieved shortlist and its simplified utility model**, not every venue in a city. It does not offer bookings, transit, weather, live tracking, or in-app navigation.

## Official references

- [Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
- [Compute Route Matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix)
- [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/overview)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
- [Google Maps API key security](https://developers.google.com/maps/api-security-best-practices)
