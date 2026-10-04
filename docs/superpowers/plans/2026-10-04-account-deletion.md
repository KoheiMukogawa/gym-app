# 退会（アカウント削除） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 利用者がアプリ内で、自分のアカウントと全データを「退会する」の入力つきで削除できるようにする。

**Architecture:** DB関数2つ（件数の取得 `account_deletion_summary`、削除 `delete_my_account`）をmigration 1本で追加する。削除は1トランザクションで、本人の記録→BIG3の種目設定→自作種目→`auth.users` の順に消し、残りは外部キーの連鎖に任せる。画面はプロフィールの「退会する」から `/account/delete` に進み、件数を見せて入力を確認し、退会後は端末の下書きとログイン状態を消して紹介ページに戻す。

**Tech Stack:** Supabase（Postgres、PL/pgSQL、PostgREST RPC）、React 19 + React Router、Vitest + Testing Library、Playwright（モックE2E）、PGlite（SQLテスト）

**Spec:** `docs/superpowers/specs/2026-10-04-account-deletion-design.md`

## Global Constraints

- UI文言は日本語、コード識別子とコミットメッセージは英語。コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 主要操作のタップ領域は最低56px（`min-h-14`）
- 通信エラーを空状態と同じ表示にしない。画面内にエラーを残し、再試行を用意する
- DB関数は `security definer`、`set search_path = ''`、完全修飾名。`public`・`anon` から実行権を外し、`authenticated` にだけ付与する
- 確認の文字列は `退会する`（全角、前後に空白なし）
- 本番DBへのmigration適用、本番での退会の実行、pushは本人の許可を得てから。pushはmigrationの適用より後
- 作業開始前に `git status --short` を確認する。push前に `git fetch` する（Codexも `master` にpushする）

## Review Focus

1. **入力の前後に空白や改行が入った「退会する」**: 一致しないものとしてボタンは押せないままにする（トリムしない。DB関数と同じ厳密な比較にそろえる）→ Task 3 のテストで確認
2. **退会ボタンの連打**: DB関数が2回呼ばれない → Task 3 のテストで確認
3. **件数の読み込み失敗**: 退会ボタンを出さず、エラーと「再試行」を出す。再試行で回復する → Task 3 のテストで確認
4. **作成したコミュニティにほかのメンバーがいない**: 警告文は出すが、「ほかのメンバー0人」と書く。複数あれば全部出す → Task 3 のテストで確認
5. **ほかの利用者が本人の自作種目を参照している**: 何も消えず、理由が画面に出る → Task 1（SQL）と Task 2（文言）で確認

---

## File Structure

| ファイル | 役割 |
|---|---|
| `supabase/migrations/20261004120000_account_deletion.sql`（新規） | DB関数2つと権限 |
| `supabase/tests/account_deletion.sql`（新規） | PGliteで流すSQLテスト（すべてrollback） |
| `supabase/tests/sql-runtime/run-sql.mjs`（変更） | テスト一覧に `account_deletion.sql` を追加 |
| `src/features/account/queries.ts`（新規） | RPCの呼び出し、型、エラー文言 |
| `src/features/account/queries.test.ts`（新規） | 上の単体テスト |
| `src/features/account/DeleteAccountPage.tsx`（新規） | 退会画面 |
| `src/features/account/DeleteAccountPage.test.tsx`（新規） | 退会画面の単体テスト |
| `src/App.tsx`（変更） | `/account/delete` のルート |
| `src/features/profile/ProfilePage.tsx`（変更） | 「アカウント」欄と「退会する」リンク |
| `src/features/profile/ProfilePage.test.tsx`（変更） | リンクのテスト |
| `tests/e2e/account-deletion.spec.ts`（新規） | モックE2E |
| `playwright.mock.config.ts`（変更） | モックE2Eの対象に追加 |
| `CLAUDE.md`（変更、Task 5） | 本番適用済みのmigrationと機能の記録 |

---

### Task 1: DB関数とSQLテスト

**Files:**
- Create: `supabase/tests/account_deletion.sql`
- Modify: `supabase/tests/sql-runtime/run-sql.mjs:8`（`suites` 配列）
- Create: `supabase/migrations/20261004120000_account_deletion.sql`

**Interfaces:**
- Produces:
  - `public.account_deletion_summary() returns jsonb` — `{ workout_days: number, set_count: number, body_log_count: number, custom_exercise_count: number, health_sync_connected: boolean, owned_communities: { name: string, other_member_count: number }[] }`
  - `public.delete_my_account(p_confirm text) returns void`
  - 例外の文言: `ログインが必要です`、`確認の文字が一致しません`、`ほかの利用者の記録が使っている種目があるため退会できません`

- [ ] **Step 1: SQLテストを書く**

`supabase/tests/account_deletion.sql` を作る。ユーザーA（退会する）、B（残る）、C（Aの自作種目を参照する、別の場面用）を使う。

```sql
-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('d0000000-0000-4000-8000-00000000000a', 'leave@example.com', '{"display_name":"退会者"}'),
 ('d0000000-0000-4000-8000-00000000000b', 'stay@example.com', '{"display_name":"残る人"}');

-- A: one workout with a preset set and a custom-exercise set, a custom exercise, a body log,
-- a BIG3 mapping, a goal, a routine, an exercise order, a Health token,
-- an owned community with B as a member, and a membership in B's community.
insert into public.exercises(id, name, name_normalized, muscle_group, is_preset, created_by) values
 ('d1000000-0000-4000-8000-00000000000a', '自作A', '自作a', 'chest', false, 'd0000000-0000-4000-8000-00000000000a'),
 ('d1000000-0000-4000-8000-00000000000b', '自作B', '自作b', 'chest', false, 'd0000000-0000-4000-8000-00000000000b');
insert into public.workouts(id, user_id) values
 ('d2000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a'),
 ('d2000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000b');
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps)
 select 'd2000000-0000-4000-8000-00000000000a', id, 1, 60, 5 from public.exercises where is_preset and name_normalized = 'ベンチプレス';
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps) values
 ('d2000000-0000-4000-8000-00000000000a', 'd1000000-0000-4000-8000-00000000000a', 2, 20, 10),
 ('d2000000-0000-4000-8000-00000000000b', 'd1000000-0000-4000-8000-00000000000b', 1, 30, 10);
insert into public.bodyweight_logs(user_id, recorded_on, bodyweight_kg) values
 ('d0000000-0000-4000-8000-00000000000a', '2026-10-01', 70),
 ('d0000000-0000-4000-8000-00000000000b', '2026-10-01', 80);
insert into public.big3_exercise_mappings(user_id, lift_type, exercise_id) values
 ('d0000000-0000-4000-8000-00000000000a', 'bench', 'd1000000-0000-4000-8000-00000000000a');
insert into public.strength_goals(user_id, label, target_date, target_total_kg) values
 ('d0000000-0000-4000-8000-00000000000a', 'BIG3', '2026-12-31', 400);
insert into public.training_routines(id, user_id, name, exercise_ids) values
 ('d3000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a', '胸の日', array['d1000000-0000-4000-8000-00000000000a']::uuid[]);
insert into public.exercise_preferences(user_id, exercise_order) values
 ('d0000000-0000-4000-8000-00000000000a', array['d1000000-0000-4000-8000-00000000000a']::uuid[]);
insert into health_sync_private.tokens(user_id, token_hash, issued_at) values
 ('d0000000-0000-4000-8000-00000000000a', repeat('a', 64), now());
insert into public.communities(id, owner_id, name) values
 ('d4000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a', 'Aの会'),
 ('d4000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000b', 'Bの会');
insert into public.community_members(community_id, user_id) values
 ('d4000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000a'),
 ('d4000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-00000000000b'),
 ('d4000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000b'),
 ('d4000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-00000000000a');

-- anon can run neither function; authenticated can.
do $$ begin
  if has_function_privilege('anon', 'public.delete_my_account(text)', 'execute')
    or has_function_privilege('anon', 'public.account_deletion_summary()', 'execute') then
    raise exception 'anon can run account deletion functions'; end if;
  if not has_function_privilege('authenticated', 'public.delete_my_account(text)', 'execute')
    or not has_function_privilege('authenticated', 'public.account_deletion_summary()', 'execute') then
    raise exception 'authenticated cannot run account deletion functions'; end if;
end $$;

set local role authenticated;

-- Signed out: both functions refuse.
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.account_deletion_summary(); raise exception 'summary ran signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
  begin perform public.delete_my_account('退会する'); raise exception 'deletion ran signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-00000000000a', true);

-- The summary counts A's data and names A's community with the other members.
do $$ declare s jsonb := public.account_deletion_summary(); begin
  if s <> jsonb_build_object('workout_days', 1, 'set_count', 2, 'body_log_count', 1, 'custom_exercise_count', 1,
    'health_sync_connected', true, 'owned_communities', jsonb_build_array(jsonb_build_object('name', 'Aの会', 'other_member_count', 1))) then
    raise exception 'unexpected summary: %', s; end if;
end $$;

-- A wrong confirmation, including surrounding spaces, deletes nothing.
do $$ declare c text; begin
  foreach c in array array['', '退会', ' 退会する', '退会する ', null] loop
    begin perform public.delete_my_account(c); raise exception 'deleted with confirmation %', coalesce(c, 'null');
    exception when raise_exception then if sqlerrm <> '確認の文字が一致しません' then raise; end if; end;
  end loop;
end $$;

-- Another user's set that points at A's custom exercise stops the whole deletion.
reset role;
insert into auth.users(id, email, raw_user_meta_data) values
 ('d0000000-0000-4000-8000-00000000000c', 'other@example.com', '{"display_name":"参照する人"}');
insert into public.workouts(id, user_id) values
 ('d2000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-00000000000c');
insert into public.workout_sets(workout_id, exercise_id, set_index, weight_kg, reps) values
 ('d2000000-0000-4000-8000-00000000000c', 'd1000000-0000-4000-8000-00000000000a', 1, 10, 10);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-00000000000a', true);
do $$ begin
  begin perform public.delete_my_account('退会する'); raise exception 'deleted while another user referenced a custom exercise';
  exception when raise_exception then if sqlerrm <> 'ほかの利用者の記録が使っている種目があるため退会できません' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from auth.users where id = 'd0000000-0000-4000-8000-00000000000a')
    or (select count(*) from public.workouts where user_id = 'd0000000-0000-4000-8000-00000000000a') <> 1
    or (select count(*) from public.big3_exercise_mappings where user_id = 'd0000000-0000-4000-8000-00000000000a') <> 1 then
    raise exception 'a refused deletion removed data'; end if;
end $$;
delete from auth.users where id = 'd0000000-0000-4000-8000-00000000000c';

-- The real deletion.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-00000000000a', true);
select public.delete_my_account('退会する');
reset role;

-- Nothing that points at A's profile is left, in any table.
do $$ declare r record; n bigint; begin
  for r in select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into n using 'd0000000-0000-4000-8000-00000000000a'::uuid;
    if n <> 0 then raise exception '% still has % rows for the deleted user', r.tbl, n; end if;
  end loop;
  if exists (select 1 from auth.users where id = 'd0000000-0000-4000-8000-00000000000a') then raise exception 'auth user remains'; end if;
  if exists (select 1 from public.profiles where id = 'd0000000-0000-4000-8000-00000000000a') then raise exception 'profile remains'; end if;
  if exists (select 1 from public.exercises where id = 'd1000000-0000-4000-8000-00000000000a') then raise exception 'custom exercise remains'; end if;
  if exists (select 1 from public.communities where id = 'd4000000-0000-4000-8000-00000000000a') then raise exception 'owned community remains'; end if;
  if exists (select 1 from public.community_members where community_id = 'd4000000-0000-4000-8000-00000000000a') then raise exception 'owned community members remain'; end if;
end $$;

-- B keeps everything, including B's community without A in it.
do $$ begin
  if not exists (select 1 from public.profiles where id = 'd0000000-0000-4000-8000-00000000000b')
    or (select count(*) from public.workout_sets where workout_id = 'd2000000-0000-4000-8000-00000000000b') <> 1
    or not exists (select 1 from public.exercises where id = 'd1000000-0000-4000-8000-00000000000b')
    or not exists (select 1 from public.bodyweight_logs where user_id = 'd0000000-0000-4000-8000-00000000000b')
    or not exists (select 1 from public.communities where id = 'd4000000-0000-4000-8000-00000000000b')
    or (select array_agg(user_id) from public.community_members where community_id = 'd4000000-0000-4000-8000-00000000000b')
      <> array['d0000000-0000-4000-8000-00000000000b']::uuid[] then
    raise exception 'the other user lost data'; end if;
end $$;
rollback;
```

- [ ] **Step 2: テスト一覧に追加する**

`supabase/tests/sql-runtime/run-sql.mjs` の8行目:

```js
const suites = ['0008_communities.sql', '0009_onboarding_global_ranking.sql', 'dots_ranking.sql', 'my_big3_data.sql', 'rls_initplan.sql', 'account_deletion.sql']
```

- [ ] **Step 3: 失敗を確認する**

Run: `node supabase/tests/sql-runtime/run-sql.mjs`
Expected: `FAIL account_deletion.sql: function public.delete_my_account(text) does not exist`（ほかのテストはPASS、終了コード1）

- [ ] **Step 4: migrationを書く**

`supabase/migrations/20261004120000_account_deletion.sql`:

```sql
-- Account deletion: a summary for the confirmation screen and the deletion itself.
-- Deleting auth.users cascades through profiles to every per-user table. Custom exercises are
-- removed first: exercises.created_by is "on delete set null", which their check constraint forbids.
begin;
create or replace function public.account_deletion_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 return jsonb_build_object(
  'workout_days', (select count(*) from public.workouts where user_id = u),
  'set_count', (select count(*) from public.workout_sets s join public.workouts w on w.id = s.workout_id where w.user_id = u),
  'body_log_count', (select count(*) from public.bodyweight_logs where user_id = u),
  'custom_exercise_count', (select count(*) from public.exercises where created_by = u and not is_preset),
  'health_sync_connected', exists (select 1 from health_sync_private.tokens where user_id = u and token_hash is not null),
  'owned_communities', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'other_member_count',
      (select count(*) from public.community_members m where m.community_id = c.id and m.user_id <> u)) order by c.created_at, c.id)
    from public.communities c where c.owner_id = u), '[]'::jsonb));
end $$;

create or replace function public.delete_my_account(p_confirm text) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if p_confirm is distinct from '退会する' then raise exception '確認の文字が一致しません'; end if;
 delete from public.workouts where user_id = u;
 delete from public.big3_exercise_mappings where user_id = u;
 if exists (select 1 from public.workout_sets s join public.exercises e on e.id = s.exercise_id where e.created_by = u and not e.is_preset)
   or exists (select 1 from public.big3_exercise_mappings m join public.exercises e on e.id = m.exercise_id where e.created_by = u and not e.is_preset) then
  raise exception 'ほかの利用者の記録が使っている種目があるため退会できません';
 end if;
 delete from public.exercises where created_by = u and not is_preset;
 delete from auth.users where id = u;
end $$;

revoke all on function public.account_deletion_summary(), public.delete_my_account(text) from public, anon;
grant execute on function public.account_deletion_summary(), public.delete_my_account(text) to authenticated;
commit;
```

- [ ] **Step 5: 通ることを確認する**

Run: `node supabase/tests/sql-runtime/run-sql.mjs`
Expected: `PASS account_deletion.sql` を含め全テストがPASS、終了コード0

- [ ] **Step 6: コミット**

```bash
git add supabase/migrations/20261004120000_account_deletion.sql supabase/tests/account_deletion.sql supabase/tests/sql-runtime/run-sql.mjs
git commit -m "Add database functions to delete one's own account"
```

---

### Task 2: RPCの呼び出しとエラー文言

**Files:**
- Create: `src/features/account/queries.ts`
- Test: `src/features/account/queries.test.ts`

**Interfaces:**
- Consumes: Task 1 のRPC名・引数名・例外の文言
- Produces:
  - `CONFIRM_TEXT: '退会する'`
  - `type DeletionSummary = { workout_days: number; set_count: number; body_log_count: number; custom_exercise_count: number; health_sync_connected: boolean; owned_communities: { name: string; other_member_count: number }[] }`
  - `fetchDeletionSummary(): Promise<DeletionSummary>`
  - `deleteMyAccount(confirm: string): Promise<void>`
  - `accountMessage(error: unknown): string`

- [ ] **Step 1: テストを書く**

`src/features/account/queries.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { accountMessage, deleteMyAccount, fetchDeletionSummary } from './queries'

beforeEach(() => vi.clearAllMocks())

describe('account queries', () => {
  it('reads the deletion summary', async () => {
    const summary = { workout_days: 3, set_count: 12, body_log_count: 0, custom_exercise_count: 1, health_sync_connected: false, owned_communities: [] }
    rpc.mockResolvedValue({ data: summary, error: null })
    await expect(fetchDeletionSummary()).resolves.toEqual(summary)
    expect(rpc).toHaveBeenCalledWith('account_deletion_summary')
  })
  it('sends the typed confirmation to the deletion', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await deleteMyAccount('退会する')
    expect(rpc).toHaveBeenCalledWith('delete_my_account', { p_confirm: '退会する' })
  })
  it('throws the RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(deleteMyAccount('退会する')).rejects.toEqual({ message: 'boom' })
  })
})

describe('accountMessage', () => {
  it('shows the database reasons as they are', () => {
    for (const message of ['ログインが必要です', '確認の文字が一致しません', 'ほかの利用者の記録が使っている種目があるため退会できません'])
      expect(accountMessage({ message })).toBe(message)
  })
  it('explains a missing function', () => {
    expect(accountMessage({ code: 'PGRST202', message: 'Could not find the function' }))
      .toBe('退会機能の準備中です。時間をおいてお試しください。')
  })
  it('falls back to the shared messages', () => {
    expect(accountMessage(new Error('boom'))).toBe('エラーが発生しました。もう一度お試しください。')
  })
})
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/features/account/queries.test.ts`
Expected: FAIL（`./queries` が見つからない）

- [ ] **Step 3: 実装する**

`src/features/account/queries.ts`:

```ts
import { supabase } from '../../lib/supabase'
import { toMessage } from '../../lib/errors'

export const CONFIRM_TEXT = '退会する'

export type DeletionSummary = {
  workout_days: number
  set_count: number
  body_log_count: number
  custom_exercise_count: number
  health_sync_connected: boolean
  owned_communities: { name: string; other_member_count: number }[]
}

export async function fetchDeletionSummary(): Promise<DeletionSummary> {
  const { data, error } = await supabase.rpc('account_deletion_summary')
  if (error) throw error
  return data as DeletionSummary
}

export async function deleteMyAccount(confirm: string): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account', { p_confirm: confirm })
  if (error) throw error
}

// Reasons raised by the database functions are written for the user and shown as they are.
const KNOWN = ['ログインが必要です', '確認の文字が一致しません', 'ほかの利用者の記録が使っている種目があるため退会できません']

export function accountMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null
  if (e?.code === 'PGRST202') return '退会機能の準備中です。時間をおいてお試しください。'
  return KNOWN.includes(e?.message ?? '') ? e!.message! : toMessage(error)
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run src/features/account/queries.test.ts`
Expected: 6 passed

- [ ] **Step 5: コミット**

```bash
git add src/features/account/queries.ts src/features/account/queries.test.ts
git commit -m "Add account deletion queries and messages"
```

---

### Task 3: 退会画面と入口

**Files:**
- Create: `src/features/account/DeleteAccountPage.tsx`
- Test: `src/features/account/DeleteAccountPage.test.tsx`
- Modify: `src/App.tsx`（lazyの一覧とルート）
- Modify: `src/features/profile/ProfilePage.tsx`（「体組成」欄の後ろ）
- Modify: `src/features/profile/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `CONFIRM_TEXT`、`DeletionSummary`、`fetchDeletionSummary`、`deleteMyAccount`、`accountMessage`。既存の `clearDraft(userId: string): void`（`src/features/workout-log/persistence.ts`）、`useSession()`、`useToast().show(message)`、`Button`（`variant: 'primary' | 'ghost' | 'danger'`）、`Spinner`
- Produces: `DeleteAccountPage`（`/account/delete`）

- [ ] **Step 1: テストを書く**

`src/features/account/DeleteAccountPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../components/ui/Toast'

const { rpc, signOut, clearDraft } = vi.hoisted(() => ({ rpc: vi.fn(), signOut: vi.fn(), clearDraft: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc, auth: { signOut } } }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me' }) }))
vi.mock('../workout-log/persistence', () => ({ clearDraft }))
import { DeleteAccountPage } from './DeleteAccountPage'

const summary = { workout_days: 42, set_count: 380, body_log_count: 15, custom_exercise_count: 2, health_sync_connected: false, owned_communities: [] as { name: string; other_member_count: number }[] }
function mockRpc(overrides: Partial<typeof summary> = {}) {
  rpc.mockImplementation(async (name: string) => name === 'account_deletion_summary'
    ? { data: { ...summary, ...overrides }, error: null } : { data: null, error: null })
}
function renderPage() {
  return render(<MemoryRouter initialEntries={['/account/delete']}><ToastProvider><Routes>
    <Route path="/account/delete" element={<DeleteAccountPage />} />
    <Route path="/" element={<p>紹介ページ</p>} />
  </Routes></ToastProvider></MemoryRouter>)
}
const deletionCalls = () => rpc.mock.calls.filter(([name]) => name === 'delete_my_account')

beforeEach(() => {
  vi.clearAllMocks()
  signOut.mockResolvedValue({ error: null })
  mockRpc()
})

describe('DeleteAccountPage', () => {
  it('lists what will be deleted and links to the export first', async () => {
    renderPage()
    expect(await screen.findByText('記録 42日分（380セット）')).toBeInTheDocument()
    expect(screen.getByText('体組成 15件')).toBeInTheDocument()
    expect(screen.getByText('自作の種目 2件')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '退会前に記録を書き出す' })).toHaveAttribute('href', '/export')
    expect(screen.queryByText(/ショートカット/)).not.toBeInTheDocument()
  })

  it('warns about every owned community, including one without other members', async () => {
    mockRpc({ owned_communities: [{ name: '朝トレ部', other_member_count: 3 }, { name: 'ひとり部', other_member_count: 0 }] })
    renderPage()
    expect(await screen.findByText('あなたが作成したコミュニティ「朝トレ部」も削除され、ほかのメンバー3人の画面から消えます。')).toBeInTheDocument()
    expect(screen.getByText('あなたが作成したコミュニティ「ひとり部」も削除され、ほかのメンバー0人の画面から消えます。')).toBeInTheDocument()
  })

  it('reminds Health sync users to remove the shortcut', async () => {
    mockRpc({ health_sync_connected: true })
    renderPage()
    expect(await screen.findByText('iPhoneのショートカットは自動では消えません。ショートカットAppから削除してください。')).toBeInTheDocument()
  })

  it('enables the button only for the exact confirmation text', async () => {
    renderPage()
    const input = await screen.findByLabelText('確認のため「退会する」と入力してください')
    const button = screen.getByRole('button', { name: '退会する' })
    for (const text of ['退会', ' 退会する', '退会する ']) {
      await userEvent.clear(input)
      await userEvent.type(input, text)
      expect(button).toBeDisabled()
    }
    await userEvent.clear(input)
    await userEvent.type(input, '退会する')
    expect(button).toBeEnabled()
  })

  it('deletes once, clears this device, and returns to the introduction', async () => {
    let finish: (value: { data: null; error: null }) => void = () => {}
    rpc.mockImplementation((name: string) => name === 'account_deletion_summary'
      ? Promise.resolve({ data: summary, error: null })
      : new Promise((resolve) => { finish = resolve }))
    renderPage()
    await userEvent.type(await screen.findByLabelText('確認のため「退会する」と入力してください'), '退会する')
    await userEvent.click(screen.getByRole('button', { name: '退会する' }))
    expect(screen.getByRole('button', { name: '退会処理中…' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '退会処理中…' }))
    finish({ data: null, error: null })
    expect(await screen.findByText('紹介ページ')).toBeInTheDocument()
    expect(screen.getByText('退会しました')).toBeInTheDocument()
    expect(deletionCalls()).toEqual([['delete_my_account', { p_confirm: '退会する' }]])
    expect(clearDraft).toHaveBeenCalledWith('me')
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('keeps the input and explains a failed deletion', async () => {
    rpc.mockImplementation(async (name: string) => name === 'account_deletion_summary'
      ? { data: summary, error: null }
      : { data: null, error: { message: 'ほかの利用者の記録が使っている種目があるため退会できません' } })
    renderPage()
    const input = await screen.findByLabelText('確認のため「退会する」と入力してください')
    await userEvent.type(input, '退会する')
    await userEvent.click(screen.getByRole('button', { name: '退会する' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ほかの利用者の記録が使っている種目があるため退会できません')
    expect(input).toHaveValue('退会する')
    expect(screen.getByRole('button', { name: '退会する' })).toBeEnabled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('hides the deletion when the summary fails, and recovers on retry', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new TypeError('Failed to fetch') })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('通信できませんでした')
    expect(screen.queryByRole('button', { name: '退会する' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(await screen.findByText('記録 42日分（380セット）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退会する' })).toBeInTheDocument()
  })
})
```

`src/features/profile/ProfilePage.test.tsx` の末尾に追加:

```tsx
it('links to account deletion at the bottom', async () => {
  profile.mockResolvedValue({ ...base, dots_opt_in: false, dots_formula: null })
  renderPage()
  expect(await screen.findByRole('link', { name: '退会する' })).toHaveAttribute('href', '/account/delete')
})
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/features/account src/features/profile`
Expected: `DeleteAccountPage.test.tsx` はimportできずにFAIL、`links to account deletion at the bottom` はリンクが見つからずにFAIL

- [ ] **Step 3: 退会画面を実装する**

`src/features/account/DeleteAccountPage.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { supabase } from '../../lib/supabase'
import { useSession } from '../auth/SessionProvider'
import { clearDraft } from '../workout-log/persistence'
import { CONFIRM_TEXT, accountMessage, deleteMyAccount, fetchDeletionSummary, type DeletionSummary } from './queries'

export function DeleteAccountPage() {
  const { userId } = useSession()
  const navigate = useNavigate()
  const { show } = useToast()
  const [summary, setSummary] = useState<DeletionSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const load = useCallback(() => {
    setLoadError(null); setSummary(null)
    fetchDeletionSummary().then(setSummary).catch((e: unknown) => setLoadError(accountMessage(e)))
  }, [])
  useEffect(() => { load() }, [load])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!userId || confirm !== CONFIRM_TEXT || lock.current) return
    lock.current = true; setDeleting(true); setError(null)
    try {
      await deleteMyAccount(confirm)
    } catch (e) {
      setError(accountMessage(e)); setDeleting(false); lock.current = false
      return
    }
    clearDraft(userId)
    // The account and its server sessions are gone, so only this device needs signing out.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    show('退会しました')
    navigate('/', { replace: true })
  }

  if (loadError) return <section className="space-y-3 p-4 py-8">
    <p role="alert" className="text-sm text-muted">{loadError}</p>
    <Button variant="ghost" onClick={load}>再試行</Button>
  </section>
  if (!summary) return <Spinner />
  return <section className="space-y-5 p-4">
    <h1 className="text-2xl font-semibold">退会</h1>
    <p className="text-sm leading-relaxed">アカウントと次のデータがすべて削除され、元に戻せません。</p>
    <ul className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
      <li>記録 {summary.workout_days}日分（{summary.set_count}セット）</li>
      <li>体組成 {summary.body_log_count}件</li>
      <li>自作の種目 {summary.custom_exercise_count}件</li>
      <li>プロフィールとランキングへの参加</li>
    </ul>
    {/* Names may repeat, so the index is part of the key. */}
    {summary.owned_communities.map((community, index) => <p key={`${index}:${community.name}`} className="text-sm leading-relaxed text-accent">
      あなたが作成したコミュニティ「{community.name}」も削除され、ほかのメンバー{community.other_member_count}人の画面から消えます。
    </p>)}
    {summary.health_sync_connected && <p className="text-sm leading-relaxed">iPhoneのショートカットは自動では消えません。ショートカットAppから削除してください。</p>}
    <Link to="/export" className="flex min-h-14 items-center text-sm text-accent">退会前に記録を書き出す</Link>
    <form onSubmit={(event) => void submit(event)} className="space-y-4 border-t border-border pt-5">
      <label className="block text-sm text-muted">確認のため「退会する」と入力してください
        <input value={confirm} disabled={deleting} autoComplete="off" onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-fg" />
      </label>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <Button type="submit" variant="danger" disabled={deleting || confirm !== CONFIRM_TEXT}>{deleting ? '退会処理中…' : '退会する'}</Button>
    </form>
  </section>
}
```

- [ ] **Step 4: ルートとプロフィールの入口を追加する**

`src/App.tsx` の lazy の一覧（`BodyPage` の次）に:

```tsx
const DeleteAccountPage = lazy(() => import('./features/account/DeleteAccountPage').then((m) => ({ default: m.DeleteAccountPage })))
```

`AppShell` の中のルート（`/exercises/:exerciseId` の次）に:

```tsx
<Route path="/account/delete" element={<DeleteAccountPage />} />
```

`src/features/profile/ProfilePage.tsx` の「体組成」欄の `</div>` の直後（`</section>` の前）に:

```tsx
    <div className="space-y-2 border-t border-border pt-5">
      <h2 className="text-sm font-semibold">アカウント</h2>
      <Link to="/account/delete" className="flex min-h-14 items-center text-sm text-muted">退会する</Link>
    </div>
```

- [ ] **Step 5: 通ることを確認する**

Run: `npx vitest run src/features/account src/features/profile`
Expected: すべてPASS

Run: `npm run lint && npx tsc -b`
Expected: エラー0（警告は既知の2件のみ）

- [ ] **Step 6: コミット**

```bash
git add src/features/account/DeleteAccountPage.tsx src/features/account/DeleteAccountPage.test.tsx src/App.tsx src/features/profile/ProfilePage.tsx src/features/profile/ProfilePage.test.tsx
git commit -m "Add the account deletion screen and its link from the profile"
```

---

### Task 4: モックE2E

**Files:**
- Create: `tests/e2e/account-deletion.spec.ts`
- Modify: `playwright.mock.config.ts`（`testMatch` に追加）

**Interfaces:**
- Consumes: Task 3 の画面文言、Task 1 のRPC名

- [ ] **Step 1: テストを書く**

`tests/e2e/account-deletion.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('a user deletes their account from the profile and lands on the introduction', async ({ page }) => {
  const uid = '33333333-3333-4333-8333-333333333333', now = Date.now()
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'leave@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const session = { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user }
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session)
  await page.addInitScript(id => localStorage.setItem(`gym-app.draft.${id}`, '{}'), uid)
  const deletions: unknown[] = []
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const reply = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/user')) return reply(user)
    if (path.endsWith('/account_deletion_summary')) return reply({ workout_days: 5, set_count: 40, body_log_count: 2,
      custom_exercise_count: 0, health_sync_connected: false, owned_communities: [{ name: '朝トレ部', other_member_count: 2 }] })
    if (path.endsWith('/delete_my_account')) { deletions.push(req.postDataJSON()); return route.fulfill({ status: 204 }) }
    if (path.endsWith('/profiles')) return reply({ id: uid, display_name: '退会者' })
    if (path.endsWith('/community_profiles')) return reply({ user_id: uid, display_name: '退会者', icon: 'initials', bio: '', global_ranking: false })
    return reply([])
  })
  await page.goto('/profile')
  await page.getByRole('link', { name: '退会する' }).click()
  await expect(page.getByRole('heading', { name: '退会' })).toBeVisible()
  await expect(page.getByText('記録 5日分（40セット）')).toBeVisible()
  await expect(page.getByText(/「朝トレ部」も削除され、ほかのメンバー2人/)).toBeVisible()
  const button = page.getByRole('button', { name: '退会する' })
  await expect(button).toBeDisabled()
  await page.getByLabel('確認のため「退会する」と入力してください').fill('退会する')
  await button.click()
  await expect(page.getByText('退会しました')).toBeVisible()
  await expect(page.getByRole('heading', { name: /今日の積み重ね/ })).toBeVisible()
  expect(deletions).toEqual([{ p_confirm: '退会する' }])
  expect(await page.evaluate(id => [localStorage.getItem('sb-example-auth-token'), localStorage.getItem(`gym-app.draft.${id}`)], uid)).toEqual([null, null])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
```

補足: プロフィール画面は `community_profiles` を `maybeSingle()` で読み（`src/features/community/queries.ts` の `profile()`）、セッションは `profiles` を `single()` で読む。どちらも1件のオブジェクトを返すモックにしている。`addInitScript` はページを開くたびに実行されるので、退会後に下書きが消えたことは、`page.goto` で開き直さずに確認する。

- [ ] **Step 2: 対象に追加して実行する**

`playwright.mock.config.ts` の `testMatch` の末尾に `'account-deletion.spec.ts'` を追加する。

Run: `npm run test:e2e:mock -- account-deletion --workers=1`
Expected: 1 passed

- [ ] **Step 3: 遅い環境でも通ることを確認する**

CIは手元より遅く、画面の切り替わり前に操作すると失敗する（パスワード再設定のE2Eで実際に起きた）。テストの先頭に一時的に `const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 })` を入れて実行し、通ることを確かめてから取り除く。

Run: `npm run test:e2e:mock -- account-deletion --workers=2 --repeat-each=3`
Expected: 3 passed

- [ ] **Step 4: 全体を確認する**

Run: `npm run lint && npm run build && npm test && node supabase/tests/sql-runtime/run-sql.mjs && npm run test:e2e:mock -- --workers=1`
Expected: すべて成功（lintの警告は既知の2件のみ）

- [ ] **Step 5: コミット**

```bash
git add tests/e2e/account-deletion.spec.ts playwright.mock.config.ts
git commit -m "Cover account deletion end to end with mocked Supabase"
```

---

### Task 5: 本番への公開（本人の許可が必要）

**Files:**
- Modify: `CLAUDE.md`（「現在地」の本番適用済みmigrationと公開済みの機能）

この Task は、各ステップで本人の許可を得てから進める。許可がなければ止まって報告する。

- [ ] **Step 1: migrationを本人に見せて許可を得る**

`supabase/migrations/20261004120000_account_deletion.sql` の全文と、Task 4 Step 4 の結果を本人に示し、本番への適用の許可を求める。

- [ ] **Step 2: 本番に適用する（許可後）**

Supabase MCPの `apply_migration`（project_id `lombbjpiftuqkacasmzg`、name `account_deletion`、queryはmigrationの全文から先頭の `begin;` と末尾の `commit;` を除いたもの）で適用する。

- [ ] **Step 3: 読み取りで確認する（削除は実行しない）**

```sql
select p.proname, p.prosecdef, p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_exec,
  has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('account_deletion_summary', 'delete_my_account');
```

Expected: 2行。`prosecdef` が true、`proconfig` が `{search_path=""}`、`anon_exec` が false、`auth_exec` が true。

あわせて `get_advisors`（security）で新しい警告を確認する。`authenticated_security_definer_function_executable` が2件増えるのは設計どおり（既存の6件と同じ扱い）。

- [ ] **Step 4: CLAUDE.md を更新してコミットし、pushする（許可後）**

`CLAUDE.md` の「現在地」で、公開済みの機能に「パスワード再設定、退会」を加え、本番に適用済みのmigrationを `account_deletion`（2026-10-04）までに更新する。

```bash
git add CLAUDE.md
git commit -m "Record that account deletion is live"
git fetch && git log --oneline master..origin/master
git push origin master
gh run list --limit 1
```

`git log` で新しいコミットがあれば、pushせずに本人に報告する。CIの完了を待ち、失敗したら原因を調べて報告する。

- [ ] **Step 5: 実際の退会を確認する（本人の許可後）**

本人が用意したテスト用アカウントで、本番の退会を1回行ってもらう。その後、読み取りで、そのユーザーIDの行が `auth.users` と、`profiles` を参照する全テーブルに残っていないことを確認する（Task 1 のSQLテストと同じ外部キーの走査を、`select` だけで行う）。
