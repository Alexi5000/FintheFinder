# Deploy Notes

## Project

FinTheFinder

## Target Shape

One Docker image supports two commands:

- `npm run start` for the Next.js web/API service.
- `npm run start:worker` for queued research runs.

The runtime image runs as the non-root `node` user. The image healthcheck validates the web `/api/health` contract, while compose gives the worker a role-specific healthcheck and restart policy. The worker healthcheck validates worker timing, worker ID, and Supabase service-role configuration without claiming queue work.

## Build

```bash
npm run verify
npm run container:build
```

Local compose:

```bash
docker compose up web worker
```

## Environment

Use `.env.example` as the key inventory. Fill real values in the host or local `.env` file only.

## Smoke Verification

Local repository smoke:

```bash
npm run smoke
```

Hosted smoke:

```bash
SMOKE_URL="https://your-host.example" npm run smoke
```

The hosted smoke parses `/api/health`, requires provider states to be only `configured` or `missing`, checks the health contract version, and fails if the payload exposes secret-looking keys, bearer tokens, or JWT-like values.
CI runs the same hosted smoke against `next start` after the production build.

## Rollback

Rollback should redeploy the previous known-good Git commit or host deployment. Do not roll back by editing secrets or local-only files.

## Owner Notes

Deployment is not portfolio-ready until `docs/DEMO.md` and `docs/BENCHMARK.md` contain a real run ID, exported report, eval result, screenshots or video, and measured cost row.
