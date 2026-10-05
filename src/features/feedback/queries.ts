import { supabase } from '../../lib/supabase'
import { adminMessage } from '../../lib/errors'

export const FEEDBACK_MAX = 2000

export type MyFeedback = { id: string; body: string; created_at: string; read_at: string | null }
export type AdminFeedback = MyFeedback & { user_agent: string | null; display_name: string }

const MY_COLUMNS = 'id, body, created_at, read_at'

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
