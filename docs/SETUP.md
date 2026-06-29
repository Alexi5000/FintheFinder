# Setup

## Prerequisites

- Node.js 20.9 or newer
- npm 11 or newer
- OpenAI API key for live model calls
- Exa API key for web search
- Supabase project for hosted multi-user mode

## Local Install

```bash
npm install
cp .env.example .env
```

Fill `.env` locally. Do not commit secrets.

```bash
OPENAI_API_KEY=""
EXA_API_KEY=""
EXA_SEARCH_TYPE="auto"
EXA_MAX_RESULTS="3"
EXA_HIGHLIGHT_MAX_CHARACTERS="1200"
OPENAI_MODEL_PRIMARY="gpt-5.5"
OPENAI_MODEL_FAST="gpt-5.4-mini"
OPENAI_REASONING_EFFORT="high"

NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
```

## Supabase

Apply all SQL files in `supabase/migrations/` in filename order to the project database. Later migrations add the worker queue, durable run attempts, claims, cost/memory surfaces, approval hardening, and eval-history transaction function.

The app expects Supabase Auth bearer tokens on API requests:

```text
Authorization: Bearer <access_token>
```

## Development

```bash
npm run dev
```

Optional Mastra development server:

```bash
npm run dev:mastra
```

## Production Build

```bash
npm run verify
```

For deployment, build both app surfaces:

```bash
npm run build
```
