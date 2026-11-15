begin;
-- Summary fixtures and all resulting achievements roll back.
do $$ declare uid uuid; sid uuid; result integer;begin
 select id into uid from public.profiles order by created_at limit 1;
 if exists(
   (select user_id,max(score) score from (select user_id,score from public.scores union all select user_id,score from public.daily_scores) x group by user_id)
   except select user_id,score from public.best_scores where score>0
 ) then raise exception 'Backfill lost a score';end if;
 insert into public.scores(user_id,score,max_tile,mode) values(uid,1900000000,32768,'hard') returning id into sid;
 select score into result from public.best_scores where user_id=uid;
 if result<>1900000000 then raise exception 'Insert did not refresh summary';end if;
 update public.scores set score=1800000000 where id=sid;
 select score into result from public.best_scores where user_id=uid;
 if result<>1800000000 then raise exception 'Score correction did not refresh';end if;
 delete from public.scores where id=sid;
 select coalesce(max(score),0) into result from (select score from public.scores where user_id=uid union all select score from public.daily_scores where user_id=uid) x;
 if result is distinct from (select score from public.best_scores where user_id=uid) then raise exception 'Delete did not restore previous best';end if;
 if has_table_privilege('authenticated','public.best_scores','insert') or has_function_privilege('authenticated','public.refresh_player_best(uuid)','execute') then raise exception 'Client can forge summary';end if;
end $$;
select 'PASS: summary backfill, insert, downward correction, delete, private maintenance' result;
rollback;
