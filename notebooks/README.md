# Notebook Authoring

Notebooks in this directory are authoring artifacts for eval design, benchmark notes, and exploratory analysis. They are not imported by runtime code and must pass `npm run notebooks:check`.

Rules:

- Do not store secrets, live customer data, bearer tokens, API keys, private keys, or long confidential source excerpts.
- Do not mark a notebook with `metadata.finRuntime = true`.
- Promote production logic into TypeScript modules with tests.

`npm run notebooks:check` scans notebook cells and metadata for secret-like keys and token-shaped values in addition to validating that notebooks stay authoring-only.
