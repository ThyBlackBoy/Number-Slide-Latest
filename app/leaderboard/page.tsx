'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import { Trophy, Calendar, Crown } from 'lucide-react';

type Tab = 'daily' | 'alltime';

function lagosDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

function nameOf(row: any): string {
  const p = row.profiles;
  if (Array.isArray(p)) return p[0]?.username || 'Player';
  return p?.username || 'Player';
}

function levelOf(row: any): number {
  const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return Math.max(1, Number(p?.level) || 1);
}

function bestRows(rows: any[]) {
  const map = new Map<string, any>();
  rows.forEach((row) => {
    const key = row.user_id || nameOf(row);
    const prev = map.get(key);
    if (!prev || row.score > prev.score) map.set(key, row);
  });
  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('daily');
  const [scores, setScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [me, setMe] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const today = lagosDate();
      const { data: auth } = await supabase.auth.getUser();
      if (!stopped) setMe(auth.user?.id || null);
      const since = new Date(`${today}T00:00:00+01:00`).toISOString();
      const until = new Date(`${today}T23:59:59.999+01:00`).toISOString();
      setLabel(tab === 'daily'
        ? `Today ${today} · updates while people play · resets at midnight, Lagos`
        : 'All time · best score kept for each player');
      const [people, daily] = await Promise.all([
        supabase.from('profiles').select('id, username, level, scores(score, max_tile, mode, created_at)').order('score', { referencedTable: 'scores', ascending: false }).limit(1, { referencedTable: 'scores' }),
        supabase.from('daily_scores').select('user_id, score, max_tile, challenge_date'),
      ]);
      if (stopped) return;
      if (people.error && daily.error) setError('The leaderboard could not load. Pull to refresh.');
      else setError('');
      const roster = new Map<string, { username: string; level: number }>();
      const rows: any[] = [];
      for (const person of people.data || []) {
        roster.set(person.id, { username: person.username, level: person.level });
        const best = Array.isArray(person.scores) ? person.scores[0] : null;
        if (!best || !(Number(best.score) > 0)) continue;
        const created = best.created_at ? new Date(best.created_at).toISOString() : '';
        if (tab === 'alltime' || (created >= since && created <= until)) {
          rows.push({
            user_id: person.id,
            score: best.score,
            max_tile: best.max_tile,
            mode: best.mode,
            profiles: { username: person.username, level: person.level },
          });
        }
      }
      for (const row of daily.data || []) {
        if (tab === 'daily' && row.challenge_date !== today) continue;
        const person = roster.get(row.user_id);
        rows.push({
          user_id: row.user_id,
          score: row.score,
          max_tile: row.max_tile,
          mode: tab === 'daily' ? 'today' : 'daily',
          profiles: { username: person?.username || 'Player', level: person?.level || 1 },
        });
      }
      setScores(bestRows(rows));
      setLoading(false);
    };
    setLoading(true);
    load();
    const timer = window.setInterval(load, 8000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [tab, supabase]);

  const tabs = [
    { id: 'daily' as Tab, label: 'Daily Top', icon: Calendar },
    { id: 'alltime' as Tab, label: 'All-Time', icon: Crown },
  ];

  return (
    <div className="ns-stage min-h-screen p-4">
      <div className="max-w-md mx-auto">
        <Link href="/" className="text-[#4a3728] text-sm font-semibold">← Back to Game</Link>
        <div className="mt-4 mb-2 flex items-end justify-between gap-3">
          <h1 className="text-3xl font-extrabold text-[#3d2b1f] flex items-center gap-2">
            <Trophy className="text-amber-500" /> Leaderboard
          </h1>
          <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-[#6b5344] shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
          </span>
        </div>
        <p className="text-sm text-[#6b5344] mb-5">{label}</p>
        <div className="flex bg-white/75 rounded-full p-1 mb-6 shadow">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-semibold transition ${tab === t.id ? 'bg-[#4a3728] text-white shadow' : 'text-[#4a3728]'}`}>
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="bg-white/95 rounded-[1.6rem] shadow-[0_16px_40px_rgba(93,64,55,0.16)] overflow-hidden">
          {loading && scores.length === 0 ? (
            <div className="p-8 text-center text-[#8a6f5c]">Loading...</div>
          ) : error ? (
            <div className="p-8 text-center text-[#8a6f5c]">{error}</div>
          ) : scores.length === 0 ? (
            <div className="p-8 text-center text-[#8a6f5c]">No scores yet. Sign in, play, and your score shows up here while you play.</div>
          ) : (
            <div className="divide-y divide-[#f3e6dc]">
              {scores.map((s, i) => {
                const mine = me && s.user_id === me;
                const medal = i === 0 ? 'bg-amber-400 text-[#3d2b1f]' : i === 1 ? 'bg-stone-300 text-stone-700' : i === 2 ? 'bg-orange-400 text-white' : 'bg-[#f6eee8] text-[#7a5b48]';
                return (
                  <div key={`${s.user_id || i}-${s.score}`} className={`flex items-center gap-4 px-4 py-3.5 ${mine ? 'bg-amber-50' : i === 0 ? 'bg-gradient-to-r from-amber-50 to-white' : ''}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-sm shadow-sm ${medal}`}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-[#3d2b1f] truncate">{nameOf(s)}</div>
                        <span className="shrink-0 rounded-full bg-[#f6eee8] px-2 py-0.5 text-[10px] font-bold text-[#7a5b48]">Lv {levelOf(s)}</span>
                        {mine && <span className="shrink-0 rounded-full bg-[#3d2b1f] px-2 py-0.5 text-[10px] font-bold text-amber-200">You</span>}
                      </div>
                      {s.mode && <div className="text-xs text-[#8a6f5c] capitalize">{s.mode}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-[#3d2b1f] tabular-nums">{Number(s.score || 0).toLocaleString()}</div>
                      {s.max_tile > 0 && <div className="text-xs text-[#8a6f5c]">Tile {s.max_tile}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
