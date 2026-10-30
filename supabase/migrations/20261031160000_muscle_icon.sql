-- 新しい初期アイコン 'muscle'（グレーの丸に筋肉質のシルエット）。新規登録の初期値もこれにする。
-- 'target'・'bolt' は選択肢から外したが、設定済みの人が保存し直せるよう受け付けたままにする。
begin;

alter table public.community_profiles drop constraint if exists community_profiles_icon_check;
alter table public.community_profiles add constraint community_profiles_icon_check check (
  icon in ('muscle','initials','barbell','target','bolt','💪','🔥','🏋️','🐻','🐱','⚡')
  or public.is_profile_photo(icon, user_id)
);
alter table public.profiles alter column icon set default 'muscle';
alter table public.community_profiles alter column icon set default 'muscle';

create or replace function public.save_glog_profile(p_name text,p_icon text,p_bio text,p_global boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 -- 写真は本人のフォルダーのものだけ。他人の画像のパスは使えない
 if char_length(trim(p_name)) not between 1 and 30
    or not (p_icon in ('muscle','initials','barbell','target','bolt') or public.is_profile_photo(p_icon, auth.uid()))
    or char_length(p_bio)>100 then raise exception 'プロフィールの入力内容を確認してください'; end if;
 insert into public.community_profiles(user_id,display_name,icon,bio,global_ranking) values(auth.uid(),trim(p_name),p_icon,trim(p_bio),p_global)
 on conflict(user_id) do update set display_name=excluded.display_name,icon=excluded.icon,bio=excluded.bio,global_ranking=excluded.global_ranking;
 update public.profiles set display_name=trim(p_name),icon=p_icon where id=auth.uid();
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare n text; i text; g boolean;
begin
 n:=left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Glogユーザー'),30);
 i:=coalesce(new.raw_user_meta_data->>'profile_icon','muscle');
 if i not in ('muscle','initials','barbell') then i:='muscle'; end if;
 g:=coalesce(new.raw_user_meta_data->>'global_ranking','')='true';
 insert into public.profiles(id,display_name,icon) values(new.id,n,i);
 insert into public.community_profiles(user_id,display_name,icon,global_ranking) values(new.id,n,i,g);
 return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

commit;
