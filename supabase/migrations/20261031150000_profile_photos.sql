-- プロフィール画像。アイコンの値として 'photo:<ユーザーID>/<ランダムID>.webp|jpg' を受け付ける。
-- 画像はStorageの公開バケット avatars に置き、本人のフォルダーにだけ書き込める。
-- ファイル名は変えるたびに新しくするので、ブラウザーやCDNに長くキャッシュさせても古い画像が残らない。
begin;

create or replace function public.is_profile_photo(p_icon text, p_user uuid)
returns boolean language sql immutable set search_path = '' as $$
  select p_icon ~ '^photo:[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
     and split_part(substr(p_icon, 7), '/', 1) = p_user::text
$$;

alter table public.community_profiles drop constraint if exists community_profiles_icon_check;
alter table public.community_profiles add constraint community_profiles_icon_check check (
  icon in ('initials','barbell','target','bolt','💪','🔥','🏋️','🐻','🐱','⚡')
  or public.is_profile_photo(icon, user_id)
);

create or replace function public.save_glog_profile(p_name text,p_icon text,p_bio text,p_global boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 -- 写真は本人のフォルダーのものだけ。他人の画像のパスは使えない
 if char_length(trim(p_name)) not between 1 and 30
    or not (p_icon in ('initials','barbell','target','bolt') or public.is_profile_photo(p_icon, auth.uid()))
    or char_length(p_bio)>100 then raise exception 'プロフィールの入力内容を確認してください'; end if;
 insert into public.community_profiles(user_id,display_name,icon,bio,global_ranking) values(auth.uid(),trim(p_name),p_icon,trim(p_bio),p_global)
 on conflict(user_id) do update set display_name=excluded.display_name,icon=excluded.icon,bio=excluded.bio,global_ranking=excluded.global_ranking;
 update public.profiles set display_name=trim(p_name),icon=p_icon where id=auth.uid();
end $$;

-- Storage。手元のSQLテスト（PGlite）には storage スキーマが無いので、あるときだけ作る
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 204800, array['image/webp', 'image/jpeg'])
    on conflict (id) do update set public = true, file_size_limit = 204800, allowed_mime_types = array['image/webp', 'image/jpeg'];

    execute $p$drop policy if exists avatars_insert_own on storage.objects$p$;
    execute $p$create policy avatars_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$drop policy if exists avatars_select_own on storage.objects$p$;
    -- 公開バケットなので表示にはポリシー不要。一覧（退会時の削除）は本人のフォルダーだけ
    execute $p$create policy avatars_select_own on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$drop policy if exists avatars_delete_own on storage.objects$p$;
    execute $p$create policy avatars_delete_own on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  end if;
end $$;

commit;
