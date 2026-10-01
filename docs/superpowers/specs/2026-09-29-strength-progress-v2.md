# Strength Progress v2 仕様書

作成日: 2026-09-29

## 1. 目的

既存の「1セットを最小操作で記録する」という価値を維持したまま、Big3
（スクワット・ベンチプレス・デッドリフト）の中長期的な成長を追えるようにする。

v1 は「記録する」ことに最適化されている。v2 は、その記録から追加操作なしで
「強くなっているか」を読み取れるようにする。

## 2. 成功条件

- ワークアウト記録画面の操作数を増やさない
- Big3 の 1RM PR、推定1RM（e1RM）、Total を1画面で確認できる
- 直近30日の推定筋力と歴代PRを分けて表示できる
- Total の期限付き目標をユーザーごとに保存できる
- e1RM は「実際に挙がる重量の保証」ではなく、成長トレンド用の指標として扱う

## 3. Big3 の定義

各ユーザーが既存の種目を squat / bench / deadlift に割り当てる。明示的な設定がない種目だけ、以下のプリセットを標準として使う。

| Lift | 種目 |
|---|---|
| squat | スクワット |
| bench | ベンチプレス |
| deadlift | デッドリフト |

標準は `is_preset = true` かつ `name_normalized` が上記と完全一致する種目で解決する。
明示的な設定は `exercise_id` だけで解決し、名前による推測や標準への自動切替は行わない。

`big3_exercise_mappings` は `user_id`（profiles参照）、`lift_type`（squat / bench / deadlift）、
`exercise_id`（exercises参照）を持つ。主キー `(user_id, lift_type)` により1ユーザー・1区分につき1種目。
同じ種目を複数区分に指定することは禁止しない。本人だけが参照・作成・更新・削除できるRLSを設定する。
設定中の種目削除はRESTRICTで防ぎ、設定の意図を失わないようにする。

Strength画面の「Big3の対象種目」で既存種目を選択すると自動保存し、すべての指標とTotalを再計算する。
「標準を使う」でその区分の明示設定を削除する。未設定のユーザーへのデータ投入は不要。
種目・履歴がない場合は値を「—」とし、元のプリセットの履歴を混ぜない。
変更時も過去のセットやワークアウトは変更しない。

## 4. 指標

### 4.1 1RM PR

reps = 1 のセットだけを対象に、歴代最大重量を採用する。
単なる「最も重いセット」と区別し、実際に記録されたシングルのみを 1RM PR と呼ぶ。

### 4.2 e1RM

1〜10回のセットを対象に Brzycki 式で計算する。

```
e1RM = weight * 36 / (37 - reps)
```

reps = 1 の場合は実重量をそのまま返す。
11回以上は高回数による推定誤差が大きいため e1RM の対象外とする。
表示は0.1kg単位に丸める。

### 4.3 All-time e1RM

対象種目の全履歴から最大 e1RM を採用する。

### 4.4 Current e1RM

直近30日以内のセットから最大 e1RM を採用する。
「過去最高」と「今の強さ」を混同しないため、All-time と分離する。

### 4.5 PR Total

3種目すべてに 1RM PR が存在するときのみ、

```
Squat 1RM PR + Bench 1RM PR + Deadlift 1RM PR
```

を表示する。同日記録であることは要求しないため、競技会の Total とは別物として扱う。

### 4.6 Current Estimated Total

3種目すべてに Current e1RM が存在するときのみ、その合計を表示する。

## 5. 目標管理

strength_goals テーブルを追加する。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | 目標所有者 |
| label | text | 年内、半年、1年など |
| target_date | date | 期限 |
| target_total_kg | numeric(5,1) | Total目標 |
| created_at | timestamptz | |

目標は本人のみ閲覧・作成・削除できる。
他メンバーには公開しない。

初期想定のロードマップ例:
- 年内: 500kg
- 半年: 530kg
- 1年: 570kg
- 卒業まで: 600kg

アプリ側に特定ユーザーの目標値をハードコードせず、Strength画面から登録する。

## 6. 画面

新規に /strength を追加し、ボトムナビに「Big3」を追加する。

表示順:

1. PR Total / Current Estimated Total
2. 次の目標と進捗
3. Squat / Bench / Deadlift カード
   - 1RM PR
   - 直近30日 e1RM
   - All-time e1RM
   - Rep PR（3/5/8/10回）
   - 日ごとの e1RM 推移
4. Big3の対象種目設定（56px以上の選択欄、各カードに集計対象の種目名を表示）
5. 目標一覧
6. 目標追加フォーム

種目カードから既存の /exercises/:exerciseId に遷移できる。

## 7. 記録導線への影響

LogPage は変更しない。
weight_kg / reps / exercise_id / performed_at は既に保存されているため、
Strength画面は既存データから派生値を計算する。

これにより「セット完了」の操作数は v1 と同じまま維持される。

## 8. 今回スコープ外

- RPE / RIR
- 体重・体脂肪
- DOTS / GL Points
- 競技会当日の公式Total
- トレーニングプログラム自動生成
- 疲労スコア
- PR達成時のアニメーション

これらは Strength Dashboard が日常利用されることを確認してから追加する。
