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

- [x] Big3 のプリセット種目を name_normalized で解決
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
- [x] 次の目標と進捗
- [x] 目標追加・削除

## Phase 5 — 導入確認

- [ ] Supabase に `0004_strength_goals.sql` を適用
- [ ] `npm test`
- [ ] `npm run build`
- [ ] 実データで Big3 の数値を確認
- [ ] スマートフォンで Strength 画面を確認

## v2.1 候補

- 派生種目（ナロウデッド等）を Big3 に紐付け
- 1/3/5/8/10RM の Rep PR 表示
- e1RM 推移グラフ
- PR達成フィードバック
- 体重・DOTS
