set lock_timeout='3s';

-- Remove permissive duplicates; permissive RLS policies otherwise combine with OR.
do $$ declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and
   ((tablename='matches' and cmd in ('INSERT','UPDATE','ALL')) or (tablename='notifications' and cmd in ('INSERT','ALL')))
 loop execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop;
end $$;
create policy matches_create on public.matches for insert to authenticated with check(creator_id=(select auth.uid()));
create policy matches_join_or_update on public.matches for update to authenticated
 using(creator_id=(select auth.uid()) or opponent_id=(select auth.uid()) or (status='waiting' and opponent_id is null))
 with check(creator_id=(select auth.uid()) or opponent_id=(select auth.uid()));
create policy notifications_attributed_insert on public.notifications for insert to authenticated
 with check(from_user_id=(select auth.uid()) and type in ('friend_request','friend_accepted','message','match') and user_id is not null);
-- A recipient may mark a notification read, but may not rewrite its sender or text.
revoke update on public.notifications from anon,authenticated;
grant update(read) on public.notifications to authenticated;

create or replace function public.guard_match_write() returns trigger
language plpgsql security invoker set search_path='' as $$
declare player uuid:=auth.uid(); begin
 if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
 if player is null then raise exception 'Sign in first' using errcode='42501'; end if;
 if tg_op='INSERT' then
   if new.creator_id is distinct from player or new.opponent_id is not null or new.status is distinct from 'waiting'
     or coalesce(new.creator_score,0)<>0 or coalesce(new.opponent_score,0)<>0 or new.winner_id is not null
     or new.time_limit is distinct from 60 then raise exception 'Invalid new match' using errcode='42501'; end if;
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
 if old.status is distinct from 'playing' or new.status not in ('playing','finished') then
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
revoke all on function public.guard_match_write() from public,anon,authenticated;
create trigger guard_match_write before insert or update on public.matches for each row execute function public.guard_match_write();

create index if not exists notifications_sender_recent_idx on public.notifications(from_user_id,created_at desc);
create index if not exists messages_sender_recent_idx on public.messages(sender_id,created_at desc);
create or replace function public.guard_social_insert() returns trigger
language plpgsql security definer set search_path='' as $$
declare player uuid:=auth.uid(); recent bigint; begin
 if player is null then raise exception 'Sign in first' using errcode='42501'; end if;
 -- Different lock namespace from score saves; bounded per-sender social traffic.
 perform pg_advisory_xact_lock(hashtextextended(player::text,733));
 if tg_table_name='messages' then
   if new.sender_id is distinct from player or new.receiver_id is null or length(new.content)>4000 or length(trim(new.content))=0 then
     raise exception 'Invalid message'; end if;
   select count(*) into recent from public.messages where sender_id=player and created_at>now()-interval '1 minute';
 else
   if new.from_user_id is distinct from player or length(new.title)>120 or length(coalesce(new.body,''))>2000 then
     raise exception 'Invalid notification'; end if;
   select count(*) into recent from public.notifications where from_user_id=player and created_at>now()-interval '1 minute';
 end if;
 if recent>=120 then raise exception 'Too many messages or notifications. Try again shortly.'; end if;
 new.created_at:=now();
 return new;
end $$;
revoke all on function public.guard_social_insert() from public,anon,authenticated;
create trigger guard_message_insert before insert on public.messages for each row execute function public.guard_social_insert();
create trigger guard_notification_insert before insert on public.notifications for each row execute function public.guard_social_insert();
