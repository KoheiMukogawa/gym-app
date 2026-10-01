-- Let sign-up choose global ranking participation so no separate profile step is needed.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare n text; i text; g boolean;
begin
 n:=left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Glogユーザー'),30);
 i:=coalesce(new.raw_user_meta_data->>'profile_icon','initials');
 if i not in ('initials','barbell','target','bolt') then i:='initials'; end if;
 g:=coalesce(new.raw_user_meta_data->>'global_ranking','')='true';
 insert into public.profiles(id,display_name,icon) values(new.id,n,i);
 insert into public.community_profiles(user_id,display_name,icon,global_ranking) values(new.id,n,i,g);
 return new;
end $$;
