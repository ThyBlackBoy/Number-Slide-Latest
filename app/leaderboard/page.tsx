'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import { Trophy, Calendar, Clock, Crown } from 'lucide-react';

type Tab = 'daily' | 'weekly' | 'alltime';

function lagosDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

function weekStartLagos(): string {
  const [y, m, d] = lagosDate().split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${utc.getUTCFullYear()}-${mm}-${dd}`;
}

function nameOf(row: any): string {
  const p = row.profiles;
  if (Array.isArray(p)) return p[0]?.username || 'Player';
  return p?.username || 'Player';
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
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const today = lagosDate();
      if (tab === 'daily') {
        setLabel(`Today ${today} · daily challenge and normal games · resets at midnight, Lagos`);
        const since = new Date(`${today}T00:00:00+01:00`).toISOString();
        const until = new Date(`${today}T23:59:59.999+01:00`).toISOString();
        const [{ data: normal }, { data: daily }] = await Promise.all([
          supabase.from('scores').select('user_id, score, max_tile, mode, profiles(username)').gte('created_at', since).lte('created_at', until).order('score', { ascending: false }).limit(200),
          supabase.from('daily_scores').select('user_id, score, max_tile, profiles(username)').eq('challenge_date', today).order('score', { ascending: false }).limit(200),
        ]);
        const dailyRows = (daily || []).map((row: any) => ({ ...row, mode: 'daily' }));
        setScores(bestRows([...(normal || []), ...dailyRows]));
      } else if (tab === 'weekly') {
        const start = weekStartLagos();
        setLabel(`This week from ${start} · resets every Monday, Lagos`);
        const since = new Date(`${start}T00:00:00+01:00`).toISOString();
        const [{ data: normal }, { data: daily }] = await Promise.all([
          supabase.from('scores').select('user_id, score, max_tile, mode, profiles(username)').gte('created_at', since).order('score', { ascending: false }).limit(200),
          supabase.from('daily_scores').select('user_id, score, max_tile, profiles(username)').gte('challenge_date', start).order('score', { ascending: false }).limit(200),
        ]);
        const dailyRows = (daily || []).map((row: any) => ({ ...row, mode: 'daily' }));
        setScores(bestRows([...(normal || []), ...dailyRows]));
      } else {
        setLabel('All time');
        const [{ data: normal }, { data: daily }] = await Promise.all([
          supabase.from('scores').select('user_id, score, max_tile, mode, profiles(username)').order('score', { ascending: false }).limit(200),
          supabase.from('daily_scores').select('user_id, score, max_tile, profiles(username)').order('score', { ascending: false }).limit(200),
        ]);
        const dailyRows = (daily || []).map((row: any) => ({ ...row, mode: 'daily' }));
        setScores(bestRows([...(normal || []), ...dailyRows]));
      }
      setLoading(false);
    };
    load();
  }, [tab, supabase]);

  const tabs = [
    { id: 'daily' as Tab, label: 'Daily', icon: Calendar },
    { id: 'weekly' as Tab, label: 'Weekly', icon: Clock },
    { id: 'alltime' as Tab, label: 'All Time', icon: Crown },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] via-[#f4c7b8] to-[#e8b4a8] p-4">
      <div className="max-w-md mx-auto">
        <Link href="/" className="text-[#4a3728] text-sm font-medium">← Back to Game</Link>
        <h1 className="text-3xl font-bold text-[#3d2b1f] mt-4 mb-2 flex items-center gap-2">
          <Trophy className="text-yellow-500" /> Leaderboard
        </h1>
        <p className="text-sm text-[#6b5344] mb-5">{label}</p>
        <div className="flex bg-white/70 rounded-full p-1 mb-6 shadow">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-medium transition ${tab === t.id ? 'bg-[#4a3728] text-white shadow' : 'text-[#4a3728]'}`}>
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : scores.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No scores yet. Be the first!</div>
          ) : (
            <div className="divide-y">
              {scores.map((s, i) => (
                <div key={`${s.user_id || i}-${s.score}`} className="flex items-center gap-4 px-4 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-[#4a3728]">{nameOf(s)}</div>
                    {s.mode && <div className="text-xs text-gray-500 capitalize">{s.mode}</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-[#4a3728]">{Number(s.score || 0).toLocaleString()}</div>
                    {s.max_tile > 0 && <div className="text-xs text-gray-500">Tile {s.max_tile}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
