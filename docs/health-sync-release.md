# Health同期 公開準備と切り戻し

2026-10-02。現在はローカル実装・検証の段階。本番のmigration、Function、アプリ公開、push・mergeは未実施です。具体的な変更と検証結果を提示して承認を得てから適用します。

## 適用対象

- DB: `supabase/migrations/20261001192350_health_sync.sql`。非公開 `health_sync_private` schemaとハッシュのみのtokens表、認証済み本人の発行／状態／失効RPC、service_role専用の原子的取込RPC。
- Function: `supabase/functions/body-metrics/`。POSTの独自Bearer認証、入力・実読取サイズ制限、許可origin。JWT gateway設定は `supabase/config.toml` の `verify_jwt=false`。
- クライアント: 接続パネル、URL/新規トークンの手動コピー、手順、全期間・再読み込み・段階一覧。既存のpublishable keyとSupabase URLだけを利用。service keyはフロントの環境変数・バンドルへ入れない。
- 対象プロジェクト: `lombbjpiftuqkacasmzg`。公開origin: `https://gym-app-ruddy-nine.vercel.app`。

## 承認後の順序

1. 適用前に現在のmigration履歴と差分を確認する。既存 `bodyweight_logs.body_fat_pct`、本人限定RLS、`extensions.pgcrypto` のSHA256/random bytesが存在することを確認。pgcrypto配置は親タスクが本番で読み取り確認済み。旧migrationをまとめて再適用しない。
2. レビュー済みの上記Health migrationを、その名前と内容で本番へ1回適用する。既存の体重行は変更しない。ロール・関数EXECUTE、private表RLSと直接アクセス不可を確認する。
3. Supabase Edge runtimeの組み込み環境 `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を使う。サービスキーをクライアントへ移さない。追加設定名 `HEALTH_SYNC_ALLOWED_ORIGIN` は上記origin（末尾スラッシュなし）。未設定時も同じ値が既定。CLIで組み込みSUPABASE_* secretを新規設定しようとしない。
4. Function名を明示して公開する。以下はCLI helpで確認したコマンド例（この準備では実行していない）。

```sh
npx --yes supabase secrets set HEALTH_SYNC_ALLOWED_ORIGIN=https://gym-app-ruddy-nine.vercel.app --project-ref lombbjpiftuqkacasmzg
npx --yes supabase functions deploy body-metrics --project-ref lombbjpiftuqkacasmzg --no-verify-jwt --use-api
```

`--no-verify-jwt` は生の個人トークンをFunction自身で照合するための設定。POSTのBearer認証は必須です。`--use-api` はDockerを使わないserver-side bundleです。他Functionのdeploy/pruneを行わない。

5. 本番PostgREST/gatewayで下記追加チェックを行う。トークンやHealth本文を共有ログへ残さない。本人アカウントへの合成記録は入れない。SQLの合成fixtureは隔離環境でrollbackして確認する。
6. チェックが通った後にアプリ公開を承認済みのGit/Vercel手順で行う。本番実機確認は本人が選んだ少数のHealth測定で行い、日付・単位・再送・失効・再発行を確認する。実機操作や本人記録の送信は別途本人の明示許可を得る。

## リリース時に残る確認

- PGliteは同時セッションとPostgREST/gatewayを再現しない。初回発行同士、発行/失効と取込の競合を独立したPostgreSQLセッションで実行し、1ユーザー1トークン、旧トークン無効、原子性・ロック順序を確認する。
- anonは管理RPCを実行不可、authenticatedは本人の管理だけ、取込はservice_roleだけ。private schemaはData APIのexposed schemaへ追加しない。private表をクライアントから読めず、状態にtoken/hashがないことを実PostgRESTで確認。
- Functionは無Bearer/失効/旧トークンで401、allowlisted-origin OPTIONS、POST成功件数、入力/サイズエラー、generic内部エラーを確認。HTTP失敗を成功履歴へ記録しない。
- iPhone: 手順の実際のアクション名、Healthの読み取り権限、kg/%、同日最新値、ローカルyyyy-MM-dd、月境界・翌日00:00除外、体重だけの日、空期間POSTなし、親子エラー停止、日次自動実行を確認。
- 初回1日 → 過去月 → keep再送 → 明示overwrite（欠損fat保持）→ 失効401 → 再発行（旧キー401/新キー成功）。送信後のGlog再読み込み・過去年の実グラフ／一覧も確認。
- 本番エンドポイント・PostgREST・同時セッション・iPhoneの結果は、ローカルのモックE2E/SQL結果と分けて報告する。

## 停止と切り戻し（障害時、実行前に適用内容を確認）

本人1人の停止はアプリの「連携を失効」。既存記録は残る。再発行も旧トークンを即時無効にする。

全体停止はまずFunctionのみを削除する（CLI helpで確認済み）。bodyweight_logsを削除・変更しない。

```sh
npx --yes supabase functions delete body-metrics --project-ref lombbjpiftuqkacasmzg
```

必要ならDBの特権管理経路で取込EXECUTEを止め、既存トークンをすべて失効する。以下はレビュー用の停止SQLであり、この準備では実行していません。

```sql
begin;
revoke execute on function public.health_sync_import(text,jsonb,text) from service_role;
revoke execute on function health_sync_private.import_records(text,jsonb,text) from service_role;
update health_sync_private.tokens set token_hash=null;
commit;
```

アプリは直前の検証済みリリースへ戻せる。取込済み体組成行、本人の手入力、既存RLSはそのまま保持する。停止中に発行されたトークンを含め、再開は権限の再付与をレビューした新migrationとFunction再公開後に必要な人が再発行する。再開を元migrationの無条件再実行で行わない。

完全削除が必要な場合も別のレビュー済みmigrationで公開4RPC（issue/status/revoke/import）、非公開helperとtokens表を明示的に削除する。schemaへ無差別CASCADEを使わない。記録表は削除しない。

公式資料: [Function secrets](https://supabase.com/docs/guides/functions/secrets)、[Function auth](https://supabase.com/docs/guides/functions/auth)。本人向け操作は [Shortcut設定手順](health-sync-shortcut.md)。
