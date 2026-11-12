'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import { Trophy, Calendar, Crown, UserPlus } from 'lucide-react';

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
  const [myName, setMyName] = useState('Someone');
  const [links, setLinks] = useState<Record<string, { id: string; status: 'friends' | 'sent' | 'incoming' }>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const supabase = createClient();

  const loadLinks = async (userId: string) => {
    const { data, error } = await supabase
      .from('friendships')
      .select('id, user_id, friend_id, status')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
    if (error || !data) return;
    const next: Record<string, { id: string; status: 'friends' | 'sent' | 'incoming' }> = {};
    (data || []).forEach((row: any) => {
      const otherId = row.user_id === userId ? row.friend_id : row.user_id;
      if (!otherId || row.status === 'rejected') return;
      const status = row.status === 'accepted'
        ? 'friends'
        : row.user_id === userId
          ? 'sent'
          : 'incoming';
      const current = next[otherId];
      if (!current || status === 'friends' || (status === 'incoming' && current.status === 'sent')) {
        next[otherId] = { id: row.id, status };
      }
    });
    setLinks(next);
  };

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const today = lagosDate();
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id || null;
      if (!stopped) setMe(userId);
      if (userId) {
        const { data: profile } = await supabase.from('profiles').select('username').eq('id', userId).single();
        if (!stopped && profile?.username) setMyName(profile.username);
        await loadLinks(userId);
      }
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

  const addPlayer = async (row: any) => {
    if (!me || !row.user_id || row.user_id === me) return;
    const existing = links[row.user_id];
    if (existing?.status === 'friends' || existing?.status === 'sent') return;
    setAdding(row.user_id);
    setNote('');
    if (existing?.status === 'incoming') {
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', existing.id);
      if (error) setNote('Could not add them yet.');
      else {
        await supabase.from('notifications').insert({
          user_id: row.user_id,
          type: 'friend_accepted',
          title: 'Friend Request Accepted',
          body: `${myName} accepted your friend request`,
          from_user_id: me,
        });
        setLinks((prev) => ({ ...prev, [row.user_id]: { id: existing.id, status: 'friends' } }));
        setNote(`You and ${nameOf(row)} are friends.`);
      }
      setAdding(null);
      return;
    }
    const { data, error } = await supabase
      .from('friendships')
      .insert({ user_id: me, friend_id: row.user_id, status: 'pending' })
      .select('id')
      .single();
    if (error) {
      setNote(error.message.includes('unique') ? 'Request already sent.' : 'Could not send the request.');
    } else {
      await supabase.from('notifications').insert({
        user_id: row.user_id,
        type: 'friend_request',
        title: 'New Friend Request',
        body: `${myName} sent you a friend request`,
        from_user_id: me,
      });
      setLinks((prev) => ({ ...prev, [row.user_id]: { id: data?.id || '', status: 'sent' } }));
      setNote(`Request sent to ${nameOf(row)}. You can message them from Friends.`);
    }
    setAdding(null);
  };

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
        <p className={`text-sm text-[#6b5344] ${!me || note ? 'mb-2' : 'mb-5'}`}>{label}</p>
        {!me && (
          <p className="text-sm text-[#6b5344] mb-4">
            <Link href="/auth/login" className="font-semibold underline">Sign in</Link> to add players from this board.
          </p>
        )}
        {note && <p className="text-sm font-semibold text-[#3d2b1f] mb-4">{note}</p>}
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
                    {me && s.user_id && !mine && (
                      <button
                        type="button"
                        onClick={() => addPlayer(s)}
                        disabled={adding === s.user_id || links[s.user_id]?.status === 'friends' || links[s.user_id]?.status === 'sent'}
                        className="shrink-0 min-h-9 inline-flex items-center gap-1 rounded-full bg-[#f6eee8] px-3 text-[11px] font-bold text-[#3d2b1f] disabled:opacity-60"
                      >
                        <UserPlus size={13} />
                        {links[s.user_id]?.status === 'friends'
                          ? 'Friends'
                          : links[s.user_id]?.status === 'sent'
                            ? 'Sent'
                            : links[s.user_id]?.status === 'incoming'
                              ? 'Accept'
                              : adding === s.user_id
                                ? 'Adding'
                                : 'Add'}
                      </button>
                    )}
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
