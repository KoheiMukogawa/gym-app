# ジム記録

10人以下のグループで使う、ダークテーマの筋トレ記録PWAです。セット記録、グループフィード、個人履歴、種目ごとの重量推移、メンバー履歴に対応しています。

## セットアップ

1. `npm install`
2. [Supabaseセットアップ](docs/setup-supabase.md)に従ってプロジェクトとデータベースを準備する
3. `.env.example` を `.env.local` にコピーし、SupabaseのURLとanon keyを記入する
4. `npm run dev`

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動 |
| `npm run build` | 型検査と本番ビルド |
| `npm run preview` | 本番ビルドをローカルで確認 |
| `npm test` | ユニット・コンポーネントテスト |
| `npm run test:watch` | テストを監視モードで実行 |
| `npm run test:e2e` | 中核導線のE2Eテスト（Playwright） |

テストを動かすには `.env.test.example` を `.env.test` にコピーし、
テスト用 Supabase プロジェクトの URL と anon key を記入します。

## E2Eテスト

1. Supabaseに動作確認用のアカウントを1つ作る
2. `.env.e2e.example` を `.env.e2e` にコピーし、そのアカウントのメールアドレスとパスワードを記入する
3. `set -a && source .env.e2e && set +a && npm run test:e2e`

`.env.e2e` が無い場合、E2Eテストはスキップされます。

## デプロイ

Vercelに `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定してデプロイします。デプロイ後は、Supabase AuthenticationのSite URLにも公開URLを登録してください。`vercel.json` がSPAの各URLへの直接アクセスを `index.html` にフォールバックします。

## 設計資料

- [設計書](docs/superpowers/specs/2026-08-14-gym-app-design.md)
- [実装計画](docs/superpowers/plans/2026-08-14-gym-app.md)
