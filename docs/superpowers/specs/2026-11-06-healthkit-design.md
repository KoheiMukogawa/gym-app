# iPhoneアプリ版のヘルスケア連携（HealthKit）設計

作成日: 2026-11-06（App Storeの審査ガイドライン4.2「Webサイトを包んだだけのアプリ」への対応を兼ねる）

## 目的

ショートカットの設定が複雑で「近日公開」にしていたヘルスケア連携を、iPhoneアプリ版ではボタン1つで使えるようにする。アプリがヘルスケアから体重と体脂肪率を直接読み、体組成の記録に入れる。

## 決めたこと

- **iPhoneアプリ版だけ。** Web版（Safari・ホーム画面のPWA）は今までどおり「近日公開」。`IS_NATIVE`（ビルド時に決まる）で分ける
- **読むだけで、ヘルスケアには書かない。** 読む項目は体重（`bodyMass`）と体脂肪率（`bodyFatPercentage`）だけ
- **DB・Edge Functionは変えない。** アプリが本人のログインのまま `bodyweight_logs` に書く（既存のRLSで本人の行だけ）。ショートカット用のキー・`body-metrics` は使わない
- **日ごとのまとめ方はショートカット連携と同じ。** 端末の日付ごとに最新の体重と、同じ日の最新の体脂肪率。体重のない日は使わない。DBの範囲外（体重20〜300kg、体脂肪率1〜70%）は使わない。小数1桁に丸める（`dailyBodyMetrics`）
- **Glogに記録がある日は上書きしない（keep）。** `upsert(..., { ignoreDuplicates: true })`。手で入れた値が優先される。ヘルスケアの値で直したいときは、その日を消してから読み込む
- **最初の連携と「今すぐ読み込む」は全期間（2000年から）。** あとから設定で読み取りを許可した人の過去の記録も入る
- **自動の読み込み:** 連携中なら、アプリを開いたとき・前に戻ったときに、前回の7日前から読む（遅れて入った測定を拾う）。前回から15分たつまでは読まない。失敗は画面に出さない（`useHealthAutoSync`、AppShell）。記録が増えたら体組成画面を読み直す（`glog-health-synced`）
- **連携中かどうかは端末に保存する**（`glog:health:<userId>`）。iOSは読み取りを許可されたかを教えないため。記録が1件も見つからないときは、設定で許可する場所（設定 → ヘルスケア → データアクセスとデバイス → Glog）を案内する
- **「連携をやめる」は端末の連携を止めるだけ。** 読み込んだ記録は残る。許可の取り消しはiPhoneの設定で行う

## iOS側

- `ios/App/App/HealthPlugin.swift`：Capacitorのプラグイン（`Health`）。`isAvailable`・`requestAuthorization`・`readBodyMetrics({ startDate, endDate })`（ミリ秒）。サンプルを `{ time, value }`（kg・%）でそのまま返す
- `ios/App/App/MainViewController.swift`：`CAPBridgeViewController` の子で、`capacitorDidLoad` でプラグインを登録する。`SceneDelegate` と `Main.storyboard` はこれを使う
- `App.entitlements` に `com.apple.developer.healthkit`。`Info.plist` に `NSHealthShareUsageDescription`（読み取りの理由）
- 無料のApple ID（Personal Team）でもHealthKitの権限つきで署名できることを確認済み（2026-11-06）

## プライバシーポリシー

「ヘルスケア連携を使う場合に受け取る情報」に、iPhoneアプリが許可を得て体重・体脂肪率を読み取り保存すること、書き込まないこと、広告などに使わないことを追記（改定日 2026-11-06）。App Store Connect の「Appのプライバシー」でも健康データを申告する。

## 検証

- 単体: `nativeHealth.test.ts`（日ごとのまとめ方・範囲外・全期間と7日前から・500件ずつ・失敗で状態を変えない）、`NativeHealthSync.test.tsx`（連携・記録なしの案内・使えない端末・今すぐ・やめる・自動の読み込み後の読み直し）、`useHealthAutoSync.test.ts`
- 実機: 許可のシート、全期間の読み込み、ローカル日付、Glogに記録がある日が変わらないこと、開き直したときの自動の読み込み
