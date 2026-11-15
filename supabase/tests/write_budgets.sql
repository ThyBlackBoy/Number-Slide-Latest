begin;
-- All requests, quota counters and relationship changes roll back.
select set_config('test.sender',(select id::text from public.profiles order by created_at limit 1),true);
select set_config('test.receiver',(select id::text from public.profiles where id<>current_setting('test.sender')::uuid order by created_at limit 1),true);
delete from public.friendships where user_id=current_setting('test.sender')::uuid and friend_id=current_setting('test.receiver')::uuid;
select set_config('request.jwt.claim.sub',current_setting('test.sender'),true);
set local role authenticated;
insert into public.friendships(user_id,friend_id,status) values(auth.uid(),current_setting('test.receiver')::uuid,'pending');
do $$ begin
 begin
  update public.friendships set status='accepted' where user_id=auth.uid() and friend_id=current_setting('test.receiver')::uuid;
  raise exception 'Sender accepted own request';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.friendships(user_id,friend_id,status) values(auth.uid(),auth.uid(),'pending');
  raise exception 'Self request allowed';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.receiver'),true);
update public.friendships set status='accepted' where user_id=current_setting('test.sender')::uuid and friend_id=auth.uid();
do $$ begin
 if not exists(select 1 from public.friendships where user_id=current_setting('test.sender')::uuid and friend_id=auth.uid() and status='accepted') then raise exception 'Recipient could not accept';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.sender'),true);
delete from public.request_budgets where user_id=auth.uid() and action='matches_writes';
set local role authenticated;
do $$ begin
 for i in 1..10 loop insert into public.matches(creator_id,status,time_limit) values(auth.uid(),'waiting',60);end loop;
 begin
  insert into public.matches(creator_id,status,time_limit) values(auth.uid(),'waiting',60);
  raise exception 'Match quota did not reject request11';
 exception when raise_exception then if sqlerrm<>'Too many requests. Try again shortly.' then raise;end if;end;
end $$;
reset role;
update public.request_budgets set window_started=clock_timestamp()-interval '61 seconds' where user_id=auth.uid() and action='matches_writes';
set local role authenticated;
insert into public.matches(creator_id,status,time_limit) values(auth.uid(),'waiting',60);
reset role;
do $$ begin
 if (select requests from public.request_budgets where user_id=auth.uid() and action='matches_writes')<>1 then raise exception 'Quota window did not reset';end if;
 if has_table_privilege('authenticated','public.request_budgets','update') or has_function_privilege('authenticated','public.consume_request_budget(text,integer)','execute') then raise exception 'Client can bypass quota';end if;
end $$;
select 'PASS: recipient-only accept, self-request denial, request11 rejected, expired quota resets, private counters' result;
rollback;
