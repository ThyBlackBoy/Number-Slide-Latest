'use client';

import { useEffect, useState, type ChangeEvent, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getRank, STATES } from '@/lib/levels';
import { Camera, Bell, Pencil, X, LogOut, MessageCircle } from 'lucide-react';

const PRESET_AVATARS = ['😎', '🔥', '👑', '🚀', '🦁', '🐉', '⚡', '🎯', '🌟', '💎'];

function tileStyle(value: number): CSSProperties {
  const map: Record<number, { bg: string; color: string }> = {
    2: { bg: '#eee4da', color: '#776e65' },
    4: { bg: '#ede0c8', color: '#776e65' },
    8: { bg: '#f2b179', color: '#ffffff' },
    16: { bg: '#f59563', color: '#ffffff' },
    32: { bg: '#f67c5f', color: '#ffffff' },
    64: { bg: '#f65e3b', color: '#ffffff' },
    128: { bg: '#edcf72', color: '#ffffff' },
    256: { bg: '#edcc61', color: '#ffffff' },
    512: { bg: '#edc850', color: '#ffffff' },
    1024: { bg: '#edc53f', color: '#ffffff' },
    2048: { bg: '#edc22e', color: '#ffffff' },
  };
  const style = map[value] || (value > 2048 ? { bg: '#3c3a32', color: '#f9f6f2' } : { bg: '#cdc1b4', color: '#776e65' });
  return { backgroundColor: style.bg, color: style.color };
}

function readStreak(): number {
  try {
    const raw = localStorage.getItem('ns_streak');
    if (!raw) return 0;
    const saved = JSON.parse(raw) as { count?: number };
    return saved.count || 0;
  } catch {
    return 0;
  }
}

function SettingRow({ label, hint, on, onClick }: { label: string; hint: string; on: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-[#f4ebe4]">
      <div>
        <div className="text-sm font-semibold text-[#3d2b1f]">{label}</div>
        <div className="text-xs text-[#a08070]">{hint}</div>
      </div>
      <button
        onClick={onClick}
        className={`w-12 h-7 rounded-full p-1 shrink-0 transition ${on ? 'bg-[#3d2b1f]' : 'bg-[#e7d9d0]'}`}
        aria-label={label}
      >
        <span className={`block w-5 h-5 rounded-full bg-white shadow transition ${on ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [scores, setScores] = useState<any[]>([]);
  const [best, setBest] = useState(0);
  const [highest, setHighest] = useState(0);
  const [gameCount, setGameCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [animationsOn, setAnimationsOn] = useState(true);
  const [stateName, setStateName] = useState('');
  const [avatar, setAvatar] = useState('😎');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameMsg, setUsernameMsg] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const savedSound = localStorage.getItem('soundOn');
    if (savedSound !== null) setSoundOn(savedSound === 'true');
    setMusicOn(localStorage.getItem('musicOn') === 'true');
    setHapticsOn(localStorage.getItem('hapticsOn') !== 'false');
    setAnimationsOn(localStorage.getItem('animationsOn') !== 'false');
    setStateName(localStorage.getItem('ns_state') || '');
    const savedAvatar = localStorage.getItem('avatar');
    if (savedAvatar) setAvatar(savedAvatar);
    setStreak(readStreak());

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/auth/login');
      setUser(user);

      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(profileData);
      setUsernameInput(profileData?.username || '');
      if (!profileData?.username) setEditingUsername(true);

      const { data: scoreData } = await supabase
        .from('scores')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8);
      setScores(scoreData || []);

      const { data: bestRow } = await supabase
        .from('scores')
        .select('score')
        .eq('user_id', user.id)
        .order('score', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: tileRow } = await supabase
        .from('scores')
        .select('max_tile')
        .eq('user_id', user.id)
        .order('max_tile', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { count } = await supabase
        .from('scores')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setBest(bestRow?.score || 0);
      setHighest(tileRow?.max_tile || 0);
      setGameCount(count || scoreData?.length || 0);

      await loadNotifications(user.id);
      setLoading(false);
    };
    load();
  }, [supabase, router]);

  const loadNotifications = async (userId: string) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications(data || []);
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const saveUsername = async () => {
    const name = usernameInput.trim();
    if (!name) { setUsernameMsg('Username cannot be empty'); return; }
    if (name.length < 3) { setUsernameMsg('At least 3 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) { setUsernameMsg('Only letters, numbers and underscore'); return; }

    setSavingUsername(true);
    setUsernameMsg('');

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', name)
      .neq('id', user.id)
      .maybeSingle();

    if (existing) {
      setUsernameMsg('Username already taken');
      setSavingUsername(false);
      return;
    }

    const { error } = await supabase.from('profiles').update({ username: name }).eq('id', user.id);

    if (error) {
      setUsernameMsg('Could not save. Try again.');
    } else {
      setProfile((p: any) => ({ ...p, username: name }));
      setEditingUsername(false);
      setUsernameMsg('');
    }
    setSavingUsername(false);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem('soundOn', String(next));
  };

  const toggleMusic = () => {
    const next = !musicOn;
    setMusicOn(next);
    localStorage.setItem('musicOn', String(next));
  };

  const toggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    localStorage.setItem('hapticsOn', String(next));
  };

  const toggleAnimations = () => {
    const next = !animationsOn;
    setAnimationsOn(next);
    localStorage.setItem('animationsOn', String(next));
  };

  const selectAvatar = (emoji: string) => {
    setAvatar(emoji);
    localStorage.setItem('avatar', emoji);
  };

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAvatar(result);
      localStorage.setItem('avatar', result);
    };
    reader.readAsDataURL(file);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const copyChallenge = async () => {
    const name = profile?.username || 'player';
    const origin = window.location.origin;
    const title = getRank(highest);
    const text = `Number Slide\n${name} is ${title.name}${stateName ? ` · ${stateName}` : ''}\nFit you beat ${best.toLocaleString()}?\n${origin}/?beat=${best}&from=${encodeURIComponent(name)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setUsernameMsg('Could not copy. Try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f8d5c8] to-[#e8b4a8] text-[#6b5344]">
        Loading profile
      </div>
    );
  }

  const level = profile?.level || 1;
  const rank = getRank(highest);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] via-[#f4c7b8] to-[#e8b4a8] px-4 py-6">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="text-[#3d2b1f] text-sm font-semibold">
            ← Back to Game
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/messages" className="w-11 h-11 rounded-full bg-white/80 shadow flex items-center justify-center">
              <MessageCircle size={18} className="text-[#4a3728]" />
            </Link>
            <button
              onClick={() => {
                setShowNotifs(!showNotifs);
                if (!showNotifs) markAllRead();
              }}
              className="relative w-11 h-11 rounded-full bg-white/80 shadow flex items-center justify-center"
            >
              <Bell size={18} className="text-[#4a3728]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] min-w-5 h-5 px-1 rounded-full flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {showNotifs && (
          <div className="mb-4 bg-white rounded-3xl shadow-xl overflow-hidden max-h-80 overflow-y-auto">
            <div className="px-5 py-3 border-b border-[#f0e4da] font-semibold text-[#3d2b1f] flex justify-between items-center">
              <span>Notifications</span>
              <button onClick={() => setShowNotifs(false)} className="text-[#a08070]">
                <X size={18} />
              </button>
            </div>
            {notifications.length === 0 ? (
              <p className="p-5 text-sm text-[#8a6f5c] text-center">Nothing yet</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`px-5 py-3 border-b border-[#f6eee8] last:border-0 ${!n.read ? 'bg-[#fff6ef]' : ''}`}>
                  <div className="font-medium text-sm text-[#3d2b1f]">{n.title}</div>
                  {n.body && <div className="text-xs text-[#8a6f5c] mt-0.5">{n.body}</div>}
                  <div className="text-[11px] text-[#b08978] mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="bg-white rounded-[28px] shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#e7b09a] to-[#f6d3c4] px-5 py-4 flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#6b4032]/80 font-semibold">Player</p>
            <span className="text-3xl font-black leading-none text-white/80">{highest || 2}</span>
          </div>

          <div className="px-6 pt-5 pb-6">
            <div className="w-24 h-24 rounded-full bg-[#f4c7b8] border-4 border-white shadow-md flex items-center justify-center text-5xl overflow-hidden">
              {avatar.startsWith('data:') ? (
                <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                avatar
              )}
            </div>

            <div className="mt-4">
              {editingUsername ? (
                <div className="space-y-2">
                  <input
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Choose a username"
                    maxLength={20}
                    className="w-full px-4 py-2.5 rounded-2xl border border-[#eadfd6] bg-[#fffaf7] text-[#3d2b1f] font-semibold outline-none"
                  />
                  {usernameMsg && <p className="text-sm text-red-500">{usernameMsg}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={saveUsername}
                      disabled={savingUsername}
                      className="px-4 py-2 bg-[#3d2b1f] text-white rounded-full text-sm font-semibold disabled:opacity-50"
                    >
                      {savingUsername ? 'Saving...' : 'Save'}
                    </button>
                    {profile?.username && (
                      <button
                        onClick={() => {
                          setEditingUsername(false);
                          setUsernameInput(profile.username);
                          setUsernameMsg('');
                        }}
                        className="px-4 py-2 bg-[#f6eee8] text-[#4a3728] rounded-full text-sm font-medium"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-extrabold tracking-tight text-[#3d2b1f]">
                    {profile?.username || 'Set username'}
                  </h1>
                  <button
                    onClick={() => setEditingUsername(true)}
                    className="w-8 h-8 rounded-full bg-[#f6eee8] text-[#4a3728] flex items-center justify-center"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              )}
              <div className="mt-2 inline-flex items-center gap-2 bg-[#f6eee8] text-[#4a3728] px-3 py-1 rounded-full text-xs font-semibold">
                {rank.name}
                <span className="text-[#c4a484]">·</span>
                Level {level}
              </div>
              <p className="mt-1 text-xs text-[#a08070]">{rank.line}</p>
              <label className="mt-3 block">
                <span className="text-[11px] uppercase tracking-[0.16em] text-[#a08070] font-semibold">I rep</span>
                <select
                  value={stateName}
                  onChange={(e) => {
                    setStateName(e.target.value);
                    localStorage.setItem('ns_state', e.target.value);
                  }}
                  className="mt-1 w-full px-4 py-2.5 rounded-2xl border border-[#eadfd6] bg-[#fffaf7] text-[#3d2b1f] font-semibold outline-none"
                >
                  <option value="">Pick your state</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-6 flex items-center gap-4">
              <div
                style={tileStyle(highest)}
                className="w-[4.5rem] h-[4.5rem] rounded-2xl shadow-inner flex items-center justify-center text-2xl font-extrabold"
              >
                {highest || ''}
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div className="bg-[#3d2b1f] text-white rounded-2xl px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Best</div>
                  <div className="text-xl font-extrabold tabular-nums">{best.toLocaleString()}</div>
                </div>
                <div className="bg-[#fff6ef] text-[#3d2b1f] rounded-2xl px-3 py-2.5 border border-[#f0e0d4]">
                  <div className="text-[10px] uppercase tracking-wider text-[#a08070]">Streak</div>
                  <div className="text-xl font-extrabold tabular-nums">{streak}</div>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-[#a08070]">{gameCount} game{gameCount === 1 ? '' : 's'} played</p>

            <button
              onClick={copyChallenge}
              disabled={best <= 0}
              className="mt-4 w-full bg-amber-400 text-[#3d2b1f] py-3.5 rounded-2xl font-semibold disabled:opacity-40"
            >
              {copied ? 'Copied. Send it.' : 'Challenge a friend'}
            </button>

            <div className="mt-8">
              <h2 className="text-xs uppercase tracking-[0.16em] text-[#a08070] font-semibold mb-3">Look</h2>
              <div className="flex flex-wrap gap-2">
                {PRESET_AVATARS.map((e) => (
                  <button
                    key={e}
                    onClick={() => selectAvatar(e)}
                    className={`w-12 h-12 rounded-full text-2xl flex items-center justify-center transition ${
                      avatar === e ? 'bg-[#f4c7b8] ring-2 ring-[#3d2b1f]' : 'bg-[#f6eee8]'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <label className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#4a3728] cursor-pointer">
                <Camera size={16} />
                <span>Upload your own photo</span>
                <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              </label>
            </div>

            <div className="mt-8">
              <h2 className="text-xs uppercase tracking-[0.16em] text-[#a08070] font-semibold mb-2">Recent</h2>
              {scores.length === 0 ? (
                <p className="text-sm text-[#8a6f5c]">No games yet.</p>
              ) : (
                <div>
                  {scores.slice(0, 6).map((s) => (
                    <div key={s.id} className="flex items-center gap-3 py-2.5 border-b border-[#f4ebe4] last:border-0">
                      <div
                        style={tileStyle(s.max_tile || 0)}
                        className="w-10 h-10 rounded-xl text-xs font-extrabold flex items-center justify-center shrink-0"
                      >
                        {s.max_tile || '·'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[#3d2b1f] capitalize">{s.mode || 'Game'}</div>
                        <div className="text-[11px] text-[#a08070]">
                          {s.created_at ? new Date(s.created_at).toLocaleDateString() : ''}
                        </div>
                      </div>
                      <div className="font-extrabold text-[#3d2b1f] tabular-nums">{s.score.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 pt-2 border-t border-[#f0e4da]">
              <h2 className="text-xs uppercase tracking-[0.16em] text-[#a08070] font-semibold mb-2 mt-4">Settings</h2>
              <SettingRow label="Sound effects" hint="Tiles and merges" on={soundOn} onClick={toggleSound} />
              <SettingRow label="Music" hint="Quiet background while you play" on={musicOn} onClick={toggleMusic} />
              <SettingRow label="Vibration" hint="A small buzz when tiles merge" on={hapticsOn} onClick={toggleHaptics} />
              <SettingRow label="Animations" hint="The flip when numbers combine" on={animationsOn} onClick={toggleAnimations} />
              <div className="flex items-center justify-between py-3 border-b border-[#f4ebe4]">
                <div>
                  <div className="text-sm font-medium text-[#3d2b1f]">Account</div>
                  <div className="text-xs text-[#a08070] truncate max-w-[220px]">{user?.email}</div>
                </div>
              </div>
              <button
                onClick={signOut}
                className="mt-4 w-full text-sm font-semibold text-red-600 flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-50"
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}