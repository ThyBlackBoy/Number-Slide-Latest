'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import { Trophy, Calendar, Clock, Crown } from 'lucide-react';

type Tab = 'daily' | 'weekly' | 'alltime';

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('daily');
  const [scores, setScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      if (tab === 'daily') {
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from('daily_scores')
          .select('score, max_tile, profiles(username)')
          .eq('challenge_date', today)
          .order('score', { ascending: false })
          .limit(50);
        setScores(data || []);
      } else if (tab === 'weekly') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const { data } = await supabase
          .from('scores')
          .select('score, max_tile, mode, profiles(username)')
          .gte('created_at', weekAgo.toISOString())
          .order('score', { ascending: false })
          .limit(50);
        setScores(data || []);
      } else {
        const { data } = await supabase
          .from('scores')
          .select('score, max_tile, mode, profiles(username)')
          .order('score', { ascending: false })
          .limit(50);
        setScores(data || []);
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

        <h1 className="text-3xl font-bold text-[#3d2b1f] mt-4 mb-6 flex items-center gap-2">
          <Trophy className="text-yellow-500" /> Leaderboard
        </h1>

        <div className="flex bg-white/70 rounded-full p-1 mb-6 shadow">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-[#4a3728] text-white shadow'
                  : 'text-[#4a3728]'
              }`}
            >
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
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    i === 0 ? 'bg-yellow-400 text-white' :
                    i === 1 ? 'bg-gray-300 text-gray-700' :
                    i === 2 ? 'bg-orange-400 text-white' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-[#4a3728]">
                      {s.profiles?.username || 'Player'}
                    </div>
                    {s.mode && (
                      <div className="text-xs text-gray-500 capitalize">{s.mode}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-[#4a3728]">{s.score.toLocaleString()}</div>
                    {s.max_tile > 0 && (
                      <div className="text-xs text-gray-500">Tile {s.max_tile}</div>
                    )}
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
