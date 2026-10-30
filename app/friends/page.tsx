'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, MessageCircle, Send, Users, X, Search } from 'lucide-react';

export default function FriendsPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
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
    const { data } = await supabase
      .from('friends')
      .select('*, friend:friend_id(id, username), requester:user_id(id, username)')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    const accepted: any[] = [];
    const pendingList: any[] = [];

    (data || []).forEach((f: any) => {
      if (f.status === 'accepted') {
        const other = f.user_id === userId ? f.friend : f.requester;
        accepted.push({ ...f, other });
      } else if (f.friend_id === userId && f.status === 'pending') {
        pendingList.push({ ...f, other: f.requester });
      }
    });

    setFriends(accepted);
    setPending(pendingList);
  };

  const searchUser = async () => {
    setSearchMsg('');
    setSearchResult(null);
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
    const { error } = await supabase.from('friends').insert({
      user_id: user.id,
      friend_id: friendId,
      status: 'pending',
    });
    if (error) {
      setSearchMsg(error.message.includes('unique') ? 'Already sent or already friends' : 'Error');
    } else {
      await createNotification(
        friendId,
        'friend_request',
        'New Friend Request',
        `${profile?.username || 'Someone'} sent you a friend request`,
        user.id
      );
      setSearchMsg('Request sent!');
      setSearchResult(null);
      setSearchName('');
    }
  };

    const acceptRequest = async (friendshipId: string, fromUserId: string) => {
    const { error } = await supabase.from('friends').update({ status: 'accepted' }).eq('id', friendshipId);
    if (error) {
      setSearchMsg('Accept failed. Run the new Supabase rules, then try again.');
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

    const { data } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: chatFriend.other.id,
        content,
      })
      .select()
      .single();

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
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] to-[#e8b4a8] flex flex-col">
        <div className="bg-white/90 backdrop-blur px-4 py-3 flex items-center gap-3 shadow">
          <button onClick={() => setChatFriend(null)} className="text-[#4a3728]">
            <X size={22} />
          </button>
          <div className="font-bold text-[#4a3728]">
            {chatFriend.other?.username || 'Friend'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender_id === user.id ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                  m.sender_id === user.id
                    ? 'bg-[#4a3728] text-white rounded-br-md'
                    : 'bg-white text-[#4a3728] rounded-bl-md shadow'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="p-3 bg-white/90 flex gap-2">
          <input
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 outline-none text-sm"
          />
          <button
            onClick={sendMessage}
            className="w-11 h-11 rounded-full bg-[#4a3728] text-white flex items-center justify-center"
          >
            <Send size={18} />
          </button>
        </div>
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
                    <MessageCircle size={15} /> Chat
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
