# 新しい機能のお知らせ 設計

作成日: 2026-10-05

## 目的

運営が知ってほしい新機能を、利用者が次にアプリを開いたときに一度だけ知らせる。

成功の基準:

- 既存の利用者は、登録後に公開されたお知らせを次回の起動時に1枚のシートで見る
- 新しく登録した人には、登録より前のお知らせは出ない（溜まったお知らせが一気に出ない）
- 一度見たお知らせは、どの端末でも二度と出ない
- 記録の途中の操作を邪魔しない

対象外: お知らせの管理画面、DBでのお知らせ管理、プッシュ通知・メール、お知らせ一覧のページ（過去のお知らせを読み返す）、管理者だけへのお知らせ、既読の個別管理（どれを見たか1件ずつ）。

## 決めたこと

- **文面はコードに書く。** 新機能と同じコミットで書き、同時に公開される。修正もデプロイで行う
- **表示は、画面の下から出るシート。** 未読があるときだけ出し、複数でも1枚にまとめる
- **既読は「この時刻までのお知らせは見た」という1つの時刻で持つ。** 行がない人は登録日時（`profiles.created_at`）を基準にする
- **DBに保存し、端末をまたいで共有する。** 書き込む時刻はサーバー側の `now()` に固定する

## お知らせの定義

`src/features/announcements/announcements.ts`:

```ts
export type Announcement = {
  id: string            // 英数字とハイフン。Reactのkeyに使う
  publishedAt: string   // ISO 8601（日本時間の+09:00付き）。この時刻より前に登録した人に出る
  title: string
  body: string          // 1〜2文
  link?: { to: string; label: string }  // 「見てみる」の移動先
}
export const ANNOUNCEMENTS: Announcement[]
```

最初の1件:

- id: `feedback-box`
- publishedAt: 公開する日時（このお知らせを含むデプロイの直前の時刻）
- title: `ご意見・不具合を送れるようになりました`
- body: `右上のアイコンのメニューから、気になる点や要望を運営に送れます。運営だけが読みます。`
- link: `{ to: '/feedback', label: 'ご意見を送る' }`

未読の判定: `publishedAt > 基準時刻` かつ `publishedAt <= 今`（未来の日時は出さない）。新しい順に並べる。

## DB（migration 1本）

### `public.announcement_reads`

| 列 | 型 | 内容 |
|---|---|---|
| `user_id` | uuid primary key default `auth.uid()` | `profiles(id)` を参照、on delete cascade |
| `seen_until` | timestamptz not null default `now()` | この時刻までのお知らせは見た |

- RLSを有効にし、`select`・`insert`・`update` を本人の行だけに許可する（`user_id = (select auth.uid())`）。deleteは許可しない
- `anon` からは全権限を外す。`authenticated` には `select`、`insert (user_id)`、`update (seen_until)` だけを付与する
- `before insert or update` のトリガーで `seen_until := now()` にする（利用者が任意の時刻を書けない）

### `public.announcements_seen_until() returns timestamptz`

security invoker（RLSが効く）、`stable`、空search_path。本人の `seen_until` があればそれ、なければ本人の `profiles.created_at` を返す。未ログインならnull。

### `public.mark_announcements_seen() returns void`

security invoker、空search_path。本人の行を作るか、あれば `seen_until` を更新する（`insert ... on conflict (user_id) do update set seen_until = now()`）。未ログインなら例外（`'ログインが必要です'`）。

どちらの関数も `public`・`anon` から実行権を外し、`authenticated` にだけ付与する。security definerではないので、advisorsの警告は増えない。

## 画面

### 出す条件

`AppShell` に置く。次をすべて満たすときだけシートを出す:

1. ログインしていて、`announcements_seen_until()` の取得に成功した
2. 未読のお知らせが1件以上ある
3. 今の画面が記録画面（`/log`）ではなく、記録の途中（下書きにセットがある）でもない

取得はアプリの起動時（ログインした利用者が変わったとき）に1回だけ行う。取得に失敗したら何も出さない。条件3で出さなかった場合は、記録を終えて別の画面に移ったときに出す。

### シート

既存の `BottomSheet` を使う。

1. 見出し「新しい機能」
2. 未読のお知らせを新しい順に、タイトル（太字）・本文・「見てみる」ボタン（`link` があるときだけ。文言は `link.label`）
3. いちばん下に「閉じる」ボタン

- ボタンのタップ領域は56px以上
- 「見てみる」: 既読にして（`mark_announcements_seen`）シートを閉じ、`link.to` へ移る
- 「閉じる」・シートの外のタップ: 既読にしてシートを閉じる
- 既読の保存は待たずに閉じる。失敗は無視する（次回また出るだけ）
- 一度閉じたら、そのセッションでは再び出さない

## プライバシーポリシー

「1. 取得する情報」の「自動的に記録される情報」に「新しい機能のお知らせを確認した日時」を加える。改定日を公開日にする。

## テスト

- SQL（`supabase/tests/announcements.sql`、`run-sql.mjs` の対象に追加）:
  - 行がなければ `announcements_seen_until()` は本人の登録日時、未ログインはnull
  - `mark_announcements_seen()` 後はサーバーの現在時刻。2回目は更新される
  - 任意の `seen_until` を直接書いても `now()` になる。他人の行は読めず、書けない（他人の `user_id` でのinsertは拒否）
  - `anon` は関数を実行できず、テーブルを読めない
  - 退会（`delete_my_account`）で行が消える
- 単体:
  - 未読の判定（基準時刻ちょうど・前後、未来の日時、新しい順）
  - シート: 表示、「閉じる」で既読にして閉じる、「見てみる」で移動、記録中は出さず記録を終えたら出す、取得失敗では出さない、未読0件では出さない
- モックE2E: 起動 → シートが出る → 「ご意見を送る」で `/feedback` へ → 再読み込みしても出ない（既読の時刻を返す）

## 公開の順序

1. 実装し、lint・ビルド・SQL・単体・モックE2Eを通す
2. 本人の許可を得てmigrationを本番に適用し、読み取りで確認する
3. 最初のお知らせの `publishedAt` を公開直前の時刻にして、`git fetch` してからpushする
4. CIと公開中のバンドルを確認し、CLAUDE.mdを更新する（お知らせの書き方も追記する）
