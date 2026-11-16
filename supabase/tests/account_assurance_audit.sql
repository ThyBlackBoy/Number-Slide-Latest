begin;
-- Isolated fake account and factor exist only in this rolled-back transaction.
with fixture as(select gen_random_uuid() id),added as(
 insert into auth.users(id,email,raw_user_meta_data) select id,'assurance-'||id||'@example.invalid',jsonb_build_object('username','assurance_'||replace(id::text,'-','')) from fixture returning id)
select set_config('test.security_uid',id::text,true) from added;
select set_config('request.jwt.claim.sub',current_setting('test.security_uid'),true),set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.security_uid'),'aal','aal1','role','authenticated')::text,true);
set local role authenticated;
select public.publish_score(100,4,'normal');
reset role;
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
 values(gen_random_uuid(),current_setting('test.security_uid')::uuid,'Rollback fixture','totp','verified',now(),now(),'ROLLBACKFACTORONLYNOTAREALSECRET');
set local role authenticated;
do $$ begin
 if coalesce(public.account_assurance_ok(),false) then raise exception 'AAL1 bypassed enrolled MFA';end if;
 begin perform public.publish_score(200,8,'normal');raise exception 'Score RPC bypassed MFA';exception when insufficient_privilege then null;end;
 begin perform public.equip_achievement(null);raise exception 'Achievement RPC bypassed MFA';exception when insufficient_privilege then null;end;
 begin perform public.friend_challenge_result(gen_random_uuid(),0);raise exception 'Challenge RPC bypassed MFA';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.scores where user_id=auth.uid()) then raise exception 'RLS bypassed MFA';end if;
 begin perform public.security_overview();raise exception 'Non-admin read security logs';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'aal','aal2','role','authenticated')::text,true);
select public.publish_score(200,8,'normal');
reset role;
insert into public.security_admins(user_id) values(current_setting('test.security_uid')::uuid);
set local role authenticated;
do $$ begin
 if not public.is_security_admin() then raise exception 'AAL2 administrator not recognized';end if;
 perform public.security_overview();
 begin delete from public.security_audit;raise exception 'Client can erase audit';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'aal','aal1','role','authenticated')::text,true);
do $$ begin
 begin perform public.security_overview();raise exception 'AAL1 administrator read audit';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.security_audit where entity='security_admins' and subject_id=current_setting('test.security_uid')::uuid) then raise exception 'Admin grant not audited';end if;
end $$;
select 'PASS: optional MFA, enforced AAL2 on RLS/RPCs, mandatory admin AAL2, private append-only audit' result;
rollback;
