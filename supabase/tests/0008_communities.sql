begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('a0000000-0000-4000-8000-000000000001','community1@example.com','{}'),
 ('a0000000-0000-4000-8000-000000000002','community2@example.com','{}'),
 ('a0000000-0000-4000-8000-000000000003','outside@example.com','{}');
insert into public.community_profiles(user_id,display_name) values
 ('a0000000-0000-4000-8000-000000000001','One'),('a0000000-0000-4000-8000-000000000002','Two') on conflict(user_id) do update set display_name=excluded.display_name;
insert into public.workouts(id,user_id,performed_at) values
 ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',date_trunc('month',now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo' - interval '1 day'),
 ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001',now()),
 ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002',now());
insert into public.workout_sets(workout_id,exercise_id,set_index,weight_kg,reps)
 select w.id,e.id,1,case when w.id::text like '%0001' then 80 else 100 end,5
 from public.workouts w cross join public.exercises e where w.id::text like 'b0000000-%'
 and e.is_preset and e.name_normalized in ('スクワット','ベンチプレス','デッドリフト');
insert into public.workouts(id,user_id,performed_at) values
 ('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001',now()+interval '2 days');
insert into public.workout_sets(workout_id,exercise_id,set_index,weight_kg,reps)
 select 'b0000000-0000-4000-8000-000000000004',id,1,999,1 from public.exercises where is_preset and name_normalized='スクワット';
-- 11 reps and future-dated records cannot inflate rankings.
insert into public.workout_sets(workout_id,exercise_id,set_index,weight_kg,reps)
 select 'b0000000-0000-4000-8000-000000000002',id,2,999,11 from public.exercises where is_preset and name_normalized='スクワット';
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare c uuid; code text; r jsonb;
begin
 c:=public.community_manage('create','仲間');
 perform public.community_manage('create','仲間',c);
 if jsonb_array_length(public.community_list())<>1 then raise exception 'Create retry duplicated'; end if;
 perform set_config('test.community',c::text,true);
 select public.community_list()->0->>'invite_code' into code;
 perform set_config('test.code',code,true);
 r:=public.community_ranking(c)->0;
 if (r->>'total')::numeric<>337.5 or (r->>'growth')::numeric<>67.5 then raise exception 'RM or baseline incorrect: %',r; end if;
 if (select count(*) from public.workouts)<>3 then raise exception 'Full history exposed'; end if;
 begin
   insert into public.community_members values(c,'a0000000-0000-4000-8000-000000000003',now());
   raise exception 'Direct membership write permitted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare c uuid:=current_setting('test.community')::uuid; r jsonb;
begin
 if public.community_list()<>'[]'::jsonb then raise exception 'Outsider list exposed'; end if;
 begin perform public.community_ranking(c); raise exception 'Outsider ranking exposed';
 exception when raise_exception then if sqlerrm='Outsider ranking exposed' then raise; end if; end;
 perform public.community_manage('join',current_setting('test.code'));
 perform public.community_manage('join',current_setting('test.code'));
 if jsonb_array_length(public.community_ranking(c))<>2 then raise exception 'Join retry duplicate'; end if;
 if public.community_list()->0->>'invite_code' is not null then raise exception 'Member sees code'; end if;
 select x into r from jsonb_array_elements(public.community_ranking(c)) x where x->>'user_id'=auth.uid()::text;
 if r->>'growth' is not null then raise exception 'First records count as growth'; end if;
 if (select count(*) from public.community_profiles)<>1 then raise exception 'Profile RLS'; end if;
 if (select count(*) from public.workout_sets)<>3 then raise exception 'Other sets exposed'; end if;
 begin perform public.community_manage('delete','',c); raise exception 'Member deleted group';
 exception when raise_exception then if sqlerrm='Member deleted group' then raise; end if; end;
 perform public.community_manage('leave','',c);
 begin perform public.community_ranking(c); raise exception 'Left member sees ranking';
 exception when raise_exception then if sqlerrm='Left member sees ranking' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare c uuid:=current_setting('test.community')::uuid;
begin
 perform public.community_manage('rotate','',c);
 begin perform public.community_manage('join',current_setting('test.code')); raise exception 'Old code accepted';
 exception when raise_exception then if sqlerrm='Old code accepted' then raise; end if; end;
 perform public.community_manage('delete','',c);
 if public.community_list()<>'[]'::jsonb then raise exception 'Delete failed'; end if;
 if (select count(*) from public.workouts)<>3 then raise exception 'Logs deleted'; end if;
end $$;
reset role;
rollback;
