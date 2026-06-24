import { NextResponse } from 'next/server';
import { getProviderStatus } from '@/lib/config';

export async function GET() {
  const status = getProviderStatus();
  return NextResponse.json({
    ok: true,
    service: 'fin-the-finder',
    version: '1.0.0',
    providers: {
      openai: status.openai ? 'configured' : 'missing',
      exa: status.exa ? 'configured' : 'missing',
      supabase: status.supabase ? 'configured' : 'missing',
    },
    contracts: {
      version: 1,
    },
  });
}
