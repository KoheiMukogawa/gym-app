# Claude Code 引き継ぎメモ

最終更新: 2026-10-07

## 現在地

- ブランチ: `master`。push すると Vercel に自動デプロイされる。Codex も `master` に push するので、push 前に必ず `git fetch` する
- 本番で実際に使われている（本人がiPhoneで日常的に記録。利用者6人）。本番データの書き込み・削除やmigration適用は本人の許可を取ってから
- 公開済みの機能: 記録（ダイアル入力、セットごとの推定1RM、メモは記録後にセットをタップ）、履歴と編集、BIG3、ランキング（kg・DOTS）、体組成、コミュニティ、Health同期、Markdown出力、パスワード再設定、退会、ご意見の送信（管理者はヘッダーのメニューの「届いた意見」で読み、既読にする。未読があるとアイコンが赤い輪で囲まれる）、管理者向けの利用状況（`/admin/usage`）、新しい機能のお知らせ（起動時のシート）
- 本番に適用済みのmigration: `zero_rep_sets`（2026-10-05、`apply_migration` で適用）、`growth_stats`（2026-10-07、`apply_migration` で適用。anonから実行不可を確認済み）。Edge Function `body-metrics` も稼働中
- `account_deletion` はClaude Codeの自動許可モードが `apply_migration` を止めたため、本人がSQL Editorで適用した。Supabaseのmigration履歴（`list_migrations`）には載らない。関数2つ・権限・中身は読み取りで確認済み。設計は `docs/superpowers/specs/2026-10-04-account-deletion-design.md`
- 退会は `delete_my_account('退会する')` で本人の記録・自作種目・`auth.users` を消し、残りは外部キーの連鎖で消える。自分が作ったコミュニティはメンバーごと消える。2026-10-04に本番のテスト用アカウントで退会し、`auth` の内部テーブルを含め、そのユーザーを参照する行が残らないことを読み取りで確認済み
- `rls_initplan` はRLSの `auth.uid()` を `(select auth.uid())` に変え、`communities.owner_id` のインデックスとDOTS参加時の係数必須チェックを追加した。適用後、advisorsの `auth_rls_initplan`・`unindexed_foreign_keys` は解消、本人として本人の記録だけが見えることを確認済み
- ご意見: 設計は `docs/superpowers/specs/2026-10-05-feedback-design.md`。管理者は `public.admins` に1行入れて登録する（アプリからは書けない）。本人を2026-10-05に登録済み。管理者の操作は `admin_list_feedback`・`admin_unread_feedback_count`・`admin_mark_feedback_read`。一覧は新しい順に200件まで
- 利用状況: 設計は `docs/superpowers/specs/2026-10-05-usage-dashboard-design.md`。`admin_usage_stats()` が集計値だけを返す（記録した日を使った日とし、週は日本時間の月曜始まり、`@example.com` は除外）
- お知らせ: 知ってほしい機能を公開するときは、その機能と同じコミットで `src/features/announcements/announcements.ts` に1件足す（`publishedAt` は公開直前の日本時間、`+09:00` 付き）。レイアウト変更などでは足さない。登録より後に公開されたものだけが、次回の起動時に1枚のシートで出る（記録中は出ない）。既読は `announcement_reads` の時刻1つ。設計は `docs/superpowers/specs/2026-10-05-announcements-design.md`
- 0回のセット: つぶれたセット（失敗試技）は0回で記録できる（記録画面・履歴の編集）。推定1RM・BIG3・ランキング・DOTSはDB・アプリとも1〜10回だけを使うので入らない。自己ベスト・日ごとの最大重量・カードの「最大」・回数の提案・次のセットの初期回数も0回を無視する。「失敗」などの印は出さない（本人の希望）
- 黒い画面（2026-10-05に原因を特定）: デプロイ後、新しいService Workerが古い版のJSをキャッシュから消し、開いたままのページが次に開く画面の読み込みに失敗していた（Vercelは存在しないJSにもindex.htmlを200で返す）。ScreenErrorBoundary（Codex）で案内を出し、`src/lib/staleBuild.ts` が `vite:preloadError` で1回だけ自動再読み込みする（30秒以内の2回目は案内画面に任せる）
- 単体テストのTesting Libraryの待ち時間は5秒（`src/test-setup.ts`）。並列実行で1秒だと記録画面などが時間切れになっていた
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
- CAPTCHA（Cloudflare Turnstile）: Vercelの `VITE_TURNSTILE_SITE_KEY`（Sensitiveにしない）があると、ログイン・新規登録・パスワード再設定に確認欄が出てトークンを送る。未設定なら出さない（手元・テスト）。SupabaseでCAPTCHAを有効にすると3つすべてでトークンが必須になるので、必ずサイトキー入りのビルドを公開してから有効にする。問題が出たら Authentication → Bot and Abuse Protection のスイッチを切れば戻る。Turnstileのホスト名には `gym-app-ruddy-nine.vercel.app` と `gym-app-gym-app10.vercel.app` の両方を登録する
- 環境変数が空だと `src/lib/supabase.ts` の throw が静的に確定し、以降のコードがtree-shakingで丸ごと消える。
  ホーム以外の画面は遅延読み込みなのでサイズでは判別しにくい。公開中の `/assets/*.js` に `lombbjpiftuqkacasmzg` が含まれていれば環境変数は入っている

## WSL環境での注意

- `clip.exe` はUTF-8を壊す。日本語を含むSQLの貼り付けには使わず、VS Code（`code <file>`）で開いてコピーする
- Playwrightの実行にはシステムライブラリが必要（`sudo npx playwright install-deps chromium` 導入済み）

## 未完了の作業

0. メール: Supabase標準のメール送信では件名・本文を変えられず（英語の標準文面）、送信先にも制限がある。独自ドメインとResendなどのSMTPを設定してから、`docs/email-templates/reset-password.html` を貼る。本人のアドレスには再設定メールが届くことを確認済み（2026-10-04）。新規登録のメール確認は現在オフ
1. 漏洩パスワード保護（Leaked password protection）はProプラン限定のため無料プランでは使えない。advisorsの `auth_leaked_password_protection` 警告は既知として残す。代わりにダッシュボードの Authentication → パスワード設定で最小文字数を8（アプリの新規登録画面と同じ）にする
2. 管理者アカウントの `profiles.display_name` が `mukougawakouhei`（メールのローカル部）のまま。SQLで更新すればよい（本番データなので本人の許可を取る）
3. 筋トレMemoからの本人の記録移行。手順と注意は `docs/kintore-memo-migration.md`。
   次の一歩は本人から履歴画面のスクリーンショット1〜2枚と移行期間を受け取り、試し読みすること。本番への書き込み前に必ず本人の許可を取る
4. 実SupabaseのE2E（`npm run test:e2e`）は2026-08-20以降未実行。実行すると `e2e@example.com` の記録がフィードに残る
5. Health同期: 本人のHealth測定を送る操作は明示許可後に本人の少数日で行う。トークンや本文を共有ログへ残さない。署名済みShortcutファイルの配布はない
6. Supabase advisors の `authenticated_security_definer_function_executable`（13件、うち2件は退会、5件は管理者用の関数（ご意見3・利用状況1・成長の指標1））と `rls_enabled_no_policy`（communities・community_members・health_sync_private.tokens）は設計どおり。どれもanonから実行不可、`search_path` 固定、`auth.uid()` で本人に限定している

## 再開時の注意

- 2026-10-07: 乗り換え層向けに「BIG3のベストを入れて始める」を追加（設計 `docs/superpowers/specs/2026-10-07-big3-starting-bests-design.md`）。BIG3が3種目とも空の人にホームでカードを出し（閉じると端末に `glog:big3-start-dismissed:<userId>`）、`/big3/start` で重量×回数（1〜10回）と日付を入れると、その日の普通のワークアウトとして保存する（`saveStartingBests`、IDを使い回して再送でも重複しない）。DB変更なし。お知らせは足していない（既存の利用者はBIG3の記録があるのでカードが出ない）。iPhone実機確認は未実施。
- 2026-10-07: Growth Architecture v1（設計とロードマップは `docs/growth-architecture.md`）。ログイン不要の公開ページ `/calculators`・`/calculators/1rm`・`/calculators/dots` を追加（`src/features/tools/`、Supabaseをimportしない）。`npm run build` が公開ページをビルド時に静的HTMLへ書き出し（`src/prerender.tsx`・`scripts/prerender.mjs`）、`sitemap.xml`・`robots.txt` も生成。公開ページを足すときは `pages.ts` と `vercel.json` のリライトの両方が必要（書き忘れるとビルドとテストが失敗）。URLの基準は `VITE_SITE_URL`（未設定ならvercel.app）。最初に開いた公開ページを `signup_source` として登録メタデータに入れ、プライバシーポリシーに追記（改定日10/7）。`track()`（`src/lib/analytics.ts`）は送信先なし。migration `20261007120000_growth_stats.sql`（`admin_growth_stats()`：Weekly Active Lifters・D1/D7/D30・週2日以上・登録のきっかけ）は本人の許可を受け本番に適用済み。アクセス解析の送信先は当面なし（本人が同意）。独自ドメインは費用を抑えるため当面なし（vercel.appのまま）。Share Card・共有URLは本人の判断で保留（スクショで足りる可能性が高い。需要が見えるまで作らない）。iPhone実機確認は未実施。
- 2026-10-06: 種目詳細の推定1RMグラフ（`ExerciseTrendChart.tsx`）は、2本指で拡大・縮小、拡大中は1本指で左右に移動、ダブルタップか「全期間」ボタンで全体に戻る（範囲の計算は `trend.ts`）。最初は直近6ヶ月（2日未満なら全期間）。グラフの上は `touch-action: pan-y` で上下スクロールはページに任せ、Safariの `gesturestart` を止める。期間ボタンとスライダー（Brush）は本人の判断でなくした。縦軸は表示範囲に合わせて自動、30日を超える表示では日ごとの点を省略（133日分で線のアニメーションが見えなかったのは点が線を隠していたため）。線のアニメーションは初回だけ。操作直後のクリックでは日を選ばない。ページの集計は `useMemo`。BIG3画面の種目別グラフとコミュニティのメンバー詳細のグラフも高さを倍（h-56）にした。モックE2E `exercise-chart.spec.ts`（CDPの2本指タッチ）を追加。iPhone実機確認は未実施。
- 2026-10-05: 本人の許可を受け、kyosuke8s@icloud.com に筋トレMemoのベンチ・スクワット・デッドリフト（156日・758セット）を取り込んだ。回数「-」の失敗セットは取り込まず、補助ありはメモの先頭に「補助あり」。元データ（`KYOSUKE/`）は取り込み後に削除済み。

- 2026-10-05: 紹介ページ公開後のCIで、退会テストの旧見出し、ランキングテストのログイン直後の遷移、Healthテストの再読み込み中のグラフ操作が失敗。新見出しに合わせ、ログイン完了・再読み込み完了を待つようE2Eを修正。アプリやDBの追加変更はなし。

- 2026-10-05: ランディングページを、本人指定の強み（AI相談用エクスポート・見やすい種目別グラフ・自作の招待制コミュニティランキング）を中心に再構成。サンプルのグラフ/AI相談/ランキングを切り替え可能にし、AI相談例・BIG3/DOTS切り替え・FAQ・登録/ログイン導線を用意。基本の入力/メモ/体組成は補足に整理。実データ・実AI呼び出しを使わず、数値はサンプルと明記。紹介ページは未ログイン時に遅延読み込み、メタ説明も更新。320/375/390/1280pxのモックE2E3件、既存規約リンクの単体3件、型チェック・lint（エラー/警告0）・PWAビルドを確認。`17b679d` として前回の記録カードとともに本番公開済み。紹介ページの切り替え・登録/ログイン導線・PWA配信を本番で読み取り確認。iPhone実機確認は未実施。


- 2026-10-05: 記録画面に「前回の記録」の折り畳みカードを追加。選択中の種目について今日より前の最新実施日を本人のworkoutsから1件だけ取得し、全セットとメモを表示。登録日時ではなく実施日時で選び、300件のプリフィル履歴に依存しない。初期表示は日付・セット数・最終セットのみ。今回の入力・今日のセットと分離し、前回の取得失敗はカード内で再試行できる。種目・ユーザー変更時は展開状態と古い応答を破棄。自重・アシストは加重表記。320/375/390pxの画像確認、関連単体43件、simple-flowのモックE2E16件、型チェック・PWAビルドを確認。lintはエラー0・既存LogPageの警告1件。DB変更・本番書き込みはなし。`17b679d` として本番公開済みで、配信済みバンドルも確認。認証した本番の記録取得とiPhone実機確認は未実施。

- 2026-10-05: 体組成の初期画面を、最新の体重・体脂肪率 → 期間選択 → グラフの順に整理。目盛り・平均・操作の説明を「グラフの見方」へ折り畳み、初回の前回比や未記録の重複表示を減らした。グラフにkg/%を添え、読み上げ用の軸説明は維持。ヘルスケア設定は既存の閉じた初期状態を維持。320/375/390pxでモックE2E2件、関連単体20件、型チェック・lintを確認。`cdd683a` として本番公開済み。CI全項目成功。iPhone実機確認は未実施。

- 2026-10-04: 本人のiPhoneフィードバックを受け、セットのメモをモーダルから行の直下のインライン入力へ変更。ほかのセットを残し、編集中だけセット入力ドックを外す。キーボード分のスクロール余白と入力欄へのスクロールを用意し、外側のフォーカス枠を欄内のボーダーへ変更して切れを防ぐ。保存失敗の入力保持・再試行・未保存キャンセル確認・入力値保持は維持。関連単体38件、320/375/390pxのモックE2E2件を確認。`d29b08c` として本番公開済み。CI全項目成功。iPhone実機確認は未実施。

- 2026-10-04: セットのメモを専用BottomSheetへ移し、編集中はセット入力ドックを外す。キーボード上のメモ欄内で長文をスクロールでき、保存失敗は入力を残してモーダル内に表示。閉じる際の未保存変更確認、元の種目・重量・回数の保持を実装。関連単体38件・モックE2E3件・型チェックを確認。本人の許可を受け、今回まとめて本番公開する。iPhone実機確認は未実施。
- 2026-10-04: 全体・コミュニティのDOTSタブに短い説明と折り畳みの7段階の目安を追加。公式区分ではないこと、Glogは推定1RMを使うことを明記。関連単体9件・320/390pxモックE2E・型チェックを確認。本人の許可を受け、今回まとめて本番公開する。
- 2026-10-04: エクスポート画面の日付欄を画面幅に収め、西暦の `YYYY/M/D` 表示に統一。透明なネイティブdate入力を重ねてiPhoneの日付選択を維持。320・375・390pxのモックE2E（英語ロケール・期間指定・メモ付きMarkdown出力）と型チェックを確認。本人の許可を受け、今回まとめて本番公開する。iPhone実機確認は未実施。
- 2026-10-04: 記録画面は現在の種目を先頭に表示し、種目名と「記録を終了」を上部に固定。入力ドックはスクロール・ブラウザーの表示領域変化をキーボードと誤判定しないよう修正。関連単体40件・モックE2E3件・型チェック・PWAビルドを確認。本人の許可を受け、今回まとめて本番公開する。iPhone実機確認は未実施。
- 2026-10-03: Health連携の初期設定を「連携キー → ショートカット → 1日分の同期確認」に整理。キー発行だけで連携済みとせず、再発行後は新しいキーでの同期を待つ。「同期結果を確認」は体組成データも再読み込みする。この改修は `master` にpush済み（本番に公開済み）。
- 配布用ショートカット本体とiCloudリンクはまだない。`src/features/body/healthSyncShortcut.ts` は `null` のまま。作成・共有・実機確認の準備は `docs/health-sync-shortcut-distribution.md`。本人はiPhoneのみ利用可能。実機確認した秘密情報のないリンクを設定してから簡単追加を有効にする。モックテストはHealthKit・iCloudからの追加・自動実行の実機検証にはならない。
- Health同期の本番DB migrationと `body-metrics` v1 ACTIVEは読み取り確認済み。上の「本番適用待ち」は古い記述。公開の経緯は `docs/health-sync-release.md` にある。今回のUI改修でDB・Edge Functionを再適用しない。

- UI文言は日本語、コード識別子とコミットメッセージは英語。
- 通信エラーを空状態と同じ表示にしない。画面内にエラーを残し、再試行を用意する既存パターンに合わせる。
- 主要操作のタップ領域は最低56px。
- 作業開始前に `git status --short` を確認する。
