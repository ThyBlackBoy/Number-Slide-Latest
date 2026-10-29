'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Send, X } from 'lucide-react';

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
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const seenKey = (id: string) => `ns_chat_seen_${id}`;

  const markSeen = (id: string) => {
    localStorage.setItem(seenKey(id), new Date().toISOString());
  };

  const unread = (row: Row) => {
    if (!row.last || row.last.sender_id === user?.id) return false;
    const seen = localStorage.getItem(seenKey(row.other.id));
    if (!seen) return true;
    return new Date(row.last.created_at).getTime() > new Date(seen).getTime();
  };

  const loadInbox = async (userId: string) => {
    const { data: links } = await supabase
      .from('friends')
      .select('*, friend:friend_id(id, username), requester:user_id(id, username)')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    const people = new Map<string, Person>();
    (links || []).forEach((f: any) => {
      const other = f.user_id === userId ? f.friend : f.requester;
      if (other?.id) people.set(other.id, { id: other.id, username: other.username || 'Player' });
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

    const missing = [...people.values()].filter((p) => p.username === 'Player').map((p) => p.id);
    if (missing.length) {
      const { data: names } = await supabase.from('profiles').select('id, username').in('id', missing);
      (names || []).forEach((n: any) => {
        const cur = people.get(n.id);
        if (cur) people.set(n.id, { id: n.id, username: n.username || 'Player' });
      });
    }

    const list: Row[] = [...people.values()].map((other) => ({ other, last: lastBy.get(other.id) }));
    list.sort((a, b) => {
      const at = a.last ? new Date(a.last.created_at).getTime() : 0;
      const bt = b.last ? new Date(b.last.created_at).getTime() : 0;
      return bt - at;
    });
    setRows(list);
    return list;
  };

  const loadThread = async (userId: string, other: Person) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${other.id}),and(sender_id.eq.${other.id},receiver_id.eq.${userId})`
      )
      .order('created_at', { ascending: true })
      .limit(80);
    setMessages(data || []);
    markSeen(other.id);
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

  const send = async () => {
    if (!user || !open || !text.trim()) return;
    const content = text.trim();
    setText('');
    const { data } = await supabase
      .from('messages')
      .insert({ sender_id: user.id, receiver_id: open.id, content })
      .select()
      .single();
    if (data) {
      setMessages((prev) => [...prev, data]);
      await supabase.from('notifications').insert({
        user_id: open.id,
        type: 'message',
        title: 'New Message',
        body: `${profile?.username || 'Someone'}: ${content.slice(0, 60)}`,
        from_user_id: user.id,
      });
      markSeen(open.id);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f8d5c8] to-[#e8b4a8] text-[#6b5344]">
        Loading messages
      </div>
    );
  }

  if (open) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] to-[#e8b4a8] flex flex-col">
        <div className="bg-white/90 px-4 py-3 flex items-center gap-3 shadow">
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
            <div className="font-bold text-[#3d2b1f]">{open.username}</div>
            <div className="text-[11px] text-[#a08070]">Friend</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.length === 0 && (
            <p className="text-center text-sm text-[#8a6f5c] mt-10">No messages yet. Say something.</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                  m.sender_id === user.id
                    ? 'bg-[#3d2b1f] text-white rounded-br-md'
                    : 'bg-white text-[#3d2b1f] rounded-bl-md shadow'
                }`}
              >
                <div>{m.content}</div>
                <div className={`text-[10px] mt-1 ${m.sender_id === user.id ? 'text-white/60' : 'text-[#b08978]'}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="p-3 bg-white/90 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Message"
            className="flex-1 px-4 py-2.5 rounded-full border border-[#eadfd6] outline-none text-sm"
          />
          <button onClick={send} className="w-11 h-11 rounded-full bg-[#3d2b1f] text-white flex items-center justify-center">
            <Send size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] via-[#f4c7b8] to-[#e8b4a8] px-4 py-6">
      <div className="max-w-md mx-auto">
        <Link href="/" className="text-sm font-semibold text-[#3d2b1f]">← Back to Game</Link>
        <h1 className="mt-6 text-3xl font-extrabold text-[#3d2b1f]">Messages</h1>
        <p className="text-sm text-[#8a6f5c] mt-1">Your chats stay here.</p>

        <div className="mt-6 bg-white rounded-[28px] shadow-xl overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[#8a6f5c]">No friends yet.</p>
              <Link href="/friends" className="inline-block mt-3 text-sm font-semibold text-[#3d2b1f] underline underline-offset-4">
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
                <div className="w-11 h-11 rounded-full bg-[#f4c7b8] flex items-center justify-center font-bold text-[#3d2b1f] shrink-0">
                  {(row.other.username || 'P').slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#3d2b1f] truncate">{row.other.username}</span>
                    {row.last && (
                      <span className="text-[11px] text-[#b08978] shrink-0">
                        {new Date(row.last.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-[#8a6f5c] truncate">
                    {row.last ? row.last.content : 'No messages yet'}
                  </div>
                </div>
                {unread(row) && <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />}
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