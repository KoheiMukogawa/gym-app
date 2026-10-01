begin;
insert into auth.users(id,email,raw_user_meta_data) values
('c0000000-0000-4000-8000-000000000001','new@example.com','{"display_name":"新人","profile_icon":"barbell"}'),
('c0000000-0000-4000-8000-000000000002','private@example.com','{"display_name":"非公開","profile_icon":"target"}');
do $$ begin
 if (select display_name from public.profiles where id='c0000000-0000-4000-8000-000000000001')<>'新人' then raise exception 'Signup name missing'; end if;
 if (select icon from public.community_profiles where user_id='c0000000-0000-4000-8000-000000000001')<>'barbell' then raise exception 'Signup icon missing'; end if;
 if exists(select 1 from public.community_profiles where user_id::text like 'c0000000%' and global_ranking) then raise exception 'Signup publishes by default'; end if;
end $$;
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from jsonb_array_elements(public.global_ranking()) x where x->>'user_id' like 'c0000000%') then raise exception 'Private profile exposed'; end if;
 perform public.save_glog_profile('変更後','bolt','よろしく',true);
 if (select display_name from public.profiles where id=auth.uid())<>'変更後' then raise exception 'Profile not synchronized'; end if;
 if not exists(select 1 from jsonb_array_elements(public.global_ranking()) x where x->>'user_id'=auth.uid()::text and x->>'icon'='bolt' and x->'points'='[]'::jsonb) then raise exception 'Opt in failed'; end if;
 perform public.save_glog_profile('変更後','initials','',false);
 if exists(select 1 from jsonb_array_elements(public.global_ranking()) x where x->>'user_id'=auth.uid()::text) then raise exception 'Opt out failed'; end if;
end $$;
reset role;
rollback;
