create table public.achievement_catalog (
 id text primary key, title text not null, description text not null,
 metric text not null check(metric in ('score','tile')), threshold integer not null check(threshold>0)
);
insert into public.achievement_catalog values
('first_steps','Rising Player','Record 100 points','score',100),
('score_scout','Score Scout','Record 5,000 points','score',5000),
('high_roller','High Roller','Record 25,000 points','score',25000),
('six_figures','Six Figure Club','Record 100,000 points','score',100000),
('tile_builder','Tile Builder','Make a 512 tile','tile',512),
('tile_master','Tile Master','Make a 2,048 tile','tile',2048),
('tile_legend','Tile Legend','Make an 8,192 tile','tile',8192),
('tile_titan','Tile Titan','Make a 32,768 tile','tile',32768);
create table public.player_achievements (
 user_id uuid references public.profiles(id) on delete cascade,
 achievement_id text references public.achievement_catalog(id),
 earned_at timestamptz not null default now(), primary key(user_id,achievement_id)
);
create table public.player_identity (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 achievement_id text not null references public.achievement_catalog(id),
 foreign key(user_id,achievement_id) references public.player_achievements(user_id,achievement_id)
);
alter table public.achievement_catalog enable row level security;
alter table public.player_achievements enable row level security;
alter table public.player_identity enable row level security;
revoke all on public.achievement_catalog, public.player_achievements, public.player_identity from anon,authenticated;
grant select on public.achievement_catalog, public.player_identity to anon,authenticated;
grant select on public.player_achievements to authenticated;
create policy catalog_read on public.achievement_catalog for select using(true);
create policy identity_read on public.player_identity for select using(true);
create policy own_achievements on public.player_achievements for select to authenticated using(user_id=auth.uid());
create function public.award_score_achievements() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.player_achievements(user_id,achievement_id)
 select new.user_id,id from public.achievement_catalog where
 (metric='score' and new.score>=threshold) or (metric='tile' and new.max_tile>=threshold)
 on conflict do nothing;
 return new;
end $$;
revoke all on function public.award_score_achievements() from public,anon,authenticated;
create trigger scores_achievements after insert or update of score,max_tile on public.scores for each row execute function public.award_score_achievements();
create trigger daily_achievements after insert or update of score,max_tile on public.daily_scores for each row execute function public.award_score_achievements();
insert into public.player_achievements(user_id,achievement_id)
select distinct s.user_id,c.id from (select user_id,score,max_tile from public.scores union all select user_id,score,max_tile from public.daily_scores) s
join public.achievement_catalog c on (c.metric='score' and s.score>=c.threshold) or (c.metric='tile' and s.max_tile>=c.threshold)
on conflict do nothing;
create function public.equip_achievement(badge_id text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if badge_id is null then delete from public.player_identity where user_id=auth.uid(); return; end if;
 if not exists(select 1 from public.player_achievements where user_id=auth.uid() and achievement_id=badge_id) then raise exception 'Achievement is locked'; end if;
 insert into public.player_identity(user_id,achievement_id) values(auth.uid(),badge_id)
 on conflict(user_id) do update set achievement_id=excluded.achievement_id;
end $$;
revoke all on function public.equip_achievement(text) from public,anon;
grant execute on function public.equip_achievement(text) to authenticated;
