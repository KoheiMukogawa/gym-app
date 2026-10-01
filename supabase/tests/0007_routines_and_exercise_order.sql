begin;
insert into auth.users (id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000701','routine1@example.test','{}'),
 ('00000000-0000-4000-8000-000000000702','routine2@example.test','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000701',true);
insert into public.training_routines(id,user_id,name,exercise_ids)
 select '00000000-0000-4000-8000-000000000711',auth.uid(),'胸の日',array[id]
 from public.exercises where is_preset and name='ベンチプレス';
insert into public.exercise_preferences(user_id,exercise_order)
 select auth.uid(),exercise_ids from public.training_routines;
-- Same-ID retries update one routine rather than duplicating it.
insert into public.training_routines(id,user_id,name,exercise_ids)
 select id,user_id,'胸の日 更新',exercise_ids from public.training_routines
 on conflict(id) do update set name=excluded.name;
do $$ begin
 if (select count(*) from public.training_routines) <> 1 then raise exception 'Retry duplicated routine'; end if;
 begin
  update public.training_routines set exercise_ids='{}';
  raise exception 'Empty routine accepted';
 exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000702',true);
do $$ begin
 if exists(select 1 from public.training_routines) or exists(select 1 from public.exercise_preferences) then
  raise exception 'Private preferences leaked'; end if;
 update public.training_routines set name='Other owner';
 if found then raise exception 'Other owner updated routine'; end if;
 delete from public.training_routines;
 if found then raise exception 'Other owner deleted routine'; end if;
 update public.exercise_preferences set exercise_order='{}';
 if found then raise exception 'Other owner updated order'; end if;
 delete from public.exercise_preferences;
 if found then raise exception 'Other owner deleted order'; end if;
 begin
  insert into public.exercise_preferences(user_id) values('00000000-0000-4000-8000-000000000701');
  raise exception 'Other owner inserted order';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.training_routines(id,user_id,name,exercise_ids)
   select '00000000-0000-4000-8000-000000000712','00000000-0000-4000-8000-000000000701','侵入',array[id]
   from public.exercises where is_preset and name='ベンチプレス';
  raise exception 'Other owner inserted routine';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000701',true);
do $$ begin
 if not exists(select 1 from public.training_routines where name='胸の日 更新') then raise exception 'Routine lost'; end if;
 delete from public.training_routines;
 if not found then raise exception 'Owner cannot delete routine'; end if;
 delete from public.exercise_preferences;
 if not found then raise exception 'Owner cannot delete order'; end if;
end $$;
rollback;
