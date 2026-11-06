-- 通報・ブロック・禁止語（設計 docs/superpowers/specs/2026-11-06-report-block-design.md）。
-- App Storeの審査ガイドライン1.2（利用者が作るコンテンツ）への対応。
begin;

-- ---------------------------------------------------------------------------
-- 禁止語。名前・ひとこと・コミュニティ名に含まれていたら保存しない。
-- 比べる前に全角・半角、大文字・小文字、カタカナ・ひらがなをそろえ、空白と記号を除く。
-- 管理者が足すときは SQL Editor で insert into public.banned_words(word) values ('…')（そろえる処理は自動）。
create or replace function public.ban_normalize(p text) returns text
language sql immutable set search_path = '' as $$
 select translate(
   lower(regexp_replace(normalize(coalesce(p, ''), NFKC), '[[:space:][:punct:]・＿]', '', 'g')),
   'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ',
   'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ')
$$;

create table public.banned_words (
  word text primary key check (word <> '')
);
alter table public.banned_words enable row level security;
revoke all on public.banned_words from anon, authenticated;

create or replace function public.banned_words_normalize() returns trigger
language plpgsql set search_path = '' as $$
begin
 new.word := public.ban_normalize(new.word);
 return new;
end $$;
create trigger banned_words_normalize before insert or update on public.banned_words
  for each row execute function public.banned_words_normalize();

-- 部分一致で比べるので、ほかの言葉の一部になりやすい短い語は入れない。
insert into public.banned_words(word) values
 ('セックス'),('ちんこ'),('ちんぽ'),('まんこ'),('ペニス'),('ポルノ'),('porn'),('fuck'),
 ('援助交際'),('援交'),('パパ活'),('売春'),('買春'),('強姦'),('レイプ'),('痴漢'),('淫乱'),
 ('中出し'),('射精'),('オナニー'),('フェラチオ'),('手コキ'),('巨乳'),('爆乳'),('乳首'),('AV女優'),
 ('キチガイ'),('基地外'),('気違い'),('池沼'),('知恵遅れ'),('ガイジ'),('支那人'),('土人'),('片輪'),('黒んぼ'),
 ('nigger'),('nigga'),('faggot'),
 ('死ね'),('氏ね'),('殺す'),('殺害予告'),('自殺しろ'),('kill yourself')
on conflict do nothing;

create or replace function public.has_banned_word(p text) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.banned_words w where strpos(public.ban_normalize(p), w.word) > 0)
$$;

-- 書き換えた欄だけを確かめる。禁止語を後から足しても、既存の名前のままDOTSの設定などは保存できる。
create or replace function public.reject_banned_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if (tg_op = 'INSERT' or new.display_name is distinct from old.display_name) and public.has_banned_word(new.display_name)
    or (tg_op = 'INSERT' or new.bio is distinct from old.bio) and public.has_banned_word(new.bio) then
   raise exception '使えない言葉が含まれています';
 end if;
 return new;
end $$;
create trigger community_profiles_banned_words before insert or update on public.community_profiles
  for each row execute function public.reject_banned_profile();

create or replace function public.reject_banned_community() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if (tg_op = 'INSERT' or new.name is distinct from old.name) and public.has_banned_word(new.name) then
   raise exception '使えない言葉が含まれています';
 end if;
 return new;
end $$;
create trigger communities_banned_words before insert or update on public.communities
  for each row execute function public.reject_banned_community();

-- 新規登録の名前が禁止語に当たったら、登録は止めずに初期の名前にする（登録の失敗は原因が分かりにくいため）。
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare n text; i text; g boolean;
begin
 n:=left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Glogユーザー'),30);
 if public.has_banned_word(n) then n:='Glogユーザー'; end if;
 i:=coalesce(new.raw_user_meta_data->>'profile_icon','muscle');
 if i not in ('muscle','initials','barbell') then i:='muscle'; end if;
 g:=coalesce(new.raw_user_meta_data->>'global_ranking','')='true';
 insert into public.profiles(id,display_name,icon) values(new.id,n,i);
 insert into public.community_profiles(user_id,display_name,icon,global_ranking) values(new.id,n,i,g);
 return new;
end $$;

-- ---------------------------------------------------------------------------
-- 自分の画面に出ている人か（全体ランキングに参加している人か、同じコミュニティの人）。
-- 通報・ブロックはこの人たちだけにでき、それ以外は利用者がいるかどうかも分からないよう同じ文言で断る。
create or replace function public.can_see_member(p_viewer uuid, p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.community_profiles c where c.user_id = p_target and c.global_ranking)
  or exists (select 1 from public.community_members a join public.community_members b on b.community_id = a.community_id
             where a.user_id = p_viewer and b.user_id = p_target)
$$;

-- ---------------------------------------------------------------------------
-- 通報。通報した時点の名前・アイコン・ひとことを snapshot に残す。同じ相手への未対応の通報は1件にまとめる。
create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('name', 'photo', 'bio', 'impersonation', 'other')),
  detail text not null default '' check (char_length(detail) <= 500),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution in ('dismissed', 'reset', 'removed')),
  check (reporter_id <> target_id),
  check ((resolved_at is null) = (resolution is null))
);
create unique index user_reports_open_idx on public.user_reports(reporter_id, target_id) where resolved_at is null;
create index user_reports_target_idx on public.user_reports(target_id);
alter table public.user_reports enable row level security;
revoke all on public.user_reports from anon, authenticated;

create or replace function public.report_user(p_target uuid, p_reason text, p_detail text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); snap jsonb;
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if p_target is null or p_target = u or not public.can_see_member(u, p_target) then raise exception 'この操作はできません'; end if;
 if p_reason is null or p_reason not in ('name', 'photo', 'bio', 'impersonation', 'other') then raise exception '理由を選んでください'; end if;
 if char_length(coalesce(p_detail, '')) > 500 then raise exception '詳細は500文字までです'; end if;
 if (select count(*) from public.user_reports r where r.reporter_id = u and r.created_at > now() - interval '24 hours') >= 20 then
   raise exception '通報の上限に達しました。時間をおいてお試しください'; end if;
 select jsonb_build_object('display_name', c.display_name, 'icon', c.icon, 'bio', c.bio) into snap
   from public.community_profiles c where c.user_id = p_target;
 insert into public.user_reports(reporter_id, target_id, reason, detail, snapshot)
 values (u, p_target, p_reason, trim(coalesce(p_detail, '')), coalesce(snap, '{}'::jsonb))
 on conflict (reporter_id, target_id) where resolved_at is null
 do update set reason = excluded.reason, detail = excluded.detail, snapshot = excluded.snapshot, created_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- ブロック。片方向で、ブロックした人の画面からだけ相手が消える。相手には知らせない。
create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks(blocked_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;

create or replace function public.block_user(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if p_target is null or p_target = u or not public.can_see_member(u, p_target) then raise exception 'この操作はできません'; end if;
 insert into public.user_blocks(blocker_id, blocked_id) values (u, p_target) on conflict do nothing;
end $$;

create or replace function public.unblock_user(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 delete from public.user_blocks where blocker_id = u and blocked_id = p_target;
end $$;

create or replace function public.list_blocked_users()
returns table (user_id uuid, display_name text, icon text, blocked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 return query select b.blocked_id, c.display_name, c.icon, b.created_at
   from public.user_blocks b join public.community_profiles c on c.user_id = b.blocked_id
   where b.blocker_id = u order by b.created_at desc, b.blocked_id;
end $$;

-- ランキングは、見ている人がブロックした相手を返さない（名前もアイコンも端末に届かない）。
create or replace function public.global_ranking() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'icon',p.icon,'bio','',
   'lifts',x.lifts,'total',x.total,'growth',x.growth,'dots',x.dots,'dots_opt_in',x.dots_opt_in,'points','[]'::jsonb)
   order by x.total desc nulls last,p.user_id),'[]'::jsonb)
 into result
 from public.big3_member_stats(array(select c.user_id from public.community_profiles c where c.global_ranking
   and not exists(select 1 from public.user_blocks b where b.blocker_id=(select auth.uid()) and b.blocked_id=c.user_id))) x
 join public.community_profiles p on p.user_id=x.user_id;
 return result;
end $$;

create or replace function public.community_ranking(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.community_members where community_id=p_id and user_id=auth.uid()) then
   raise exception 'コミュニティに参加していません'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',p.display_name,'icon',p.icon,'bio',p.bio,
   'lifts',x.lifts,'total',x.total,'growth',x.growth,'dots',x.dots,'dots_opt_in',x.dots_opt_in,'points',x.points)
   order by x.total desc nulls last,p.user_id),'[]'::jsonb)
 into result
 from public.big3_member_stats(array(select m.user_id from public.community_members m where m.community_id=p_id
   and not exists(select 1 from public.user_blocks b where b.blocker_id=(select auth.uid()) and b.blocked_id=m.user_id))) x
 join public.community_profiles p on p.user_id=x.user_id;
 return result;
end $$;

-- ---------------------------------------------------------------------------
-- 管理者の対応。
create or replace function public.admin_list_reports()
returns table (id uuid, created_at timestamptz, reason text, detail text, snapshot jsonb, resolved_at timestamptz, resolution text,
  reporter_name text, target_id uuid, target_name text, target_icon text, target_bio text, target_global boolean)
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if not exists (select 1 from public.admins a where a.user_id = u) then raise exception '権限がありません'; end if;
 return query select r.id, r.created_at, r.reason, r.detail, r.snapshot, r.resolved_at, r.resolution,
   rp.display_name, r.target_id, tp.display_name, tp.icon, tp.bio, tp.global_ranking
  from public.user_reports r
  left join public.community_profiles rp on rp.user_id = r.reporter_id
  left join public.community_profiles tp on tp.user_id = r.target_id
  order by r.resolved_at is null desc, r.created_at desc, r.id desc limit 200;
end $$;

-- 管理者以外は0（ヘッダーが毎回たずねるため、エラーにしない）。
create or replace function public.admin_open_report_count() returns integer
language sql stable security definer set search_path = '' as $$
 select case when exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
   then (select count(*)::integer from public.user_reports r where r.resolved_at is null) else 0 end
$$;

-- 相手ごとに対応する。同じ相手への未対応の通報はまとめて対応済みにし、件数を返す。
--   dismiss: 何も変えない／reset: 名前・アイコン・ひとことを初期化／remove: 初期化して全体ランキングから外す
create or replace function public.admin_resolve_report(p_target uuid, p_action text) returns integer
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); n integer;
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if not exists (select 1 from public.admins a where a.user_id = u) then raise exception '権限がありません'; end if;
 if p_action is null or p_action not in ('dismiss', 'reset', 'remove') then raise exception '操作を選んでください'; end if;
 if not exists (select 1 from public.user_reports r where r.target_id = p_target and r.resolved_at is null) then
   raise exception '未対応の通報が見つかりません'; end if;
 if p_action in ('reset', 'remove') then
   update public.community_profiles set display_name = 'Glogユーザー', icon = 'muscle', bio = '',
     global_ranking = case when p_action = 'remove' then false else global_ranking end
   where user_id = p_target;
   update public.profiles set display_name = 'Glogユーザー', icon = 'muscle' where id = p_target;
 end if;
 update public.user_reports set resolved_at = now(),
   resolution = case p_action when 'dismiss' then 'dismissed' when 'reset' then 'reset' else 'removed' end
 where target_id = p_target and resolved_at is null;
 get diagnostics n = row_count;
 return n;
end $$;

-- ---------------------------------------------------------------------------
revoke all on function public.ban_normalize(text), public.has_banned_word(text), public.banned_words_normalize(),
  public.reject_banned_profile(), public.reject_banned_community(), public.can_see_member(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.report_user(uuid, text, text), public.block_user(uuid), public.unblock_user(uuid),
  public.list_blocked_users(), public.admin_list_reports(), public.admin_open_report_count(),
  public.admin_resolve_report(uuid, text), public.global_ranking(), public.community_ranking(uuid)
  from public, anon;
grant execute on function public.report_user(uuid, text, text), public.block_user(uuid), public.unblock_user(uuid),
  public.list_blocked_users(), public.admin_list_reports(), public.admin_open_report_count(),
  public.admin_resolve_report(uuid, text), public.global_ranking(), public.community_ranking(uuid)
  to authenticated;
notify pgrst, 'reload schema';
commit;
