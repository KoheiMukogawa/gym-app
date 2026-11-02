-- Polls ask users to choose one option. A vote cannot be changed or withdrawn: there is no
-- update or delete grant, and votes are written only through vote_poll. The counts are returned
-- only to people who have voted or after the poll has closed, so voters are not swayed by them,
-- and they are counts only; nobody sees who chose what. Votes go with the account.
-- Polls are written by operators (for now in SQL; an admin screen comes later).
begin;
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(btrim(question)) between 1 and 200),
  description text check (char_length(description) <= 1000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.poll_options (
  poll_id uuid not null references public.polls(id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9_-]{1,40}$'),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  position smallint not null,
  primary key (poll_id, id),
  unique (poll_id, position)
);

create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_id text not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id),
  foreign key (poll_id, option_id) references public.poll_options(poll_id, id) on delete cascade
);
create index poll_votes_user_id_idx on public.poll_votes(user_id);
create index poll_votes_option_idx on public.poll_votes(poll_id, option_id);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
revoke all on public.polls, public.poll_options, public.poll_votes from anon, authenticated;
grant select on public.polls, public.poll_options, public.poll_votes to authenticated;
-- Started polls and their options are readable; each user reads only their own vote.
create policy polls_select_started on public.polls for select to authenticated using (starts_at <= now());
create policy poll_options_select_started on public.poll_options for select to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and p.starts_at <= now()));
create policy poll_votes_select_own on public.poll_votes for select to authenticated
  using (user_id = (select auth.uid()));

-- Started polls, newest open first, with the caller's choice. Counts are null until the caller
-- has voted or the poll has closed.
create function public.list_polls()
returns table (id uuid, question text, description text, starts_at timestamptz, ends_at timestamptz,
  my_option text, total_votes integer, options jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare u uuid := (select auth.uid());
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 return query
 select p.id, p.question, p.description, p.starts_at, p.ends_at, v.option_id,
   case when v.option_id is not null or p.ends_at <= now()
     then (select count(*)::integer from public.poll_votes c where c.poll_id = p.id) end,
   (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'votes',
       case when v.option_id is not null or p.ends_at <= now()
         then (select count(*) from public.poll_votes c where c.poll_id = p.id and c.option_id = o.id) end)
     order by o.position), '[]'::jsonb)
    from public.poll_options o where o.poll_id = p.id)
 from public.polls p
 left join public.poll_votes v on v.poll_id = p.id and v.user_id = u
 where p.starts_at <= now()
 order by (p.ends_at > now()) desc, p.ends_at desc, p.id
 limit 50;
end $$;

-- One vote per user, only while the poll is open, and never changed afterwards.
create function public.vote_poll(p_poll_id uuid, p_option_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
 u uuid := (select auth.uid());
 v_starts timestamptz;
 v_ends timestamptz;
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 select p.starts_at, p.ends_at into v_starts, v_ends from public.polls p where p.id = p_poll_id;
 if not found or v_starts > now() then raise exception '投票が見つかりません'; end if;
 if v_ends <= now() then raise exception 'この投票は締め切りました'; end if;
 if not exists (select 1 from public.poll_options o where o.poll_id = p_poll_id and o.id = p_option_id) then
   raise exception '選択肢を選んでください';
 end if;
 insert into public.poll_votes(poll_id, user_id, option_id) values (p_poll_id, u, p_option_id)
  on conflict (poll_id, user_id) do nothing;
 if not found then raise exception 'この投票には投票済みです'; end if;
end $$;

revoke all on function public.list_polls(), public.vote_poll(uuid, text) from public, anon;
grant execute on function public.list_polls(), public.vote_poll(uuid, text) to authenticated;

-- The first poll: the app's name, from Nov 2 to the end of Nov 5 (Japan time).
insert into public.polls(id, question, description, starts_at, ends_at) values (
  'b0110000-0000-4000-8000-000000000001',
  'アプリの名前はどちらがいいですか？',
  '使っている皆さんと一緒に、アプリの名前を決めたいと思います。結果を参考に運営が決めます。',
  '2026-11-02 00:00:00+09', '2026-11-06 00:00:00+09');
insert into public.poll_options(poll_id, id, label, position) values
  ('b0110000-0000-4000-8000-000000000001', 'glog', 'Glog', 1),
  ('b0110000-0000-4000-8000-000000000001', 'barbell-club', 'BARBELL CLUB', 2);
commit;
