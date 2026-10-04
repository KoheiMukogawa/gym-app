import { supabase } from '../../lib/supabase'
import { toMessage } from '../../lib/errors'

export const CONFIRM_TEXT = '退会する'

export type DeletionSummary = {
  workout_days: number
  set_count: number
  body_log_count: number
  custom_exercise_count: number
  health_sync_connected: boolean
  owned_communities: { name: string; other_member_count: number }[]
}

export async function fetchDeletionSummary(): Promise<DeletionSummary> {
  const { data, error } = await supabase.rpc('account_deletion_summary')
  if (error) throw error
  return data as DeletionSummary
}

export async function deleteMyAccount(confirm: string): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account', { p_confirm: confirm })
  if (error) throw error
}

// Reasons raised by the database functions are written for the user and shown as they are.
const KNOWN = ['ログインが必要です', '確認の文字が一致しません', 'ほかの利用者の記録が使っている種目があるため退会できません']

export function accountMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null
  if (e?.code === 'PGRST202') return '退会機能の準備中です。時間をおいてお試しください。'
  return KNOWN.includes(e?.message ?? '') ? e!.message! : toMessage(error)
}
