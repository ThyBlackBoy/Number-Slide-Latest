-- Public board data only; private friendship state is loaded separately.
set lock_timeout = '3s';
create index if not exists scores_user_best_idx on public.scores(user_id, score desc, created_at desc);
create index if not exists daily_scores_day_best_idx on public.daily_scores(challenge_date, score desc);
create index if not exists messages_thread_recent_idx on public.messages(sender_id, receiver_id, created_at desc);
create index if not exists messages_receiver_recent_idx on public.messages(receiver_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, read, created_at desc);
create index if not exists friendships_receiver_idx on public.friendships(friend_id);
create index if not exists friends_receiver_idx on public.friends(friend_id);

create or replace function public.leaderboard_page(board text, page_offset integer default 0)
returns table(user_id uuid, score integer, max_tile integer, mode text, profiles jsonb, title text)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if board not in ('daily','alltime') or board is null or page_offset is null or page_offset < 0 or page_offset > 100000 then
    raise exception 'Invalid leaderboard page' using errcode = '22023';
  end if;
  return query
  with candidates as (
    select s.user_id, s.score, s.max_tile, s.mode, 0 as priority
    from public.scores s
    where s.score > 0 and (board = 'alltime' or
      (s.created_at >= ((now() at time zone 'Africa/Lagos')::date::timestamp at time zone 'Africa/Lagos')
       and s.created_at < (((now() at time zone 'Africa/Lagos')::date + 1)::timestamp at time zone 'Africa/Lagos')))
    union all
    select d.user_id, d.score, d.max_tile, case when board='daily' then 'today' else 'daily' end, 1
    from public.daily_scores d
    where d.score > 0 and (board='alltime' or d.challenge_date=(now() at time zone 'Africa/Lagos')::date)
  ), best as (
    select distinct on (c.user_id) c.user_id,c.score,c.max_tile,c.mode
    from candidates c where c.user_id is not null
    order by c.user_id,c.score desc,c.priority,c.max_tile desc nulls last,c.mode
  ), page as (
    select b.* from best b order by b.score desc,b.user_id limit 100 offset page_offset
  )
  select page.user_id,page.score,page.max_tile,page.mode,
    jsonb_build_object('username',p.username,'level',p.level),a.title
  from page join public.profiles p on p.id=page.user_id
  left join public.player_identity i on i.user_id=page.user_id
  left join public.achievement_catalog a on a.id=i.achievement_id
  order by page.score desc,page.user_id;
end;
$$;
revoke all on function public.leaderboard_page(text,integer) from public;
grant execute on function public.leaderboard_page(text,integer) to anon,authenticated;
