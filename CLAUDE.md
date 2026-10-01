# Claude Code 引き継ぎメモ

最終更新: 2026-10-02

## 現在地

- ブランチ: `claude/nifty-gates-qp3rlp`
- MVP Task 1〜16 は完了済み。体組成管理の実装計画は `docs/superpowers/plans/2026-10-02-body-composition.md`
- 体組成 Task 1〜7 を実装済み: 任意の体脂肪率、本人限定の記録・修正・削除、体組成タブ、期間別グラフと7日平均、Markdown出力
- `bodyweight_logs.body_fat_pct` は本番DBに適用済み。既存の本人限定RLSは維持
- プロフィールからは体組成タブへ案内。自重種目の記録画面での体重入力は維持
- この作業のコミットはローカルのみ。push・merge・本番アプリのデプロイは未実施
- 次の別フェーズで iPhoneヘルスケアの過去データ取り込みと継続同期を設計・実装する（下記参照）

## Task 15/16 で追加したもの

- `vite-plugin-pwa` によるmanifestとService Worker（アプリシェルのみプリキャッシュ、APIはキャッシュしない）
- `scripts/generate-pwa-icons.mjs` でPNGアイコンを生成（外部依存なし、`node scripts/generate-pwa-icons.mjs` で再生成可能）
- `vercel.json` のSPAリライト
- README を本アプリの内容に差し替え
- Playwright の設定と中核導線のE2Eテスト1件（`.env.e2e` 未設定なら自動スキップ）

## 検証結果

- 体組成の最新検証結果・実行コマンドは `.superpowers/sdd/2026-10-02-body-composition/task-5-7-report.md` を参照
- モックE2Eは画面→保存→実Recharts SVG/ツールチップ→一覧→過去日修正→スワイプ削除を検証
- 実SupabaseのE2Eは今回は実行していない。2026-08-20時点ではログイン〜1セット記録〜フィード反映がPASS
- RLSの既存検証結果は `docs/setup-supabase.md` の「RLS検証結果」を参照
- 通常の並列 `npm test` は、この環境では無関係な既存テストがタイムアウトすることがある。ワーカー1つで確認する

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

5. 体組成のヘルスケア連携は未実装。次の別フェーズで過去データ取り込みと継続同期を扱う。
   設計の起点は `docs/superpowers/specs/2026-10-02-body-composition-design.md` の「将来: ショートカット連携」。
   Edge Function と個人トークンの発行・ハッシュ保管用テーブルはその回で設計する。

## 再開時の注意

- UI文言は日本語、コード識別子とコミットメッセージは英語。
- 通信エラーを空状態と同じ表示にしない。画面内にエラーを残し、再試行を用意する既存パターンに合わせる。
- 主要操作のタップ領域は最低56px。
- 作業開始前に `git status --short` を確認する。
