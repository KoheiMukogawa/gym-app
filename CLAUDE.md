# Claude Code 引き継ぎメモ

最終更新: 2026-10-03

## 現在地

- ブランチ: `master`。push すると Vercel に自動デプロイされる。Codex も `master` に push するので、push 前に必ず `git fetch` する
- 本番で実際に使われている（本人がiPhoneで日常的に記録。利用者6人）。本番データの書き込み・削除やmigration適用は本人の許可を取ってから
- 公開済みの機能: 記録（ダイアル入力、セットごとの推定1RM、メモは記録後にセットをタップ）、履歴と編集、BIG3、ランキング（kg・DOTS）、体組成、コミュニティ、Health同期、Markdown出力
- 本番に適用済みのmigration: `rls_initplan`（2026-10-03）まで。Edge Function `body-metrics` も稼働中
- `rls_initplan` はRLSの `auth.uid()` を `(select auth.uid())` に変え、`communities.owner_id` のインデックスとDOTS参加時の係数必須チェックを追加した。適用後、advisorsの `auth_rls_initplan`・`unindexed_foreign_keys` は解消、本人として本人の記録だけが見えることを確認済み
- 最後のセットを削除すると、空になったワークアウトもその場で消える（記録画面・履歴の編集画面とも）
- 主な設計: DOTS `docs/superpowers/specs/2026-10-02-dots-ranking-design.md`、Health同期 `docs/superpowers/specs/2026-10-02-health-sync-design.md`（停止手順は `docs/health-sync-release.md`）、体組成 `docs/superpowers/plans/2026-10-02-body-composition.md`

## Task 15/16 で追加したもの

- `vite-plugin-pwa` によるmanifestとService Worker（アプリシェルのみプリキャッシュ、APIはキャッシュしない）
- `scripts/generate-pwa-icons.mjs` でPNGアイコンを生成（外部依存なし、`node scripts/generate-pwa-icons.mjs` で再生成可能）
- `vercel.json` のSPAリライト
- README を本アプリの内容に差し替え
- Playwright の設定と中核導線のE2Eテスト1件（`.env.e2e` 未設定なら自動スキップ）

## 検証結果

- Health同期の検証結果は `.superpowers/sdd/2026-10-02-health-sync/task-3-5-report.md` とbackend reportを参照。SQLのPGliteは同時セッションや本番PostgREST/gatewayを再現しない
- 体組成の最新検証結果・実行コマンドは `.superpowers/sdd/2026-10-02-body-composition/task-5-7-report.md` を参照
- モックE2Eは画面→保存→実Recharts SVG/ツールチップ→一覧→過去日修正→スワイプ削除を検証
- 実SupabaseのE2Eは今回は実行していない。2026-08-20時点ではログイン〜1セット記録〜フィード反映がPASS
- RLSの既存検証結果は `docs/setup-supabase.md` の「RLS検証結果」を参照
- 単体テストのタイムアウトは20秒（`vite.config.ts`）。並列の `npm test` で通る
- モックE2Eは `npm run test:e2e:mock -- --workers=1`。並列だと体組成・Health系がタイムアウトすることがある
- `npm run lint`（ESLint、TypeScript と React Hooks のルール）。警告2件（ProfilePage・LogPage の useEffect 依存）は意図的
- SQLは `node supabase/tests/sql-runtime/run-sql.mjs` で、全migrationを適用した一時PGliteに対して実行できる（初回は `npm ci --prefix supabase/tests/sql-runtime`）
- CI（`.github/workflows/ci.yml`）: lint → build → 単体 → SQL → モックE2E。Vercelのデプロイは CI の結果を待たないので、push 後に `gh run list` で確認する

## 本番環境

- 公開URL: https://gym-app-ruddy-nine.vercel.app （Vercel / GitHub連携で `master` push時に自動デプロイ）
- リポジトリ: https://github.com/KoheiMukogawa/gym-app （Private）
- Supabaseプロジェクト: `lombbjpiftuqkacasmzg`
- キーは新形式の `sb_publishable_...`（旧 `eyJ...` のJWT形式ではない）。`@supabase/supabase-js` はどちらも受け付ける
- Vercelの環境変数は **Sensitive にしないこと**。Viteはビルド時に値を埋め込むため、Sensitive指定だと空文字のままビルドされる
- 環境変数が空だと `src/lib/supabase.ts` の throw が静的に確定し、以降のコードがtree-shakingで丸ごと消える。
  ホーム以外の画面は遅延読み込みなのでサイズでは判別しにくい。公開中の `/assets/*.js` に `lombbjpiftuqkacasmzg` が含まれていれば環境変数は入っている

## WSL環境での注意

- `clip.exe` はUTF-8を壊す。日本語を含むSQLの貼り付けには使わず、VS Code（`code <file>`）で開いてコピーする
- Playwrightの実行にはシステムライブラリが必要（`sudo npx playwright install-deps chromium` 導入済み）

## 未完了の作業

1. Supabaseダッシュボードで漏洩パスワード保護（Leaked password protection）をオンにする。ダッシュボード設定のためコードやSQLからは変更できない
2. 管理者アカウントの `profiles.display_name` が `mukougawakouhei`（メールのローカル部）のまま。SQLで更新すればよい（本番データなので本人の許可を取る）
3. 筋トレMemoからの本人の記録移行。手順と注意は `docs/kintore-memo-migration.md`。
   次の一歩は本人から履歴画面のスクリーンショット1〜2枚と移行期間を受け取り、試し読みすること。本番への書き込み前に必ず本人の許可を取る
4. 実SupabaseのE2E（`npm run test:e2e`）は2026-08-20以降未実行。実行すると `e2e@example.com` の記録がフィードに残る
5. Health同期: 本人のHealth測定を送る操作は明示許可後に本人の少数日で行う。トークンや本文を共有ログへ残さない。署名済みShortcutファイルの配布はない
6. Supabase advisors の `authenticated_security_definer_function_executable`（6件）と `rls_enabled_no_policy`（communities・community_members・health_sync_private.tokens）は設計どおり。どれもanonから実行不可、`search_path` 固定、`auth.uid()` で本人に限定している

## 再開時の注意

- 2026-10-03: Health連携の初期設定を「連携キー → ショートカット → 1日分の同期確認」に整理。キー発行だけで連携済みとせず、再発行後は新しいキーでの同期を待つ。「同期結果を確認」は体組成データも再読み込みする。この改修は `master` にpush済み（本番に公開済み）。
- 配布用ショートカット本体とiCloudリンクはまだない。`src/features/body/healthSyncShortcut.ts` は `null` のまま。作成・共有・実機確認の準備は `docs/health-sync-shortcut-distribution.md`。本人はiPhoneのみ利用可能。実機確認した秘密情報のないリンクを設定してから簡単追加を有効にする。モックテストはHealthKit・iCloudからの追加・自動実行の実機検証にはならない。
- Health同期の本番DB migrationと `body-metrics` v1 ACTIVEは読み取り確認済み。上の「本番適用待ち」は古い記述。公開の経緯は `docs/health-sync-release.md` にある。今回のUI改修でDB・Edge Functionを再適用しない。

- UI文言は日本語、コード識別子とコミットメッセージは英語。
- 通信エラーを空状態と同じ表示にしない。画面内にエラーを残し、再試行を用意する既存パターンに合わせる。
- 主要操作のタップ領域は最低56px。
- 作業開始前に `git status --short` を確認する。
