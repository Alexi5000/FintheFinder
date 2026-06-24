# Deploy Notes

## Project

FinTheFinder

## Target Shape

One Docker image supports two commands:

- `npm run start` for the Next.js web/API service.
- `npm run start:worker` for queued research runs.

## Build

```bash
npm run verify
npm run container:build
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

The hosted smoke checks `/api/health` and must not expose secrets.

## Rollback

Rollback should redeploy the previous known-good Git commit or host deployment. Do not roll back by editing secrets or local-only files.

## Owner Notes

Deployment is not portfolio-ready until `docs/DEMO.md` and `docs/BENCHMARK.md` contain a real run ID, exported report, eval result, screenshots or video, and measured cost row.
