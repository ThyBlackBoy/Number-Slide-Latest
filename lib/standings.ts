import type { SupabaseClient } from '@supabase/supabase-js';

export type Standing = {
  todayTop: boolean;
  allTimeTop: boolean;
  todayPlace: number | null;
  allTimePlace: number | null;
};

export async function publishStanding(
  supabase: SupabaseClient,
  input: { userId: string; score: number; tile: number; mode: string },
): Promise<{ standing: Standing; saved: boolean; percent: number | null }> {
  const failed = { standing: { todayTop: false, allTimeTop: false, todayPlace: null, allTimePlace: null }, saved: false, percent: null };
  if (!Number.isSafeInteger(input.score) || input.score <= 0 || input.score > 2147483647 ||
      !Number.isSafeInteger(input.tile) || input.tile < 2 || input.tile > 1073741824 || (input.tile & (input.tile - 1)) !== 0) return failed;
  try {
    // The server derives the player and Lagos date; no client-supplied identity or date is trusted.
    const { data, error } = await supabase.rpc('publish_score', {
      new_score: input.score, new_tile: input.tile,
      game_mode: ['easy', 'normal', 'hard'].includes(input.mode) ? input.mode : 'normal',
    });
    if (error || !data?.saved || !data.standing) return failed;
    return { standing: data.standing, saved: true, percent: data.percent ?? null };
  } catch {
    return failed;
  }
}
