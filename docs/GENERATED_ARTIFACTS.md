# Generated Artifact Disclosure

| Artifact | Source | Commit policy |
| --- | --- | --- |
| `assets/fin-hero.png` | Repo-owned generated raster asset | Committed |
| `assets/og-image.png` | Repo-owned generated raster asset | Committed |
| `contracts/schema.json` | Generated from Zod contracts | Committed; regenerate with `npm run contracts:sync` |
| `contracts/schema.sha256` | Generated drift hash | Committed |
| `.mastra/output/*` | Mastra build output | Do not commit |
| `.next/*` | Next.js build output | Do not commit |
| `coverage/*` | Test coverage output | Do not commit |

Generated assets are reviewed as project-owned Apache-2.0 repository artifacts before release.
