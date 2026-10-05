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
