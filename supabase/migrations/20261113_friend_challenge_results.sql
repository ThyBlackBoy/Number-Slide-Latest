create table public.friend_challenge_scores (
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 score integer not null check(score >= 0 and score <= 10000000),
 primary key(message_id,user_id)
);
alter table public.friend_challenge_scores enable row level security;
revoke all on public.friend_challenge_scores from anon, authenticated;
create or replace function public.friend_challenge_result(invite_id uuid, final_score integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare invitation public.messages; mine integer; theirs integer; other_id uuid; other_name text;
begin
 select * into invitation from public.messages where id=invite_id;
 if auth.uid() is null or invitation.id is null or auth.uid() not in (invitation.sender_id,invitation.receiver_id)
 or invitation.content !~ '^\[INVITE:[0-9]+\]' then raise exception 'Challenge unavailable'; end if;
 other_id := case when auth.uid()=invitation.sender_id then invitation.receiver_id else invitation.sender_id end;
 if final_score is not null then
 insert into public.friend_challenge_scores(message_id,user_id,score) values(invite_id,auth.uid(),final_score) on conflict do nothing;
 end if;
 select score into mine from public.friend_challenge_scores where message_id=invite_id and user_id=auth.uid();
 select score into theirs from public.friend_challenge_scores where message_id=invite_id and user_id=other_id;
 select username into other_name from public.profiles where id=other_id;
 return jsonb_build_object('mine',mine,'theirs',theirs,'opponent',coalesce(other_name,'Opponent'),
 'result',case when mine is null or theirs is null then null when mine>theirs then 'win' when mine<theirs then 'lose' else 'draw' end);
end $$;
revoke all on function public.friend_challenge_result(uuid,integer) from public,anon;
grant execute on function public.friend_challenge_result(uuid,integer) to authenticated;
