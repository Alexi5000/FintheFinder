# Agent Evals

Fin should be evaluated like a research system, not only like a web app.

## Evaluation Dimensions

| Dimension | What Good Looks Like |
| --- | --- |
| Source quality | Finds primary, recent, authoritative, and diverse sources |
| Relevance | Filters generic or tangential sources |
| Evidence extraction | Produces specific claims with source-backed evidence |
| Contradictions | Flags conflicting findings and uncertainty |
| Citation coverage | Every material report section maps to source IDs |
| Report quality | Executive summary is clear, nuanced, and actionable |

## Fixture Set

Add fixtures under `tests/fixtures/evals/` with:

- Prompt
- Expected source characteristics
- Required caveats
- Minimum citation coverage
- Report acceptance rubric

## Release Rule

Any model, prompt, or agent-role change should run against the fixture set before release. Failed evals should block promotion unless the rubric is intentionally updated.
