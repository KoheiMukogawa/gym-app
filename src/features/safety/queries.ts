import { supabase } from '../../lib/supabase'
import { toMessage } from '../../lib/errors'

// 通報・ブロック（設計 docs/superpowers/specs/2026-11-06-report-block-design.md）。
// どちらもDBの関数だけが書く。通報できるのは、自分の画面に出ている人だけ。

export const REPORT_REASONS = {
  name: '不適切な名前',
  photo: '不適切な画像',
  bio: '不適切なひとこと',
  impersonation: 'なりすまし',
  other: 'その他',
} as const
export type ReportReason = keyof typeof REPORT_REASONS
export const REPORT_DETAIL_MAX = 500

// DBの関数が利用者向けに書いた理由は、そのまま見せる
const REASONS = ['ログインが必要です', 'この操作はできません', '理由を選んでください', '詳細は500文字までです', '通報の上限に達しました。時間をおいてお試しください']

export function safetyMessage(error: unknown): string {
  const e = (error ?? {}) as { code?: string; message?: string }
  if (e.code === 'PGRST202' || e.code === 'PGRST205') return 'この機能の準備中です。時間をおいてお試しください。'
  return REASONS.includes(e.message ?? '') ? e.message! : toMessage(error)
}

export async function reportUser(target: string, reason: ReportReason, detail: string): Promise<void> {
  const { error } = await supabase.rpc('report_user', { p_target: target, p_reason: reason, p_detail: detail.trim() })
  if (error) throw error
}

export async function blockUser(target: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_target: target })
  if (error) throw error
}

export async function unblockUser(target: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_target: target })
  if (error) throw error
}

export type BlockedUser = { user_id: string; display_name: string; icon: string; blocked_at: string }

export async function listBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('list_blocked_users')
  if (error) throw error
  return data ?? []
}

// ---- 管理者 ----

export type ReportResolution = 'dismissed' | 'reset' | 'removed'
export type ReportAction = 'dismiss' | 'reset' | 'remove'
export const RESOLUTION_LABELS: Record<ReportResolution, string> = { dismissed: '問題なし', reset: 'プロフィールを初期化', removed: 'ランキングから外した' }

export type AdminReport = {
  id: string
  created_at: string
  reason: ReportReason
  detail: string
  /** 通報した時点の名前・アイコン・ひとこと */
  snapshot: { display_name?: string; icon?: string; bio?: string }
  resolved_at: string | null
  resolution: ReportResolution | null
  reporter_name: string | null
  target_id: string
  target_name: string | null
  target_icon: string | null
  target_bio: string | null
  target_global: boolean | null
}

export async function fetchReports(): Promise<AdminReport[]> {
  const { data, error } = await supabase.rpc('admin_list_reports')
  if (error) throw error
  return data ?? []
}

export async function fetchOpenReportCount(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_open_report_count')
  if (error) throw error
  return Number(data ?? 0)
}

/** 相手ごとに、未対応の通報をまとめて対応済みにする。 */
export async function resolveReport(target: string, action: ReportAction): Promise<number> {
  const { data, error } = await supabase.rpc('admin_resolve_report', { p_target: target, p_action: action })
  if (error) throw error
  return Number(data ?? 0)
}
