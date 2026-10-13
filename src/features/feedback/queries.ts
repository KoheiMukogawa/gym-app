import { supabase } from '../../lib/supabase'
import { adminMessage } from '../../lib/errors'

export const FEEDBACK_MAX = 2000

export const REPLY_MAX = 1000
export type FeedbackStatus = 'considering' | 'in_progress' | 'done' | 'declined'
export const STATUS_LABELS: Record<FeedbackStatus, string> = { considering: '検討中', in_progress: '対応中', done: '対応済み', declined: '見送り' }

type Answer = { status: FeedbackStatus | null; reply: string | null; replied_at: string | null }
export type MyFeedback = { id: string; body: string; created_at: string; read_at: string | null } & Answer & { reply_seen_at: string | null }
export type AdminFeedback = Omit<MyFeedback, 'reply_seen_at'> & { user_agent: string | null; display_name: string }

const MY_COLUMNS = 'id, body, created_at, read_at, status, reply, replied_at, reply_seen_at'

/** 運営の返信（状態の変更を含む）を、本人がまだ見ていない意見。 */
export function hasUnseenReply(item: MyFeedback): boolean {
  return item.replied_at !== null && (item.reply_seen_at === null || item.reply_seen_at < item.replied_at)
}

/** 本人が、ここまでの返信を見たことを記録する。 */
export async function markRepliesSeen(): Promise<void> {
  const { error } = await supabase.rpc('mark_my_feedback_replies_seen')
  if (error) throw error
}

/** 管理者が状態と返信を保存する。返り値は返信の日時（内容が変わらなければ前の日時）。 */
export async function replyFeedback(id: string, status: FeedbackStatus, reply: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_reply_feedback', { p_id: id, p_status: status, p_reply: reply })
  if (error) throw error
  return data as string
}

/** 自分が送った意見（新しい順、50件まで）。RLSで本人の分だけが返る。 */
export async function fetchMyFeedback(): Promise<MyFeedback[]> {
  const { data, error } = await supabase.from('feedback').select(MY_COLUMNS)
    .order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return (data ?? []) as MyFeedback[]
}

/** 意見を送る。不具合の調査のため、ブラウザの情報を添える。 */
export async function sendFeedback(body: string): Promise<MyFeedback> {
  const { data, error } = await supabase.from('feedback')
    .insert({ body: body.trim(), user_agent: navigator.userAgent.slice(0, 500) })
    .select(MY_COLUMNS).single()
  if (error) throw error
  return data as MyFeedback
}

/** 管理者かどうか。admins は本人の行しか読めない。 */
export async function fetchIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('admins').select('user_id').eq('user_id', userId).limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}

export async function fetchUnreadFeedbackCount(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_unread_feedback_count')
  if (error) throw error
  return Number(data ?? 0)
}

export async function fetchAllFeedback(): Promise<AdminFeedback[]> {
  const { data, error } = await supabase.rpc('admin_list_feedback')
  if (error) throw error
  return (data ?? []) as AdminFeedback[]
}

export async function markFeedbackRead(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_mark_feedback_read', { p_id: id })
  if (error) throw error
}

export const feedbackMessage = adminMessage

/** 送信日時を「10/5 9:30」の形で表す（日本時間）。 */
export function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
