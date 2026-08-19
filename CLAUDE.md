# Claude Code 引き継ぎメモ

最終更新: 2026-08-20

## 現在地

- ブランチ: `feat/gym-app-mvp`
- 実装計画: `docs/superpowers/plans/2026-08-14-gym-app.md`
- Task 1〜16 のコード実装が完了済み（計画書のチェックボックス自体は未更新のため、コミット履歴と実装を正とする）
- 直近完了: Task 15「PWA化とデプロイ」、Task 16「E2Eテスト」
- 残りは人手が必要な作業のみ（下記「未完了の作業」）

## Task 15/16 で追加したもの

- `vite-plugin-pwa` によるmanifestとService Worker（アプリシェルのみプリキャッシュ、APIはキャッシュしない）
- `scripts/generate-pwa-icons.mjs` でPNGアイコンを生成（外部依存なし、`node scripts/generate-pwa-icons.mjs` で再生成可能）
- `vercel.json` のSPAリライト
- README を本アプリの内容に差し替え
- Playwright の設定と中核導線のE2Eテスト1件（`.env.e2e` 未設定なら自動スキップ）

## 検証結果

- `npm run build`: 成功。`dist/manifest.webmanifest` と `dist/sw.js` を生成
- `npx vitest run --maxWorkers=1 --reporter=dot`: 24 files / 148 tests 全件成功
- `npm run test:e2e`: **実Supabaseに対してPASS**（ログイン〜1セット記録〜フィード反映）
- RLS: 実APIでの検証済み。結果は `docs/setup-supabase.md` の「RLS検証結果」を参照
- 通常の並列 `npm test` は、この環境では無関係な既存テストがタイムアウトすることがある。ワーカー1つなら全件成功するため負荷起因と判断。

## 本番環境

- 公開URL: https://gym-app-ruddy-nine.vercel.app （Vercel / GitHub連携で `master` push時に自動デプロイ）
- リポジトリ: https://github.com/KoheiMukogawa/gym-app （Private）
- Supabaseプロジェクト: `lombbjpiftuqkacasmzg`
- キーは新形式の `sb_publishable_...`（旧 `eyJ...` のJWT形式ではない）。`@supabase/supabase-js` はどちらも受け付ける
- Vercelの環境変数は **Sensitive にしないこと**。Viteはビルド時に値を埋め込むため、Sensitive指定だと空文字のままビルドされる
- 環境変数が空だと `src/lib/supabase.ts` の throw が静的に確定し、以降のコードがtree-shakingで丸ごと消える。
  バンドルが約230kBなら環境変数が入っていない、約820kBなら入っている、という切り分けができる

## WSL環境での注意

- `clip.exe` はUTF-8を壊す。日本語を含むSQLの貼り付けには使わず、VS Code（`code <file>`）で開いてコピーする
- Playwrightの実行にはシステムライブラリが必要（`sudo npx playwright install-deps chromium` 導入済み）

## 未完了の作業

1. Supabase Authentication → URL Configuration に公開URLをSite URLとして登録（メール/パスワード認証のみなら無くても動作する）
2. 実機スマートフォンでのホーム画面追加とログイン〜1セット記録の確認
3. 管理者アカウントの `profiles.display_name` が `mukougawakouhei`（メールのローカル部）のまま。
   ユーザー作成時に User Metadata の `display_name` を設定しなかったため。SQLで更新すればよい
4. E2Eテストを実行すると `e2e@example.com` の記録がフィードに残る。気になる場合は
   `delete from public.workouts where user_id = '<e2eユーザーのid>';` で消す

## 再開時の注意

- UI文言は日本語、コード識別子とコミットメッセージは英語。
- 通信エラーを空状態と同じ表示にしない。画面内にエラーを残し、再試行を用意する既存パターンに合わせる。
- 主要操作のタップ領域は最低56px。
- 作業開始前に `git status --short` を確認する。
