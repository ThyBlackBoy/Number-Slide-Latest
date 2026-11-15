begin;
-- All fixtures roll back. No test matches or notifications remain.
select set_config('test.player_a',ids[1]::text,true),set_config('test.player_b',ids[2]::text,true),set_config('test.player_c',ids[3]::text,true)
from(select array_agg(id order by created_at) ids from public.profiles) x;
select set_config('request.jwt.claim.sub',current_setting('test.player_a'),true);
set local role authenticated;
do $$ declare mid uuid; n integer; begin
 insert into public.matches(creator_id,status,time_limit) values(auth.uid(),'waiting',60) returning id into mid;
 perform set_config('test.match_id',mid::text,true);
 begin
  update public.matches set creator_id=current_setting('test.player_b')::uuid where id=mid;
  raise exception 'Match identity hijack accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.player_b'),true);
update public.matches set opponent_id=auth.uid(),status='playing',started_at=now() where id=current_setting('test.match_id')::uuid;
select set_config('request.jwt.claim.sub',current_setting('test.player_c'),true);
do $$ declare n integer; begin
 update public.matches set creator_score=999 where id=current_setting('test.match_id')::uuid;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Outsider match update succeeded'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.player_a'),true);
update public.matches set creator_score=100,opponent_score=999 where id=current_setting('test.match_id')::uuid;
do $$ begin
 if (select opponent_score from public.matches where id=current_setting('test.match_id')::uuid)<>0 then raise exception 'Opponent score forgery accepted';end if;
 begin
  update public.matches set status='finished' where id=current_setting('test.match_id')::uuid;
  raise exception 'Premature match finish accepted';
 exception when raise_exception then if sqlerrm<>'Match has not ended' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.player_b'),true);
update public.matches set opponent_score=200 where id=current_setting('test.match_id')::uuid;
update public.matches set status='finished',winner_id=current_setting('test.player_a')::uuid where id=current_setting('test.match_id')::uuid;
do $$ declare nid uuid; begin
 if (select winner_id from public.matches where id=current_setting('test.match_id')::uuid) is distinct from auth.uid() then raise exception 'Winner was not computed by server'; end if;
 insert into public.notifications(user_id,from_user_id,type,title) values(current_setting('test.player_a')::uuid,auth.uid(),'message','Test');
 begin
  insert into public.notifications(user_id,from_user_id,type,title) values(auth.uid(),auth.uid(),'system','Forged system event');
  raise exception 'System event spoof accepted';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.notifications(user_id,from_user_id,type,title) values(auth.uid(),current_setting('test.player_a')::uuid,'message','Forged sender');
  raise exception 'Sender spoof accepted';
 exception when raise_exception then if sqlerrm<>'Invalid notification' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.player_a'),true);
do $$ declare nid uuid;begin
 select id into nid from public.notifications where from_user_id=current_setting('test.player_b')::uuid order by created_at desc limit 1;
 update public.notifications set read=true where id=nid;
 begin
  update public.notifications set title='Forged content' where id=nid;
  raise exception 'Recipient can rewrite notification';
 exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ declare n integer;begin
 update public.matches set creator_score=999 where id=current_setting('test.match_id')::uuid;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Anonymous match update succeeded';end if;
end $$;
reset role;
select 'PASS: joins, outsider/anonymous denial, immutable identity, own score only, server winner, notification attribution/read-only updates' as result;

rollback;
