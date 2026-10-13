-- Operators answer a note with a status and an optional reply. The sender sees both on their
-- feedback page and is told once at launch. Only admin_reply_feedback writes the answer, and
-- only mark_my_feedback_replies_seen writes when the sender saw it; neither column is granted.
begin;
alter table public.feedback
  add column status text check (status in ('considering', 'in_progress', 'done', 'declined')),
  add column reply text check (char_length(reply) <= 1000),
  -- Set whenever the status or reply changes, so a changed answer is shown again.
  add column replied_at timestamptz,
  add column reply_seen_at timestamptz;

-- The list now carries the answer; the return type changes, so the function is recreated.
drop function public.admin_list_feedback();
create function public.admin_list_feedback()
returns table (id uuid, body text, user_agent text, created_at timestamptz, read_at timestamptz, display_name text,
  status text, reply text, replied_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if not exists (select 1 from public.admins a where a.user_id = u) then raise exception '権限がありません'; end if;
 return query select f.id, f.body, f.user_agent, f.created_at, f.read_at, p.display_name, f.status, f.reply, f.replied_at
  from public.feedback f join public.profiles p on p.id = f.user_id
  order by f.created_at desc, f.id desc limit 200;
end $$;

-- Answering also marks the note read. A blank reply is stored as none.
create function public.admin_reply_feedback(p_id uuid, p_status text, p_reply text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
 u uuid := auth.uid();
 v_reply text := nullif(btrim(coalesce(p_reply, ''), E' \t\r\n　'), '');
 v_at timestamptz;
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if not exists (select 1 from public.admins a where a.user_id = u) then raise exception '権限がありません'; end if;
 if p_status is null or p_status not in ('considering', 'in_progress', 'done', 'declined') then raise exception '状態を選んでください'; end if;
 if char_length(v_reply) > 1000 then raise exception '返信は1000文字までです'; end if;
 update public.feedback f set
   replied_at = case when f.status is distinct from p_status or f.reply is distinct from v_reply then now() else f.replied_at end,
   status = p_status, reply = v_reply, read_at = coalesce(f.read_at, now())
  where f.id = p_id
  returning f.replied_at into v_at;
 if not found then raise exception '意見が見つかりません'; end if;
 return v_at;
end $$;

-- The sender has seen every answer so far.
create function public.mark_my_feedback_replies_seen() returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 update public.feedback set reply_seen_at = now()
  where user_id = u and replied_at is not null and (reply_seen_at is null or reply_seen_at < replied_at);
end $$;

revoke all on function public.admin_list_feedback(), public.admin_reply_feedback(uuid, text, text), public.mark_my_feedback_replies_seen() from public, anon;
grant execute on function public.admin_list_feedback(), public.admin_reply_feedback(uuid, text, text), public.mark_my_feedback_replies_seen() to authenticated;
commit;
