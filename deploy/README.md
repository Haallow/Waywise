# Deployment checklist

1. Build the app and run Express from the project directory:

   ```bash
   npm ci
   npm run build
   npm start
   ```

   Or use the included production container and Redis service:

   ```bash
   docker compose -f deploy/docker-compose.yml up -d --build
   ```

   Keep the root `.env` outside the image; Compose injects it at runtime.

2. Put Nginx (or an equivalent proxy) in front of Express using `nginx.conf.example`. Terminate TLS there, configure a trusted certificate, keep the API reachable only on localhost, and set `TRUST_PROXY=1` for the one trusted proxy hop.

3. Configure a shared Redis instance:

   ```text
   REDIS_URL=redis://user:password@redis.internal:6379
   GOOGLE_DAILY_REQUEST_LIMIT=40
   ```

   Redis stores the shared rate-limit counters and successful provider cache entries. If Redis is unavailable, the app falls back to process-local state and should remain single-process until Redis is restored.

4. Restrict provider credentials outside the app. For Google, enable only Places API (New), restrict the key to the server's egress IPs, set quota alerts, and keep billing budgets enabled. For ORS, restrict the key to the required matrix, directions, and POI services and set daily/monthly quotas.

5. Monitor `/api/health` for request count, error count, average latency, and provider cooldown state. Alert on sustained 4xx/5xx responses, provider-limit events, latency increases, Redis connectivity failures, and billing/quota thresholds. Do not log keys, exact coordinates, or complete provider payloads.

6. Back up only data that is intentionally introduced later. Waywise currently has no database or user persistence, so there is no application backup state and no SQL injection surface. If persistence is added, use parameterized queries and a least-privilege database account.

See [../SECURITY.md](../SECURITY.md) for incident response, key rotation, quota exhaustion, Redis outage, and release procedures.
