-- 20261106120000_reports_blocks の修正。
-- 1. プロフィールの保存（save_glog_profile）は insert … on conflict do update で書くため、
--    追加のトリガーが先に動き、名前を変えずに保存しても今の名前で止まっていた。すでにある行と比べ、書き換えた欄だけを確かめる。
-- 2. 「ちんこ」「まんこ」はひらがなにそろえると名前の境目（「ちん こうへい」など）に当たるため外し、「おまんこ」にする。
begin;

create or replace function public.reject_banned_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_name text; old_bio text; existed boolean := true;
begin
 if tg_op = 'INSERT' then
   select c.display_name, c.bio into old_name, old_bio from public.community_profiles c where c.user_id = new.user_id;
   existed := found;
 else
   old_name := old.display_name; old_bio := old.bio;
 end if;
 if (not existed or new.display_name is distinct from old_name) and public.has_banned_word(new.display_name)
    or (not existed or new.bio is distinct from old_bio) and public.has_banned_word(new.bio) then
   raise exception '使えない言葉が含まれています';
 end if;
 return new;
end $$;
revoke all on function public.reject_banned_profile() from public, anon, authenticated;

delete from public.banned_words where word in (public.ban_normalize('ちんこ'), public.ban_normalize('まんこ'));
insert into public.banned_words(word) values ('おまんこ') on conflict do nothing;

commit;
