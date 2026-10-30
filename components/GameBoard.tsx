'use client';

import { useEffect, useState, useCallback, useRef, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase';
import {
  GameState,
  initializeGame,
  playMove,
  applySwap,
  applyDelete,
  applyBomb,
  canMove,
  legalMoveCount,
  maxTile,
  todaySeed,
  lagosDate,
  Grid,
  Dir,
  boardSizeFor,
} from '@/lib/gameLogic';
import { getTargetScore, getLevelTitle } from '@/lib/levels';
import { Undo2, RotateCcw, Volume2, VolumeX, Calendar, Swords, Users } from 'lucide-react';
import Link from 'next/link';

interface HistoryItem {
  grid: Grid;
  score: number;
  undosLeft: number;
  swapsLeft: number;
  deletesLeft: number;
  bombsLeft: number;
  maxTileSeen: number;
  rngState: number;
}

type Mode = 'easy' | 'normal' | 'hard' | 'classic' | 'daily' | 'pvp' | 'duel';
type Screen = 'home' | 'pvp-lobby' | 'playing';
type Tool = 'swap' | 'delete' | 'bomb' | null;

const MODE_CONFIG = {
  classic: { label: 'Classic', emoji: '🎮', desc: '4×4 · no power-ups' },
  easy: { label: 'Easy', emoji: '😊', desc: '4×4' },
  normal: { label: 'Normal', emoji: '😎', desc: '6×6' },
  hard: { label: 'Hard', emoji: '🔥', desc: '8×8' },
  daily: { label: 'Daily Challenge', emoji: '📅', desc: 'Same board for everyone today' },
  pvp: { label: 'Vs Player', emoji: '⚔️', desc: 'Timed 1v1 match' },
  duel: { label: 'Beat Score', emoji: '🎯', desc: '60 seconds' },
};

function getTileStyle(value: number | null): CSSProperties {
  if (!value) return { backgroundColor: '#cdc1b4', color: 'transparent' };
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
  const style = map[value] || { bg: '#3c3a32', color: '#ffffff' };
  return { backgroundColor: style.bg, color: style.color };
}

function readStreak(): number {
  try {
    const raw = localStorage.getItem('ns_streak');
    if (!raw) return 0;
    const saved = JSON.parse(raw) as { date: string; count: number };
    return saved.date === lagosDate() || saved.date === lagosDate(new Date(Date.now() - 86400000))
      ? saved.count
      : 0;
  } catch {
    return 0;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function touchStreak(): number {
  const today = lagosDate();
  const yesterday = lagosDate(new Date(Date.now() - 86400000));
  let count = 1;
  try {
    const raw = localStorage.getItem('ns_streak');
    if (raw) {
      const saved = JSON.parse(raw) as { date: string; count: number };
      if (saved.date === today) count = saved.count;
      else if (saved.date === yesterday) count = saved.count + 1;
    }
  } catch {
    count = 1;
  }
  localStorage.setItem('ns_streak', JSON.stringify({ date: today, count }));
  return count;
}

export default function GameBoard() {
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const [state, setState] = useState<GameState>(() => initializeGame('easy'));
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState('player');
  const [soundOn, setSoundOn] = useState(true);
  const [combo, setCombo] = useState(0);
  const [justMerged, setJustMerged] = useState<Set<number>>(new Set());
  const [bigMergeFlash, setBigMergeFlash] = useState(false);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [match, setMatch] = useState<any>(null);
  const [openMatches, setOpenMatches] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [pvpResult, setPvpResult] = useState<'win' | 'lose' | 'draw' | null>(null);
  const [opponentScore, setOpponentScore] = useState<number>(0);
  const [opponentName, setOpponentName] = useState<string>('Opponent');
  const [loadingLobby, setLoadingLobby] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [swapFirst, setSwapFirst] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [streak, setStreak] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const [beatOf, setBeatOf] = useState(0);
  const [dailyPlace, setDailyPlace] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ score: number; from: string } | null>(null);
  const [keepGoing, setKeepGoing] = useState(false);
  const [playedToday, setPlayedToday] = useState(true);
  const [throne, setThrone] = useState<{ name: string; score: number; mine: boolean; behind: number } | null>(null);
  const [mark, setMark] = useState<{ name: string; score: number; board: 'daily' | 'normal' } | null>(null);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [nudge, setNudge] = useState<Dir | null>(null);
  const [pausedRun, setPausedRun] = useState<{ mode: Mode; state: GameState } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scoreRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const savedRun = useRef(false);
  const supabase = createClient();

  const targetScore = getTargetScore(playerLevel);
  const isDaily = selectedMode === 'daily';
  const isPvp = selectedMode === 'pvp';
  const isDuel = selectedMode === 'duel';
  const timed = isPvp || isDuel;
  const movesLeft = legalMoveCount(state.grid);
  const danger = screen === 'playing' && !state.gameOver && (movesLeft <= 1 || state.grid.flat().filter((v) => v === null).length <= 2);

  useEffect(() => {
    scoreRef.current = state.score;
  }, [state.score]);

  // --------------------------------------------------------------------------
  // SUPABASE REALTIME BROADCAST FOR PVP MATCHES
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isPvp || !match?.id || screen !== 'playing') return;

    const channel = supabase.channel(`pvp_match_${match.id}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'score' }, ({ payload }) => {
        if (typeof payload.score === 'number') setOpponentScore(payload.score);
        if (payload.username) setOpponentName(payload.username);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isPvp, match?.id, screen, supabase]);

  useEffect(() => {
    if (!isPvp || !match?.id || screen !== 'playing') return;

    const channel = supabase.channel(`pvp_match_${match.id}`);
    channel.send({
      type: 'broadcast',
      event: 'score',
      payload: { score: state.score, username },
    });
  }, [state.score, isPvp, match?.id, screen, username, supabase]);

  useEffect(() => {
    if (screen !== 'playing' || localStorage.getItem('musicOn') !== 'true') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0.02;
    master.connect(ctx.destination);
    const notes = [174.61, 220, 261.63, 329.63, 261.63, 220];
    let step = 0;
    let stopped = false;
    const play = () => {
      if (stopped) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[step % notes.length];
      step += 1;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.45);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.8);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + 1.9);
    };
    play();
    const timer = window.setInterval(play, 1600);
    ctx.resume();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      ctx.close();
    };
  }, [screen]);

  useEffect(() => {
    const saved = localStorage.getItem('soundOn');
    if (saved !== null) setSoundOn(saved === 'true');
    setStreak(readStreak());
    setPlayedToday(localStorage.getItem('ns_daily_date') === lagosDate());
    const best = Number(localStorage.getItem('ns_best') || 0);
    if (best) setBestScore(best);
    try {
      const raw = localStorage.getItem('ns_active_run');
      if (raw) {
        const saved = JSON.parse(raw) as { mode: Mode; state: GameState };
        if (saved?.state?.grid && !saved.state.gameOver) setPausedRun(saved);
      }
    } catch { /* ignore broken save */ }

    const params = new URLSearchParams(window.location.search);
    const beat = Number(params.get('beat') || 0);
    const from = (params.get('from') || 'a player').slice(0, 20);
    if (beat > 0) setChallenge({ score: beat, from });
    const pass = Number(params.get('pass') || 0);
    if (pass > 0) {
      setMark({
        name: from,
        score: pass,
        board: params.get('board') === 'normal' ? 'normal' : 'daily',
      });
    }

    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data } = await supabase.from('profiles').select('level, username').eq('id', user.id).single();
        if (data?.level) setPlayerLevel(data.level);
        if (data?.username) setUsername(data.username);
      }
    };
    loadUser();

    const loadThrone = async () => {
      const today = lagosDate();
      const { data: { user: me } } = await supabase.auth.getUser();
      const { data: rows } = await supabase
        .from('daily_scores')
        .select('user_id, score, profiles(username)')
        .eq('challenge_date', today)
        .order('score', { ascending: false })
        .limit(8);
      const list = rows || [];
      if (!list.length) {
        setThrone(null);
        return;
      }
      const label = (row: any) => {
        const p = row.profiles;
        if (Array.isArray(p)) return p[0]?.username || 'Player';
        return p?.username || 'Player';
      };
      const top = list[0];
      const second = list[1];
      const mine = !!me && top.user_id === me.id;
      setThrone({
        name: label(top),
        score: top.score,
        mine,
        behind: mine && second ? top.score - second.score : mine ? 0 : top.score,
      });
    };
    loadThrone();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  // Pull logic: Separate Alerts from Unread Messages
  useEffect(() => {
    if (!user) return;
    const pull = async () => {
      // 1. Fetch unread general alerts (excluding chat messages)
      const { data: alerts } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('read', false)
        .neq('type', 'message')
        .order('created_at', { ascending: false })
        .limit(20);

      // 2. Fetch count of unread chat message notifications
      const { count: chatCount } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('type', 'message')
        .eq('read', false);

      setNotifs(alerts || []);
      setUnreadChatCount(chatCount || 0);
    };

    pull();
    const timer = window.setInterval(pull, 5000);
    return () => window.clearInterval(timer);
  }, [user, supabase]);

  useEffect(() => {
    if (!timed || screen !== 'playing') return;
    if (isPvp && !match?.started_at) return;
    const endTime = isPvp
      ? new Date(match.started_at).getTime() + (match.time_limit || 60) * 1000
      : Date.now() + 60000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        if (isPvp) endPvpMatch();
        else finishDuel();
      }
    };
    tick();
    timerRef.current = setInterval(tick, 250);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timed, isPvp, screen, match?.started_at]);

  const showToast = (text: string) => {
    if (!text) return;
    setToast(text);
    window.setTimeout(() => setToast(''), 1700);
  };

  const playTone = (freq: number, duration = 0.08, volume = 0.08) => {
    if (!soundOn) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      /* ignore autoplay blocks */
    }
  };

  const playDanger = () => {
    playTone(140, 0.12, 0.05);
  };

  const playBigMerge = (tileValue: number) => {
    if (tileValue >= 2048) {
      playTone(880, 0.25, 0.18);
      setTimeout(() => playTone(1174, 0.2, 0.14), 80);
    } else if (tileValue >= 1024) {
      playTone(740, 0.2, 0.16);
      setTimeout(() => playTone(988, 0.15, 0.12), 60);
    } else if (tileValue >= 512) {
      playTone(660, 0.18, 0.14);
    } else if (tileValue >= 256) {
      playTone(587, 0.15, 0.12);
    } else if (tileValue >= 128) {
      playTone(523, 0.12, 0.1);
    }
    setBigMergeFlash(true);
    setTimeout(() => setBigMergeFlash(false), 280);
  };

  const rememberBest = (score: number) => {
    setBestScore((prev) => {
      const next = Math.max(prev, score, Number(localStorage.getItem('ns_best') || 0));
      localStorage.setItem('ns_best', String(next));
      return next;
    });
  };

  const saveScore = async (score: number, tile: number) => {
    if (score <= 0 || isPvp) return;
    if (!user) {
      showToast('Sign in so the score can be saved');
      return;
    }
    if (!(isDaily || isDuel)) {
      const { error: scoreError } = await supabase.from('scores').insert({
        user_id: user.id,
        score,
        mode: selectedMode || 'normal',
        max_tile: tile,
      });
      if (scoreError) showToast('Score did not save');
    }
    if (isDaily || isDuel) {
      const today = lagosDate();
      const { data: kings } = await supabase
        .from('daily_scores')
        .select('user_id, score, profiles(username)')
        .eq('challenge_date', today)
        .order('score', { ascending: false })
        .limit(5);
      const king: any = (kings || []).find((row: any) => row.user_id !== user.id);
      const { data: mineRow } = await supabase
        .from('daily_scores')
        .select('score')
        .eq('user_id', user.id)
        .eq('challenge_date', today)
        .maybeSingle();
      if (!mineRow || score > mineRow.score) {
        const { error: dailyError } = await supabase.from('daily_scores').upsert({
          user_id: user.id,
          score,
          max_tile: tile,
          challenge_date: today,
        }, { onConflict: 'user_id,challenge_date' });
        if (dailyError) showToast('Daily score did not save');
        if (king && score > king.score) {
          const kingName = Array.isArray(king.profiles) ? king.profiles[0]?.username : king.profiles?.username;
          await supabase.from('notifications').insert({
            user_id: king.user_id,
            type: 'throne',
            title: 'Somebody pass you',
            body: `${username} just scored ${score.toLocaleString()} and took today's top from ${kingName || 'you'}. Come take it back.`,
            from_user_id: user.id,
          });
          showToast('You took today\'s top');
        }
      }
      const { count: behind } = await supabase
        .from('daily_scores')
        .select('*', { count: 'exact', head: true })
        .eq('challenge_date', today)
        .lt('score', score);
      const { count: total } = await supabase
        .from('daily_scores')
        .select('*', { count: 'exact', head: true })
        .eq('challenge_date', today);
      if (total && total > 0) {
        setBeatOf(Math.round(((behind || 0) / total) * 100));
        setDailyPlace(`Beat ${Math.round(((behind || 0) / total) * 100)}% today`);
      }
    } else {
      const { data: kings } = await supabase
        .from('scores')
        .select('user_id, score, profiles(username)')
        .order('score', { ascending: false })
        .limit(5);
      const king: any = (kings || []).find((row: any) => row.user_id !== user.id);
      if (king && score > king.score) {
        const kingName = Array.isArray(king.profiles) ? king.profiles[0]?.username : king.profiles?.username;
        await supabase.from('notifications').insert({
          user_id: king.user_id,
          type: 'throne',
          title: 'Somebody pass you',
          body: `${username} just scored ${score.toLocaleString()} and took the top from ${kingName || 'you'}. Come take it back.`,
          from_user_id: user.id,
        });
        showToast('You took the top');
      }
    }
  };

  const levelUp = async (newLevel: number, score: number) => {
    setPlayerLevel(newLevel);
    setShowLevelUp(true);
    playTone(660, 0.15);
    if (user) {
      await supabase.from('profiles').update({ level: newLevel, highest_level: newLevel }).eq('id', user.id);
      await supabase.from('level_progress').upsert({ user_id: user.id, level: newLevel - 1, score });
    }
  };

  const snapshot = (current: GameState): HistoryItem => ({
    grid: current.grid.map((row) => [...row]),
    score: current.score,
    undosLeft: current.undosLeft,
    swapsLeft: current.swapsLeft,
    deletesLeft: current.deletesLeft,
    bombsLeft: current.bombsLeft,
    maxTileSeen: current.maxTileSeen,
    rngState: current.rngState,
  });

  const persistRun = (mode: Mode | null, next: GameState) => {
    if (!mode || mode === 'pvp' || next.gameOver) {
      localStorage.removeItem('ns_active_run');
      setPausedRun(null);
      return;
    }
    const pack = { mode, state: next };
    localStorage.setItem('ns_active_run', JSON.stringify(pack));
    setPausedRun(pack);
  };

  const loadOpenMatches = async () => {
    setLoadingLobby(true);
    const { data } = await supabase
      .from('matches')
      .select('*, profiles:creator_id(username)')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(10);
    setOpenMatches(data || []);
    setLoadingLobby(false);
  };

  const findMatch = async () => {
    if (!user) return;
    const { data: open, error } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'waiting')
      .neq('creator_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) {
      showToast('Match search failed. Update the Supabase rules.');
      return;
    }
    if (open && open[0]) {
      await joinMatch(open[0].id);
      return;
    }
    await createMatch();
  };

  const createMatch = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('matches')
      .insert({ creator_id: user.id, status: 'waiting', time_limit: 60 })
      .select()
      .single();
    if (!error && data) {
      setMatch(data);
      const interval = setInterval(async () => {
        const { data: updated } = await supabase.from('matches').select('*, profiles:opponent_id(username)').eq('id', data.id).single();
        if (updated?.status === 'playing') {
          clearInterval(interval);
          setMatch(updated);
          if (updated.profiles?.username) setOpponentName(updated.profiles.username);
          startPvpGame(updated);
        }
      }, 1500);
    }
  };

  const joinMatch = async (matchId: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('matches')
      .update({ opponent_id: user.id, status: 'playing', started_at: new Date().toISOString() })
      .eq('id', matchId)
      .eq('status', 'waiting')
      .select('*, profiles:creator_id(username)')
      .single();
    if (!error && data) {
      setMatch(data);
      if (data.profiles?.username) setOpponentName(data.profiles.username);
      startPvpGame(data);
    }
  };

  const startPvpGame = (m: any) => {
    setSelectedMode('pvp');
    setMatch(m);
    setState(initializeGame('normal', undefined, 4));
    setHistory([]);
    setCombo(0);
    setJustMerged(new Set());
    setShowLevelUp(false);
    setPvpResult(null);
    setOpponentScore(0);
    setTool(null);
    setSwapFirst(null);
    setKeepGoing(false);
    savedRun.current = false;
    setTimeLeft(m.time_limit || 60);
    setScreen('playing');
  };

  const endPvpMatch = async () => {
    if (!match || !user || pvpResult) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const myScore = scoreRef.current;
    const isCreator = match.creator_id === user.id;
    const updateData: any = isCreator ? { creator_score: myScore } : { opponent_score: myScore };
    await supabase.from('matches').update(updateData).eq('id', match.id);
    const { data: latest } = await supabase.from('matches').select('*').eq('id', match.id).single();
    if (!latest) return;
    const cScore = isCreator ? myScore : latest.creator_score;
    const oScore = isCreator ? latest.opponent_score : myScore;
    if ((latest.creator_score > 0 && latest.opponent_score > 0) || timeLeft <= 0) {
      let winnerId = null;
      if (cScore > oScore) winnerId = latest.creator_id;
      else if (oScore > cScore) winnerId = latest.opponent_id;
      await supabase.from('matches').update({
        status: 'finished',
        winner_id: winnerId,
        finished_at: new Date().toISOString(),
        creator_score: cScore,
        opponent_score: oScore,
      }).eq('id', match.id);
      if (winnerId === user.id) setPvpResult('win');
      else if (winnerId === null) setPvpResult('draw');
      else setPvpResult('lose');
      setStreak(touchStreak());
    }
  };

  const finishDuel = () => {
    if (pvpResult) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const mine = scoreRef.current;
    const target = challenge?.score || 0;
    setPvpResult(mine > target ? 'win' : mine === target ? 'draw' : 'lose');
    setStreak(touchStreak());
    rememberBest(mine);
    if (mine > 0) saveScore(mine, maxTile(state.grid));
  };

  const closeRun = (current: GameState) => {
    if (savedRun.current || isPvp) return;
    savedRun.current = true;
    localStorage.removeItem('ns_active_run');
    setPausedRun(null);
    const tile = maxTile(current.grid);
    rememberBest(current.score);
    setStreak(touchStreak());
    if (isDuel) finishDuel();
    else saveScore(current.score, tile);
  };

  const startGame = (mode: Mode) => {
    if (mode === 'pvp') {
      if (!user) {
        alert('Please sign in to play Vs Player');
        return;
      }
      setScreen('pvp-lobby');
      loadOpenMatches();
      return;
    }
    setSelectedMode(mode);
    const seed = mode === 'daily' ? todaySeed() : undefined;
    const playMode = mode === 'daily' || mode === 'duel' || mode === 'classic' ? 'normal' : mode;
    const size = mode === 'classic' ? 4 : boardSizeFor(mode);
    const next = initializeGame(playMode, seed, size);
    if (mode === 'classic') next.undosLeft = 0;
    if (mode === 'daily') {
      if (readStreak() >= 3) next.undosLeft += 1;
      localStorage.setItem('ns_daily_date', lagosDate());
      setPlayedToday(true);
    }
    setState(next);
    setHistory([]);
    setCombo(0);
    setJustMerged(new Set());
    setShowLevelUp(false);
    setPvpResult(null);
    setOpponentScore(0);
    setTool(null);
    setSwapFirst(null);
    setDailyPlace(null);
    setKeepGoing(false);
    savedRun.current = false;
    setTimeLeft(60);
    persistRun(mode, next);
    setScreen('playing');
  };

  const continueRun = () => {
    if (!pausedRun) return;
    setSelectedMode(pausedRun.mode);
    setState(pausedRun.state);
    setHistory([]);
    setPvpResult(null);
    setShowLevelUp(false);
    setTool(null);
    savedRun.current = false;
    setScreen('playing');
  };

  const acceptRequest = async (note: any) => {
    if (!user || !note.from_user_id) return;

    // 1. Accept in friendships table
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('user_id', note.from_user_id)
      .eq('friend_id', user.id);

    if (error) {
      showToast('Could not accept yet');
      return;
    }

    // 2. Notify requester
    await supabase.from('notifications').insert({
      user_id: note.from_user_id,
      type: 'friend_accepted',
      title: 'Friend request accepted',
      body: `${username} accepted your friend request`,
      from_user_id: user.id,
    });

    // 3. Mark alert as read in database and UI
    await supabase.from('notifications').update({ read: true }).eq('id', note.id);
    setNotifs((prev) => prev.filter((n) => n.id !== note.id));
    showToast('Friend added');
  };

  const handleMove = useCallback((dir: Dir) => {
    if (screen !== 'playing' || state.gameOver || showLevelUp || pvpResult) return;
    if (timed && timeLeft <= 0) return;
    const result = playMove(state, dir);
    if (!result) return;

    const oldMax = maxTile(state.grid);
    const newMax = maxTile(result.state.grid);
    if (newMax > oldMax && newMax >= 128) playBigMerge(newMax);
    else playTone(result.scoreGained > 0 ? 480 : 260, result.scoreGained > 0 ? 0.1 : 0.05);
    if (result.grantLabel) showToast(result.grantLabel);
    const storedBest = Number(localStorage.getItem('ns_best') || 0);
    if (storedBest > 0 && state.score <= storedBest && result.state.score > storedBest) {
      localStorage.setItem('ns_best', String(result.state.score));
      setBestScore(result.state.score);
      showToast('New best');
      playTone(880, 0.14, 0.12);
    }
    if (newMax >= 2048 && oldMax < 2048) setKeepGoing(true);
    if (mark && state.score <= mark.score && result.state.score > mark.score) {
      showToast(`You passed ${mark.name}`);
      playTone(880, 0.14, 0.12);
    }

    if (legalMoveCount(result.state.grid) <= 1 && canMove(result.state.grid)) playDanger();

    setHistory((prev) => [...prev.slice(-19), snapshot(state)]);
    if (result.scoreGained > 0) {
      const mergedIndexes = new Set<number>();
      result.state.grid.flat().forEach((val, idx) => {
        if (val && val >= 4) mergedIndexes.add(idx);
      });
      setJustMerged(mergedIndexes);
      setTimeout(() => setJustMerged(new Set()), 320);
      if (localStorage.getItem('hapticsOn') !== 'false' && navigator.vibrate) navigator.vibrate(12);
    }
    setCombo(result.scoreGained > 0 ? combo + 1 : 0);
    setNudge(dir);
    window.setTimeout(() => setNudge(null), 100);
    setState(result.state);
    persistRun(selectedMode, result.state);
    setTool(null);
    setSwapFirst(null);

    if (!isDaily && !isPvp && !isDuel && result.state.score >= targetScore && !showLevelUp) {
      levelUp(playerLevel + 1, result.state.score);
    }
    if (result.state.gameOver) closeRun(result.state);
  }, [screen, state, user, combo, soundOn, playerLevel, targetScore, showLevelUp, isDaily, isPvp, isDuel, timed, timeLeft, pvpResult, mark, selectedMode]);

  const undo = () => {
    if (history.length === 0 || state.undosLeft <= 0 || isPvp) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setState((prev) => ({
      ...prev,
      grid: last.grid,
      score: last.score,
      undosLeft: Math.max(0, last.undosLeft - 1),
      swapsLeft: last.swapsLeft,
      deletesLeft: last.deletesLeft,
      bombsLeft: last.bombsLeft,
      maxTileSeen: last.maxTileSeen,
      rngState: last.rngState,
      gameOver: false,
    }));
    setCombo(0);
    setTool(null);
    setSwapFirst(null);
  };

  const useToolOn = (index: number) => {
    if (!tool || state.gameOver || pvpResult) return;
    if (tool === 'swap' && swapFirst === null) {
      setSwapFirst(index);
      return;
    }
    setHistory((prev) => [...prev.slice(-19), snapshot(state)]);
    let next: GameState | null = null;
    if (tool === 'swap' && swapFirst !== null) next = applySwap(state, swapFirst, index);
    else if (tool === 'delete') next = applyDelete(state, index);
    else if (tool === 'bomb') next = applyBomb(state, index);
    if (!next) return;
    playTone(320, 0.08, 0.07);
    setState(next);
    setTool(null);
    setSwapFirst(null);
    if (next.gameOver) closeRun(next);
  };

  const restart = () => {
    if (isPvp) {
      setScreen('pvp-lobby');
      setMatch(null);
      setPvpResult(null);
      loadOpenMatches();
      return;
    }
    if (selectedMode) startGame(selectedMode);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem('soundOn', String(next));
  };

  const challengeLink = () => {
    const origin = window.location.origin;
    const score = state.score || bestScore;
    return `${origin}/?beat=${score}&from=${encodeURIComponent(username || 'player')}`;
  };

  const shareText = () => {
    const tile = maxTile(state.grid);
    const lines = [
      `Number Slide · ${lagosDate()}`,
      `Tile ${tile || '-'} · Score ${state.score.toLocaleString()}`,
      streak > 0 ? `Streak ${streak}` : '',
      dailyPlace || '',
      isDuel && challenge ? `${pvpResult === 'win' ? 'Beat' : 'Chased'} ${challenge.from}'s ${challenge.score.toLocaleString()}` : '',
      `Beat me: ${challengeLink()}`,
    ];
    return lines.filter(Boolean).join('\n');
  };

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      showToast('Copy failed. Select the text and copy it.');
    }
  };

  const shareCard = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const bg = ctx.createLinearGradient(0, 0, 0, 1350);
    bg.addColorStop(0, '#f8d5c8');
    bg.addColorStop(1, '#e8b4a8');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 80, 140, 920, 1070, 48);
    ctx.fillStyle = '#3d2b1f';
    ctx.textAlign = 'center';
    ctx.font = '700 40px sans-serif';
    ctx.fillText('NUMBER SLIDE', 540, 250);
    const tile = maxTile(state.grid);
    const look = getTileStyle(tile || null);
    ctx.fillStyle = String(look.backgroundColor || '#edcf72');
    roundRect(ctx, 390, 320, 300, 300, 36);
    ctx.fillStyle = String(look.color || '#ffffff');
    ctx.font = '800 88px sans-serif';
    ctx.fillText(tile ? String(tile) : '-', 540, 500);
    ctx.fillStyle = '#3d2b1f';
    ctx.font = '800 78px sans-serif';
    ctx.fillText(state.score.toLocaleString(), 540, 760);
    ctx.fillStyle = '#8a6f5c';
    ctx.font = '600 34px sans-serif';
    ctx.fillText(username || 'player', 540, 830);
    if (streak > 0) ctx.fillText(`Streak ${streak}`, 540, 890);
    ctx.fillText('Beat this score', 540, 1040);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'number-slide.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText(), title: 'Number Slide' });
        return;
      }
    } catch {
      /* user cancelled or share failed, fall through to download */
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'number-slide.png';
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right',
      };
      if (map[e.key]) {
        e.preventDefault();
        handleMove(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMove]);

  const onPointerDown = (e: { clientX: number; clientY: number }) => {
    pointerRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: { clientX: number; clientY: number }) => {
    if (!pointerRef.current || tool) return;
    const dx = e.clientX - pointerRef.current.x;
    const dy = e.clientY - pointerRef.current.y;
    pointerRef.current = null;
    if (Math.hypot(dx, dy) < 28) return;
    if (Math.abs(dx) > Math.abs(dy)) handleMove(dx > 0 ? 'right' : 'left');
    else handleMove(dy > 0 ? 'down' : 'up');
  };

  useEffect(() => {
    if (screen !== 'pvp-lobby') return;
    const timer = window.setInterval(loadOpenMatches, 3000);
    return () => window.clearInterval(timer);
  }, [screen, user]);

  if (screen === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] via-[#f4c7b8] to-[#e8b4a8] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-4">
            <Link href="/messages" className="relative bg-white/80 text-[#3d2b1f] text-sm font-semibold px-4 py-2 rounded-full shadow">
              Chat
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadChatCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => setShowNotifs((v) => !v)}
              className="relative bg-white/80 text-[#3d2b1f] text-sm font-semibold px-4 py-2 rounded-full shadow"
            >
              Alerts
              {notifs.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {notifs.length}
                </span>
              )}
            </button>
          </div>
          {showNotifs && (
            <div className="mb-4 bg-white rounded-2xl shadow max-h-64 overflow-y-auto">
              {notifs.length === 0 ? (
                <p className="p-4 text-sm text-[#8a6f5c]">No alerts yet</p>
              ) : notifs.map((n) => (
                <div key={n.id} className="px-4 py-3 border-b border-[#f6eee8] flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[#3d2b1f]">{n.title}</div>
                    {n.body && <div className="text-xs text-[#8a6f5c]">{n.body}</div>}
                  </div>
                  {n.type === 'friend_request' && (
                    <button onClick={() => acceptRequest(n)} className="bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow">
                      Accept
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="text-center mb-6">
            <h1 className="text-4xl font-extrabold text-[#3d2b1f] tracking-tight">Number Slide</h1>
            <div className="mt-3 inline-flex items-center gap-2 bg-white/70 backdrop-blur px-4 py-1.5 rounded-full shadow-sm">
              <span className="text-sm font-semibold text-[#4a3728]">Level {playerLevel}</span>
              <span className="text-[#c4a484]">·</span>
              <span className="text-sm text-[#6b5344]">{getLevelTitle(playerLevel)}</span>
            </div>
            <p className="mt-2 text-sm text-[#8a6f5c]">Target {getTargetScore(playerLevel).toLocaleString()}</p>
            {streak > 0 && (
              <p className="mt-2 text-sm font-semibold text-[#4a3728]">Streak {streak} day{streak === 1 ? '' : 's'}</p>
            )}
          </div>

          {throne && !throne.mine && !mark && (
            <button
              onClick={() => {
                setMark({ name: throne.name, score: throne.score, board: 'daily' });
                startGame('daily');
              }}
              className="w-full mb-3 bg-[#3d2b1f] text-white p-4 rounded-2xl text-left shadow-lg active:scale-[0.98] transition"
            >
              <div className="text-xs uppercase tracking-wider text-amber-300">Today's top</div>
              <div className="font-bold text-lg mt-0.5">Beat {throne.name}</div>
              <div className="text-sm text-white/80">{throne.score.toLocaleString()} · full game, no timer</div>
            </button>
          )}

          {throne?.mine && (
            <div className="w-full mb-3 bg-white/90 text-[#3d2b1f] p-4 rounded-2xl text-left shadow-md">
              <div className="text-xs uppercase tracking-wider text-amber-700">You hold today</div>
              <div className="font-bold text-lg mt-0.5">{throne.score.toLocaleString()}</div>
              <div className="text-sm text-[#6b5344]">
                {throne.behind > 0 ? `${throne.behind.toLocaleString()} ahead of the next person` : 'Nobody has touched you yet'}
              </div>
            </div>
          )}

          {mark && (
            <button
              onClick={() => startGame(mark.board)}
              className="w-full mb-3 bg-[#3d2b1f] text-white p-4 rounded-2xl text-left shadow-lg active:scale-[0.98] transition"
            >
              <div className="text-xs uppercase tracking-wider text-amber-300">Chase</div>
              <div className="font-bold text-lg mt-0.5">Beat {mark.name}</div>
              <div className="text-sm text-white/80">{mark.score.toLocaleString()} · full game, no timer</div>
            </button>
          )}

          {challenge && (
            <button
              onClick={() => startGame('duel')}
              className="w-full mb-3 bg-[#3d2b1f] text-white p-4 rounded-2xl text-left shadow-lg active:scale-[0.98] transition"
            >
              <div className="text-xs uppercase tracking-wider text-white/60">Challenge</div>
              <div className="font-bold text-lg mt-0.5">Beat {challenge.from}</div>
              <div className="text-sm text-white/80">Score {challenge.score.toLocaleString()} · 60 seconds</div>
            </button>
          )}

          <div className="space-y-3">
            <button
              onClick={() => startGame('daily')}
              className="w-full group bg-gradient-to-r from-indigo-500 to-violet-600 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-indigo-200/50 active:scale-[0.98] transition"
            >
              <div className="text-left">
                <div className="font-bold text-lg flex items-center gap-2">
                  <Calendar size={18} /> Daily Challenge
                </div>
                <div className="text-sm text-white/80">
                  {!playedToday ? 'You have not played today' : streak >= 3 ? 'Streak bonus: +1 undo' : 'Same board for everyone today'}
                </div>
              </div>
              <span className="text-3xl group-hover:scale-110 transition">📅</span>
            </button>

            <button
              onClick={() => startGame('pvp')}
              className="w-full group bg-gradient-to-r from-rose-500 to-orange-500 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-rose-200/50 active:scale-[0.98] transition"
            >
              <div className="text-left">
                <div className="font-bold text-lg flex items-center gap-2">
                  <Swords size={18} /> Vs Player
                </div>
                <div className="text-sm text-white/80">Timed 1v1 · 60 seconds</div>
              </div>
              <span className="text-3xl group-hover:scale-110 transition">⚔️</span>
            </button>

            {pausedRun && (
              <button
                onClick={continueRun}
                className="w-full bg-white text-[#3d2b1f] p-4 rounded-2xl text-left shadow-md"
              >
                <div className="font-bold">Continue your game</div>
                <div className="text-sm text-[#6b5344]">{pausedRun.state.score.toLocaleString()} · {pausedRun.mode}</div>
              </button>
            )}
            <button
              onClick={() => startGame('classic')}
              className="w-full bg-white/95 p-4 rounded-2xl text-left shadow-md"
            >
              <div className="font-bold text-[#3d2b1f]">Classic 2048</div>
              <div className="text-sm text-[#6b5344]">4×4. No swap, delete, or bomb.</div>
            </button>
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {(['easy', 'normal', 'hard'] as Mode[]).map((m) => {
                const cfg = MODE_CONFIG[m];
                return (
                  <button
                    key={m}
                    onClick={() => startGame(m)}
                    className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-md active:scale-[0.97] transition flex flex-col items-center gap-1.5 border border-white/60"
                  >
                    <span className="text-3xl">{cfg.emoji}</span>
                    <span className="text-sm font-bold text-[#4a3728]">{cfg.label}</span>
                    <span className="text-[11px] text-[#8a6f5c]">{cfg.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-6 text-sm font-medium text-[#5c4334]">
            <Link href="/levels" className="hover:underline underline-offset-4">Levels</Link>
            <Link href="/leaderboard" className="hover:underline underline-offset-4">Leaderboard</Link>
            <Link href="/friends" className="hover:underline underline-offset-4">Friends</Link>
            <Link href="/messages" className="hover:underline underline-offset-4">Chat</Link>
            {user ? (
              <Link href="/profile" className="hover:underline underline-offset-4">Profile</Link>
            ) : (
              <Link href="/auth/login" className="hover:underline underline-offset-4">Sign In</Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'pvp-lobby') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] via-[#f4c7b8] to-[#e8b4a8] p-5">
        <div className="max-w-md mx-auto">
          <button onClick={() => setScreen('home')} className="text-sm font-medium text-[#5c4334] mb-6">
            ← Back
          </button>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white text-2xl shadow-lg mb-3">
              ⚔️
            </div>
            <h1 className="text-2xl font-extrabold text-[#3d2b1f]">Vs Player</h1>
            <p className="text-sm text-[#6b5344] mt-1">Create a match or join an open one</p>
          </div>
          <button
            onClick={findMatch}
            disabled={!!match}
            className="w-full bg-gradient-to-r from-rose-500 to-orange-500 text-white py-4 rounded-2xl font-bold text-base shadow-lg shadow-rose-200/40 mb-5 disabled:opacity-60 active:scale-[0.98] transition"
          >
            {match ? 'Waiting for opponent…' : 'Find a match'}
          </button>
          {match && (
            <div className="bg-white/90 backdrop-blur rounded-2xl p-5 mb-6 text-center shadow-md border border-white/50">
              <Users className="mx-auto mb-2 text-[#4a3728]" size={28} />
              <p className="font-semibold text-[#4a3728]">Match created</p>
              <p className="text-sm text-[#8a6f5c] mt-0.5">Waiting for someone to join…</p>
            </div>
          )}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[#4a3728]">Open Matches</h2>
            <button onClick={loadOpenMatches} className="text-xs font-medium text-[#8a6f5c] hover:text-[#4a3728]">
              Refresh
            </button>
          </div>
          {loadingLobby ? (
            <p className="text-sm text-[#8a6f5c]">Loading…</p>
          ) : openMatches.length === 0 ? (
            <div className="bg-white/60 rounded-2xl p-6 text-center text-sm text-[#8a6f5c]">
              No open matches right now. Send a score link instead — it works even when nobody is online.
            </div>
          ) : (
            <div className="space-y-2.5">
              {openMatches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => joinMatch(m.id)}
                  className="w-full bg-white/90 backdrop-blur rounded-2xl p-4 flex items-center justify-between shadow-md border border-white/50 active:scale-[0.98] transition"
                >
                  <div className="text-left">
                    <div className="font-semibold text-[#4a3728]">{m.profiles?.username || 'Player'}</div>
                    <div className="text-xs text-[#8a6f5c]">60 second match</div>
                  </div>
                  <span className="bg-[#4a3728] text-white text-sm px-4 py-1.5 rounded-full font-medium">Join</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const cfg = MODE_CONFIG[selectedMode || 'normal'];
  const progress = Math.min((state.score / targetScore) * 100, 100);
  const toolHint = tool === 'swap'
    ? swapFirst === null ? 'Tap the first tile' : 'Tap the second tile'
    : tool === 'delete'
      ? 'Tap a number to clear every copy'
      : tool === 'bomb'
        ? 'Tap a tile to clear it and its neighbours'
        : danger
          ? 'One bad move ends it'
          : 'Make a 64 to unlock Swap';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] via-[#f4c7b8] to-[#e8b4a8]">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#3d2b1f] text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
          {toast}
        </div>
      )}

      <header className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => { setScreen('home'); setSelectedMode(null); setMatch(null); setPvpResult(null); }}
          className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center text-[#4a3728] shadow-sm"
        >
          ←
        </button>
        <div className="flex items-center gap-2 bg-[#4a3728] text-white px-4 py-1.5 rounded-full text-sm font-medium shadow">
          <span>{cfg.emoji}</span>
          <span>{cfg.label}</span>
        </div>
        <button onClick={toggleSound} className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center text-[#4a3728] shadow-sm">
          {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} className="opacity-50" />}
        </button>
      </header>

      <main className="flex flex-col items-center px-4 pb-10">
        {timed && (
          <div className={`mb-3 text-2xl font-extrabold tabular-nums ${timeLeft <= 10 ? 'text-red-600 animate-pulse' : 'text-[#4a3728]'}`}>
            {timeLeft}s
          </div>
        )}

        {/* Live PvP Match Score HUD */}
        {isPvp && (
          <div className="w-full max-w-md mb-4 bg-white/80 backdrop-blur rounded-2xl p-3 shadow border border-white/60 flex items-center justify-around">
            <div className="text-center">
              <div className="text-[10px] uppercase font-bold text-[#8a6f5c]">You</div>
              <div className="text-xl font-extrabold text-[#3d2b1f]">{state.score.toLocaleString()}</div>
            </div>
            <div className="text-xs font-black text-rose-500 uppercase px-2 py-1 bg-rose-100 rounded-full">VS</div>
            <div className="text-center">
              <div className="text-[10px] uppercase font-bold text-[#8a6f5c] truncate max-w-[100px]">{opponentName}</div>
              <div className="text-xl font-extrabold text-purple-700">{opponentScore.toLocaleString()}</div>
            </div>
          </div>
        )}

        {mark && !timed && (
          <div className="mb-3 text-sm font-semibold text-[#4a3728]">
            {state.score > mark.score
              ? `You passed ${mark.name}`
              : `${(mark.score - state.score).toLocaleString()} to pass ${mark.name}`}
          </div>
        )}

        {isDuel && challenge && (
          <div className="mb-3 text-sm font-semibold text-[#4a3728]">
            Beat {challenge.from} · {challenge.score.toLocaleString()}
          </div>
        )}

        {!isDaily && !timed && selectedMode !== 'classic' && (
          <div className="w-full max-w-md mb-4">
            <div className="flex justify-between text-sm text-[#4a3728] mb-1.5">
              <span className="font-bold">Level {playerLevel}</span>
              <span className="tabular-nums">{state.score.toLocaleString()} / {targetScore.toLocaleString()}</span>
            </div>
            <div className="h-2.5 bg-white/50 rounded-full overflow-hidden shadow-inner">
              <div className="h-full bg-[#4a3728] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {isDaily && (
          <div className="mb-4 text-center">
            <div className="inline-flex items-center gap-2 bg-indigo-100/80 text-indigo-700 px-4 py-1.5 rounded-full text-sm font-medium">
              <Calendar size={14} /> Same board for everyone · resets midnight
            </div>
          </div>
        )}

        <div className="w-full max-w-md flex justify-between items-center mb-5 gap-3">
          <div className="bg-[#4a3728] text-white px-5 py-3 rounded-2xl text-center min-w-[108px] shadow-lg">
            <div className="text-[10px] uppercase tracking-wider opacity-70">Score</div>
            <div className="text-2xl font-extrabold tabular-nums">{state.score.toLocaleString()}</div>
          </div>
          <div className="bg-white/80 text-[#4a3728] px-5 py-3 rounded-2xl text-center min-w-[108px] shadow">
            <div className="text-[10px] uppercase tracking-wider opacity-60">Best</div>
            <div className="text-2xl font-extrabold tabular-nums">{Math.max(bestScore, state.bestScore, state.score).toLocaleString()}</div>
          </div>
          {combo > 1 && (
            <div className="bg-amber-400 text-[#3d2b1f] px-3.5 py-1.5 rounded-full font-bold text-sm shadow">
              Combo ×{combo}
            </div>
          )}
          <button
            onClick={restart}
            className="w-12 h-12 rounded-full bg-white shadow-md flex items-center justify-center text-[#4a3728] active:scale-95 transition"
          >
            <RotateCcw size={18} />
          </button>
        </div>

        {danger && (
          <div className="mb-3 text-sm font-bold text-red-700 animate-pulse">Board is tight</div>
        )}
        {!danger && bestScore > state.score && (
          <div className="mb-3 text-sm font-semibold text-[#4a3728]">
            {(bestScore - state.score).toLocaleString()} to your best
          </div>
        )}
        {!danger && bestScore > 0 && state.score >= bestScore && state.score > 0 && (
          <div className="mb-3 text-sm font-semibold text-[#4a3728]">New best</div>
        )}

        <div
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className={`bg-[#bbada0] rounded-2xl p-2 shadow-xl touch-none select-none w-full max-w-[520px] ${
            bigMergeFlash ? 'brightness-110' : ''
          } ${danger ? 'ring-4 ring-red-500/80' : ''} ${nudge ? `nudge-${nudge}` : ''}`}
        >
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${state.size || 4}, minmax(0, 1fr))` }}
          >
            {state.grid.flat().map((value, i) => {
              const digits = value ? String(value).length : 0;
              const big = (state.size || 4) >= 8;
              const mid = (state.size || 4) === 6;
              const text = digits >= 6 ? 'text-[10px]' : digits >= 4 ? (big ? 'text-[10px]' : 'text-sm') : big ? 'text-xs' : mid ? 'text-base' : 'text-2xl';
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => useToolOn(i)}
                  style={getTileStyle(value)}
                  className={`aspect-square w-full rounded-md sm:rounded-lg flex items-center justify-center font-bold ${text} ${
                    justMerged.has(i) && localStorage.getItem('animationsOn') !== 'false' ? 'animate-collapse3d' : ''
                  } ${swapFirst === i ? 'outline outline-2 outline-white' : ''}`}
                >
                  {value || ''}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-3 text-xs font-medium text-[#6b5344]">{toolHint}</p>

        {selectedMode !== 'classic' && <div className="mt-6 grid grid-cols-4 gap-2 w-full max-w-md">
          <button
            onClick={undo}
            disabled={state.undosLeft <= 0 || history.length === 0 || isPvp}
            className="bg-amber-400 text-white rounded-2xl py-3 text-xs font-bold shadow disabled:opacity-40"
          >
            <Undo2 className="mx-auto mb-1" size={16} />
            Undo · {state.undosLeft}
          </button>
          <button
            onClick={() => { setTool(tool === 'swap' ? null : 'swap'); setSwapFirst(null); }}
            disabled={state.swapsLeft <= 0}
            className={`rounded-2xl py-3 text-xs font-bold shadow ${tool === 'swap' ? 'bg-[#3d2b1f] text-white' : 'bg-white text-[#4a3728]'} disabled:opacity-40`}
          >
            Swap
            <div className="mt-1">{state.swapsLeft > 0 ? state.swapsLeft : 'at 64'}</div>
          </button>
          <button
            onClick={() => { setTool(tool === 'delete' ? null : 'delete'); setSwapFirst(null); }}
            disabled={state.deletesLeft <= 0}
            className={`rounded-2xl py-3 text-xs font-bold shadow ${tool === 'delete' ? 'bg-[#3d2b1f] text-white' : 'bg-white text-[#4a3728]'} disabled:opacity-40`}
          >
            Delete
            <div className="mt-1">{state.deletesLeft > 0 ? state.deletesLeft : 'at 128'}</div>
          </button>
          <button
            onClick={() => { setTool(tool === 'bomb' ? null : 'bomb'); setSwapFirst(null); }}
            disabled={state.bombsLeft <= 0}
            className={`rounded-2xl py-3 text-xs font-bold shadow ${tool === 'bomb' ? 'bg-[#3d2b1f] text-white' : 'bg-white text-[#4a3728]'} disabled:opacity-40`}
          >
            Bomb
            <div className="mt-1">{state.bombsLeft > 0 ? state.bombsLeft : 'at 256'}</div>
          </button>
        </div>}

        {keepGoing && !state.gameOver && !pvpResult && (
          <button onClick={() => setKeepGoing(false)} className="mt-4 text-sm font-bold text-[#4a3728]">
            2048 reached. Keep going.
          </button>
        )}

        {(pvpResult || (state.gameOver && !showLevelUp)) && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50">
            <div className="bg-white rounded-3xl p-8 text-center max-w-xs w-full shadow-2xl">
              <div className="text-2xl font-extrabold text-[#3d2b1f] mb-1">
                {pvpResult === 'win' ? 'You win' : pvpResult === 'draw' ? 'Draw' : pvpResult === 'lose' ? 'Not this time' : 'Game over'}
              </div>
              <div className="text-[#6b5344]">Score {state.score.toLocaleString()}</div>
              {isPvp && <div className="text-sm font-semibold text-purple-700 mt-1">{opponentName}: {opponentScore.toLocaleString()}</div>}
              <div className="text-sm text-[#8a6f5c] mt-1">Best tile {maxTile(state.grid) || '-'}</div>
              {dailyPlace && <div className="text-sm text-indigo-600 mt-2">{dailyPlace}</div>}
              {streak > 0 && <div className="text-sm font-semibold text-[#4a3728] mt-1">Streak {streak}</div>}
              <button onClick={shareCard} className="w-full mt-5 bg-amber-400 text-[#3d2b1f] py-3.5 rounded-2xl font-semibold">
                Share card
              </button>
              <button onClick={copyShare} className="w-full mt-2 bg-[#f6eee8] text-[#3d2b1f] py-3.5 rounded-2xl font-semibold">
                {copied ? 'Copied. Send it.' : 'Copy challenge'}
              </button>
              <button onClick={restart} className="w-full mt-2 bg-[#4a3728] text-white py-3.5 rounded-2xl font-semibold">
                {isPvp ? 'Back to lobby' : 'Play again'}
              </button>
              <button
                onClick={() => { setScreen('home'); setSelectedMode(null); setMatch(null); setPvpResult(null); }}
                className="w-full mt-2 bg-[#f6eee8] text-[#3d2b1f] py-3.5 rounded-2xl font-semibold"
              >
                Back home
              </button>
            </div>
          </div>
        )}

        {showLevelUp && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50">
            <div className="bg-white rounded-3xl p-8 text-center max-w-xs w-full shadow-2xl">
              <div className="text-5xl mb-3">🎉</div>
              <div className="text-2xl font-extrabold text-[#3d2b1f] mb-1">Level up</div>
              <div className="text-[#6b5344] mb-1">Level {playerLevel}</div>
              <div className="text-sm text-[#8a6f5c] mb-6">{getLevelTitle(playerLevel)}</div>
              <button
                onClick={() => { setShowLevelUp(false); restart(); }}
                className="w-full bg-[#4a3728] text-white py-3.5 rounded-2xl font-semibold"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
