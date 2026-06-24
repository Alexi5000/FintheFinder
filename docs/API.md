# API

All API responses are JSON unless noted. Authenticated endpoints require:

```text
Authorization: Bearer <supabase_access_token>
```

## Sessions

### `POST /api/research/sessions`

Creates a research session.

Request:

```json
{ "query": "Research AI agent evaluation systems" }
```

Response:

```json
{ "session": { "id": "...", "status": "draft", "phase": "intake" } }
```

### `GET /api/research/sessions`

Lists sessions for the authenticated user.

### `GET /api/research/sessions/:id`

Returns session detail with current run, sources, evaluations, learnings, events, and report.

### `POST /api/research/sessions/:id/run`

Queues a worker-owned research run for an owned session. This endpoint returns before long-running model/search work starts.

Response:

```json
{ "runId": "...", "status": "queued", "run": { "id": "...", "metadata": { "stage": "research" } } }
```

### `GET /api/research/runs/:id`

Returns run status and run-linked events for an owned run.

### `GET /api/research/sessions/:id/claims`

Returns persisted claims and claim gaps for an owned session.

### `POST /api/research/sessions/:id/approval`

Records approval, rejection, or follow-up request.

Request:

```json
{
  "action": "approve",
  "notes": "Sources look good.",
  "approvedSourceIds": ["src_abc"],
  "waivedGapIds": []
}
```

An approval queues a reporting-stage run and returns `202 { "runId": "...", "status": "queued" }`.

### `GET /api/research/sessions/:id/events`

Returns server-sent event formatted run events.

## Reports

### `GET /api/reports/:id/export.md`

Exports the session report as markdown.

## Errors

Errors use a consistent envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request payload is invalid.",
    "details": {}
  }
}
```
