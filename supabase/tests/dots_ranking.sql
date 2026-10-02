begin;
-- d1 male, d2 female, d3 not opted in, d4 opted in but deadlift has no nearby weight, d5 DOTS only (not in global ranking).
insert into auth.users(id,email,raw_user_meta_data) values
 ('d0000000-0000-4000-8000-000000000001','dots1@example.com','{"display_name":"男性"}'),
 ('d0000000-0000-4000-8000-000000000002','dots2@example.com','{"display_name":"女性"}'),
 ('d0000000-0000-4000-8000-000000000003','dots3@example.com','{"display_name":"非参加"}'),
 ('d0000000-0000-4000-8000-000000000004','dots4@example.com','{"display_name":"体重不足"}'),
 ('d0000000-0000-4000-8000-000000000005','dots5@example.com','{"display_name":"全体非公開"}');
update public.community_profiles set global_ranking=true where user_id::text like 'd0000000-%' and user_id<>'d0000000-0000-4000-8000-000000000005';
update public.community_profiles set dots_opt_in=true,dots_formula='male' where user_id in
 ('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000005');
update public.community_profiles set dots_opt_in=true,dots_formula='female' where user_id='d0000000-0000-4000-8000-000000000002';
insert into public.bodyweight_logs(user_id,recorded_on,bodyweight_kg) values
 ('d0000000-0000-4000-8000-000000000001','2026-01-08',100.0),
 ('d0000000-0000-4000-8000-000000000001','2026-01-12',90.0),
 ('d0000000-0000-4000-8000-000000000001','2026-03-15',100.0),
 ('d0000000-0000-4000-8000-000000000002','2026-01-10',60.0),
 ('d0000000-0000-4000-8000-000000000002','2026-02-09',60.0),
 ('d0000000-0000-4000-8000-000000000003','2026-01-10',70.0),
 ('d0000000-0000-4000-8000-000000000004','2026-01-10',80.0),
 ('d0000000-0000-4000-8000-000000000005','2026-01-10',80.0);
create temp table dots_sets(user_id uuid,day date,lift text,kg numeric) on commit drop;
insert into dots_sets values
 -- 01-10 is two days from both 01-08 (100kg) and 01-12 (90kg): the earlier weigh-in wins.
 ('d0000000-0000-4000-8000-000000000001','2026-01-10','スクワット',200),
 ('d0000000-0000-4000-8000-000000000001','2026-01-10','ベンチプレス',150),
 ('d0000000-0000-4000-8000-000000000001','2026-01-10','デッドリフト',250),
 -- 14 days before 03-15 counts; 15 days after does not (kg ranking still sees the 300kg squat).
 ('d0000000-0000-4000-8000-000000000001','2026-03-01','デッドリフト',260),
 ('d0000000-0000-4000-8000-000000000001','2026-03-30','スクワット',300),
 -- 15 days before the 03-15 weigh-in does not count either.
 ('d0000000-0000-4000-8000-000000000001','2026-02-28','ベンチプレス',200),
 ('d0000000-0000-4000-8000-000000000002','2026-01-10','スクワット',150),
 ('d0000000-0000-4000-8000-000000000002','2026-01-10','ベンチプレス',80),
 ('d0000000-0000-4000-8000-000000000002','2026-01-10','デッドリフト',170),
 ('d0000000-0000-4000-8000-000000000003','2026-01-10','スクワット',150),
 ('d0000000-0000-4000-8000-000000000003','2026-01-10','ベンチプレス',100),
 ('d0000000-0000-4000-8000-000000000003','2026-01-10','デッドリフト',200),
 ('d0000000-0000-4000-8000-000000000004','2026-01-10','スクワット',150),
 ('d0000000-0000-4000-8000-000000000004','2026-01-10','ベンチプレス',100),
 ('d0000000-0000-4000-8000-000000000004','2026-06-01','デッドリフト',200),
 ('d0000000-0000-4000-8000-000000000005','2026-01-10','スクワット',150),
 ('d0000000-0000-4000-8000-000000000005','2026-01-10','ベンチプレス',100),
 ('d0000000-0000-4000-8000-000000000005','2026-01-10','デッドリフト',200);
insert into public.workouts(id,user_id,performed_at)
 select gen_random_uuid(),user_id,(day+time '12:00') at time zone 'Asia/Tokyo' from (select distinct user_id,day from dots_sets) d;
insert into public.workout_sets(workout_id,exercise_id,set_index,weight_kg,reps)
 select w.id,e.id,row_number() over(partition by w.id),s.kg,1
 from dots_sets s
 join public.workouts w on w.user_id=s.user_id and (w.performed_at at time zone 'Asia/Tokyo')::date=s.day
 join public.exercises e on e.is_preset and e.name_normalized=s.lift;
-- 00:30 in Japan on 01-26 is still 01-25 in UTC. The Japanese date is 14 days from 02-09 and counts.
insert into public.workouts(id,user_id,performed_at) values
 ('d1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','2026-01-26 00:30:00+09');
insert into public.workout_sets(workout_id,exercise_id,set_index,weight_kg,reps)
 select 'd1000000-0000-4000-8000-000000000001',id,1,180,1 from public.exercises where is_preset and name_normalized='デッドリフト';
do $$ begin
 if round(public.dots_points(700,100,'male'),4)<>430.8610 then raise exception 'Male DOTS reference mismatch'; end if;
 if round(public.dots_points(400,60,'female'),4)<>443.4182 then raise exception 'Female DOTS reference mismatch'; end if;
 if public.dots_points(100,30,'male')<>public.dots_points(100,40,'male') or public.dots_points(100,250,'male')<>public.dots_points(100,210,'male') then raise exception 'Male bodyweight bounds'; end if;
 if public.dots_points(100,160,'female')<>public.dots_points(100,150,'female') then raise exception 'Female bodyweight bounds'; end if;
 if public.dots_points(100,80,'other') is not null then raise exception 'Unknown formula scored'; end if;
end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare g jsonb; r jsonb; c uuid; code text;
begin
 begin perform public.big3_member_stats(array['d0000000-0000-4000-8000-000000000003'::uuid]); raise exception 'Stats helper callable';
 exception when insufficient_privilege then null; end;
 begin perform public.dots_points(100,80,'male'); raise exception 'DOTS helper callable';
 exception when insufficient_privilege then null; end;
 select jsonb_object_agg(x->>'display_name',x) into g from jsonb_array_elements(public.global_ranking()) x where x->>'user_id' like 'd0000000-%';
 if (g->'男性'->>'dots')::numeric<>375.5 then raise exception 'Nearest/tie/boundary weight wrong: %',g->'男性'; end if;
 if (g->'男性'->>'total')::numeric<>760 then raise exception 'kg total changed: %',g->'男性'; end if;
 if (g->'女性'->>'dots')::numeric<>454.5 then raise exception 'Female DOTS wrong: %',g->'女性'; end if;
 if g->'非参加'->'dots'<>'null'::jsonb or (g->'非参加'->>'dots_opt_in')::boolean then raise exception 'Non-participant scored: %',g->'非参加'; end if;
 if g->'体重不足'->'dots'<>'null'::jsonb or not (g->'体重不足'->>'dots_opt_in')::boolean then raise exception 'Missing weight scored: %',g->'体重不足'; end if;
 if g ? '全体非公開' then raise exception 'DOTS opt-in bypassed global ranking'; end if;
 -- Community: members see each other regardless of the global setting, and only opted-in scores.
 c:=public.community_manage('create','DOTS');
 select public.community_list()->0->>'invite_code' into code;
 perform set_config('test.code',code,true); perform set_config('test.community',c::text,true);
 begin perform public.save_dots_settings(true,null); raise exception 'Opt-in without formula saved';
 exception when raise_exception then if sqlerrm<>'DOTSの係数を選んでください' then raise; end if; end;
 begin perform public.save_dots_settings(true,'other'); raise exception 'Unknown formula saved';
 exception when raise_exception then if sqlerrm<>'DOTSの係数を選んでください' then raise; end if; end;
 perform public.save_dots_settings(false,null);
 if (select dots_formula from public.community_profiles where user_id=auth.uid())<>'male' then raise exception 'Opt-out dropped formula'; end if;
 if (select x->'dots' from jsonb_array_elements(public.global_ranking()) x where x->>'user_id'=auth.uid()::text)<>'null'::jsonb then raise exception 'Opt-out still scored'; end if;
 perform public.save_dots_settings(true,'male');
end $$;
reset role;
do $$ begin
 if (select dots_formula from public.community_profiles where user_id='d0000000-0000-4000-8000-000000000002')<>'female' then raise exception 'Settings touched another user'; end if;
end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000005',true);
set local role authenticated;
do $$ declare r jsonb; begin
 perform public.community_manage('join',current_setting('test.code'));
 select jsonb_object_agg(x->>'display_name',x) into r from jsonb_array_elements(public.community_ranking(current_setting('test.community')::uuid)) x;
 if (r->'男性'->>'dots')::numeric<>375.5 or jsonb_array_length(r->'男性'->'points')=0 then raise exception 'Community DOTS/points wrong: %',r->'男性'; end if;
 if (r->'全体非公開'->>'dots')::numeric is null then raise exception 'Community member DOTS missing: %',r->'全体非公開'; end if;
end $$;
reset role;
rollback;
