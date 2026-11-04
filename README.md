# Waywise

Waywise is an intelligent errand planner. Choose a starting point and one to four errands; it finds nearby venues, compares complete venue-and-order plans, and opens the selected stop order in Google Maps. New trips start with an empty errand list.

The planner is a model-based, utility-based goal agent. It searches the returned shortlist locally using one directional travel matrix and compares its best plan with a nearest-next baseline. It optimizes within that shortlist; it does not claim to find the best route across an entire city.

## Features

- Offline Demo Mode with clearly fictional venues and travel data.
- Live venue search using Google Places, with per-category OpenStreetMap fallback through Overpass and, when configured, OpenPOIService.
- OpenStreetMap tiles and attribution in Live Mode.
- ORS road travel estimates when configured; otherwise the app shows approximate straight-line distance and no invented driving time.
- Fastest, Shortest, Balanced, and Live-only Highly rated strategies.
- Local replanning when changing a strategy, choosing a venue, skipping/completing an errand, or undoing completion.
- Ordered Google Maps handoff, with Place IDs used for Google-matched venues and coordinates for fallback venues.

## Run locally

Requires Node.js 20+ and npm.

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. Vite serves the frontend and proxies API requests to Express on port 3001. Demo Mode works without provider keys.

To run the production build locally:

```bash
npm run build
npm start
```

Open <http://127.0.0.1:3001>.

## Live provider setup

Copy `.env.example` to `.env` and add server-side credentials as needed:

```env
GOOGLE_PLACES_API_KEY=your_restricted_places_key
ORS_API_KEY=your_ors_key
GOOGLE_DAILY_REQUEST_LIMIT=40
```

Keep these credentials in the server environment. Never put them in a `VITE_` variable or commit `.env`.

Google Places is queried first for each selected errand category. It returns up to three nearby candidates with business details, ratings, review counts, and Place IDs. If Google is unavailable or returns fewer than two usable candidates, that category falls back to OpenStreetMap. Google ratings are not queried a second time for Google-discovered venues.

ORS provides road distance, estimated driving time, and optional road geometry. It also enables OpenPOIService as a fallback when Overpass is unavailable; OpenPOIService searches at most 2 km, and the app discloses the effective radius. Without ORS, Live Mode uses approximate straight-line distance only. OSM and Nominatim are public community services with variable coverage and availability.

## Deploy

For a final-project demo, deploy as one Node web service. For example, Render can build and run this project with:

```text
Build command: npm ci && npm run build
Start command: npm start
```

Set `NODE_ENV=production`, `HOST=0.0.0.0`, and the port required by the host (Render commonly supplies `PORT`). Add provider keys through the host's environment-variable settings. One instance does not require Redis.

For a container deployment, the repository includes a [Dockerfile](Dockerfile), a [Docker Compose setup with Redis](deploy/docker-compose.yml), an [Nginx HTTPS example](deploy/nginx.conf.example), and a [deployment checklist](deploy/README.md). Set `REDIS_URL` when running multiple app processes so request limits and provider caches are shared. TLS certificates and provider billing/quota configuration are managed by the deployment environment.

## Agent and scoring

For a plan (P=(v_1,\ldots,v_n)) from origin (v_0), the agent sums the directional leg estimates:

```text
T(P) = Σ t(vᵢ, vᵢ₊₁)       D(P) = Σ d(vᵢ, vᵢ₊₁)
timeScore(P) = 1 / (1 + minutes(T(P)) / 30)
distanceScore(P) = 1 / (1 + kilometers(D(P)) / 10)
```

Fastest maximizes time score, Shortest maximizes distance score, and Balanced gives both equal weight. If road time is unavailable, travel scoring uses distance alone.

Highly rated combines 70% rating score and 30% travel utility. Ratings with few reviews are shrunk toward 3.5 stars:

```text
ratingScore = (rating × reviewCount + 3.5 × 5) / (reviewCount + 5) / 5
utility = 0.70 × mean(ratingScore) + 0.30 × travelUtility
```

Only confidently matched Google ratings are shown. Unmatched venues are neutral in the rating term. The nearest-next baseline uses the same matrix and strategy score as the selected plan.

## Security and operational limits

- Request bodies, search radius, categories, candidate lists, matrix nodes, and request rates are bounded.
- Google usage has per-IP and per-browser-session daily caps; `GOOGLE_DAILY_REQUEST_LIMIT` sets the cap. Google and ORS provider calls are throttled and have circuit breakers.
- CSP, HSTS in production, `X-Content-Type-Options`, and `Referrer-Policy` headers are set by the app. `TRUST_PROXY` should only be configured for a proxy you control.
- `/api/health` reports request/error counts, average latency, provider-limit events, and provider cooldown state.
- Redis is optional for a single instance and recommended for multi-process deployments.
- Waywise has no database or user-history storage, so no SQL queries or application data backups currently exist. See [SECURITY.md](SECURITY.md) for key rotation and incident procedures.

## Verify

```bash
npm test
npm run build
npm audit --omit=dev
```

Tests mock provider requests; they do not spend live API quota. Live provider coverage varies by location and time.
