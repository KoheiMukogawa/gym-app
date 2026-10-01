-- Body-only personal credentials: private storage, one active token per user.
create schema if not exists health_sync_private;
revoke all on schema health_sync_private from public, anon, authenticated, service_role;
grant usage on schema health_sync_private to authenticated, service_role;
create table health_sync_private.tokens (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$'),
 issued_at timestamptz,
 last_synced_at timestamptz,
 last_synced_count integer
);
alter table health_sync_private.tokens enable row level security;
revoke all on health_sync_private.tokens from public, anon, authenticated, service_role;

create function health_sync_private.issue_token() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); raw_token text; issued timestamptz;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 -- Serializes even the first issuance (there is no row to lock yet).
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 78123));
 raw_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
 issued := pg_catalog.clock_timestamp();
 insert into health_sync_private.tokens(user_id, token_hash, issued_at)
 values (owner_id, pg_catalog.encode(extensions.digest(raw_token,'sha256'),'hex'), issued)
 on conflict(user_id) do update set token_hash=excluded.token_hash, issued_at=excluded.issued_at;
 return pg_catalog.jsonb_build_object('token',raw_token,'issued_at',issued);
end $$;

create function health_sync_private.status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); result jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select pg_catalog.jsonb_build_object('enabled',token_hash is not null,'issued_at',issued_at,
  'last_synced_at',last_synced_at,'last_synced_count',last_synced_count)
 into result from health_sync_private.tokens where user_id=owner_id;
 return coalesce(result, '{"enabled":false,"issued_at":null,"last_synced_at":null,"last_synced_count":null}'::jsonb);
end $$;

create function health_sync_private.revoke_token() returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 78123));
 update health_sync_private.tokens set token_hash=null where user_id=owner_id;
end $$;

create function health_sync_private.import_records(p_token_hash text,p_records jsonb,p_mode text default 'keep')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; rec jsonb; day date; w numeric; fat numeric;
 ins integer:=0; upd integer:=0; skip integer:=0; affected integer; seen text[]:='{}';
begin
 -- EXECUTE is service-only; owner is always derived from the stored token.
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'Invalid credential' using errcode='28000';
 end if;
 select user_id into owner_id from health_sync_private.tokens where token_hash=p_token_hash for update;
 if owner_id is null then raise exception 'Invalid credential' using errcode='28000'; end if;
 if p_mode is null or p_mode not in ('keep','overwrite') or p_records is null
    or pg_catalog.jsonb_typeof(p_records)<>'array' then
  raise exception 'Invalid records' using errcode='22023';
 end if;
 if pg_catalog.jsonb_array_length(p_records)<1 or pg_catalog.jsonb_array_length(p_records)>500 then
  raise exception 'Invalid records' using errcode='22023';
 end if;
 -- Validate the entire request before writing.
 for rec in select value from pg_catalog.jsonb_array_elements(p_records) loop
  if pg_catalog.jsonb_typeof(rec)<>'object' then raise exception 'Invalid records' using errcode='22023'; end if;
  if exists(select 1 from pg_catalog.jsonb_object_keys(rec) k where k not in ('date','weight_kg','body_fat_pct'))
   or coalesce(pg_catalog.jsonb_typeof(rec->'date'),'null')<>'string'
   or (rec->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or coalesce(pg_catalog.jsonb_typeof(rec->'weight_kg'),'null')<>'number'
   or (rec ? 'body_fat_pct' and pg_catalog.jsonb_typeof(rec->'body_fat_pct') not in ('number','null'))
  then raise exception 'Invalid records' using errcode='22023'; end if;
  begin
   day := (rec->>'date')::date;
   if pg_catalog.to_char(day,'YYYY-MM-DD')<>rec->>'date' then raise exception 'Invalid date'; end if;
  exception when others then raise exception 'Invalid records' using errcode='22023';
  end;
  w := (rec->>'weight_kg')::numeric; fat := (rec->>'body_fat_pct')::numeric;
  if w not between 20 and 300 or (fat is not null and fat not between 1 and 70)
   or rec->>'date'=any(seen) then raise exception 'Invalid records' using errcode='22023'; end if;
  seen := pg_catalog.array_append(seen,rec->>'date');
 end loop;
 for rec in select value from pg_catalog.jsonb_array_elements(p_records) loop
  day := (rec->>'date')::date;
  w := pg_catalog.round((rec->>'weight_kg')::numeric,1);
  fat := pg_catalog.round((rec->>'body_fat_pct')::numeric,1);
  insert into public.bodyweight_logs(user_id,recorded_on,bodyweight_kg,body_fat_pct)
   values(owner_id,day,w,fat) on conflict(user_id,recorded_on) do nothing;
  get diagnostics affected=row_count;
  if affected=1 then ins:=ins+1;
  elsif p_mode='overwrite' then
   update public.bodyweight_logs set bodyweight_kg=w,body_fat_pct=coalesce(fat,body_fat_pct)
    where user_id=owner_id and recorded_on=day;
   upd:=upd+1;
  else skip:=skip+1;
  end if;
 end loop;
 update health_sync_private.tokens set last_synced_at=pg_catalog.clock_timestamp(),
  last_synced_count=ins+upd where user_id=owner_id;
 return pg_catalog.jsonb_build_object('inserted',ins,'updated',upd,'skipped',skip);
end $$;

create function public.health_sync_issue_token() returns jsonb
language sql security invoker set search_path='' as $$ select health_sync_private.issue_token() $$;
create function public.health_sync_status() returns jsonb
language sql security invoker set search_path='' as $$ select health_sync_private.status() $$;
create function public.health_sync_revoke_token() returns void
language sql security invoker set search_path='' as $$ select health_sync_private.revoke_token() $$;
create function public.health_sync_import(p_token_hash text,p_records jsonb,p_mode text default 'keep') returns jsonb
language sql security invoker set search_path='' as $$ select health_sync_private.import_records(p_token_hash,p_records,p_mode) $$;

revoke all on function health_sync_private.issue_token(),health_sync_private.status(),health_sync_private.revoke_token(),
 health_sync_private.import_records(text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.health_sync_issue_token(),public.health_sync_status(),public.health_sync_revoke_token(),
 public.health_sync_import(text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function health_sync_private.issue_token(),health_sync_private.status(),health_sync_private.revoke_token(),
 public.health_sync_issue_token(),public.health_sync_status(),public.health_sync_revoke_token() to authenticated;
grant execute on function health_sync_private.import_records(text,jsonb,text),public.health_sync_import(text,jsonb,text) to service_role;
