# Claude Code 引き継ぎメモ

最終更新: 2026-08-19

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
- `npm run test:e2e`: 認証情報未設定のためスキップ1件（webServerの起動とスキップ制御は動作確認済み）
- 通常の並列 `npm test` は、この環境では無関係な既存テストがタイムアウトすることがある。ワーカー1つなら全件成功するため負荷起因と判断。

## 未完了の作業（人手が必要）

1. Vercelへのデプロイ（`npx vercel --prod`）と環境変数 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` の設定
2. Supabase Authentication → URL Configuration に公開URLをSite URLとして登録
3. E2E用アカウントを作り `.env.e2e` に記入して `npm run test:e2e` を実走
4. Supabase SQL Editor でのRLS手動検証（計画書 Task 16 Step 5）と `docs/setup-supabase.md` への結果追記
5. 実機スマートフォンでのホーム画面追加とログイン〜1セット記録の確認

## 再開時の注意

- UI文言は日本語、コード識別子とコミットメッセージは英語。
- 通信エラーを空状態と同じ表示にしない。画面内にエラーを残し、再試行を用意する既存パターンに合わせる。
- 主要操作のタップ領域は最低56px。
- 作業開始前に `git status --short` を確認する。
