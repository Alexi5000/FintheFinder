import { NextResponse } from 'next/server';
import { evalHistoryResponseSchema } from '@/lib/schemas';
import { apiError, parseError } from '@/server/http';
import { getLatestEvalRun, listEvalRuns } from '@/server/evals/history';
import { hasSupabaseConfig } from '@/server/supabase/server';

export async function GET(request: Request) {
  try {
    if (!hasSupabaseConfig()) {
      return apiError('supabase_not_configured', 'Supabase is required to read persisted eval history.', 503);
    }

    const limit = parseLimit(new URL(request.url).searchParams.get('limit'));
    const suite = parseSuite(new URL(request.url).searchParams.get('suite'));
    const [runs, latest] = await Promise.all([listEvalRuns(limit, suite), getLatestEvalRun(suite)]);
    return NextResponse.json(evalHistoryResponseSchema.parse({ suite, runs, latest }));
  } catch (error) {
    return parseError(error);
  }
}

function parseLimit(value: string | null) {
  if (!value) return 20;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(parsed, 50);
}

function parseSuite(value: string | null) {
  const suite = value?.trim();
  return suite ? suite.slice(0, 80) : 'offline';
}
