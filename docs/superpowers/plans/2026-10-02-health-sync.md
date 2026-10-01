# iPhoneヘルスケア同期 実装計画

作成日: 2026-10-02
設計: `docs/superpowers/specs/2026-10-02-health-sync-design.md`

## Task 1: 個人トークンと原子的取り込み

- Supabase CLIの `migration new health_sync` でmigration名を生成する。非公開トークン表、本人用発行/状態/失効RPC、サービス限定import RPC、安全なhelperと権限を追加する。
- 256bit乱数とSHA-256、1ユーザー1個、token-row lock、auth.uid必須、空search_pathを実装する。
- importは最大500日の全件検証、keep/overwrite、小数1桁、fat省略/null保持、同日重複拒否、件数と成功状態更新を1トランザクションで行う。
- `supabase/tests/health_sync.sql` にrollback検証を追加する。ユーザー2人と匿名/認証/serviceの実行権限を切り替えて境界を検証する。
- 隔離PGliteランタイム（pgcrypto、Supabase相当rolesとauth.uid stub）で実行する。既存DB定義を必要最小限に再現し、テストがDDL/権限/挙動を実行して確かめる。実行不能なら本番適用を止めて原因を報告する。

完了条件: 生トークン/ハッシュが公開されず、本人以外の操作が拒否され、バッチ失敗が部分書込みを残さない。

## Task 2: body-metrics Edge Function

- `supabase/functions/body-metrics/index.ts` と純粋な検証モジュールを追加し、custom Bearer認証のためverify_jwt=falseを設定する。
- POST/JSON/実読取256KiB/1〜500件/strict日付/有限数値/許可キー/重複を検証し、サービス環境変数でimport RPCを呼ぶ。所有者をリクエストから受け取らない。
- OPTIONS、400/401/405/413/415/500と安全な成功件数応答を実装する。データ/認証値をログしない。
- テストで不正日付、文字列数値、NaN相当、境界、重複、fat null、無効Bearer、本文上限、RPC失敗を確認する。

完了条件: 認証済みバッチだけが所有者の体組成へ届き、秘密が応答やログに出ない。

## Task 3: 接続UIと日本語ショートカット手順

- `src/features/body/healthSyncQueries.ts` にtyped RPCを追加する。
- 折り畳み連携パネルをBodyPageへ追加する。状態/発行/再発行/失効、表示一度の生トークン、endpointコピー/手動選択、確認と再試行を実装する。
- `docs/health-sync-shortcut.md` に開始・終了日、月単位処理、Health権限、kg/%、ローカル日付、同日最新の体重/脂肪率、500件以下のJSON POST、keepとoverwrite、再送、日次オートメーションを手順として記載する。画面から手順を読めるようにする。
- 秘密はReactメモリだけに置き、セッション変更/ログアウトで消す。接続状態の失敗を未接続と誤表示しない。
- UIテストで発行一度表示、再発行/失効確認、エラー/コピーfallback、ユーザー変更、最終同期を確認する。

完了条件: ユーザーがアプリとiPhoneだけで過去期間の同期を設定できる。

## Task 4: 過去全期間と再読み込み

- `src/features/profile/bodyweightQueries.ts` のfetchBodyweightLogsをuser_id + recorded_on昇順 + rangeでページングする。途中失敗はthrowする。
- BodyPageに「全期間」と「記録を再読み込み」を追加し、一覧の段階表示と全期間軸の年表記を用意する。
- `src/lib/bodyComposition.ts` の月境界を対象月末にクランプし、既存期間と移動平均の意味を保つ。
- 1000件ちょうど/1001件/複数ページ/途中エラー、古い年、月末/閏年、再読み込み後の表示を検証する。

完了条件: 数年分の同期記録が切り捨てられず、最新と過去を画面で確認できる。

## Task 5: 統合確認と本番適用準備

- モックE2Eで接続設定→外部同期後再読み込み→過去年のグラフ/一覧→keep維持→overwrite反映を確認する。
- 既存体組成、自重計算、Markdown出力、単一workerテスト、buildを確認する。
- ローカルSQL結果・Edge/UI結果・実機未確認箇所を報告し、CLAUDE.mdを更新する。公開前にmigration、Function設定、必要secret名、rollback/失効手順をレビュー可能にする。
- 本番適用承認後にmigration/Functionを公開し、隔離した合成データ（rollback）で過去日→再送→失効→再発行のスモーク確認を行う。トークンを共有ログへ残さない。

完了条件: 検証済みの変更と公開手順が揃い、承認済みの場合のみ本番へ反映される。
