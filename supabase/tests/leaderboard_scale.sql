begin;
-- Synthetic users exist only within this transaction; no emails or logins are issued.
create temporary table scale_fixture_users(i integer,uid uuid) on commit drop;
insert into scale_fixture_users select i,gen_random_uuid() from generate_series(1,220) i;
insert into auth.users(id,email,raw_user_meta_data)
 select uid,'scale-'||uid||'@example.invalid',jsonb_build_object('username','scale_'||replace(uid::text,'-','')) from scale_fixture_users;
insert into public.scores(user_id,score,max_tile,mode)
 select uid,900000+i*1000,32768,'hard' from scale_fixture_users;
insert into public.scores(user_id,score,max_tile,mode)
 select uid,800000,16384,'normal' from scale_fixture_users;
do $$ declare n integer;r jsonb;begin
 select count(*) into n from public.leaderboard_page('alltime',0);
 if n<>100 then raise exception 'First page not bounded to100';end if;
 select count(*) into n from public.leaderboard_page('alltime',100);
 if n<>100 then raise exception 'Second page wrong size';end if;
 select count(*) into n from (select user_id from public.leaderboard_page('alltime',0) intersect select user_id from public.leaderboard_page('alltime',100)) x;
 if n<>0 then raise exception 'Duplicate player across pages';end if;
 select count(*) into n from public.leaderboard_page('alltime',200);
 if n<20 then raise exception 'Players past200 are missing';end if;
 perform set_config('request.jwt.claim.sub',(select uid::text from scale_fixture_users where i=1),true);
 r:=public.publish_score(901000,32768,'hard');
 if (r->'standing'->>'allTimePlace')::integer<>220 then raise exception 'Rank beyond200 wrong: %',r;end if;
 if exists(
   (select user_id,max(score) score from (select user_id,score from public.scores union all select user_id,score from public.daily_scores) x group by user_id)
   except select user_id,score from public.best_scores where score>0
 ) then raise exception 'Summary diverged from history';end if;
end $$;
select 'PASS: 220 temporary players, duplicate history, pages100+100+remaining, rank220 and exact summary' result;
rollback;
