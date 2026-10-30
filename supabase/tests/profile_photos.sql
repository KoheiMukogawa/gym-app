-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('d0000000-0000-4000-8000-00000000000a', 'photo-a@glog.test', '{"display_name":"A"}'),
 ('d0000000-0000-4000-8000-00000000000b', 'photo-b@glog.test', '{"display_name":"B"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-00000000000a', true);
-- The owner can use a photo in their own folder.
select public.save_glog_profile('A', 'photo:d0000000-0000-4000-8000-00000000000a/11111111-1111-4111-8111-111111111111.webp', '', false);
do $$ begin
  if (select icon from public.profiles where id = 'd0000000-0000-4000-8000-00000000000a')
     <> 'photo:d0000000-0000-4000-8000-00000000000a/11111111-1111-4111-8111-111111111111.webp' then
    raise exception 'own photo not saved'; end if;
  -- Another user's folder, an odd extension or a free-form value are refused.
  begin
    perform public.save_glog_profile('A', 'photo:d0000000-0000-4000-8000-00000000000b/11111111-1111-4111-8111-111111111111.webp', '', false);
    raise exception 'other user photo accepted';
  exception when raise_exception then
    if sqlerrm = 'other user photo accepted' then raise; end if;
  end;
  begin
    perform public.save_glog_profile('A', 'photo:d0000000-0000-4000-8000-00000000000a/x.png', '', false);
    raise exception 'bad photo path accepted';
  exception when raise_exception then
    if sqlerrm = 'bad photo path accepted' then raise; end if;
  end;
  begin
    perform public.save_glog_profile('A', 'https://example.com/a.png', '', false);
    raise exception 'url accepted';
  exception when raise_exception then
    if sqlerrm = 'url accepted' then raise; end if;
  end;
end $$;
-- Preset icons still work, including the new muscle icon and the retired ones already in use.
select public.save_glog_profile('A', 'barbell', '', false);
select public.save_glog_profile('A', 'muscle', '', false);
select public.save_glog_profile('A', 'bolt', '', false);

reset role;
-- New users start with the muscle icon unless they picked another one at signup.
insert into auth.users(id, email, raw_user_meta_data) values
 ('d0000000-0000-4000-8000-00000000000c', 'photo-c@glog.test', '{"display_name":"C"}'),
 ('d0000000-0000-4000-8000-00000000000d', 'photo-d@glog.test', '{"display_name":"D","profile_icon":"barbell"}'),
 ('d0000000-0000-4000-8000-00000000000e', 'photo-e@glog.test', '{"display_name":"E","profile_icon":"bolt"}');
do $$ begin
  if (select string_agg(icon, ',' order by display_name) from public.profiles where display_name in ('C','D','E')) <> 'muscle,barbell,muscle' then
    raise exception 'unexpected signup icons'; end if;
end $$;
-- The table itself also refuses another user's photo.
do $$ begin
  begin
    update public.community_profiles set icon = 'photo:d0000000-0000-4000-8000-00000000000a/11111111-1111-4111-8111-111111111111.webp'
     where user_id = 'd0000000-0000-4000-8000-00000000000b';
    raise exception 'check allowed another user photo';
  exception when check_violation then null; end;
end $$;
rollback;
