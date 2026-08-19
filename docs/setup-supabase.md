# Supabase セットアップ手順

このドキュメントは、`supabase/migrations/` 配下のSQLファイルを実際のSupabaseプロジェクトに適用し、
このアプリ（少人数のプライベートグループ向けジム記録PWA）が動く状態にするための手順です。
Supabaseを使ったことがない人でも上から順に実行すれば完了するように書いています。

対象ファイル:
- `supabase/migrations/0001_init.sql` — テーブル定義
- `supabase/migrations/0002_rls.sql` — Row Level Security ポリシーとプロフィール自動作成トリガー
- `supabase/migrations/0003_seed_exercises.sql` — プリセット種目55件の投入

## Step 1: Supabaseプロジェクトを作成する

1. https://supabase.com にアクセスし、アカウントを作成（またはログイン）する。
2. 「New project」からプロジェクトを新規作成する。
   - Region: **Northeast Asia (Tokyo)** を選択する。
   - Database password は安全な場所に控えておく（後で使う可能性があるため）。
3. プロジェクトの初期化が終わるまで数分待つ。

## Step 2: マイグレーションSQLを適用する

Supabaseダッシュボードの左メニューから **SQL Editor** を開き、以下の3ファイルの中身を
**この順番で** 1つずつ貼り付けて実行する（「Run」ボタン）。

1. `supabase/migrations/0001_init.sql` を貼り付けて実行する。
   - `profiles` / `exercises` / `workouts` / `workout_sets` の4テーブルと `muscle_group` enum型が作成される。
2. `supabase/migrations/0002_rls.sql` を貼り付けて実行する。
   - 4テーブルすべてでRow Level Securityが有効化され、各テーブルの参照・作成・更新・削除ポリシーが設定される。
   - `auth.users` にユーザーが作成されたとき自動的に `public.profiles` 行を作るトリガー
     (`on_auth_user_created` / `handle_new_user`) も作成される。
3. `supabase/migrations/0003_seed_exercises.sql` を貼り付けて実行する。
   - プリセット種目55件（`is_preset = true`, `created_by = null`）が `exercises` テーブルに投入される。

**`0002_rls.sql` はSQL Editor上で1つのトランザクションとして実行される。途中の文が1つでも失敗すると、
このファイル内の変更は（成功したように見えた文も含めて）すべてロールバックされる。** つまり途中でエラーが
出た場合、RLSはどのテーブルでも有効化されておらず、ポリシーも1つも作られていない。Table Editorでテーブルや
enum型が存在するように見えても、それだけでは0002が成功した証拠にはならない（テーブル自体は0001で作成済みの
ため）。0002が成功したかどうかは、後述のStep 7の `rowsecurity` 確認クエリで必ず確認すること。

もっとも発生しやすいエラーは、`create trigger on_auth_user_created after insert on auth.users ...`
（トリガーが `auth.users` テーブルに対する所有権を要求するため）で出る **`must be owner of relation users`**
である。対処方法:

1. まず、Supabaseダッシュボードの **SQL Editor** から実行しているか確認する（SQL Editorは `postgres`
   ロールで実行されるため、通常はここで実行すれば成功する）。ローカルの `psql` や別のクライアントから
   `anon`/`authenticated` ロールで接続して実行するとこのエラーになる。
2. SQL Editorから実行してもなお `must be owner of relation users` が出る場合は、このトリガー部分
   （`create function public.handle_new_user()` ～ `create trigger on_auth_user_created ...` の一続き）だけを
   コメントアウトまたは削除してから `0002_rls.sql` を再実行する。この場合、`profiles` 行の自動作成が
   行われなくなるため、Step 5でメンバーのアカウントを作成するたびに、以下のSQLを **SQL Editor** で
   手動実行して `profiles` 行を作成する（`<user-id>` はStep 5で作成したユーザーのUUID、`<表示名>` は
   `display_name` に設定したい値に置き換える）。

   ```sql
   insert into public.profiles (id, display_name) values ('<user-id>', '<表示名>');
   ```

   `<user-id>` は **Authentication** → **Users** の該当ユーザーの詳細画面（UUID列）から確認できる。

**Step 7の `rowsecurity` 確認クエリがすべて `true` になることを確認してから、次のStep 5（メンバーの
アカウント作成）やアプリの接続設定（Step 6）に進むこと。** RLSが無効な状態でメンバーのアカウントを作った
り、アプリを接続したりすると、全メンバーが互いのデータを自由に書き換えられる無防備な状態のまま運用が
始まってしまう。

## Step 3: メール確認を無効にする

管理者（あなた）がメンバーのアカウントを手動で発行する運用のため、メール確認は不要にする。

1. ダッシュボード左メニュー **Authentication** → **Providers** → **Email** を開く。
2. **Confirm email** の設定をオフ（無効）にする。
3. 保存する。

## Step 4: 新規サインアップを無効にする

このアプリは10人以下のプライベートグループ専用のため、誰でも自由にサインアップできる状態は避ける。

1. **Authentication** → **Sign In / Providers**（または **Authentication** → **Settings**、UIのバージョンにより名称が異なる）を開く。
2. **Allow new users to sign up** をオフ（無効）にする。
3. 保存する。

## Step 5: メンバーのアカウントを作成する

1. **Authentication** → **Users** を開く。
2. **Add user** をクリックする。
3. メンバーごとに以下を設定してアカウントを作成する。
   - Email: メンバーのメールアドレス
   - Password: 初期パスワード（本人に別途伝え、必要なら後で変更してもらう）
   - **Auto Confirm User** をオンにする（Step 3でメール確認を無効にしていても、念のためオンにしておく）
   - **User Metadata** に以下のJSONを設定し、表示名を渡す。

     ```json
     { "display_name": "名前" }
     ```

     これにより、Step 2で作成したトリガーが `public.profiles.display_name` にこの値を自動的にセットする。
メンバーの人数分（最大10人まで）繰り返す。

## Step 6: APIキーを控えて `.env.local` に設定する

1. **Project Settings** → **API** を開く。
2. **Project URL** と **anon public** キーを控える。
3. リポジトリ直下に `.env.local` を作成し（`.env.example` を参考に）、以下を記入する。

   ```
   VITE_SUPABASE_URL=<Project URL>
   VITE_SUPABASE_ANON_KEY=<anon public キー>
   ```

`.env.local` はコミットしないこと（`.gitignore` で除外されている想定）。

## Step 7: スキーマが正しく適用されたことを確認する（チェックリスト）

Supabaseダッシュボードの **SQL Editor** で以下のクエリを順に実行し、結果を確認する。

- [ ] プリセット種目が55件投入されている

  ```sql
  select count(*) from public.exercises where is_preset;
  ```

  期待値: `55`

- [ ] 4テーブルすべてでRow Level Securityが有効になっている

  ```sql
  select tablename, rowsecurity from pg_tables
  where schemaname = 'public'
    and tablename in ('profiles', 'exercises', 'workouts', 'workout_sets');
  ```

  期待値: 4行すべて `rowsecurity = true`

- [ ] （任意）Step 5で作成したユーザーの数だけ `profiles` に行ができていることを確認する

  ```sql
  select id, display_name, created_at from public.profiles order by created_at;
  ```

  期待値: 作成したメンバーの人数分の行があり、`display_name` がそれぞれ設定した名前になっている

上記すべてにチェックが付けば、データベース側のセットアップは完了です。

## RLS検証結果（2026-08-20）

E2E用アカウントのJWTでSupabase REST APIを直接叩き、他メンバーのデータを改変できないことを確認した。
SQL Editorでの `set local role` による疑似検証ではなく、アプリと同じ経路（PostgREST + anon key + ユーザーJWT）で検証している。

| 検証内容 | 結果 |
|---|---|
| 他ユーザーのワークアウトへの `workout_sets` INSERT | `HTTP 403` / `42501: new row violates row-level security policy for table "workout_sets"` |
| 他ユーザーの `workouts` の DELETE | `HTTP 200`・**0行削除**（エラーにはならないが削除されない） |
| 他ユーザーの `profiles.display_name` の UPDATE | `HTTP 200`・**0行更新** |
| 他ユーザーのワークアウトの SELECT | 取得できる（グループ内で共有する仕様のため意図どおり） |

削除・更新がエラーではなく0行で返るのは、RLSが行を可視範囲から除外するPostgreSQLの仕様どおりの挙動である。
検証後、対象の他ユーザーのワークアウトと表示名がいずれも変更されていないことも確認済み。

再検証する場合は `.env.e2e` に認証情報を用意し、E2Eアカウントのアクセストークンを取得したうえで
`/rest/v1/workout_sets` への他ユーザー宛INSERTが403になることを確認すればよい。
