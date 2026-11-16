import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { safeAuthDestination } from '@/lib/accountSecurity';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const destination = safeAuthDestination(request.nextUrl.searchParams.get('next'));
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set('Cache-Control', 'no-store');
  if (code) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: cookies => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
  }
  // Never reflect tokens or provider error messages into the redirect.
  return NextResponse.redirect(new URL('/auth/login?verification=failed', request.url), { headers: { 'Cache-Control': 'no-store' } });
}
