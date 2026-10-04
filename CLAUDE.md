# Claude Code 引き継ぎメモ

最終更新: 2026-10-02（Codexへ引き継ぎ）

## 現在地

- ブランチ: `master`（DOTSランキングまでローカルでマージ済み。originへのpushは未実施）
- MVP Task 1〜16 は完了済み。体組成管理の実装計画は `docs/superpowers/plans/2026-10-02-body-composition.md`
- 体組成 Task 1〜7 を実装済み: 任意の体脂肪率、本人限定の記録・修正・削除、体組成タブ、期間別グラフと7日平均、Markdown出力
- `bodyweight_logs.body_fat_pct` は本番DBに適用済み。既存の本人限定RLSは維持
- プロフィールからは体組成タブへ案内。自重種目の記録画面での体重入力は維持
- この作業のコミットはローカルのみ。push・merge・本番アプリのデプロイは未実施
- Health同期のTasks1〜5をローカル実装: 個人トークン管理、期間バッチEdge、折り畳み接続UIと日本語Shortcut手順、全期間グラフと1000件ずつの履歴取得・50件ずつの一覧
- Health同期の本番migration/Function/アプリ公開とiPhone実機確認は未実施。具体的な適用・停止手順は `docs/health-sync-release.md`
- DOTSランキングをローカル実装: 記録日の前後14日以内の体重で種目ごとにDOTSを出し、全体・コミュニティにDOTSタブ、プロフィールで参加と係数を設定。設計は `docs/superpowers/specs/2026-10-02-dots-ranking-design.md`
- DOTSのmigrationは2026-10-02に本番適用済み（本番の履歴名 `dots_ranking`）。適用前後で全体・コミュニティのkgランキング結果が一致、`big3_member_stats` / `dots_points` はanon/authenticatedから実行不可を確認。アプリのpush・デプロイは未実施

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
- 通常の並列 `npm test` は、この環境では無関係な既存テストがタイムアウトすることがある。ワーカー1つで確認する
- モックE2Eも並列だと体組成・Health系がタイムアウトすることがある。`--workers=1` で確認する
- ランキング系SQLは `node supabase/tests/sql-runtime/run-sql.mjs` で、全migrationを適用した一時PGliteに対して実行できる（初回は `npm ci --prefix supabase/tests/sql-runtime`）

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

1. Supabaseダッシュボードで新規サインアップを許可する（Allow new users to sign up をオン、Confirm email はオフ。標準メールはチームのアドレスにしか届かないため）。
   手順は `docs/setup-supabase.md` の Step 3〜4。ダッシュボード設定のためコードやSQLからは変更できない
2. 実機スマートフォンでのホーム画面追加とログイン〜1セット記録の確認
3. 管理者アカウントの `profiles.display_name` が `mukougawakouhei`（メールのローカル部）のまま。
   ユーザー作成時に User Metadata の `display_name` を設定しなかったため。SQLで更新すればよい
4. E2Eテストを実行すると `e2e@example.com` の記録がフィードに残る。気になる場合は
   `delete from public.workouts where user_id = '<e2eユーザーのid>';` で消す

5. Health同期はローカル実装済み・本番適用待ち。設計は `docs/superpowers/specs/2026-10-02-health-sync-design.md`。
   公開前に本番PostgREST権限、同時セッションのロック、Function gatewayを確認する。
   iPhoneの実際のアクション・単位・親子エラー停止・日次実行は未確認。署名済みShortcutファイルの配布はない。
   本人のHealth測定を送る操作は明示許可後に本人の少数日で行う。トークンや本文を共有ログへ残さない。
   2026-10-02時点で本番のmigration履歴に `health_sync` が記録されている（この項目の「本番適用待ち」と食い違う）。Edge Functionの状態と合わせて確認してから、この項目を直す。
6. 筋トレMemoからの本人の記録移行。手順と注意は `docs/kintore-memo-migration.md`。
   次の一歩は本人から履歴画面のスクリーンショット1〜2枚と移行期間を受け取り、試し読みすること。本番への書き込み前に必ず本人の許可を取る。
7. DOTSランキングの後回しにした軽微な点: migration末尾の `notify pgrst,'reload schema'` がない、コミュニティの空一覧の文言がDOTS専用、
   係数未選択で保存ボタンが無効になる理由の表示がない、同点の次の順位が飛ぶことのテストがない、`dots_opt_in` をRPCを通さず直接更新できる（本人のデータのみ）

## 再開時の注意

- 2026-10-04: エクスポート画面の日付欄を画面幅に収め、西暦の `YYYY/M/D` 表示に統一。透明なネイティブdate入力を重ねてiPhoneの日付選択を維持。320・375・390pxのモックE2E（英語ロケール・期間指定・メモ付きMarkdown出力）と型チェックを確認。本番へのpush・iPhone実機確認は未実施。
- 2026-10-04: 記録画面は現在の種目を先頭に表示し、種目名と「記録を終了」を上部に固定。入力ドックはスクロール・ブラウザーの表示領域変化をキーボードと誤判定しないよう修正。関連単体40件・モックE2E3件・型チェック・PWAビルドを確認。iPhone実機確認と本番へのpushは未実施。
- 2026-10-03: Health連携の初期設定を「連携キー → ショートカット → 1日分の同期確認」に整理。キー発行だけで連携済みとせず、再発行後は新しいキーでの同期を待つ。「同期結果を確認」は体組成データも再読み込みする。この改修はローカルで、本番アプリへのpushは未実施。
- 配布用ショートカット本体とiCloudリンクはまだない。`src/features/body/healthSyncShortcut.ts` は `null` のまま。作成・共有・実機確認の準備は `docs/health-sync-shortcut-distribution.md`。本人はiPhoneのみ利用可能。実機確認した秘密情報のないリンクを設定してから簡単追加を有効にする。モックテストはHealthKit・iCloudからの追加・自動実行の実機検証にはならない。
- Health同期の本番DB migrationと `body-metrics` v1 ACTIVEは読み取り確認済み。上の「本番適用待ち」は古い記述。公開の経緯は `docs/health-sync-release.md` にある。今回のUI改修でDB・Edge Functionを再適用しない。

- UI文言は日本語、コード識別子とコミットメッセージは英語。
- 通信エラーを空状態と同じ表示にしない。画面内にエラーを残し、再試行を用意する既存パターンに合わせる。
- 主要操作のタップ領域は最低56px。
- 作業開始前に `git status --short` を確認する。
