'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, MessageCircle, Send, Users, ChevronLeft, Search } from 'lucide-react';

export default function FriendsPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);
  const [reachable, setReachable] = useState<{ id: string; username: string } | null>(null);
  const [searchName, setSearchName] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchMsg, setSearchMsg] = useState('');
  const [chatFriend, setChatFriend] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/auth/login');
      setUser(user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(profileData);

      await loadFriends(user.id);
      setLoading(false);
    };
    load();
  }, [supabase, router]);

  const createNotification = async (
    toUserId: string,
    type: string,
    title: string,
    body: string,
    fromUserId?: string
  ) => {
    await supabase.from('notifications').insert({
      user_id: toUserId,
      type,
      title,
      body,
      from_user_id: fromUserId || null,
    });
  };

  const loadFriends = async (userId: string) => {
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
    if (error) setSearchMsg(error.message);

    const rows = data || [];
    const ids = Array.from(new Set(rows.flatMap((f: any) => [f.user_id, f.friend_id]).filter(Boolean)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id, username').in('id', ids);
      (people || []).forEach((person: any) => names.set(person.id, person.username || 'Player'));
    }

    const accepted: any[] = [];
    const pendingList: any[] = [];
    const sentList: any[] = [];
    rows.forEach((f: any) => {
      if (f.status === 'accepted') {
        const otherId = f.user_id === userId ? f.friend_id : f.user_id;
        accepted.push({ ...f, other: { id: otherId, username: names.get(otherId) || 'Player' } });
      } else if (f.friend_id === userId && f.status === 'pending') {
        pendingList.push({ ...f, other: { id: f.user_id, username: names.get(f.user_id) || 'Player' } });
      } else if (f.user_id === userId && f.status === 'pending') {
        sentList.push({ ...f, other: { id: f.friend_id, username: names.get(f.friend_id) || 'Player' } });
      }
    });

    setFriends(accepted);
    setPending(pendingList);
    setOutgoing(sentList);
  };

  const searchUser = async () => {
    setSearchMsg('');
    setSearchResult(null);
    setReachable(null);
    if (!searchName.trim()) return;

    const { data } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', searchName.trim())
      .neq('id', user.id)
      .limit(1)
      .maybeSingle();

    if (!data) {
      setSearchMsg('User not found');
      return;
    }
    setSearchResult(data);
  };

  const sendFriendRequest = async (friendId: string) => {
    const { error } = await supabase.from('friendships').insert({
      user_id: user.id,
      friend_id: friendId,
      status: 'pending',
    });
    if (error) {
      setSearchMsg(error.message.includes('unique') ? 'Already sent or already friends' : 'Error sending request');
      return;
    }
    await createNotification(
      friendId,
      'friend_request',
      'New Friend Request',
      `${profile?.username || 'Someone'} sent you a friend request`,
      user.id
    );
    const person = { id: friendId, username: searchResult?.username || 'Player' };
    setReachable(person);
    setSearchMsg('Request sent. You can message them now.');
    setSearchResult(null);
    setSearchName('');
    loadFriends(user.id);
  };

  const acceptRequest = async (friendshipId: string, fromUserId: string) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);

    if (error) {
      setSearchMsg('Accept failed. Check database policies and try again.');
      return;
    }

    await createNotification(
      fromUserId,
      'friend_accepted',
      'Friend Request Accepted',
      `${profile?.username || 'Someone'} accepted your friend request`,
      user.id
    );
    loadFriends(user.id);
  };

  const openChat = async (friend: any) => {
    setChatFriend(friend);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${friend.other.id}),and(sender_id.eq.${friend.other.id},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true })
      .limit(50);
    setMessages(data || []);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !chatFriend) return;
    const content = newMsg.trim();
    setNewMsg('');

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: chatFriend.other.id,
        content,
      })
      .select()
      .single();

    if (error) {
      setNewMsg(content);
      setSearchMsg('Message did not send');
      return;
    }

    if (data) {
      setMessages((prev) => [...prev, data]);
      await createNotification(
        chatFriend.other.id,
        'message',
        'New Message',
        `${profile?.username || 'Someone'}: ${content.slice(0, 60)}`,
        user.id
      );
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f8d5c8] to-[#e8b4a8]">
        Loading...
      </div>
    );
  }

  if (chatFriend) {
    const name = chatFriend.other?.username || 'Friend';
    return (
      <div className="min-h-screen bg-[#f3e7df] flex flex-col">
        <div className="sticky top-0 z-20 bg-[#fffaf7]/95 backdrop-blur px-3 py-2.5 flex items-center gap-2 border-b border-[#eadfd6]">
          <button type="button" aria-label="Back to friends" onClick={() => setChatFriend(null)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-[#3d2b1f]">
            <ChevronLeft size={22} />
          </button>
          <div className="w-10 h-10 rounded-full bg-[#3d2b1f] text-white flex items-center justify-center font-bold shrink-0">
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[#3d2b1f] truncate">{name}</div>
            <div className="text-[11px] text-[#8a6f5c]">Friend</div>
          </div>
          <Link href={`/messages?with=${chatFriend.other.id}`} className="min-h-11 inline-flex items-center px-3 text-sm font-semibold text-[#3d2b1f]">
            Open
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto scroll-smooth p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-sm text-[#8a6f5c] mt-10">No messages yet. Say something.</p>
          )}
          {messages.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] px-4 py-2.5 rounded-3xl text-[15px] leading-relaxed ${
                    mine
                      ? 'bg-[#3d2b1f] text-white rounded-br-md'
                      : 'bg-white text-[#3d2b1f] rounded-bl-md shadow-sm'
                  }`}
                >
                  <div>{m.content}</div>
                  <div className={`text-[11px] mt-1 text-right ${mine ? 'text-white/70' : 'text-[#a08070]'}`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        <form
          className="sticky bottom-0 bg-[#fffaf7]/95 backdrop-blur border-t border-[#eadfd6] p-3 flex gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
        >
          <label className="sr-only" htmlFor="friend-message">Message</label>
          <input
            id="friend-message"
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            placeholder="Type a message"
            className="flex-1 min-h-12 px-4 rounded-full border border-[#eadfd6] outline-none text-base bg-white"
          />
          <button
            type="submit"
            aria-label="Send message"
            className="min-w-12 min-h-12 rounded-full bg-[#3d2b1f] text-white flex items-center justify-center"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] via-[#f4c7b8] to-[#e8b4a8] p-5">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-[#5c4334]">
            ← Back to Game
          </Link>
          <Link href="/messages" className="w-11 h-11 rounded-full bg-white/80 shadow flex items-center justify-center">
            <MessageCircle size={18} className="text-[#4a3728]" />
          </Link>
        </div>

        <div className="text-center mt-6 mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#4a3728] text-white shadow-lg mb-3">
            <Users size={26} />
          </div>
          <h1 className="text-2xl font-extrabold text-[#3d2b1f]">Friends</h1>
          <p className="text-sm text-[#6b5344] mt-1">Add friends and chat</p>
        </div>

        <div className="bg-white/90 backdrop-blur rounded-2xl p-4 shadow-md border border-white/50 mb-5">
          <h2 className="font-semibold text-[#4a3728] mb-3 flex items-center gap-2">
            <UserPlus size={18} /> Add Friend
          </h2>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUser()}
                placeholder="Search by username"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#4a3728]"
              />
            </div>
            <button
              onClick={searchUser}
              className="px-4 py-2.5 bg-[#4a3728] text-white rounded-xl text-sm font-medium"
            >
              Search
            </button>
          </div>
          {searchMsg && <p className="text-sm text-[#6b5344] mt-2">{searchMsg}</p>}
          {reachable && (
            <div className="mt-3 flex items-center justify-between gap-3 bg-[#f8f4f0] rounded-xl p-3">
              <span className="font-medium text-[#4a3728]">{reachable.username}</span>
              <button
                type="button"
                onClick={() => openChat({ other: reachable })}
                className="min-h-11 inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#3d2b1f] px-3 rounded-full"
              >
                <MessageCircle size={15} /> Message
              </button>
            </div>
          )}
          {searchResult && (
            <div className="mt-3 flex items-center justify-between bg-[#f8f4f0] rounded-xl p-3">
              <span className="font-medium text-[#4a3728]">{searchResult.username}</span>
              <button
                onClick={() => sendFriendRequest(searchResult.id)}
                className="text-sm bg-[#4a3728] text-white px-3 py-1.5 rounded-full"
              >
                Add
              </button>
            </div>
          )}
        </div>

        {pending.length > 0 && (
          <div className="mb-5">
            <h2 className="font-semibold text-[#4a3728] mb-2">Friend Requests</h2>
            <div className="space-y-2">
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-amber-50 rounded-xl p-3 border border-amber-100"
                >
                  <span className="font-medium text-[#4a3728]">{p.other?.username}</span>
                  <button
                    onClick={() => acceptRequest(p.id, p.other?.id)}
                    className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-full"
                  >
                    Accept
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="mb-5">
            <h2 className="font-semibold text-[#4a3728] mb-2">Requests you sent</h2>
            <div className="space-y-2">
              {outgoing.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 bg-white/90 rounded-xl p-3.5 shadow-sm border border-white/50">
                  <div className="min-w-0">
                    <div className="font-medium text-[#4a3728] truncate">{f.other?.username || 'Player'}</div>
                    <div className="text-xs text-[#8a6f5c]">Waiting for them to accept</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openChat(f)}
                    className="min-h-11 shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-[#3d2b1f] bg-[#f8f4f0] px-3 rounded-full"
                  >
                    <MessageCircle size={15} /> Message
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="font-semibold text-[#4a3728] mb-2">
            Your Friends ({friends.length})
          </h2>
          {friends.length === 0 ? (
            <div className="bg-white/60 rounded-2xl p-6 text-center text-sm text-[#8a6f5c]">
              No friends yet. Search by username above.
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between bg-white/90 backdrop-blur rounded-xl p-3.5 shadow-sm border border-white/50"
                >
                  <span className="font-medium text-[#4a3728]">
                    {f.other?.username || 'Player'}
                  </span>
                  <button
                    onClick={() => openChat(f)}
                    className="flex items-center gap-1.5 text-sm font-medium text-[#4a3728] bg-[#f8f4f0] px-3 py-1.5 rounded-full"
                  >
                    <MessageCircle size={15} /> Message
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
