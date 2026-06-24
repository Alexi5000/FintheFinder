import { NextResponse } from 'next/server';
import { parseError } from '@/server/http';
import { runOfflineEvalSuite } from '@/server/evals/eval-suite';

export async function GET() {
  try {
    return NextResponse.json({ mode: 'offline', ...runOfflineEvalSuite() });
  } catch (error) {
    return parseError(error);
  }
}
