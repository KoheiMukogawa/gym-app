# 新しい機能のお知らせ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登録後に公開された新機能のお知らせを、次回の起動時に1枚のシートで一度だけ見せる。

**Architecture:** お知らせの文面はコード（`announcements.ts`）に置く。利用者ごとの「この時刻まで見た」はテーブル `announcement_reads` に持ち、security invokerの関数2つで読み書きする。書く時刻はトリガーで `now()` に固定する。`AppShell` に置く `AnnouncementsGate` が、未読があり記録中でないときに `BottomSheet` を出す。

**Tech Stack:** PostgreSQL（Supabase）、React 19、React Router 7、Vitest + Testing Library、Playwright（モックE2E）、PGlite（SQLテスト）

**Spec:** `docs/superpowers/specs/2026-10-05-announcements-design.md`

## Global Constraints

- UI文言は日本語、コード識別子とコミットメッセージは英語
- ボタンのタップ領域は最低56px（`min-h-14`、`Button` は既定で満たす）
- お知らせの取得・既読の保存に失敗しても、利用者の操作を止めない（シートを出さない／閉じる）
- 記録画面（`/log`）と、記録の途中（下書きにセットがある）ではシートを出さない
- 新しく登録した人には、登録より前のお知らせを出さない。公開日時が未来のお知らせは出さない
- 各タスクで本番DBへの書き込みや `git push` はしない
- コミットメッセージの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

- ほかのモックE2Eは `announcements_seen_until` に `[]` や `{}` を返す。文字列以外は「出さない」と扱い、既存のE2Eにシートが割り込まない（Task 2の単体テストで固定）
- 記録の途中でアプリを開き直したときは出ず、記録を終えてホームに戻ったら出る（Task 3）
- 「閉じる」を押したら既読の保存を待たずに閉じ、失敗してもエラーを出さない（Task 3）
- 他人の `user_id` で既読の行を作れない・読めない（Task 1）
- 利用者が `seen_until` に未来の時刻を書いても `now()` になる（Task 1）

---

### Task 1: DB（テーブル・トリガー・関数2つ）

**Files:**
- Create: `supabase/migrations/20261005140000_announcement_reads.sql`
- Create: `supabase/tests/announcements.sql`
- Modify: `supabase/tests/sql-runtime/run-sql.mjs`（`suites` の末尾に `'announcements.sql'`）

**Interfaces:**
- Produces: `public.announcements_seen_until() returns timestamptz`、`public.mark_announcements_seen() returns void`

- [ ] **Step 1: SQLテストを書く**

`supabase/tests/announcements.sql`:

```sql
-- Synthetic fixtures only; the entire suite is rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('a0000000-0000-4000-8000-00000000000a', 'a@glog.test', '{"display_name":"A"}'),
 ('a0000000-0000-4000-8000-00000000000b', 'b@glog.test', '{"display_name":"B"}');
update public.profiles set created_at = '2026-09-01T00:00:00Z' where id = 'a0000000-0000-4000-8000-00000000000a';

do $$ begin
  if has_function_privilege('anon', 'public.announcements_seen_until()', 'execute')
    or has_function_privilege('anon', 'public.mark_announcements_seen()', 'execute')
    or has_table_privilege('anon', 'public.announcement_reads', 'select') then
    raise exception 'anon can reach announcement reads'; end if;
  if not has_function_privilege('authenticated', 'public.announcements_seen_until()', 'execute')
    or not has_function_privilege('authenticated', 'public.mark_announcements_seen()', 'execute') then
    raise exception 'authenticated cannot run announcement functions'; end if;
end $$;

set local role authenticated;

-- Signed out: no baseline, and marking refuses.
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if public.announcements_seen_until() is not null then raise exception 'signed-out baseline is not null'; end if;
  begin perform public.mark_announcements_seen(); raise exception 'marked signed out';
  exception when raise_exception then if sqlerrm <> 'ログインが必要です' then raise; end if; end;
end $$;

-- A without a row: the baseline is the signup time. Marking records the server time, twice is fine.
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-00000000000a', true);
do $$ begin
  if public.announcements_seen_until() <> '2026-09-01T00:00:00Z'::timestamptz then raise exception 'baseline is not the signup time'; end if;
  perform public.mark_announcements_seen();
  perform public.mark_announcements_seen();
  if public.announcements_seen_until() <> now() then raise exception 'marking did not record now()'; end if;
  if (select count(*) from public.announcement_reads) <> 1 then raise exception 'expected one row'; end if;
end $$;

-- Writing a chosen time directly still records now(); another user's row cannot be created or deleted.
do $$ begin
  update public.announcement_reads set seen_until = '2099-01-01T00:00:00Z';
  if (select seen_until from public.announcement_reads) <> now() then raise exception 'a chosen time was kept'; end if;
  begin insert into public.announcement_reads(user_id) values ('a0000000-0000-4000-8000-00000000000b'); raise exception 'created another user''s row';
  exception when insufficient_privilege then null; end;
  begin insert into public.announcement_reads(user_id, seen_until) values ('a0000000-0000-4000-8000-00000000000a', now()); raise exception 'chose seen_until on insert';
  exception when insufficient_privilege then null; end;
  begin delete from public.announcement_reads; raise exception 'deleted a row';
  exception when insufficient_privilege then null; end;
end $$;

-- B cannot see A's row and still gets B's own signup time.
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-00000000000b', true);
do $$ begin
  if (select count(*) from public.announcement_reads) <> 0 then raise exception 'B reads A''s row'; end if;
  if public.announcements_seen_until() <> (select created_at from public.profiles where id = 'a0000000-0000-4000-8000-00000000000b') then
    raise exception 'B baseline is not B''s signup time'; end if;
end $$;

-- Leaving removes A's row.
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-00000000000a', true);
select public.delete_my_account('退会する');
reset role;
do $$ begin
  if exists (select 1 from public.announcement_reads where user_id = 'a0000000-0000-4000-8000-00000000000a') then
    raise exception 'announcement read survived account deletion'; end if;
end $$;
rollback;
```

`run-sql.mjs` の `suites` の末尾に `'announcements.sql'` を加える。

- [ ] **Step 2: 失敗を確認する**

Run: `node supabase/tests/sql-runtime/run-sql.mjs`
Expected: `FAIL announcements.sql: function public.announcements_seen_until() does not exist`

- [ ] **Step 3: migrationを書く**

`supabase/migrations/20261005140000_announcement_reads.sql`:

```sql
-- New-feature announcements live in the app's code; this records, per user, the time up to
-- which they have been seen. Without a row the baseline is the signup time, so new users never
-- get a backlog. The time written is always the server's now().
begin;
create table public.announcement_reads (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  seen_until timestamptz not null default now()
);
alter table public.announcement_reads enable row level security;
revoke all on public.announcement_reads from anon, authenticated;
grant select on public.announcement_reads to authenticated;
grant insert (user_id) on public.announcement_reads to authenticated;
grant update (seen_until) on public.announcement_reads to authenticated;
create policy announcement_reads_select_own on public.announcement_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy announcement_reads_insert_own on public.announcement_reads for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy announcement_reads_update_own on public.announcement_reads for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.announcement_reads_now() returns trigger
language plpgsql set search_path = '' as $$
begin
 new.seen_until := now();
 return new;
end $$;
revoke all on function public.announcement_reads_now() from public, anon, authenticated;
create trigger announcement_reads_now before insert or update on public.announcement_reads
  for each row execute function public.announcement_reads_now();

create or replace function public.announcements_seen_until() returns timestamptz
language sql stable security invoker set search_path = '' as $$
 select coalesce(
  (select r.seen_until from public.announcement_reads r where r.user_id = auth.uid()),
  (select p.created_at from public.profiles p where p.id = auth.uid()))
$$;

create or replace function public.mark_announcements_seen() returns void
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'ログインが必要です'; end if;
 insert into public.announcement_reads(user_id) values (auth.uid())
  on conflict (user_id) do update set seen_until = now();
end $$;

revoke all on function public.announcements_seen_until(), public.mark_announcements_seen() from public, anon;
grant execute on function public.announcements_seen_until(), public.mark_announcements_seen() to authenticated;
commit;
```

- [ ] **Step 4: 通ることを確認する**

Run: `node supabase/tests/sql-runtime/run-sql.mjs`
Expected: 全スイートPASS（`PASS announcements.sql` を含む）

- [ ] **Step 5: コミットする**

```bash
git add supabase/migrations/20261005140000_announcement_reads.sql supabase/tests/announcements.sql supabase/tests/sql-runtime/run-sql.mjs
git commit -m "Record how far each user has seen the announcements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: お知らせの定義・未読の判定・通信

**Files:**
- Create: `src/features/announcements/announcements.ts`、`src/features/announcements/announcements.test.ts`
- Create: `src/features/announcements/queries.ts`、`src/features/announcements/queries.test.ts`

**Interfaces:**
- Consumes: Task 1の関数
- Produces:
  - `type Announcement = { id: string; publishedAt: string; title: string; body: string; link?: { to: string; label: string } }`
  - `ANNOUNCEMENTS: Announcement[]`
  - `unreadAnnouncements(items: Announcement[], seenUntil: string, now?: Date): Announcement[]`（新しい順）
  - `fetchSeenUntil(): Promise<string | null>`（文字列以外はnull）
  - `markAnnouncementsSeen(): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/announcements/announcements.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ANNOUNCEMENTS, unreadAnnouncements, type Announcement } from './announcements'

const item = (id: string, publishedAt: string): Announcement => ({ id, publishedAt, title: id, body: '' })
const items = [item('old', '2026-10-01T12:00:00+09:00'), item('new', '2026-10-05T12:00:00+09:00'), item('future', '2026-12-01T12:00:00+09:00')]
const now = new Date('2026-10-06T00:00:00+09:00')

describe('unreadAnnouncements', () => {
  it('shows only what was published after the baseline and not in the future, newest first', () => {
    expect(unreadAnnouncements(items, '2026-09-01T00:00:00Z', now).map((a) => a.id)).toEqual(['new', 'old'])
    expect(unreadAnnouncements(items, '2026-10-03T00:00:00Z', now).map((a) => a.id)).toEqual(['new'])
  })
  it('treats an announcement published exactly at the baseline as seen', () => {
    expect(unreadAnnouncements(items, '2026-10-05T03:00:00Z', now)).toEqual([])
  })
  it('shows nothing for an unreadable baseline', () => {
    expect(unreadAnnouncements(items, 'not a date', now)).toEqual([])
  })
})

describe('ANNOUNCEMENTS', () => {
  it('has unique ids and Japan-time publication dates', () => {
    expect(new Set(ANNOUNCEMENTS.map((a) => a.id)).size).toBe(ANNOUNCEMENTS.length)
    for (const a of ANNOUNCEMENTS) {
      expect(a.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/)
      expect(Number.isNaN(Date.parse(a.publishedAt))).toBe(false)
    }
  })
})
```

`src/features/announcements/queries.test.ts`:

```ts
import { beforeEach, expect, it, vi } from 'vitest'
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
import { fetchSeenUntil, markAnnouncementsSeen } from './queries'

beforeEach(() => vi.clearAllMocks())

it('reads the baseline time', async () => {
  rpc.mockResolvedValue({ data: '2026-10-05T08:00:00+00:00', error: null })
  await expect(fetchSeenUntil()).resolves.toBe('2026-10-05T08:00:00+00:00')
  expect(rpc).toHaveBeenCalledWith('announcements_seen_until')
})
it.each([[null], [[]], [{}], [42]])('treats %j as no baseline', async (data) => {
  rpc.mockResolvedValue({ data, error: null })
  await expect(fetchSeenUntil()).resolves.toBeNull()
})
it('throws the RPC error', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
  await expect(fetchSeenUntil()).rejects.toEqual({ message: 'boom' })
})
it('marks the announcements seen', async () => {
  rpc.mockResolvedValue({ data: null, error: null })
  await markAnnouncementsSeen()
  expect(rpc).toHaveBeenCalledWith('mark_announcements_seen')
})
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/features/announcements`
Expected: FAIL（`./announcements`・`./queries` が見つからない）

- [ ] **Step 3: 実装する**

`src/features/announcements/announcements.ts`:

```ts
/**
 * 新しい機能のお知らせ。運営が知ってほしい機能を公開するとき、その機能と同じコミットで1件足す。
 * レイアウトの変更などでは足さない。publishedAt より前に登録した人にだけ、次回の起動時に出る。
 */
export type Announcement = {
  id: string
  /** ISO 8601、日本時間（+09:00）。公開するデプロイの直前の時刻にする */
  publishedAt: string
  title: string
  body: string
  link?: { to: string; label: string }
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'feedback-box',
    publishedAt: '2026-10-05T17:00:00+09:00',
    title: 'ご意見・不具合を送れるようになりました',
    body: '右上のアイコンのメニューから、気になる点や要望を運営に送れます。運営だけが読みます。',
    link: { to: '/feedback', label: 'ご意見を送る' },
  },
]

/** 基準時刻より後に公開され、今より前のお知らせ（新しい順）。基準時刻が読めなければ出さない。 */
export function unreadAnnouncements(items: Announcement[], seenUntil: string, now = new Date()): Announcement[] {
  const baseline = Date.parse(seenUntil)
  if (Number.isNaN(baseline)) return []
  return items
    .filter((a) => { const at = Date.parse(a.publishedAt); return at > baseline && at <= now.getTime() })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}
```

`src/features/announcements/queries.ts`:

```ts
import { supabase } from '../../lib/supabase'

/** この時刻より後のお知らせが未読。既読の記録がなければ登録日時。 */
export async function fetchSeenUntil(): Promise<string | null> {
  const { data, error } = await supabase.rpc('announcements_seen_until')
  if (error) throw error
  return typeof data === 'string' ? data : null
}

/** 今の時刻までのお知らせを見たことにする（時刻はサーバーが決める）。 */
export async function markAnnouncementsSeen(): Promise<void> {
  const { error } = await supabase.rpc('mark_announcements_seen')
  if (error) throw error
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run src/features/announcements`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add src/features/announcements
git commit -m "Define announcements and the unread rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: シート（`AnnouncementsGate`）と `AppShell` への組み込み

**Files:**
- Create: `src/features/announcements/AnnouncementsGate.tsx`、`src/features/announcements/AnnouncementsGate.test.tsx`
- Modify: `src/components/AppShell.tsx`（`<AnnouncementsGate/>` を置く）、`src/components/AppShell.test.tsx`（queriesのモック）

**Interfaces:**
- Consumes: Task 2の全export、`useSession().userId`、`loadDraft(userId)`、`BottomSheet`、`Button`
- Produces: `export function AnnouncementsGate({ items = ANNOUNCEMENTS }: { items?: Announcement[] })`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/announcements/AnnouncementsGate.test.tsx`:

```tsx
import { beforeEach, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Announcement } from './announcements'

const { fetchSeenUntil, markAnnouncementsSeen, loadDraft } = vi.hoisted(() => ({ fetchSeenUntil: vi.fn(), markAnnouncementsSeen: vi.fn(), loadDraft: vi.fn() }))
vi.mock('./queries', () => ({ fetchSeenUntil, markAnnouncementsSeen }))
vi.mock('../auth/SessionProvider', () => ({ useSession: () => ({ userId: 'me' }) }))
vi.mock('../workout-log/persistence', () => ({ loadDraft }))
import { AnnouncementsGate } from './AnnouncementsGate'

// jsdom does not implement the modal top layer.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open', '') } },
  close: { configurable: true, value() { this.removeAttribute('open') } },
})

const items: Announcement[] = [
  { id: 'a', publishedAt: '2026-10-01T12:00:00+09:00', title: '古い機能', body: '古い説明' },
  { id: 'b', publishedAt: '2026-10-05T12:00:00+09:00', title: 'ご意見ボックス', body: '運営に送れます', link: { to: '/feedback', label: 'ご意見を送る' } },
]
function renderGate(path = '/') {
  render(<MemoryRouter initialEntries={[path]}>
    <AnnouncementsGate items={items} />
    <Routes>
      <Route path="/" element={<p>ホーム画面</p>} />
      <Route path="/log" element={<Link to="/">記録を終える</Link>} />
      <Route path="/feedback" element={<p>送信画面</p>} />
    </Routes>
  </MemoryRouter>)
}
const flush = () => act(async () => {})
beforeEach(() => {
  vi.clearAllMocks()
  fetchSeenUntil.mockResolvedValue('2026-09-01T00:00:00Z')
  markAnnouncementsSeen.mockResolvedValue(undefined)
  loadDraft.mockReturnValue(null)
})

it('shows every unread announcement in one sheet, newest first', async () => {
  renderGate(); await flush()
  expect(screen.getByRole('dialog', { name: '新しい機能' })).toBeInTheDocument()
  const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
  expect(titles).toEqual(['ご意見ボックス', '古い機能'])
})

it('marks them seen and closes without waiting for the save', async () => {
  markAnnouncementsSeen.mockReturnValue(new Promise(() => {}))
  renderGate(); await flush()
  await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(markAnnouncementsSeen).toHaveBeenCalledOnce()
})

it('opens the feature from its button', async () => {
  renderGate(); await flush()
  await userEvent.click(screen.getByRole('button', { name: 'ご意見を送る' }))
  expect(screen.getByText('送信画面')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(markAnnouncementsSeen).toHaveBeenCalledOnce()
})

it('ignores a failed save', async () => {
  markAnnouncementsSeen.mockRejectedValue(new Error('offline'))
  renderGate(); await flush()
  await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
  await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows nothing when everything was seen, the baseline is missing, or loading fails', async () => {
  fetchSeenUntil.mockResolvedValueOnce('2026-10-06T00:00:00Z')
  const first = render(<MemoryRouter><AnnouncementsGate items={items} /></MemoryRouter>); await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  first.unmount()
  fetchSeenUntil.mockResolvedValueOnce(null)
  const second = render(<MemoryRouter><AnnouncementsGate items={items} /></MemoryRouter>); await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  second.unmount()
  fetchSeenUntil.mockRejectedValueOnce(new Error('offline'))
  render(<MemoryRouter><AnnouncementsGate items={items} /></MemoryRouter>); await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('waits while recording and shows once the recording screen is left', async () => {
  renderGate('/log'); await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: '記録を終える' }))
  expect(screen.getByRole('dialog', { name: '新しい機能' })).toBeInTheDocument()
})

it('waits while a draft has sets, even off the recording screen', async () => {
  loadDraft.mockReturnValue({ state: { sets: [{ id: 's1' }] } })
  renderGate(); await flush()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(loadDraft).toHaveBeenCalledWith('me')
})
```

`src/components/AppShell.test.tsx`: `vi.mock('../features/feedback/queries', ...)` の次の行に加える（既存のテストにシートが出ないよう、基準時刻なしを返す）:

```tsx
vi.mock('../features/announcements/queries', () => ({ fetchSeenUntil: vi.fn().mockResolvedValue(null), markAnnouncementsSeen: vi.fn() }))
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/features/announcements/AnnouncementsGate.test.tsx`
Expected: FAIL（`./AnnouncementsGate` が見つからない）

- [ ] **Step 3: 実装する**

`src/features/announcements/AnnouncementsGate.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Button } from '../../components/ui/Button'
import { useSession } from '../auth/SessionProvider'
import { loadDraft } from '../workout-log/persistence'
import { ANNOUNCEMENTS, unreadAnnouncements, type Announcement } from './announcements'
import { fetchSeenUntil, markAnnouncementsSeen } from './queries'

/**
 * 未読のお知らせを、起動後に1枚のシートで一度だけ出す。記録中は出さず、記録を終えてから出す。
 * 取得や保存の失敗は、出さない・閉じるだけで、利用者の操作を止めない。
 */
export function AnnouncementsGate({ items = ANNOUNCEMENTS }: { items?: Announcement[] }) {
  const { userId } = useSession()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [unread, setUnread] = useState<Announcement[]>([])
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    let active = true
    setUnread([]); setClosed(false)
    if (userId) fetchSeenUntil()
      .then((seenUntil) => { if (active && seenUntil) setUnread(unreadAnnouncements(items, seenUntil)) })
      .catch(() => undefined)
    return () => { active = false }
  }, [userId, items])

  const recording = pathname === '/log' || (userId ? (loadDraft(userId)?.state.sets.length ?? 0) > 0 : false)
  if (closed || unread.length === 0 || recording) return null

  function close(to?: string) {
    setClosed(true)
    void markAnnouncementsSeen().catch(() => undefined)
    if (to) navigate(to)
  }
  return <BottomSheet title="新しい機能" onDismiss={() => close()}>
    <div className="space-y-5 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <ul className="space-y-4">{unread.map((a) => <li key={a.id} className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <h3 className="font-semibold">{a.title}</h3>
        <p className="text-sm leading-relaxed text-muted">{a.body}</p>
        {a.link && <Button onClick={() => close(a.link!.to)}>{a.link.label}</Button>}
      </li>)}</ul>
      <Button variant="ghost" onClick={() => close()}>閉じる</Button>
    </div>
  </BottomSheet>
}
```

`src/components/AppShell.tsx`:
- importに `import { AnnouncementsGate } from '../features/announcements/AnnouncementsGate'` を加える
- `<nav aria-label="メイン" ...>` の直前（`</main>` の直後）に `<AnnouncementsGate/>` を置く

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run src/features/announcements src/components`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add src/features/announcements src/components/AppShell.tsx src/components/AppShell.test.tsx
git commit -m "Show unread announcements in a sheet after launch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: プライバシーポリシーとモックE2E

**Files:**
- Modify: `src/features/legal/privacy-policy.md`、`src/features/legal/LegalPages.test.tsx`
- Create: `tests/e2e/announcements.spec.ts`
- Modify: `playwright.mock.config.ts`（`testMatch` に `'announcements.spec.ts'`）

- [ ] **Step 1: 失敗するテストを書く**

`LegalPages.test.tsx` のプライバシーポリシーのテストに加える:

```tsx
    expect(screen.getByText(/新しい機能のお知らせを確認した日時/)).toBeInTheDocument()
```

`tests/e2e/announcements.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('an existing user sees the new feature once and opens it', async ({ page }) => {
  const uid = '66666666-6666-4666-8666-666666666666', now = Date.now()
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'member@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const session = { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user }
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session)
  let seenUntil = '2026-01-01T00:00:00+00:00', marks = 0
  await page.route('https://example.supabase.co/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    const reply = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    if (path.endsWith('/user')) return reply(user)
    if (path.endsWith('/announcements_seen_until')) return reply(seenUntil)
    if (path.endsWith('/mark_announcements_seen')) { marks++; seenUntil = new Date().toISOString(); return route.fulfill({ status: 204 }) }
    if (path.endsWith('/profiles')) return reply({ id: uid, display_name: '利用者' })
    return reply([])
  })
  await page.goto('/')
  const sheet = page.getByRole('dialog', { name: '新しい機能' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'ご意見・不具合を送れるようになりました' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await sheet.getByRole('button', { name: 'ご意見を送る' }).click()
  await expect(page.getByRole('heading', { name: 'ご意見・不具合の報告' })).toBeVisible()
  await expect(sheet).toBeHidden()
  expect(marks).toBe(1)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'ご意見・不具合の報告' })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByRole('dialog', { name: '新しい機能' })).toBeHidden()
})
```

`playwright.mock.config.ts` の `testMatch` の末尾に `'announcements.spec.ts'` を加える。

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/features/legal`
Expected: FAIL（ポリシーの文がない）

- [ ] **Step 3: プライバシーポリシーを更新する**

`privacy-policy.md` の「自動的に記録される情報」の箇条書きの最後（「- ログイン、新規登録、パスワード再設定のときは…」の行）の次に加える:

```markdown
- 新しい機能のお知らせを確認した日時（同じお知らせを繰り返し表示しないため）
```

改定日は公開日（`2026年10月5日`）のまま。公開が翌日以降になる場合は、改定日と `LegalPages.test.tsx` の期待値を公開日に合わせる。

- [ ] **Step 4: 全体の確認**

Run（順に）: `npm run lint`、`npm run build`、`npm test`、`node supabase/tests/sql-runtime/run-sql.mjs`、`npm run test:e2e:mock -- --workers=1`
Expected: すべてPASS。ほかのE2Eにシートが割り込んでいないこと（`announcements_seen_until` に `[]` を返すため出ない）

- [ ] **Step 5: コミットする**

```bash
git add src/features/legal tests/e2e/announcements.spec.ts playwright.mock.config.ts
git commit -m "Cover announcements in the privacy policy and a mock E2E flow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 公開（本人の許可済み）

1. migration `announcement_reads` を本番に適用し（`begin`/`commit` を除く）、テーブル・ポリシー・列の権限・トリガー・関数・anon不可を読み取りで確認する。本人として `announcements_seen_until()` が登録日時を返すことを確かめる（`mark` は実行しない）
2. `ANNOUNCEMENTS` の `feedback-box` の `publishedAt` を公開直前の時刻（日本時間）にしてコミットする
3. `git fetch` してからpushし、CIと公開中のバンドルを確認する
4. CLAUDE.mdを更新する（公開済みの機能、適用済みのmigration、お知らせの書き方: 「知ってほしい機能を公開するときは `src/features/announcements/announcements.ts` に1件足す。publishedAt は公開直前の日本時間」）
