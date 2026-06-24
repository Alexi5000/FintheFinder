# Notebook Authoring

Notebooks in this directory are authoring artifacts for eval design, benchmark notes, and exploratory analysis. They are not imported by runtime code and must pass `npm run notebooks:check`.

Rules:

- Do not store secrets or live customer data.
- Do not mark a notebook with `metadata.finRuntime = true`.
- Promote production logic into TypeScript modules with tests.
