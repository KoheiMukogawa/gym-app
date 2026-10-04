# 退会（アカウント削除） 設計

作成日: 2026-10-04

## 目的

利用者がアプリ内で自分のアカウントと全データを削除できるようにする。URLを一般公開して誰でも登録できる形にする前の必須項目で、将来のApp Store公開でも求められる（アプリ内でのアカウント削除）。プライバシーポリシーに書く「データの削除方法」の前提にもなる。

成功の基準:

- 退会した利用者のデータがDBに残らない（記録・体組成・Health連携のキー・プロフィール・ランキング・コミュニティ関連・自作種目・ログイン用アカウント）
- ほかの利用者のデータは消えない
- うっかり退会できない。消えるものを事前に知ってから退会できる

対象外: 退会の取り消しや猶予期間、コミュニティの引き継ぎ、パスワード再入力による本人確認、管理者による他人の削除、退会理由のアンケート。

## 決めたこと

- **自分が作ったコミュニティは、メンバーごと削除する。** 作成者がコミュニティを削除したときと同じ扱い。退会画面で、そのコミュニティ名とメンバー数を事前に表示する
- **最後の確認は「退会する」の入力。** 入力欄が「退会する」と一致したときだけ、ボタンが押せる。DB関数でも同じ文字列を確認する
- **Edge FunctionではなくDB関数で削除する。** 本番DBの `postgres` に `auth.users` の削除権限があることを確認済み（2026-10-04、`has_table_privilege` が true）。関数を1つ多く配置せずに済み、既存のPGliteのSQLテストで検証できる

## 現状のデータの連鎖

全migrationを適用した一時DBで外部キーを確認した（2026-10-04）。

- `auth.users` → `profiles`（cascade）
- `profiles` → `workouts`、`strength_goals`、`big3_exercise_mappings`、`training_routines`、`exercise_preferences`、`community_profiles`、`communities`（owner_id）、`community_members`、`bodyweight_logs`、`health_sync_private.tokens`（すべてcascade）
- `workouts` → `workout_sets`（cascade）、`communities` → `community_members`（cascade）
- **例外**: `exercises.created_by` は `on delete set null`。アカウントを消すだけでは、自作種目が持ち主なしで残る
- `workout_sets.exercise_id` は no action、`big3_exercise_mappings.exercise_id` は restrict。ほかの利用者の記録が参照している種目は消せない

本番での確認（2026-10-04、件数のみ）: 他人の自作種目を使ったセットは0件、BIG3の種目設定も0件、持ち主のいない自作種目は0件、コミュニティは1件。

## DB（migration 1本）

### `account_deletion_summary() returns jsonb`

退会画面で表示する件数を返す。security definer、空search_path、完全修飾名。`auth.uid()` がnullなら例外。返す内容:

| キー | 内容 |
|---|---|
| `workout_days` | 本人の `workouts` の件数 |
| `set_count` | 本人の `workout_sets` の件数 |
| `body_log_count` | 本人の `bodyweight_logs` の件数 |
| `custom_exercise_count` | 本人が作った、プリセット以外の種目の件数 |
| `health_sync_connected` | `health_sync_private.tokens` に本人の行があるか |
| `owned_communities` | 本人が作ったコミュニティの配列。各要素は `name` と、本人を除く `other_member_count` |

### `delete_my_account(p_confirm text) returns void`

security definer、空search_path、完全修飾名。1つのトランザクションで次を行う。

1. `auth.uid()` がnullなら例外
2. `p_confirm` が `'退会する'` でなければ例外（`'確認の文字が一致しません'`）
3. 本人の `workouts` を削除する（`workout_sets` は連鎖して消える）
4. 本人の `big3_exercise_mappings` を削除する
5. 本人が作った、プリセット以外の種目のうち、`workout_sets` と `big3_exercise_mappings` のどこからも参照されていないものを削除する。参照が残る種目は消さずに残す。この種目は手順6で `created_by` がnullになり、RLS（`is_preset or created_by = auth.uid()`）によって誰からも見えなくなる
6. `auth.users` から本人の行を削除する。残りは外部キーの連鎖で消える

権限: どちらの関数も `public`・`anon` から実行権を外し、`authenticated` にだけ付与する。

## 画面

### 入口

プロフィール画面の一番下に「アカウント」欄を追加し、「退会する」リンクを置く（`/account/delete`）。リンクは目立たない色にし、タップ領域は56px。

### 退会画面 `/account/delete`

ログインが必要。`AppShell` の中に置く。

1. 見出し「退会」と説明「アカウントと次のデータがすべて削除され、元に戻せません。」
2. 消えるものの一覧: 記録 〇日分（〇セット）、体組成 〇件、自作の種目 〇件、プロフィールとランキングへの参加
3. 作成したコミュニティがある場合: 「あなたが作成したコミュニティ『〇〇』も削除され、ほかのメンバー〇人の画面から消えます。」（複数あれば1つずつ）
4. Health連携中の場合: 「iPhoneのショートカットは自動では消えません。ショートカットAppから削除してください。」
5. 「退会前に記録を書き出す」→ `/export`
6. 入力欄「確認のため『退会する』と入力してください」
7. 赤いボタン「退会する」。入力が「退会する」と一致したときだけ押せる

状態:

- 件数の読み込み中はスピナー。失敗したら画面内にエラーと「再試行」を出し、退会ボタンは出さない
- 退会処理中は入力とボタンを無効にし、ボタンの文言を「退会処理中…」にする
- 退会に失敗したら、画面内にエラーを出して入力を残し、再度押せるようにする

### 退会後

1. この端末に保存している入力途中のデータ（`gym-app.draft.<userId>`）を消す
2. `supabase.auth.signOut({ scope: 'local' })` で端末のログイン状態を消す（サーバー側のセッションはアカウントと一緒に消えているため、`local` にする）
3. 紹介ページ（`/`）へ移り、トースト「退会しました」を出す

## エラー表示

- 通信エラーは既存の `toMessage` の文言を使う
- 確認の文字の不一致はDB関数の例外だが、画面では入力が一致するまでボタンを押せないため、通常は起きない。起きた場合は汎用エラーとして表示する

## テスト

- SQL（`supabase/tests/account_deletion.sql`、`run-sql.mjs` の対象に追加）:
  - 本人を削除すると、本人の全テーブルの行と自作種目、`auth.users` の行が消える
  - ほかの利用者の記録・プロフィール・自作種目は残る
  - 本人が作ったコミュニティは、ほかのメンバーの所属ごと消える。本人が所属しているだけのコミュニティは残り、本人の所属だけが消える
  - ほかの利用者の記録が参照している本人の自作種目は削除されず、`created_by` がnullになる
  - 確認の文字列が違うと例外になり、何も消えない
  - 未ログイン（`auth.uid()` がnull）では例外になる
  - `anon` は実行できない
  - `account_deletion_summary` が件数とコミュニティ情報を正しく返す
- 単体テスト: 退会画面（件数の表示、コミュニティの警告、入力が一致するまでボタンが押せない、成功時の後処理、失敗時のエラー表示と再試行）
- モックE2E: プロフィール→退会画面→「退会する」入力→退会→紹介ページと「退会しました」

## 公開の順序

1. 実装し、SQL・単体・モックE2Eを通す
2. migrationの内容を本人に見せ、許可を得て本番に適用する
3. 本番で関数ができたことを読み取りで確認する（`pg_proc` と実行権限。実際の削除は試さない）
4. アプリのコードをpushする。関数がないまま画面だけ公開されるのを防ぐため、migrationの適用より後にする
5. 実際の退会の確認は、本人が用意したテスト用アカウントで行う（本人の許可を得てから）
