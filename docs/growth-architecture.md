# Glog Growth Architecture v1

作成: 2026-10-07 / 対象コミット: `9a526ff` の次

Glogを「検索・SNSから人が来て、記録を続け、そのまま将来のiOSアプリへ移れる」プロダクトにするための設計と、実装の優先順位。
判断の順序は User Value → Retention → Distribution → Measurement → Native Readiness → Developer Simplicity。

---

## 1. Current Architecture（現状）

| 項目 | 現状 |
| --- | --- |
| フロントエンド | Vite 8 + React 19 + TypeScript + Tailwind 4。React Router 7（`BrowserRouter`）のSPA |
| レンダリング | **CSRのみ**。`index.html` の `<div id="root">` は空で、本文はJSが描画する |
| ホスティング | Vercel（静的配信）。`master` へのpushで自動デプロイ。全パスを `index.html` にリライト |
| ドメイン | `gym-app-ruddy-nine.vercel.app`（ほかに `gym-app-gym-app10.vercel.app` でも同じ内容が出る） |
| バックエンド | Supabase（Postgres + RLS + RPC関数 + Edge Function `body-metrics`）。独自APIサーバーはない |
| 認証 | Supabase Auth のメール + パスワード。Cloudflare Turnstile。メール確認は現在オフ |
| DBアクセス | ブラウザから `supabase-js` で直接。呼び出しは各機能の `queries.ts` に集約（`.tsx` から直接呼ぶのは SessionProvider・GlobalRanking・ProfilePage の3か所だけ） |
| ビジネスロジック | 推定1RM（Brzycki、1〜10回）はTS（`src/lib/strength.ts`）とSQLの両方、DOTS・ランキング・退会・集計はSQL関数 |
| PWA | `vite-plugin-pwa`。manifest・アイコン・standalone・アプリシェルのプリキャッシュあり。APIはキャッシュしない。古いビルドの自動回復あり（`staleBuild.ts`） |
| 公開ページ | `/`（未ログイン時だけ紹介ページ）、`/login`、`/signup`、`/terms`、`/privacy`。それ以外の未ログインアクセスは `/login` へ |
| SEO | `index.html` に固定の title / description / OG。canonical・robots.txt・sitemap.xml・構造化データなし。OG画像はアイコン（512px） |
| 計測 | 外部のアクセス解析なし。管理者用 `admin_usage_stats()` がDBから「記録した人数・ワークアウト数・セット数・登録数」を集計 |
| エラー監視 | なし（`ScreenErrorBoundary` が画面内で案内するのみ） |
| 共有 | なし。ワークアウト・プロフィールに公開URLはない（ランキングはログイン中の利用者だけに見える） |
| テスト | 単体（Vitest）、SQL（PGlite）、モックE2E（Playwright）、CI（GitHub Actions） |

**良い点（そのまま活かす）**

- Supabaseは「Webとネイティブが同じBackendを使う」構成をすでに満たしている。RLSで本人の行だけに限定し、複雑な処理はSQL関数（RPC）にあるので、iOSは `supabase-swift` から同じテーブル・同じRPCを呼べばよい。**独自APIサーバーは今は不要**
- データモデルがネイティブ移行に向いている: UUIDの主キー、`performed_at`（実施日時）と `created_at`（登録日時）の区別、`auth.users` に紐づくアカウント、退会の連鎖削除
- 製品の主要指標はすでにDBにある。ワークアウト・セットは記録そのものなので、イベント計測なしで「Weekly Active Lifters」やリテンションを正確に出せる

## 2. Problems（問題点・技術的負債）

| # | 問題 | 影響 | 分類 |
| --- | --- | --- | --- |
| 1 | **公開領域がほぼ無い**。紹介ページ以外はすべてログイン必須 | 検索・AI検索からの入口がない | 今すぐ |
| 2 | **CSRのみで本文がHTMLにない** | GPTBot・ClaudeBot・PerplexityBotなど多くのAIクローラーはJSを実行しない。Googleも描画は後回し | 今すぐ |
| 3 | **独自ドメインがない**（`*.vercel.app`、しかも2つ） | 後から移すと被リンク・インデックス・共有URL・Universal Links（AASA）をすべて移し替えることになる。SEOを始める前に決めるほど安い | 今すぐ（本人の判断） |
| 4 | canonical・sitemap・robots・構造化データなし | 重複URL、発見されにくい | 今すぐ |
| 5 | 登録前の行動（どこから来て、何を使って登録したか）が分からない | 計算ツール→登録の転換率が測れない | 今すぐ |
| 6 | リテンション（D1/D7/D30）と利用頻度がない | ネイティブ化の判断材料がない | 今すぐ |
| 7 | 共有の仕組みがない | 紹介ループが回らない | ユーザー獲得 |
| 8 | エラー監視がない | 本番の不具合に気づけるのは本人の報告だけ | ユーザー数が増えたら |
| 9 | 推定1RMの式がTSとSQLに重複 | 片方だけ変えると数値がずれる（テストで固定済み） | 現状維持でよい |
| 10 | OG画像がアイコン | SNSでの見え方が弱い | 共有と一緒に |
| 11 | アプリ領域のURL（`/exercises/:uuid`、`/history/:uuid`）は本人専用 | 公開用の `/exercises/bench-press` とは衝突する。公開URLは別の名前空間にする | 設計で回避 |

**今はやらなくていいもの**: SSRフレームワーク（Next.js等）への移行、独自APIサーバー・マイクロサービス、オフライン記録（同期の衝突処理が重い）、Push通知（iOSのWeb Pushはホーム画面追加が前提で到達率が低い）、ブログの量産、統計のない「パーセンタイル」表示、認証方式の追加。

## 3. Target Architecture（目指す形）

```
                ┌──────────── 公開領域（Discovery / SEO / Conversion）──────────┐
検索・AI・SNS → │ /  /calculators/*  /strength-standards/*（将来） /s/:token（将来）│
                │ 静的HTML（ビルド時プリレンダー）＋ 同じReactで動く               │
                └───────────────┬──────────────────────────────────────────────┘
                                │ 「この記録をGlogに残す」→ /signup（入口を記録）
                ┌───────────────▼──────── アプリ領域（Speed / Logging / Retention）┐
                │ /  /log  /history  /exercises/:id  /big3  /ranking  /body ...   │
                │ CSR + PWA。速さ最優先。SEO要素は持ち込まない                     │
                └───────────────┬──────────────────────────────────────────────┘
       Web (supabase-js)        │        iOS (supabase-swift)  ← 将来
                                ▼
          Supabase: Auth / Postgres + RLS / RPC（集計・ランキング・退会）/ Edge Functions
```

原則:

1. **公開領域とアプリ領域をURLとコードで分ける。** 公開ページは `src/features/tools/` に置き、Supabaseをimportしない（ビルド時に描画できるように）。アプリ領域の記録UXには一切手を入れない
2. **SSRサーバーは持たない。** 公開ページは数十枚規模までビルド時プリレンダーで足りる。数百〜数千枚（種目×体重×性別の基準ページなど）になったらVercelのISR/Edgeを検討する
3. **Backendは引き続きSupabase。** 「ネイティブでも必要になるロジック」はSQL関数かEdge Functionに置き、Web側の `.tsx` に新しいビジネスルールを増やさない
4. **製品イベントはDBが正。** クライアントのイベント送信は「登録前の行動」だけ

## 4. SEO / GEO Strategy

**狙うクエリ**: ブランド名ではなく、すでに検索されている疑問。計算・判定の結果がその場で出るページを優先し、記事の量産はしない。

| クエリの型 | 例 | 受けるページ | 状態 |
| --- | --- | --- | --- |
| 計算 | 1RM 計算、DOTS 計算、DOTS スコア 目安 | `/calculators/1rm`、`/calculators/dots` | **v1で公開** |
| 判定 | ベンチプレス 100kg レベル、体重比、スクワット 平均 | `/strength-standards/bench-press` など | 根拠データを決めてから（後述） |
| 記録アプリ | 筋トレ 記録 アプリ、gym log | `/`（紹介ページ） | 既存。プリレンダーはP2 |
| 英語 | 1RM calculator、strength standards | `/en/...` | 日本語で手応えが出てから（P3） |

**AI検索（ChatGPT Search / AI Overviews / Copilot / Perplexity）に引用されやすくする要素** — v1の計算ページで実装済み:

- JSなしで読めるHTML（ビルド時プリレンダー）。h1 → 結果 → 計算方法 → FAQ の明確な見出し構造
- **式・例・出典をページ本文に書く**（Brzycki 1993、OpenPowerliftingの係数）。数値の根拠が本文にあるページは引用されやすい
- 適用範囲と限界を明記（「11回以上は計算しない」「DOTSのレベルは公式ではない」）。曖昧さのない短い答えがFAQにある
- 最終更新日を本文（`<time>`）とsitemapの `lastmod` の両方に
- title・description・canonical・OG・`robots.txt`・`sitemap.xml`
- 構造化データは**見えている内容と一致するものだけ**: `BreadcrumbList`（全ページ）、`WebApplication`（ツールのページ）、`FAQPage`（FAQを表示しているページだけ）。テストで「FAQを表示していないページにFAQPageを出さない」を固定。※GoogleはFAQのリッチリザルトを2023年に政府・医療サイトに限定したが、マークアップ自体は有効で、AIの読み取りにも役立つ
- 内部リンク: 紹介ページのフッター → 計算ツール、計算ツール同士、パンくず

使わないもの: `Article`（記事ではない）、`Dataset`（Glog独自の統計を公開するまで）、`SoftwareApplication` の評価（レビューがない）、`llms.txt`（主要なAI検索が参照する根拠がまだ弱い。公開ページが増えたら再検討）。

**本人の作業（コード外）**: 独自ドメインの取得 → Google Search Console・Bing Webmaster Tools に登録してsitemapを送信。Bingへの登録はCopilot・ChatGPT Searchの発見にも効く。

## 5. Public Page Architecture（URL設計）

| URL | 役割 | 公開 | 状態 |
| --- | --- | --- | --- |
| `/` | 未ログイン: 紹介ページ / ログイン中: ホーム | ○ | 既存 |
| `/calculators` | 計算ツールの一覧 | ○ | **v1** |
| `/calculators/1rm` | 1RM計算（推定1RM・％換算表・体重比） | ○ | **v1** |
| `/calculators/dots` | DOTS計算（スコア・Glog独自の目安） | ○ | **v1** |
| `/strength-standards`、`/strength-standards/{bench-press,squat,deadlift}` | 種目別の体重比の目安・Glog Strength Standards | ○ | P1〜P2 |
| `/lifts/{slug}` | 種目の公開解説（必要になれば） | ○ | P2。`/exercises/` はアプリが `:uuid` で使用中なので使わない |
| `/s/{token}` | 本人が明示的に共有したワークアウト・PRのカード | ○（noindex） | P1 |
| `/u/{handle}` | 本人が公開を選んだプロフィール | ○（任意） | P3 |
| `/login`、`/signup`、`/terms`、`/privacy` | 認証・規約 | ○ | 既存 |
| `/log`、`/history/*`、`/exercises/:id`、`/big3`、`/ranking`、`/body`、`/profile`、`/export`、`/admin/*` | 本人専用のアプリ | × | 既存。URLは変えない |

- 公開の共有URLはアプリの内部ID（`/history/:workoutId`）を使わず、**推測できない別トークン**（`/s/:token`）にする。共有の取り消し＝トークン削除で、元の記録は残る
- Universal Linksは「パスの集合」で設定するので、`/s/*`・`/log`・`/history/*` のように名前空間が分かれていればAASAに素直に書ける（14章）
- 公開ページを追加する手順: `src/features/tools/pages.ts` に1件 → コンポーネント → `PublicPages.tsx` → `vercel.json` にリライト。ビルド（`scripts/prerender.mjs`）とテストが、リライトの書き忘れを検出して失敗する

**実装の仕組み（v1）**

1. `vite build`（通常のアプリ）→ `vite build --ssr src/prerender.tsx`（公開ページだけをNode向けに）→ `node scripts/prerender.mjs`
2. `prerender.mjs` が `dist/index.html` を元に、ページごとの `<head>` と本文入りの `dist/calculators/1rm.html` などを書き出し、`sitemap.xml`・`robots.txt` も生成（URLは `VITE_SITE_URL`、未設定なら現在のvercel.app）
3. `vercel.json` で `/calculators/1rm` → `/calculators/1rm.html` にリライト（全体のSPAリライトより前）。**`index.html` は変えない**ので、アプリの画面に公開ページがちらつくことはない
4. ブラウザでは `main.tsx` が公開ページのJSを先に読み込んでから描画するので、スピナーを挟まずに入れ替わる。JSが届く前に入力された数値も引き継ぐ（遅い回線を想定したテストあり）

## 6. Analytics / Event Taxonomy

### 方針: 「DBが正、クライアントイベントは登録前だけ」

| 種類 | どこで測るか | 理由 |
| --- | --- | --- |
| 記録・継続（workout, set, PR, リテンション） | **DB（SQL関数）** | 記録そのものが事実。広告ブロッカーやイベントの取りこぼしの影響を受けない。iOS版の記録も自動で同じ指標に入る |
| 登録前（訪問・計算ツール・登録開始） | クライアントの `track()` | DBには残らないため |
| 登録の入口 | **登録時のメタデータ**（`signup_source` 等） | 外部ツールなしで「計算ツール→登録」を数えられる |

### イベント一覧

| イベント | 定義 | v1の取り方 |
| --- | --- | --- |
| `landing_view` | 未ログインで紹介ページを表示 | `track()`（送信先は未接続） |
| `calculator_used` | 計算ツールで最初の結果が出た（1ページ表示につき1回）。`calculator: 1rm \| dots` | `track()` |
| `signup_started` | 新規登録フォームを送信 | `track()` |
| `signup_completed` | 登録APIが成功 | `track()` ＋ `auth.users.raw_user_meta_data.signup_source / signup_path / signup_referrer` |
| `workout_started` | その日の最初のセットでワークアウトが作られた | DB: `workouts.created_at` |
| `workout_completed` | ワークアウトに1セット以上ある日（Glogは「終了」ボタンが必須ではないため、日単位で扱う） | DB: `workouts` × `workout_sets` |
| `exercise_added` | 自作種目の作成 | DB: `exercises.created_by` |
| `set_logged` | セットの保存 | DB: `workout_sets.created_at` |
| `pr_achieved` | その種目の推定1RM（1〜10回）が過去最高を更新 | DB: SQLのウィンドウ関数で後から算出（P1。保存はしない） |
| `share_opened` / `share_completed` | 共有シートを開いた / 共有APIが成功 | `track()`（型だけ用意。共有の実装時に送る） |
| `returning_user` | 前回の記録日から1日以上空けて記録 | DB: 記録日の差分 |
| `app_install_prompt_viewed` | ホーム画面追加の案内を表示 | `track()`（型だけ用意。案内の実装時に送る） |

`src/lib/analytics.ts` の `setAnalyticsSink()` に送信先を1つ渡せば全イベントがつながる。開発中はコンソールに出る。

**送信先の候補（本人の判断）**: ①まずはなし（DBの集計で足りる。今の6人規模では最もシンプル）、②Vercel Web Analytics（ページビューと参照元。カスタムイベントは有料プラン）、③PostHog（無料枠が大きく、ファネル・リテンションも見られる。外部送信になるのでプライバシーポリシーの更新が必要）。**推奨は①のまま、公開ページへの流入が見え始めたら②を追加**。

### 指標（`/admin/usage`）

| 指標 | 定義 | 出どころ |
| --- | --- | --- |
| **Weekly Active Lifters（北極星）** | 直近7日に1回以上ワークアウトを記録した人（テスト用 `@example.com` を除く。未来日時は除く） | `admin_growth_stats()` **新規** |
| 週2日以上記録した人 | 直近7日で記録した日（日本時間）が2日以上 | 新規 |
| WAU / MAU | Weekly Active Lifters ÷ 直近30日に記録した人 | 新規（画面で計算） |
| 1人あたりのワークアウト・セット | 直近7日の合計 ÷ Weekly Active Lifters | 新規 |
| D1 / D7 / D30 リテンション | 登録日（日本時間）を0日目として、D1=1日目、D7=7〜13日目、D30=30〜36日目に記録した人の割合。期間を過ぎた人だけを分母にする | 新規 |
| 登録のきっかけ | 直近90日の登録者を `signup_source`（最初に開いた公開ページ or `utm_source`）で集計 | 新規 |
| 登録者数・週ごとの記録人数・セット数・新規登録 | 既存どおり | `admin_usage_stats()` |
| 計算ツール→登録の転換率 | `signup_source = calc-*` の登録数 ÷ `calculator_used` | 分母は送信先をつないでから |

## 7. Growth Loop

```
検索 / AI検索 / SNS
  → 計算ツール（その場で結果。根拠つき）               … v1
  → 「無料でGlogに記録する」（入口を記録して /signup）   … v1
  → 登録 → 最初のセット（既存のオンボーディング）
  → 推定1RM・グラフ・PRで成長が見える                   … 既存
  → NEW PR のShare Card（画像）を共有                   … P1
  → 共有URL /s/:token → 公開ページ → 登録                … P1
```

**Share / Referral の設計（P1、次に作るもの）**

- PRを記録した直後、または種目詳細から「共有」。カードは種目・重量×回数・推定1RM・（任意）体重比/DOTS・Glogのロゴ。**体重・メモ・名前は既定で入れない**
- 画像はブラウザのCanvasで生成し、`navigator.share({ files })` で共有（iOS Safari対応）。非対応の環境では画像の保存とリンクのコピー
- 画像だけの共有ならDB変更は不要。**共有URL（`/s/:token`）を作るときだけ** `shared_cards`（token, user_id, スナップショットのjsonb, created_at, revoked_at）を追加する。中身は共有した時点のスナップショットで、元の記録とは連動させない（後から記録を直しても公開内容は変わらない＝意図しない公開を防ぐ）。anonはtokenを指定した1件だけ読めるRPCを用意し、一覧はできないようにする
- `/s/:token` のOG画像はEdge Function（または `@vercel/og`）で生成。`noindex` にして検索結果には出さない
- 紹介コード・特典は、共有の数字が出てから考える

## 8. PWA Strategy

すでに「ジムでWebアプリとして快適に使える」水準にある（manifest、standalone、アイコン、アプリシェルのプリキャッシュ、古いビルドからの自動回復）。追加は最小限にする。

| 項目 | 方針 |
| --- | --- |
| ホーム画面追加の案内 | P1。iOS Safariは `beforeinstallprompt` がないので、**3回目の記録の後**などに一度だけ手順のシートを出す（`app_install_prompt_viewed`）。記録中は出さない |
| オフライン | P2。まずは「通信が切れても入力中のセットを失わない」（下書き保存は既存）。完全なオフライン記録はネイティブで |
| Push通知 | P3（ネイティブで）。iOSのWeb Pushはホーム画面追加が必須で、到達できる人が限られる |
| キャッシュ | 現状維持。APIはキャッシュしない（古い記録を成功に見せない） |
| 公開ページとSW | SWは公開ページにもアプリのシェルを返すが、同じReactが描画するので問題ない（検索エンジンにはSWがないので静的HTMLが届く） |

## 9. Native App Migration Strategy

**作り方**: SwiftUI + `supabase-swift`。BackendはそのままSupabase。

| 引き継ぐもの | 方法 |
| --- | --- |
| アカウント | 同じSupabase Auth。メール+パスワードはそのまま使える |
| トレーニング履歴・PR・種目・設定・統計 | 同じテーブルとRLS・RPC。PRと推定1RMは記録から計算するので移行作業はない |
| ランキング・DOTS | 既存のRPC（`global_ranking` 等）をそのまま呼ぶ |
| 体組成 | 既存のテーブル。HealthKitはネイティブから直接書けるので、ショートカット経由（`body-metrics`）より簡単になる |

**ネイティブ化の前に済ませておくこと**

- 新しい業務ルールはSQL関数に置く（例: PR判定を作るならSQLで）。TS側にしかないもの（回数の提案 `suggestReps`、前回の記録の選び方）は、ネイティブ化の時点でSwiftに移植するか、RPCにするかを決める。今すぐ動かす必要はない
- ネイティブで使えないWeb専用の前提を増やさない（例: localStorageにしかない重要データ。下書き以外は置いていない）
- 型: `npx supabase gen types` 相当のスキーマを正として、Web・iOSで同じ定義から型を作る

## 10. Native Readiness Checklist

| | 項目 | 状態 |
| --- | --- | --- |
| ✅ | Backendがクライアントから独立（Supabase、RLS、RPC） | 済 |
| ✅ | 全テーブルにRLS、本人の行だけ | 済（`rls_initplan` で検証） |
| ✅ | 主キーがUUID、実施日時と登録日時が分かれている | 済 |
| ✅ | 退会で関連データが消える（App Store必須要件） | 済（`delete_my_account`） |
| ✅ | 集計・ランキングがSQL関数 | 済 |
| ✅ | 製品指標がDBから出る（クライアント非依存） | **v1で追加** |
| ⬜ | 独自ドメイン（Universal LinksのAASAを置く場所） | 本人の判断待ち |
| ⬜ | 共有URLが内部IDと別の名前空間 | 設計済み（`/s/:token`）、未実装 |
| ⬜ | Sign in with Apple | ネイティブ化の時。Google等のソーシャルログインを入れる場合、App Store審査ガイドライン4.8によりSign in with Appleなど同等の選択肢が必要。メール+パスワードだけなら必須ではない |
| ⬜ | ディープリンクのパス一覧の確定 | 14章 |
| ⬜ | エラー監視 | P2 |
| ⬜ | TSだけにあるロジック（回数提案など）の扱い | ネイティブ化の時 |

## 11. Native App Trigger Metrics（ネイティブ化の判断材料）

どれも絶対条件ではない。`/admin/usage` の数値で次を見る。

| 観点 | 目安 | 見る場所 |
| --- | --- | --- |
| 規模 | MAU 300〜1,000+、Weekly Active Lifters 100+ | 直近30日に記録した人 / Weekly Active Lifters |
| 継続 | D30 20〜30%以上 | D30リテンション |
| 頻度 | アクティブな人の多くが週2日以上 | 週2日以上記録した人 ÷ Weekly Active Lifters |
| ネイティブ機能の需要 | Push・Health・Widget・Watch・オフラインの要望 | ご意見（`feedback`）。P2で選択式の項目を足すと数えやすい |
| Health連携 | ショートカット連携の利用者数 | `health_sync_private.tokens` の件数（P2で集計に追加） |

## 12. Implementation Roadmap

### P0 — 今やらないと作り直しになる

| 項目 | 状態 |
| --- | --- |
| 公開領域とアプリ領域の分離（URL・コード） | **済（v1）** |
| 公開ページのビルド時プリレンダー（JSなしで本文が読める） | **済（v1）** |
| canonical / OG / sitemap.xml / robots.txt / 構造化データ、URLの一元化（`VITE_SITE_URL`） | **済（v1）** |
| 製品指標をDBから出す（Weekly Active Lifters・リテンション・頻度） | **済（v1、本番適用 2026-10-07）** |
| 登録の入口の記録（first-touch → 登録メタデータ） | **済（v1）**、プライバシーポリシーに追記 |
| 独自ドメイン | **当面なし（費用を抑える判断）**。流入が出てきたら取得し、`VITE_SITE_URL` を設定して再ビルド、vercel.appから301 |

### P1 — ユーザー獲得・計測

1. Share Card（画像生成 + Web Share API）。DB変更なし
2. 種目別の体重比の目安ページ `/strength-standards/*`（下の「根拠」の方針で）
3. 共有URL `/s/:token`（migrationあり）とOG画像
4. ホーム画面追加の案内（3回目の記録の後に一度）
5. PR達成の集計（SQL）を `/admin/usage` に
6. Search Console / Bing Webmaster への登録（本人）

### P2 — ユーザー数が増えてから

- アクセス解析の送信先（Vercel Web Analytics → 必要ならPostHog）
- エラー監視（Sentry等、無料枠）
- 紹介ページのプリレンダー（ログイン中の人にちらつかない仕組みが必要）
- Glog Strength Standards（13章）、`/lifts/*` の種目解説
- ご意見に「ほしい機能」の選択肢（Push・Widget・Watch・オフライン）

### P3 — ネイティブ化の時

- SwiftUIアプリ、Sign in with Apple、AASA（`/.well-known/apple-app-site-association`）、HealthKit・Widget・Watch・Push
- 英語版の公開ページ、公開プロフィール `/u/:handle`

### 今から3か月の計画

| 期間 | 作るもの | 終わりの状態 |
| --- | --- | --- |
| 1か月目（10月） | 独自ドメイン → Search Console/Bing登録 → v1公開・migration適用。Share Card（画像のみ） | 計算ツールがインデックスされ、PRを画像で共有できる。毎週 `/admin/usage` を見る習慣 |
| 2か月目（11月） | `/strength-standards/*`（BIG3の3枚）と、計算結果からの内部リンク。ホーム画面追加の案内。PR達成の集計 | 「ベンチ 100kg レベル」型のクエリの受け皿がある。流入と登録のきっかけが見える |
| 3か月目（12月） | 共有URL `/s/:token` + OG画像。アクセス解析の送信先を決める。数値を見て、強い入口のページを増やすか、継続施策に寄せるか判断 | 共有→登録のループが計測できる。ネイティブ化の判断材料（D30・頻度）が3か月分たまる |

**Strength Standards の根拠の方針**: 体重比は計算なので出せる。「初級・中級…」の区分は、出典のある既存の基準（例: 文献や公開データセット）を引用元つきで載せるか、Glog独自の目安と明記するかのどちらか。**データの裏づけのないパーセンタイルは出さない**。

## 13. Future Ideas

- **Glog Strength Standards**: 種目 × 性別 × 体重階級ごとの推定1RM・体重比の50/75/90パーセンタイル。公開条件: ①各セルのサンプルが十分（例: 30人以上）②本人が統計への利用を拒否していない（同意の列を足す）③テスト用アカウントを除外 ④個人を特定できない粒度（体重は5kg刻み）。データモデルは今のままで計算できる（`workout_sets` × `bodyweight_logs` × DOTSの係数＝性別の代わりに使える）。性別は今は「DOTSの係数」でしか持っていないので、統計に使うなら本人の任意入力の列を検討する。集計はマテリアライズドビューで夜間に更新し、公開ページにはその結果だけを埋め込む（`Dataset` の構造化データはこの時に使う）
- AIによる分析: すでにあるMarkdown出力を、Glog内で要約・提案するところまで（費用と精度を見て）
- コミュニティの招待リンクを共有カードと同じ仕組みで（`/s/:token` の種類違い）
- 計算ツールの結果を、登録直後の最初の記録にそのまま入れる（`?from=calc-1rm` に重量・回数を載せる）

---

## 付録: 今回の変更（v1）

- 公開ページ: `src/features/tools/`（`pages.ts` がページ一覧・メタデータ・構造化データの唯一の定義）
- プリレンダー: `src/prerender.tsx`、`scripts/prerender.mjs`、`vercel.json` のリライト、`vite.config.ts`（SSRビルドではPWAを外す）
- 計算: `src/lib/dots.ts`（SQLの `dots_points` と同じ値になることをテストで固定）。推定1RMは既存の `src/lib/strength.ts`
- 計測: `src/lib/analytics.ts`（送信先なし）、`src/lib/attribution.ts`（最初の公開ページ → 登録メタデータ）
- DB: `supabase/migrations/20261007120000_growth_stats.sql`（`admin_growth_stats()`、管理者だけ、集計値のみ）と `supabase/tests/growth_stats.sql`。2026-10-07に本番へ適用済み。関数がない環境でも `/admin/usage` の既存部分は動き、成長の指標の欄だけがエラーと再試行を出す
- ロールバック: 公開ページは `vercel.json` のリライトと `PUBLIC_PAGES` を消せば元に戻る。DBは `drop function public.admin_growth_stats();`（読み取り専用の関数なのでデータへの影響はない）
