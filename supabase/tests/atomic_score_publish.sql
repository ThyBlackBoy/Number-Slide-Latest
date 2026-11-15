begin;
-- All score, achievement and notification changes in this test are rolled back.
select set_config('request.jwt.claim.sub',(select p.id::text from public.profiles p order by p.created_at limit 1),true);
set local role authenticated;
do $$
declare result jsonb; uid uuid:=auth.uid(); before_count bigint; after_count bigint; n bigint;
begin
  select count(*) into before_count from public.scores where user_id=uid;
  result:=public.publish_score(1000000,32768,'hard');
  if result->>'saved'<>'true' or (result->'standing'->>'todayPlace')::integer<>1 then raise exception 'High score/rank failure'; end if;
  result:=public.publish_score(1000000,32768,'hard');
  result:=public.publish_score(100,4,'easy');
  select score into n from public.daily_scores where user_id=uid and challenge_date=(now() at time zone 'Africa/Lagos')::date;
  if n<>1000000 then raise exception 'Lower submission overwrote daily best'; end if;
  select max(score) into n from public.scores where user_id=uid;
  if n<>1000000 then raise exception 'Lower submission overwrote all-time best'; end if;
  select count(*) into after_count from public.scores where user_id=uid;
  if after_count>before_count+1 then raise exception 'Duplicate score row'; end if;
  if not exists(select 1 from public.player_achievements where user_id=uid and achievement_id='six_figures') then raise exception 'Achievement trigger failed'; end if;
  begin
    perform public.publish_score(0,4,'easy');
    raise exception 'Invalid score accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.publish_score(100,3,'easy');
    raise exception 'Invalid tile accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.publish_score(100,4,'daily');
    raise exception 'Invalid mode accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.publish_score(integer,integer,text)','execute') then raise exception 'Anonymous write privilege'; end if;
end $$;
select 'PASS: repeat/lower submissions, unique row, rank, achievement, validation, anonymous privilege' as result;
rollback;
