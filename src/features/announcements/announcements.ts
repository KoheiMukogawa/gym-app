/**
 * 新しい機能のお知らせ。運営が知ってほしい機能を公開するとき、その機能と同じコミットで1件足す。
 * レイアウトの変更などでは足さない。publishedAt より前に登録した人にだけ、次回の起動時に出る。
 */
export type Announcement = {
  id: string
  /** ISO 8601、日本時間（+09:00）。公開するデプロイの直前の時刻にする */
  publishedAt: string
  title: string
  body: string
  link?: { to: string; label: string }
}

export const ANNOUNCEMENTS: Announcement[] = [
  // 2026-10-13: 10/5以降の変更のうち、利用者が知っておくとよいものをまとめて知らせる（上ほど先に出る）
  {
    id: 'weight-dial-1kg',
    publishedAt: '2026-10-13T15:53:05+09:00',
    title: '重量ダイヤルが1kg刻みにも対応しました',
    body: 'ダンベルやマシンなど、1kg単位で記録している種目は、ダイヤルが自動で1kg刻みになります。初めて1kg単位で入れるときは、ダイヤル中央の数字をタップすると直接入力できます。ダイヤルの上の＋−ボタンはなくし、記録画面では「ダイヤルを隠す」で入力欄をたためるようにしました。',
  },
  {
    id: 'history-edit-dial',
    publishedAt: '2026-10-13T15:53:04+09:00',
    title: '履歴の編集も、記録画面と同じ操作に',
    body: '履歴から日付を選んで編集するとき、記録画面と同じダイヤルで重量と回数を選べます。各セットの推定1RMも表示され、種目のカードの中から直接セットを追加できます。11〜30回のセットの推定1RMは参考値として表示します。',
    link: { to: '/history', label: '履歴を開く' },
  },
  {
    id: 'feedback-replies',
    publishedAt: '2026-10-13T15:53:03+09:00',
    title: 'ご意見に運営から返信が届くようになりました',
    body: '送った意見に、対応状況（検討中・対応中・対応済みなど）と返信が届きます。返信があると右上のアイコンに印が付き、ご意見の画面で確認できます。',
    link: { to: '/feedback', label: 'ご意見の画面へ' },
  },
  {
    id: 'zero-rep-sets',
    publishedAt: '2026-10-13T15:53:02+09:00',
    title: 'つぶれたセットも記録できます',
    body: '回数を0回にすると、挙げきれなかったセットも記録として残せます。0回のセットは推定1RM・BIG3・ランキングには使いません。',
  },
  {
    id: 'chart-pinch-zoom',
    publishedAt: '2026-10-13T15:53:01+09:00',
    title: 'グラフを2本指で拡大できます',
    body: '種目ごとの推定1RMのグラフは、2本指で拡大・縮小し、拡大中は1本指で左右に動かせます。ダブルタップか「全期間」で全体に戻ります。',
    link: { to: '/big3', label: 'BIG3を開く' },
  },
  {
    id: 'feedback-box',
    publishedAt: '2026-10-05T18:10:00+09:00',
    title: 'ご意見・不具合を送れるようになりました',
    body: '右上のアイコンのメニューから、気になる点や要望を運営に送れます。運営だけが読みます。',
    link: { to: '/feedback', label: 'ご意見を送る' },
  },
]

/** 基準時刻より後に公開され、今より前のお知らせ（新しい順）。基準時刻が読めなければ出さない。 */
export function unreadAnnouncements(items: Announcement[], seenUntil: string, now = new Date()): Announcement[] {
  const baseline = Date.parse(seenUntil)
  if (Number.isNaN(baseline)) return []
  return items
    .filter((a) => { const at = Date.parse(a.publishedAt); return at > baseline && at <= now.getTime() })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
}
