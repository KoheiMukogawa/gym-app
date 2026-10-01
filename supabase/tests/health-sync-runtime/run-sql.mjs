import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../../..')
const db = new PGlite({ extensions: { pgcrypto } })
try {
 await db.exec(`
 create schema extensions;
 create extension pgcrypto with schema extensions;
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 grant usage on schema public,auth to anon,authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as
 $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create table public.profiles(id uuid primary key references auth.users(id),display_name text);
 create function public.test_profile() returns trigger language plpgsql as $$
 begin insert into public.profiles values(new.id,new.raw_user_meta_data->>'display_name'); return new; end $$;
 create trigger test_profile after insert on auth.users for each row execute function public.test_profile();
 create table public.bodyweight_logs(user_id uuid references public.profiles(id),recorded_on date,
 bodyweight_kg numeric(4,1) check(bodyweight_kg between 20 and 300),
 body_fat_pct numeric(4,1) check(body_fat_pct between 1 and 70),primary key(user_id,recorded_on));
 alter table public.bodyweight_logs enable row level security;
 create policy own_body on public.bodyweight_logs to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 grant all on public.bodyweight_logs to authenticated,service_role;
 `)
 await db.exec(readFileSync(resolve(root,'supabase/migrations/20261001192350_health_sync.sql'),'utf8'))
 await db.exec(readFileSync(resolve(root,'supabase/tests/health_sync.sql'),'utf8'))
 const {rows}=await db.query('select (select count(*) from health_sync_private.tokens)::int tokens,(select count(*) from public.bodyweight_logs)::int logs')
 if(rows[0].tokens!==0 || rows[0].logs!==0) throw new Error('Rollback leaked synthetic fixtures')
 console.log('PASS exact migration + rollback Health sync SQL privilege/validation/import suite; no rows retained')
} catch(error) {
 console.error(error.message)
 process.exitCode=1
} finally {await db.close()}
