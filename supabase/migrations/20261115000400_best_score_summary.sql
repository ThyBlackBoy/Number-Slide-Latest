set lock_timeout='3s';
-- One public best-score row per player. History remains the source of truth.
create table public.best_scores (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 score integer not null default 0,
 max_tile integer,
 mode text
);
alter table public.best_scores enable row level security;
revoke all on public.best_scores from public,anon,authenticated;
grant select on public.best_scores to anon,authenticated;
create policy best_scores_public_read on public.best_scores for select using(true);
create index best_scores_rank_idx on public.best_scores(score desc,user_id);
create index if not exists daily_scores_user_best_idx on public.daily_scores(user_id,score desc);

create function public.refresh_player_best(player uuid) returns void
language plpgsql security definer set search_path='' as $$
declare best record;begin
 if player is null or not exists(select 1 from public.profiles p where p.id=player) then return;end if;
 -- Lock only the summary row; separate statements see freshly committed source rows
 -- after waiting for another writer. Zero rows remain to avoid delete/recreate races.
 insert into public.best_scores(user_id) values(player) on conflict do nothing;
 perform 1 from public.best_scores where user_id=player for update;
 select x.score,x.max_tile,x.mode into best from (
   (select s.score,s.max_tile,s.mode,0 priority from public.scores s where s.user_id=player and s.score>0
     order by s.score desc,s.max_tile desc nulls last,s.mode,s.id limit 1)
   union all
   (select d.score,d.max_tile,'daily'::text,1 from public.daily_scores d where d.user_id=player and d.score>0
     order by d.score desc,d.max_tile desc nulls last,d.id limit 1)
 ) x order by x.score desc,x.priority,x.max_tile desc nulls last,x.mode limit 1;
 update public.best_scores set score=coalesce(best.score,0),max_tile=best.max_tile,mode=best.mode where user_id=player;
end $$;
revoke all on function public.refresh_player_best(uuid) from public,anon,authenticated;
create function public.sync_player_best() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then perform public.refresh_player_best(old.user_id);return old;end if;
 if tg_op='UPDATE' and old.user_id is distinct from new.user_id then
   -- Stable lock ordering when an administrator reassigns a score.
   if old.user_id<new.user_id then
     perform public.refresh_player_best(old.user_id);perform public.refresh_player_best(new.user_id);
   else
     perform public.refresh_player_best(new.user_id);perform public.refresh_player_best(old.user_id);
   end if;
 else perform public.refresh_player_best(new.user_id);end if;
 return new;
end $$;
revoke all on function public.sync_player_best() from public,anon,authenticated;
create trigger scores_best_sync after insert or update or delete on public.scores for each row execute function public.sync_player_best();
create trigger daily_best_sync after insert or update or delete on public.daily_scores for each row execute function public.sync_player_best();
-- Backfill inside the same migration transaction before readers switch over.
select public.refresh_player_best(p.id) from public.profiles p order by p.id;

create or replace function public.leaderboard_page(board text, page_offset integer default 0)
returns table(user_id uuid, score integer, max_tile integer, mode text, profiles jsonb, title text)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if board not in ('daily','alltime') or board is null or page_offset is null or page_offset < 0 or page_offset > 100000 then
    raise exception 'Invalid leaderboard page' using errcode = '22023';
  end if;
  return query
  with daily_candidates as (
    select s.user_id,s.score,s.max_tile,s.mode,0 priority from public.scores s
    where board='daily' and s.score>0
      and s.created_at >= ((now() at time zone 'Africa/Lagos')::date::timestamp at time zone 'Africa/Lagos')
      and s.created_at < (((now() at time zone 'Africa/Lagos')::date+1)::timestamp at time zone 'Africa/Lagos')
    union all
    select d.user_id,d.score,d.max_tile,'today'::text,1 from public.daily_scores d
    where board='daily' and d.score>0 and d.challenge_date=(now() at time zone 'Africa/Lagos')::date
  ), daily_best as (
    select distinct on(c.user_id) c.user_id,c.score,c.max_tile,c.mode from daily_candidates c
    where c.user_id is not null order by c.user_id,c.score desc,c.priority,c.max_tile desc nulls last,c.mode
  ), best as (
    select b.user_id,b.score,b.max_tile,b.mode from public.best_scores b where board='alltime' and b.score>0
    union all select d.user_id,d.score,d.max_tile,d.mode from daily_best d
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
