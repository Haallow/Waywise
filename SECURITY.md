# Waywise security runbook

## Credentials

- Keep `GOOGLE_PLACES_API_KEY` and `ORS_API_KEY` in the server environment only.
- Restrict the Google key to Places API (New) and the deployment server's egress IPs.
- Restrict the ORS key to matrix, directions, and POI services required by Waywise.
- Set provider quota and billing alerts before enabling Live Mode.
- Rotate a key immediately if it appears in a log, terminal transcript, image, crash report, or source file. Restart all application instances after rotation and revoke the old key only after the replacement is confirmed.

## Quota or abuse incident

1. Disable the affected provider key or set its quota to zero.
2. Set `GOOGLE_DAILY_REQUEST_LIMIT` to a low emergency value and keep the app in Demo Mode.
3. Inspect `/api/health` for error, latency, provider-limit, and cooldown changes; do not collect exact user coordinates in logs.
4. Review reverse-proxy access logs for request volume and source IPs, then block abusive sources at the proxy or firewall.
5. Rotate the provider key if unauthorized use is possible, document the UTC time and action, and restore the normal quota only after the cause is understood.

## Redis or provider outage

Redis failure causes a safe process-local fallback. Keep the deployment single-process until Redis is healthy again; do not scale horizontally while shared counters are unavailable. Provider timeouts and quota errors trigger bounded cooldowns and the app falls back to its disclosed OSM/distance-only behavior where possible.

## Data and SQL policy

Waywise currently has no database and stores no user account or itinerary history. If persistence is added, use parameterized queries exclusively, validate sort/filter fields against allowlists, grant the application only the minimum database permissions, encrypt backups, and test restore procedures before launch.

## Release checks

Run `npm ci`, `npm audit --omit=dev`, `npm test`, `npm run build`, and `git diff --check`. Review provider scopes, `.env` handling, Docker secrets, proxy TLS settings, and the health endpoint before each release. Never run commands that print the contents of `.env` in shared CI logs.
