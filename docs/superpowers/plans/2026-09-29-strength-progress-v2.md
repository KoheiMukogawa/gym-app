# Strength Progress v2 実装計画

作成日: 2026-09-29

## Phase 1 — 計算基盤

- [x] `src/lib/strength.ts` を追加
- [x] Brzycki e1RM
- [x] 1RM PR
- [x] All-time e1RM
- [x] 直近30日 e1RM
- [x] Total 合算
- [x] Vitest を追加

## Phase 2 — データ取得

- [x] 明示的なBig3設定をIDで解決し、未設定区分だけプリセットを is_preset / name_normalized で解決
- [x] ユーザー本人の Big3 履歴を取得
- [x] Strength Snapshot を生成

## Phase 3 — 目標

- [x] `strength_goals` migration
- [x] RLS: 本人のみ SELECT / INSERT / UPDATE / DELETE
- [x] 目標取得
- [x] 目標追加
- [x] 目標削除

## Phase 4 — UI

- [x] `/strength` ルート
- [x] ボトムナビに Big3 を追加
- [x] PR Total / Current Estimated Total
- [x] 3種目カード
- [x] Rep PR（3/5/8/10回）
- [x] e1RM 推移グラフ
- [x] 次の目標と進捗
- [x] 目標追加・削除

## Phase 5 — 導入確認

- [x] Supabase に `0004_strength_goals.sql` を適用（2026-09-29、gym-app）
- [x] `npm test`（GitHub Actionsで成功）
- [x] `npm run build`（GitHub Actionsで成功）
- [ ] 実データで Big3 の数値を確認
- [ ] スマートフォンで Strength 画面を確認

## Phase 6 — ユーザー別Big3種目設定

- [x] `0005_big3_exercise_mappings.sql`（主キー user_id / lift_type、FK、本人限定RLS）
- [x] `strengthSnapshot.ts` に純粋な種目解決・スナップショット計算を分離
- [x] 設定の取得・upsert・標準へのリセットをfeature queryに実装
- [x] すべての指標・推移・Total・詳細リンクに設定を反映
- [x] 履歴をページ取得し、最初の1000件以降も歴代PRの対象にする
- [x] Strength画面に日本語の対象種目設定（56px以上、自動保存・即再計算）
- [x] 保存失敗は選択を維持して再試行可。保存後の再取得失敗は古い指標を隠して再試行
- [x] 標準・明示設定・欠損・全指標・query・UIの回帰テスト追加
- [x] `npm test`: 28ファイル / 183テスト成功（Node 24）
- [x] `npm run build`: 成功（Node 24、既存のバンドルサイズ警告のみ）
- [x] 制約・upsert・2ユーザー間RLSのSQLテストを追加し、PGliteの一時DBで実行
- [x] 本番Supabaseに `0005_big3_exercise_mappings.sql` を適用（2026-09-29、gym-app）
- [x] 本番DBのカタログで両テーブルのRLS、本人限定4ポリシー、PK/FK/CHECK、authenticatedのCRUD権限を確認（実アカウントのREST/API操作は未確認）
- [ ] 実アカウントで設定の保存・再読み込み・コンベンショナルデッドリフトの集計を確認

## v2.1 候補

- PR達成フィードバック
- 体重・DOTS
