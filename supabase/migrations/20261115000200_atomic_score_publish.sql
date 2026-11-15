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
  select coalesce(max(s.score),0) into previous_best from public.scores s where s.user_id=player;
  select d.user_id,d.score into daily_king from public.daily_scores d
    where d.challenge_date=day and d.user_id<>player order by d.score desc,d.user_id limit 1;
  select x.user_id,x.score into all_king from (
    select s.user_id,s.score from public.scores s where s.user_id<>player
    union all select d.user_id,d.score from public.daily_scores d where d.user_id<>player
  ) x order by x.score desc,x.user_id limit 1;

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
  select greatest(new_score,coalesce(max(x.score),0)) into all_best from (
    select s.score from public.scores s where s.user_id=player
    union all select d.score from public.daily_scores d where d.user_id=player
  ) x;
  select 1+count(distinct d.user_id) into daily_place from public.daily_scores d
    where d.challenge_date=day and d.score>daily_best;
  select 1+count(distinct x.user_id) into all_place from (
    select s.user_id from public.scores s where s.score>all_best
    union all select d.user_id from public.daily_scores d where d.score>all_best
  ) x;
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
