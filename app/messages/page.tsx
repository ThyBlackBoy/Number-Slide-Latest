'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Send, X, Swords, Trophy, Sparkles } from 'lucide-react';

type Person = { id: string; username: string };
type Row = { other: Person; last?: { content: string; created_at: string; sender_id: string } };

function MessagesPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<Person | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [targetGoal, setTargetGoal] = useState(2048);
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const loadInbox = async (userId: string) => {
    // Fixed table name from 'friends' to 'friendships'
    const { data: links } = await supabase
      .from('friendships')
      .select('*')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    const people = new Map<string, Person>();
    (links || []).forEach((f: any) => {
      const otherId = f.user_id === userId ? f.friend_id : f.user_id;
      if (otherId) people.set(otherId, { id: otherId, username: 'Player' });
    });

    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(300);

    const lastBy = new Map<string, any>();
    (msgs || []).forEach((m: any) => {
      const otherId = m.sender_id === userId ? m.receiver_id : m.sender_id;
      if (!lastBy.has(otherId)) lastBy.set(otherId, m);
      if (!people.has(otherId)) people.set(otherId, { id: otherId, username: 'Player' });
    });

    const missing = Array.from(people.values()).filter((p) => p.username === 'Player').map((p) => p.id);
    if (missing.length) {
      const { data: names } = await supabase.from('profiles').select('id, username').in('id', missing);
      (names || []).forEach((n: any) => {
        const cur = people.get(n.id);
        if (cur) people.set(n.id, { id: n.id, username: n.username || 'Player' });
      });
    }

    const list: Row[] = Array.from(people.values()).map((other) => ({ other, last: lastBy.get(other.id) }));
    list.sort((a, b) => {
      const at = a.last ? new Date(a.last.created_at).getTime() : 0;
      const bt = b.last ? new Date(b.last.created_at).getTime() : 0;
      return bt - at;
    });
    setRows(list);
    return list;
  };

  const loadThread = async (userId: string, other: Person) => {
    // Automatically mark unread message notifications as read in Supabase
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('from_user_id', other.id)
      .eq('type', 'message');

    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${other.id}),and(sender_id.eq.${other.id},receiver_id.eq.${userId})`
      )
      .order('created_at', { ascending: true })
      .limit(80);

    setMessages(data || []);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
  };

  useEffect(() => {
    const boot = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/auth/login');
      setUser(user);
      const { data: profileData } = await supabase.from('profiles').select('username').eq('id', user.id).single();
      setProfile(profileData);
      const list = await loadInbox(user.id);
      const withId = params.get('with');
      if (withId) {
        const found = list.find((r) => r.other.id === withId);
        const person = found?.other || { id: withId, username: 'Player' };
        setOpen(person);
        await loadThread(user.id, person);
      }
      setLoading(false);
    };
    boot();
  }, [supabase, router]);

  useEffect(() => {
    if (!user || !open) return;
    const timer = setInterval(() => loadThread(user.id, open), 4000);
    return () => clearInterval(timer);
  }, [user, open]);

  const send = async (contentToSend?: string) => {
    const content = (contentToSend || text).trim();
    if (!user || !open || !content) return;
    if (!contentToSend) setText('');

    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: user.id, receiver_id: open.id, content })
      .select()
      .single();

    if (!error && data) {
      setMessages((prev) => [...prev, data]);
      await supabase.from('notifications').insert({
        user_id: open.id,
        type: 'message',
        title: 'New Message',
        body: `${profile?.username || 'Someone'}: ${content.slice(0, 60)}`,
        from_user_id: user.id,
      });
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
    }
  };

  const sendMatchInvite = async () => {
    setShowInviteModal(false);
    const inviteText = `[INVITE:${targetGoal}] ⚔️ Challenge: First to reach ${targetGoal.toLocaleString()} points wins!`;
    await send(inviteText);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f8d5c8] to-[#e8b4a8] text-[#6b5344]">
        Loading messages…
      </div>
    );
  }

  if (open) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] to-[#e8b4a8] flex flex-col">
        {/* Header */}
        <div className="bg-white/90 backdrop-blur px-4 py-3 flex items-center justify-between shadow border-b border-white/40">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setOpen(null);
                if (user) loadInbox(user.id);
                router.replace('/messages');
              }}
              className="text-[#4a3728]"
            >
              <X size={22} />
            </button>
            <div>
              <div className="font-bold text-[#3d2b1f] flex items-center gap-1.5">
                {open.username}
                <Sparkles size={14} className="text-amber-500" />
              </div>
              <div className="text-[11px] text-[#a08070]">Friend</div>
            </div>
          </div>

          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500 to-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow active:scale-95 transition"
          >
            <Swords size={14} /> Invite to Match
          </button>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center mt-12 bg-white/40 backdrop-blur rounded-2xl p-6 max-w-xs mx-auto text-[#8a6f5c]">
              <Trophy size={32} className="mx-auto mb-2 text-amber-500" />
              <p className="font-semibold text-[#3d2b1f]">No messages yet</p>
              <p className="text-xs mt-1">Send a greeting or challenge them to a match!</p>
            </div>
          )}

          {messages.map((m) => {
            const isMe = m.sender_id === user.id;
            const isInvite = m.content.startsWith('[INVITE:');
            let inviteTarget = 2048;

            if (isInvite) {
              const match = m.content.match(/\[INVITE:(\d+)\]/);
              if (match) inviteTarget = parseInt(match[1], 10);
            }

            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                {isInvite ? (
                  <div className="bg-gradient-to-br from-indigo-900 to-slate-800 text-white p-4 rounded-2xl max-w-[80%] shadow-lg border border-indigo-400/30">
                    <div className="flex items-center gap-2 font-bold text-amber-300 text-sm mb-1">
                      <Swords size={16} /> MATCH CHALLENGE
                    </div>
                    <div className="text-sm font-extrabold mb-2">
                      Goal: First to {inviteTarget.toLocaleString()} pts
                    </div>
                    <Link
                      href={`/?beat=${inviteTarget}&from=${encodeURIComponent(profile?.username || 'Friend')}`}
                      className="block text-center bg-gradient-to-r from-amber-400 to-orange-400 text-slate-900 text-xs font-extrabold py-2 px-4 rounded-xl shadow active:scale-95 transition"
                    >
                      Accept & Play
                    </Link>
                  </div>
                ) : (
                  <div
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                      isMe
                        ? 'bg-[#3d2b1f] text-white rounded-br-none'
                        : 'bg-white text-[#3d2b1f] rounded-bl-none'
                    }`}
                  >
                    <div>{m.content}</div>
                    <div className={`text-[9px] mt-1 text-right ${isMe ? 'text-white/60' : 'text-[#b08978]'}`}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Emoji Reactions */}
        <div className="px-3 py-1.5 bg-white/60 backdrop-blur flex items-center justify-around text-lg border-t border-white/40">
          {['🔥', '⚔️', '👑', '👏', '😂', '🎯'].map((emoji) => (
            <button
              key={emoji}
              onClick={() => send(emoji)}
              className="hover:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white/90 backdrop-blur flex gap-2 border-t border-white/50">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 rounded-full border border-[#eadfd6] outline-none text-sm bg-white"
          />
          <button
            onClick={() => send()}
            className="w-11 h-11 rounded-full bg-[#3d2b1f] text-white flex items-center justify-center shadow"
          >
            <Send size={18} />
          </button>
        </div>

        {/* Challenge Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50">
            <div className="bg-white rounded-3xl p-6 text-center max-w-xs w-full shadow-2xl">
              <Swords className="mx-auto mb-2 text-rose-500" size={32} />
              <h3 className="font-extrabold text-lg text-[#3d2b1f]">Invite for Match</h3>
              <p className="text-xs text-[#8a6f5c] mb-4">Set a target score. First to reach it wins!</p>

              <div className="space-y-2 mb-5">
                {[1000, 2048, 5000].map((goal) => (
                  <button
                    key={goal}
                    onClick={() => setTargetGoal(goal)}
                    className={`w-full py-2.5 rounded-xl font-bold text-sm border transition ${
                      targetGoal === goal
                        ? 'bg-rose-500 text-white border-rose-500 shadow'
                        : 'bg-gray-50 text-[#3d2b1f] border-gray-200'
                    }`}
                  >
                    Target: {goal.toLocaleString()} pts
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-[#3d2b1f] text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={sendMatchInvite}
                  className="flex-1 py-2.5 bg-rose-500 text-white text-xs font-bold rounded-xl shadow"
                >
                  Send Challenge
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] via-[#f4c7b8] to-[#e8b4a8] px-4 py-6">
      <div className="max-w-md mx-auto">
        <Link href="/" className="text-sm font-semibold text-[#3d2b1f]">← Back to Game</Link>
        <h1 className="mt-6 text-3xl font-extrabold text-[#3d2b1f]">Messages</h1>

        <div className="mt-6 bg-white rounded-[28px] shadow-xl overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[#8a6f5c]">No friends yet.</p>
              <Link href="/friends" className="inline-block mt-3 text-sm font-semibold text-[#3d2b1f] underline">
                Add a friend
              </Link>
            </div>
          ) : (
            rows.map((row) => (
              <button
                key={row.other.id}
                onClick={() => {
                  setOpen(row.other);
                  if (user) loadThread(user.id, row.other);
                }}
                className="w-full flex items-center gap-3 px-5 py-4 border-b border-[#f4ebe4] last:border-0 text-left"
              >
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-400 to-rose-400 flex items-center justify-center font-extrabold text-white shrink-0 shadow-sm">
                  {(row.other.username || 'P').slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#3d2b1f] truncate">{row.other.username}</span>
                  </div>
                  <div className="text-sm text-[#8a6f5c] truncate">
                    {row.last ? row.last.content : 'No messages yet'}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#f8d5c8] text-[#6b5344]">Loading messages</div>}>
      <MessagesPage />
    </Suspense>
  );
}
