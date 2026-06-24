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

Returns session detail with current run, current run cost, current post-mortem, sources, evaluations, learnings, events, approvals, and report.

### `POST /api/research/sessions/:id/run`

Queues a worker-owned research run for an owned session. This endpoint returns before long-running model/search work starts.

Response:

```json
{ "runId": "...", "status": "queued", "run": { "id": "...", "metadata": { "stage": "research" } } }
```

### `GET /api/research/runs/:id`

Returns run status, run-linked events, cost, and post-mortem for an owned run.

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

An approval queues a reporting-stage run and returns `202 { "runId": "...", "status": "queued" }`. Unresolved critical gaps return `409 critical_gaps_unresolved` unless every critical gap is explicitly listed in `waivedGapIds` with reviewer notes.

### `GET /api/research/sessions/:id/approvals`

Returns the human decision history for an owned session.

Response:

```json
{
  "approvals": [
    {
      "id": "approval_abc",
      "sessionId": "session_abc",
      "userId": "user_abc",
      "action": "approve",
      "notes": "Sources look good.",
      "approvedSourceIds": ["src_abc"],
      "waivedGapIds": [],
      "createdAt": "2026-06-24T00:00:00.000Z"
    }
  ]
}
```

### `GET /api/research/sessions/:id/events`

Returns server-sent event formatted run events.

### `GET /api/research/memory`

Returns user-scoped memories. Pass `?sessionId=...` to include session-scoped memory for an owned session.

### `POST /api/research/memory`

Writes explicit user or session memory.

Request:

```json
{
  "sessionId": "optional-for-session-scope",
  "scope": "session",
  "namespace": "procedure",
  "key": "operator-note:1",
  "value": { "note": "Prefer primary sources." }
}
```

### `GET /api/research/evals`

Returns the deterministic offline eval regression summary used by CI. This is intentionally separate from configured live-demo proof.

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
