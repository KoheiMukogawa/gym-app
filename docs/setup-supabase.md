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

途中でエラーが出た場合は、直前のステップが正しく完了しているか（テーブルやenum型が実際に作成されているか）を
Table Editor で確認してからやり直す。

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
