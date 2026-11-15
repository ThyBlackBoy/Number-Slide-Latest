import { NextRequest, NextResponse } from 'next/server';

// Bounded per-process coalescing protects cache misses from simultaneous readers.
// Entries contain only the same public rows served to anonymous visitors.
const pages = new Map<string, { expires: number; promise: Promise<unknown> }>();
async function readPage(board: string, offset: number): Promise<unknown> {
  const key = `${board}:${offset}`;
  const existing = pages.get(key);
  if (existing && existing.expires > Date.now()) return existing.promise;
  if (pages.size >= 128) pages.delete(pages.keys().next().value!);
  const entry = { expires: Infinity, promise: Promise.resolve<unknown>(null) };
  entry.promise = Promise.resolve().then(async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/leaderboard_page`, {
        method: 'POST',
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ board, page_offset: offset }),
        next: { revalidate: 10 },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Leaderboard unavailable');
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > 100) throw new Error('Invalid leaderboard');
      entry.expires = Date.now() + 1000;
      return rows;
    } catch (error) {
      if (pages.get(key) === entry) pages.delete(key);
      throw error;
    }
  });
  pages.set(key, entry);
  return entry.promise;
}


export async function GET(request: NextRequest) {
  const board = request.nextUrl.searchParams.get('board') || 'daily';
  const offset = request.nextUrl.searchParams.get('offset') || '0';
  if (!['daily', 'alltime'].includes(board) || !/^\d{1,6}$/.test(offset) || Number(offset) > 100000) {
    return NextResponse.json({ error: 'Invalid leaderboard page' }, { status: 400 });
  }
  try {
    const rows = await readPage(board, Number(offset));
    return NextResponse.json(rows, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' } });
  } catch {
    return NextResponse.json({ error: 'Leaderboard temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
