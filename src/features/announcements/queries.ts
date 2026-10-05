import { supabase } from '../../lib/supabase'

/** この時刻より後のお知らせが未読。既読の記録がなければ登録日時。 */
export async function fetchSeenUntil(): Promise<string | null> {
  const { data, error } = await supabase.rpc('announcements_seen_until')
  if (error) throw error
  return typeof data === 'string' ? data : null
}

/** 今の時刻までのお知らせを見たことにする（時刻はサーバーが決める）。 */
export async function markAnnouncementsSeen(): Promise<void> {
  const { error } = await supabase.rpc('mark_announcements_seen')
  if (error) throw error
}
