# iPhoneヘルスケア同期 設計

作成日: 2026-10-02

## 目的と導線

iPhoneショートカットで指定期間のヘルスケア体重を読み取り、Glogの既存 `bodyweight_logs` に取り込む。初回の過去記録取り込みと、その後の日次オートメーションを同じAPIで扱う。PWAから直接HealthKitを読む機能やAppleのXMLファイル取り込みは今回の対象外。

本人の1日1行という主キーと既存RLSを維持する。既存の体組成画面・Markdown出力・自重種目の計算に同期記録がそのまま反映される。

## ショートカットの契約

開始日・終了日を入力し、月単位の小さな期間ごとに処理する。終了日はローカル日の翌日開始を排他的上限にする。体重をkg、体脂肪率を%で取得し、サンプルの日時をiPhoneのローカル日付 `yyyy-MM-dd` にする。UTCへ変換しない。日ごとの最新体重と、その同じ日の最新体脂肪率を採用する。体重のない日は送らない。体脂肪率だけの別日の記録を補完しない。

```json
{
  "records": [
    { "date": "2023-01-02", "weight_kg": 70.2, "body_fat_pct": 15.4 },
    { "date": "2023-01-03", "weight_kg": 70.1 }
  ],
  "mode": "keep"
}
```

POST `/functions/v1/body-metrics`、`Content-Type: application/json`、`Authorization: Bearer <個人トークン>`。1リクエスト1〜500日、本文256KiB以下。mode省略時はkeep。dateは実在する厳密なYYYY-MM-DD、weightは有限のJSON数値20〜300、fatは任意の有限数値1〜70またはnull。同日重複・不正なフィールド・不正な型・範囲外はリクエスト全体を拒否する。保存は既存列に合わせて小数1桁に丸める。

keepは既存の日を変更せず、未登録日だけ挿入する。overwriteは明示的に選んだ場合だけ体重を更新し、fatがnull/省略なら既存fatを保つ。同期による削除は提供しない。SQLで全件を原子的に処理し、再送しても1日1行を保つ。成功応答は `{ inserted, updated, skipped }`。updatedは既存日へのoverwrite適用件数で、値が同じでも件数に含める。履歴最終成功時刻と件数はコミット時だけ更新する。

エラーは400不正入力、401無効/失効トークン、405メソッド、413サイズ、415Content-Type、500内部失敗。返信とログにトークン・Health本文・SQL内部情報を含めない。ショートカットは失敗した期間を表示して停止し、修正後同じ期間をkeepで再送できる。日次実行は最近の数日をkeepで送り、遅れて入った測定を拾う。測定訂正を反映したいときだけoverwriteを選ぶ。

## 認証とDB境界

ログイン中の本人だけが、1ユーザー1個の体組成書込み専用トークンを発行/再発行/失効できる。暗号学的乱数256bitを使い、DBにはSHA-256ハッシュだけ保存する。生トークンは発行応答の一度だけ表示し、Reactメモリ以外に保存しない。URL、localStorage、ログへ出さない。再発行で旧トークンは直ちに無効になる。

非公開schemaのトークン表はRLS有効、クライアントへのテーブル権限なし。状態RPCはenabled/issued_at/last_synced_at/last_synced_countのみ返し、ハッシュも既存トークンも取得できない。管理RPCは `auth.uid()` 必須で他人のuser_idを入力に取らない。

特権処理は非公開schemaのSECURITY DEFINER関数に置き、空search_pathと完全修飾名を使う。公開RPCは小さなSECURITY INVOKERラッパーとし、PUBLIC/anon/authenticated/service_roleのEXECUTEを明示的に整理する。管理経路はauthenticatedのみ、取り込み経路はservice_roleのみ。非公開helperのEXECUTEもラッパー実行に必要な最小限に限定し、管理helper内部でもauth.uidを検証する。取り込み関数はハッシュから所有者を求め、所有者指定を受け付けない。初回発行も含めた発行/失効はuser_id由来のadvisory transaction lockで直列化する。取り込みはトークン行をロックし、失効/再発行と取り込みの競合順序を確定する。

Edge Functionだけがサービスキーを環境変数で使う。`verify_jwt=false` は個人Bearerトークンを独自認証するために必要であり、認証省略ではない。Edgeで入力を検証し、SQLでも権限/件数/型/範囲/重複を検証する。本文上限はContent-Lengthだけに頼らず実際の読取バイトにも適用する。OPTIONSの許可元はアプリoriginを明示し、POSTには必ず認証を要求する。トークン照合失敗は一律の応答にする。

## アプリ画面と長期間表示

体組成ページに折り畳み「ヘルスケア連携」を追加する。接続状態、最終同期、発行/再発行/失効、URLと新しいトークンのコピー、日本語手順を表示する。クリップボード失敗時は選択して手動コピーできる。再発行/失効は効果を説明して確認する。操作は56px以上、エラーは画面内に残し再試行を用意する。ログアウト/ユーザー変更時に生トークンを消す。

「記録を再読み込み」でショートカット実行後のデータと接続状態を更新する。既存1ヶ月/3ヶ月/1年に「全期間」を加え、古い年の記録を読めるようにする。全期間の横軸には年も含める。大量の一覧は段階表示して画面の負荷を抑える。

現在のfetchBodyweightLogsはページングなしでSupabaseの既定1000件制限に当たるため、user_id絞り込みと日付昇順を保ったrange取得を繰り返し、すべての記録を返す。途中エラーで部分結果を成功扱いしない。withinPeriodのsetMonthは月末で翌月へ繰り上がるため、対象月の日数にクランプする（3/31の1ヶ月前は2/28または2/29）。

## 検証と公開条件

SQLのrollbackテストで所有者分離、匿名拒否、直接表/取込RPC拒否、発行/ローテーション/失効、無効トークン、keep/overwrite、fat保持、丸め、重複/境界、不正バッチ全体ロールバック、最終成功状態を確認する。ローカルにCLI/Docker/Postgresがないため、pgcrypto付きPGliteの隔離ランタイムにauth.uid、anon/authenticated/service_roleとRLSを再現して実行する。PGliteの限界と本番Supabaseで追加確認すべき権限を報告する。

Edge検証、UI/クエリ/日付単体テスト、モックE2E、単一workerの既存テストとbuildを実施する。実機では過去月と日次同期、kg/%、ローカル日付、再送、失効を確認する。本番migration/Function公開は検証結果と具体的な変更を提示して承認後に実施する。

## 公式資料

- Apple: [ショートカットの検索・フィルタ](https://support.apple.com/ja-jp/guide/shortcuts/apdbdab3433f/ios)、[APIリクエスト](https://support.apple.com/ja-jp/guide/shortcuts/apd58d46713f/ios)
- Supabase: [Edge Function認証](https://supabase.com/docs/guides/functions/auth)
- PGlite: [拡張とpgcrypto](https://pglite.dev/extensions/)
