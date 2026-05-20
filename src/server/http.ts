import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function apiError(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function parseError(error: unknown) {
  if (error instanceof ZodError) {
    return apiError('validation_error', 'The request payload is invalid.', 422, error.flatten());
  }

  if (error instanceof Error) {
    return apiError('internal_error', error.message, 500);
  }

  return apiError('internal_error', 'Unexpected server error.', 500);
}
