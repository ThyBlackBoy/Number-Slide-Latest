set lock_timeout='3s';
-- Fixed-size state per player/action, rather than an ever-growing request log.
create table public.request_budgets (
 user_id uuid not null references auth.users(id) on delete cascade,
 action text not null,
 window_started timestamptz not null,
 requests integer not null,
 primary key(user_id,action)
);
alter table public.request_budgets enable row level security;
revoke all on public.request_budgets from public,anon,authenticated;
create function public.consume_request_budget(action_name text,request_limit integer) returns void
language plpgsql security definer set search_path='' as $$
declare player uuid:=auth.uid();ts timestamptz:=clock_timestamp();begin
 if player is null then raise exception 'Sign in first' using errcode='42501';end if;
 insert into public.request_budgets(user_id,action,window_started,requests) values(player,action_name,ts,1)
 on conflict(user_id,action) do update set
   requests=case when request_budgets.window_started<=ts-interval '1 minute' then 1 else request_budgets.requests+1 end,
   window_started=case when request_budgets.window_started<=ts-interval '1 minute' then ts else request_budgets.window_started end
 where request_budgets.window_started<=ts-interval '1 minute' or request_budgets.requests<request_limit;
 if not found then raise exception 'Too many requests. Try again shortly.' using errcode='P0001';end if;
end $$;
revoke all on function public.consume_request_budget(text,integer) from public,anon,authenticated;
create function public.guard_creation_budget() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Administrators without an end-user session may run maintenance/backfills.
 if auth.uid() is not null then
   perform public.consume_request_budget(tg_table_name||'_writes',case when tg_table_name='matches' then 10
     when tg_table_name in ('friends','friendships') then 30 else 120 end);
 end if;
 return new;
end $$;
revoke all on function public.guard_creation_budget() from public,anon,authenticated;
create trigger match_creation_budget before insert on public.matches for each row execute function public.guard_creation_budget();
create trigger friendships_creation_budget before insert on public.friendships for each row execute function public.guard_creation_budget();
create trigger friends_creation_budget before insert on public.friends for each row execute function public.guard_creation_budget();
create trigger scores_write_budget before insert or update on public.scores for each row execute function public.guard_creation_budget();
create trigger daily_write_budget before insert or update on public.daily_scores for each row execute function public.guard_creation_budget();

create function public.guard_friendship_write() returns trigger
language plpgsql security invoker set search_path='' as $$
declare player uuid:=auth.uid();begin
 if current_user in ('postgres','supabase_admin','service_role') then return new;end if;
 if player is null then raise exception 'Sign in first' using errcode='42501';end if;
 if tg_op='INSERT' then
   if new.user_id is distinct from player or new.friend_id is null or new.friend_id=player or new.status is distinct from 'pending' then
     raise exception 'Invalid friend request' using errcode='42501';end if;
   new.created_at:=now();return new;
 end if;
 if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.friend_id is distinct from old.friend_id
   or new.created_at is distinct from old.created_at then raise exception 'Friend request identity is immutable' using errcode='42501';end if;
 if new.status is distinct from old.status and (player is distinct from old.friend_id or old.status is distinct from 'pending' or new.status is null or new.status not in ('accepted','rejected')) then
   raise exception 'Only the recipient can respond to a pending request' using errcode='42501';end if;
 return new;
end $$;
revoke all on function public.guard_friendship_write() from public,anon,authenticated;
create trigger guard_friendship_write before insert or update on public.friendships for each row execute function public.guard_friendship_write();
create trigger guard_friends_write before insert or update on public.friends for each row execute function public.guard_friendship_write();

-- One authenticated network request atomically saves both boards.
create or replace function public.publish_score(new_score integer, new_tile integer, game_mode text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  player uuid := auth.uid();
  day date := (now() at time zone 'Africa/Lagos')::date;
  day_start timestamptz := day::timestamp at time zone 'Africa/Lagos';
  previous_daily integer;
  previous_best integer;
  daily_best integer;
  all_best integer;
  today_row uuid;
  daily_king record;
  all_king record;
  daily_place bigint;
  all_place bigint;
  daily_total bigint;
  daily_behind bigint;
  player_name text;
begin
  if player is null then raise exception 'Sign in first' using errcode='42501'; end if;
  if new_score is null or new_score <= 0 or new_tile is null or new_tile < 2 or (new_tile & (new_tile-1)) <> 0
    or game_mode is null or game_mode not in ('easy','normal','hard') then
    raise exception 'Invalid score payload' using errcode='22023';
  end if;
  perform public.consume_request_budget('publish_score',120);
  -- Serialize this player's submissions across devices, without blocking other players.
  perform pg_advisory_xact_lock(hashtextextended(player::text, 731));
  select coalesce(max(d.score),0) into previous_daily from public.daily_scores d where d.user_id=player and d.challenge_date=day;
  select coalesce((select b.score from public.best_scores b where b.user_id=player),0) into previous_best;
  select d.user_id,d.score into daily_king from public.daily_scores d
    where d.challenge_date=day and d.user_id<>player order by d.score desc,d.user_id limit 1;
  select b.user_id,b.score into all_king from public.best_scores b
    where b.user_id<>player and b.score>0 order by b.score desc,b.user_id limit 1;

  insert into public.daily_scores(user_id,score,max_tile,challenge_date)
    values(player,new_score,new_tile,day)
    on conflict(user_id,challenge_date) do update set score=excluded.score,max_tile=excluded.max_tile
    where public.daily_scores.score < excluded.score;
  if new_score>previous_best then
    select s.id into today_row from public.scores s where s.user_id=player and s.created_at>=day_start
      order by s.score desc,s.id limit 1 for update;
    if today_row is null then
      insert into public.scores(user_id,score,max_tile,mode) values(player,new_score,new_tile,game_mode);
    else
      update public.scores set score=new_score,max_tile=new_tile,mode=game_mode where id=today_row and score<new_score;
    end if;
  end if;
  daily_best := greatest(previous_daily,new_score);
  select b.score into all_best from public.best_scores b where b.user_id=player;
  select 1+count(distinct d.user_id) into daily_place from public.daily_scores d
    where d.challenge_date=day and d.score>daily_best;
  select 1+count(*) into all_place from public.best_scores b where b.score>all_best;
  select count(*),count(*) filter(where d.score<daily_best) into daily_total,daily_behind
    from public.daily_scores d where d.challenge_date=day;

  select username into player_name from public.profiles where id=player;
  -- Server-authored events cannot spoof another player's identity. Supported type is system.
  if daily_king.user_id is not null and new_score>daily_king.score and previous_daily<=daily_king.score then
    insert into public.notifications(user_id,type,title,body,from_user_id)
      values(daily_king.user_id,'system','A new daily leader',player_name||' took the daily lead. Come take it back.',player);
  end if;
  if all_king.user_id is not null and new_score>all_king.score and previous_best<=all_king.score
      and all_king.user_id is distinct from daily_king.user_id then
    insert into public.notifications(user_id,type,title,body,from_user_id)
      values(all_king.user_id,'system','A new all-time leader',player_name||' took the all-time lead. Come take it back.',player);
  end if;
  return jsonb_build_object('saved',true,'standing',jsonb_build_object(
    'todayTop',daily_place=1,'allTimeTop',all_place=1,'todayPlace',daily_place,'allTimePlace',all_place),
    'percent',case when daily_total>0 then round(100.0*daily_behind/daily_total) else null end);
end;
$$;
revoke all on function public.publish_score(integer,integer,text) from public,anon;
grant execute on function public.publish_score(integer,integer,text) to authenticated;

create or replace function public.guard_match_write() returns trigger
language plpgsql security invoker set search_path='' as $$
declare player uuid:=auth.uid(); begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if player is null then raise exception 'Sign in first' using errcode='42501'; end if;
 if tg_op='INSERT' then
   if new.creator_id is distinct from player or new.opponent_id is not null or new.status is distinct from 'waiting'
     or coalesce(new.creator_score,0)<>0 or coalesce(new.opponent_score,0)<>0 or new.winner_id is not null
     or new.time_limit is distinct from 60 then raise exception 'Invalid new match' using errcode='42501'; end if;
   new.creator_score:=0;new.opponent_score:=0;
   new.started_at:=null; new.finished_at:=null; new.created_at:=now();
   return new;
 end if;
 if new.id is distinct from old.id or new.creator_id is distinct from old.creator_id
   or new.time_limit is distinct from old.time_limit or new.created_at is distinct from old.created_at then
   raise exception 'Match identity is immutable' using errcode='42501'; end if;
 if old.status='waiting' then
   if old.opponent_id is not null or player=old.creator_id or new.opponent_id is distinct from player or new.status is distinct from 'playing' then
     raise exception 'Invalid match join' using errcode='42501'; end if;
   new.creator_score:=old.creator_score;new.opponent_score:=old.opponent_score;
   new.winner_id:=null;new.started_at:=now();new.finished_at:=null;
   return new;
 end if;
 if player is distinct from old.creator_id and player is distinct from old.opponent_id then
   raise exception 'Not a participant' using errcode='42501'; end if;
 if new.opponent_id is distinct from old.opponent_id or new.started_at is distinct from old.started_at then
   raise exception 'Match participants are immutable' using errcode='42501'; end if;
 if old.status='finished' then return old; end if;
 if old.status is distinct from 'playing' or new.status is null or new.status not in ('playing','finished') then
   raise exception 'Invalid match transition' using errcode='42501'; end if;
 -- Preserve the opponent's score even if a stale legacy client includes both scores.
 if player=old.creator_id then
   new.opponent_score:=old.opponent_score;
   if new.creator_score is null or new.creator_score<coalesce(old.creator_score,0) then raise exception 'Invalid score'; end if;
 else
   new.creator_score:=old.creator_score;
   if new.opponent_score is null or new.opponent_score<coalesce(old.opponent_score,0) then raise exception 'Invalid score'; end if;
 end if;
 new.winner_id:=old.winner_id; new.finished_at:=old.finished_at;
 if new.status='finished' then
   if now()<old.started_at+make_interval(secs=>old.time_limit) and not(new.creator_score>0 and new.opponent_score>0) then
     raise exception 'Match has not ended'; end if;
   new.winner_id:=case when new.creator_score>new.opponent_score then old.creator_id
     when new.opponent_score>new.creator_score then old.opponent_id else null end;
   new.finished_at:=now();
 end if;
 return new;
end $$;
