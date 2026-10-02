# Agent instructions

このリポジトリの引き継ぎメモと作業ルールは `CLAUDE.md` にある。作業を始める前に必ず読み、同じルールに従う。

- UI文言は日本語、コード識別子とコミットメッセージは英語
- 作業開始前に `git status --short` を確認する
- 本番DB（Supabase）への書き込み、`master` へのpush（Vercelが自動デプロイする）は、本人の明示的な許可を得てから行う
- 単体テストは `npx vitest run --maxWorkers=1`、SQLテストは `node supabase/tests/sql-runtime/run-sql.mjs`
