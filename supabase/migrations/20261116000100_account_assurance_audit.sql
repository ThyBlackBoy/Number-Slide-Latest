set lock_timeout='3s';
create table public.security_admins(user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.security_admins enable row level security;
revoke all on public.security_admins from public,anon,authenticated;

create function public.account_assurance_ok() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
   (coalesce(auth.jwt()->>'aal'='aal2',false) and (
      not exists(select 1 from public.security_admins a where a.user_id=auth.uid())
      or exists(select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.status='verified')
   )) or (
     not exists(select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.status='verified')
     and not exists(select 1 from public.security_admins a where a.user_id=auth.uid())
   )
 )
$$;
revoke all on function public.account_assurance_ok() from public,anon;
grant execute on function public.account_assurance_ok() to authenticated;
create function public.require_account_assurance() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(public.account_assurance_ok(),false) then raise exception 'Verify your authenticator before accessing your account' using errcode='42501';end if;
end $$;
revoke all on function public.require_account_assurance() from public,anon,authenticated;
create function public.is_security_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.jwt()->>'aal'='aal2',false) and exists(select 1 from public.security_admins a where a.user_id=auth.uid())
   and exists(select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.status='verified')
$$;
revoke all on function public.is_security_admin() from public,anon;
grant execute on function public.is_security_admin() to authenticated;
create function public.account_security_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('administrator',exists(select 1 from public.security_admins a where a.user_id=auth.uid()),
   'verified_session',coalesce(auth.jwt()->>'aal'='aal2',false),'access_allowed',coalesce(public.account_assurance_ok(),false))
$$;
revoke all on function public.account_security_status() from public,anon;
grant execute on function public.account_security_status() to authenticated;

do $$ declare tbl text;begin
 foreach tbl in array array['profiles','scores','daily_scores','level_progress','saved_runs','messages','notifications','friends','friendships','matches','player_achievements','player_identity'] loop
   execute format('create policy account_mfa_required on public.%I as restrictive for all to authenticated using ((select public.account_assurance_ok())) with check ((select public.account_assurance_ok()))',tbl);
 end loop;
end $$;

create table public.security_audit (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(), actor_id uuid,
 actor_kind text not null, entity text not null, operation text not null,
 subject_id uuid, before_values jsonb, after_values jsonb
);
alter table public.security_audit enable row level security;
revoke all on public.security_audit from public,anon,authenticated;
grant select on public.security_audit to authenticated;
create policy admin_audit_read on public.security_audit for select to authenticated using((select public.is_security_admin()));
create index security_audit_recent_idx on public.security_audit(created_at desc,id desc);
create function public.audit_admin_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare player uuid:=auth.uid();before_data jsonb;after_data jsonb;subject uuid;begin
 -- Ordinary gameplay is not logged as administration.
 if player is not null and not exists(select 1 from public.security_admins a where a.user_id=player) then
   if tg_op='DELETE' then return old;else return new;end if;
 end if;
 if tg_op<>'INSERT' then before_data:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_data:=to_jsonb(new);end if;
 subject:=coalesce((after_data->>'user_id')::uuid,(before_data->>'user_id')::uuid,(after_data->>'id')::uuid,(before_data->>'id')::uuid);
 if tg_table_name='profiles' then
   before_data:=case when before_data is null then null else jsonb_build_object('username',before_data->'username','level',before_data->'level') end;
   after_data:=case when after_data is null then null else jsonb_build_object('username',after_data->'username','level',after_data->'level') end;
 elsif tg_table_name in ('scores','daily_scores') then
   before_data:=case when before_data is null then null else jsonb_build_object('score',before_data->'score','tile',before_data->'max_tile','mode',before_data->'mode') end;
   after_data:=case when after_data is null then null else jsonb_build_object('score',after_data->'score','tile',after_data->'max_tile','mode',after_data->'mode') end;
 end if;
 if before_data is not distinct from after_data then
   if tg_op='DELETE' then return old;else return new;end if;
 end if;
 insert into public.security_audit(actor_id,actor_kind,entity,operation,subject_id,before_values,after_values)
 values(player,case when player is null then 'maintenance' else 'administrator' end,tg_table_name,tg_op,subject,before_data,after_data);
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function public.audit_admin_change() from public,anon,authenticated;
create trigger profiles_admin_audit after update or delete on public.profiles for each row execute function public.audit_admin_change();
create trigger scores_admin_audit after update or delete on public.scores for each row execute function public.audit_admin_change();
create trigger daily_admin_audit after update or delete on public.daily_scores for each row execute function public.audit_admin_change();
create trigger roles_admin_audit after insert or update or delete on public.security_admins for each row execute function public.audit_admin_change();

create function public.security_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_security_admin() then raise exception 'Administrator access and two-factor verification required' using errcode='42501';end if;
 return jsonb_build_object(
   'audit',(select coalesce(jsonb_agg(x order by x.created_at desc,x.id desc),'[]'::jsonb) from (select * from public.security_audit order by created_at desc,id desc limit 100) x),
   'recent_signups',(select count(*) from auth.users where created_at>now()-interval '1 hour'),
   'administrator_count',(select count(*) from public.security_admins),
   'profiles',(select count(*) from public.profiles),
   'unconfirmed_accounts',(select count(*) from auth.users where email_confirmed_at is null)
 );
end $$;
revoke all on function public.security_overview() from public,anon;
grant execute on function public.security_overview() to authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;

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
 perform public.require_account_assurance();
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

create or replace function public.friend_challenge_result(invite_id uuid, final_score integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare invitation public.messages; mine integer; theirs integer; other_id uuid; other_name text;
begin
 perform public.require_account_assurance();
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

create or replace function public.equip_achievement(badge_id text) returns void language plpgsql security definer set search_path=public as $$
begin
 perform public.require_account_assurance();
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if badge_id is null then delete from public.player_identity where user_id=auth.uid(); return; end if;
 if not exists(select 1 from public.player_achievements where user_id=auth.uid() and achievement_id=badge_id) then raise exception 'Achievement is locked'; end if;
 insert into public.player_identity(user_id,achievement_id) values(auth.uid(),badge_id)
 on conflict(user_id) do update set achievement_id=excluded.achievement_id;
end $$;
revoke all on function public.equip_achievement(text) from public,anon;
grant execute on function public.equip_achievement(text) to authenticated;
