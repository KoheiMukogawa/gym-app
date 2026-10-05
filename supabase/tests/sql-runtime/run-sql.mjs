import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
// Applies every migration to a throwaway database with Supabase-like roles and default grants,
// then runs the rollback-only ranking suites. Nothing touches a real Supabase project.
const root = resolve(import.meta.dirname, '../../..')
const suites = ['0008_communities.sql', '0009_onboarding_global_ranking.sql', 'dots_ranking.sql', 'my_big3_data.sql', 'rls_initplan.sql', 'account_deletion.sql', 'feedback.sql', 'usage_stats.sql', 'announcements.sql']
const db = new PGlite({ extensions: { pgcrypto } })
try {
  await db.exec(`
  create schema extensions; create extension pgcrypto with schema extensions;
  create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
  grant usage on schema public,auth to anon,authenticated,service_role;
  alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
  alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
  create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
  create function public.rls_auto_enable() returns void language sql as $$ select $$;
  `)
  const dir = resolve(root, 'supabase/migrations')
  for (const file of readdirSync(dir).sort()) await db.exec(readFileSync(resolve(dir, file), 'utf8'))
  for (const suite of suites) {
    try {
      await db.exec(readFileSync(resolve(root, 'supabase/tests', suite), 'utf8'))
      console.log(`PASS ${suite}`)
    } catch (error) {
      await db.exec('rollback')
      console.error(`FAIL ${suite}: ${error.message}`)
      process.exitCode = 1
    }
  }
} finally {
  await db.close()
}
