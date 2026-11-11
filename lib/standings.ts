import type { SupabaseClient } from '@supabase/supabase-js';
import { lagosDate } from './gameLogic';

export type Standing = {
  todayTop: boolean;
  allTimeTop: boolean;
  todayPlace: number | null;
  allTimePlace: number | null;
};

type ScoreRow = { user_id: string; score: number };

function lagosDayStart(day: string): string {
  return new Date(`${day}T00:00:00+01:00`).toISOString();
}

function bestByUser(rows: ScoreRow[], userId: string, score: number) {
  const best = new Map<string, number>();
  rows.forEach((row) => {
    const prev = best.get(row.user_id) || 0;
    if (row.score > prev) best.set(row.user_id, row.score);
  });
  best.set(userId, Math.max(best.get(userId) || 0, score));
  return best;
}

function placeOf(best: Map<string, number>, userId: string): { place: number; top: boolean } {
  const mine = best.get(userId) || 0;
  let ahead = 0;
  best.forEach((value, id) => {
    if (id !== userId && value > mine) ahead += 1;
  });
  return { place: mine > 0 ? ahead + 1 : 0, top: mine > 0 && ahead === 0 };
}

function topOther(rows: ScoreRow[], userId: string): { userId: string; score: number; username?: string } | null {
  let king: { userId: string; score: number; username?: string } | null = null;
  rows.forEach((row: any) => {
    if (row.user_id === userId) return;
    if (!king || row.score > king.score) {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      king = { userId: row.user_id, score: row.score, username: profile?.username };
    }
  });
  return king;
}

export async function publishStanding(
  supabase: SupabaseClient,
  input: { userId: string; score: number; tile: number; mode: string },
): Promise<{ standing: Standing; saved: boolean; passedToday: { userId: string; username?: string } | null; passedAllTime: { userId: string; username?: string } | null }> {
  const today = lagosDate();
  const since = lagosDayStart(today);
  const empty: Standing = { todayTop: false, allTimeTop: false, todayPlace: null, allTimePlace: null };
  if (input.score <= 0) {
    return { standing: empty, saved: false, passedToday: null, passedAllTime: null };
  }

  const [{ data: myDaily }, { data: myBest }, { data: todayBoard }, { data: allBoard }] = await Promise.all([
    supabase.from('daily_scores').select('score').eq('user_id', input.userId).eq('challenge_date', today).order('score', { ascending: false }).limit(1),
    supabase.from('scores').select('id, score').eq('user_id', input.userId).order('score', { ascending: false }).limit(1),
    supabase.from('daily_scores').select('user_id, score, profiles(username)').eq('challenge_date', today).order('score', { ascending: false }).limit(200),
    supabase.from('scores').select('user_id, score, profiles(username)').order('score', { ascending: false }).limit(200),
  ]);

  const previousDaily = myDaily?.[0]?.score || 0;
  const previousBest = myBest?.[0]?.score || 0;
  const todayKing = topOther((todayBoard || []) as ScoreRow[], input.userId);
  const allKing = topOther((allBoard || []) as ScoreRow[], input.userId);
  let saved = true;

  if (input.score > previousDaily) {
    const patch = previousDaily > 0
      ? await supabase.from('daily_scores').update({
        score: input.score,
        max_tile: input.tile,
      }).eq('user_id', input.userId).eq('challenge_date', today).lt('score', input.score).select('user_id')
      : { error: { message: 'missing' }, data: [] as { user_id: string }[] };
    if (patch.error || !patch.data?.length) {
      const inserted = await supabase.from('daily_scores').insert({
        user_id: input.userId,
        score: input.score,
        max_tile: input.tile,
        challenge_date: today,
      });
      if (inserted.error) saved = false;
    }
  }

  if (input.score > previousBest) {
    const { data: todayRows } = await supabase
      .from('scores')
      .select('id, score')
      .eq('user_id', input.userId)
      .gte('created_at', since)
      .order('score', { ascending: false })
      .limit(1);
    const todayRow = todayRows?.[0];
    const patch = todayRow?.id
      ? await supabase.from('scores').update({
        score: input.score,
        max_tile: input.tile,
        mode: input.mode || 'normal',
      }).eq('id', todayRow.id).select('id')
      : { error: { message: 'missing' }, data: [] as { id: string }[] };
    if (patch.error || !patch.data?.length) {
      const inserted = await supabase.from('scores').insert({
        user_id: input.userId,
        score: input.score,
        mode: input.mode || 'normal',
        max_tile: input.tile,
      });
      if (inserted.error) saved = false;
    }
  }

  const todayPlace = placeOf(bestByUser((todayBoard || []) as ScoreRow[], input.userId, input.score), input.userId);
  const allPlace = placeOf(bestByUser((allBoard || []) as ScoreRow[], input.userId, input.score), input.userId);

  return {
    standing: {
      todayTop: todayPlace.top,
      allTimeTop: allPlace.top,
      todayPlace: todayPlace.place || null,
      allTimePlace: allPlace.place || null,
    },
    saved,
    passedToday: todayKing && input.score > todayKing.score && previousDaily <= todayKing.score
      ? { userId: todayKing.userId, username: todayKing.username }
      : null,
    passedAllTime: allKing && input.score > allKing.score && previousBest <= allKing.score
      ? { userId: allKing.userId, username: allKing.username }
      : null,
  };
}
