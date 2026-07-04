# Recorded Live Proof

This folder contains the checked proof bundle for the Fin the Finder v1.0.0 configured-live run.

## What This Proves

- Real provider-backed research ran with OpenAI-compatible model routing and Exa search.
- Supabase stored the session, research run, reporting run, approval, sources, claims, final audit, events, and cost rows.
- The report export, run export, eval summary, media artifact, benchmark row, and manifest all point to the same session lineage.
- `npm run demo:record` passed against the checked artifacts.
- `npm run evals:live` re-fetched Supabase evidence and passed against the checked manifest.

## What This Does Not Prove

- Hosted SaaS uptime.
- Production traffic behavior under multiple users.
- Enterprise compliance certification.
- Quality across every possible research topic.

## Primary Artifacts

- `live-demo.json`: provenance manifest and artifact hashes.
- `artifacts/report.md`: exported cited report.
- `artifacts/run-export.json`: session-level Supabase export.
- `artifacts/eval-summary.json`: live eval output.
- `artifacts/proof-run-terminal.png`: recorded terminal proof media.
- `artifacts/proof-run-terminal.txt`: terminal proof transcript.

## Verify

```bash
npm run demo:record
npm run evals:live
npm run benchmark:check
```

The live eval requires the same Supabase project and configured provider environment used for the proof run. `demo:record` and `benchmark:check` validate the checked local artifact bundle.
