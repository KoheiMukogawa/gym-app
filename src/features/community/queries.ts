import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { isPhoto } from '../profile/photo'
import type { DotsFormula } from '../../lib/dots'
export type { DotsFormula }
export type Community = { id: string; name: string; owner_id: string; invite_code: string | null }
export type RankMetric = 'total' | 'growth' | 'dots'
export type CommunityProfile = { global_ranking?: boolean; dots_opt_in?: boolean; dots_formula?: DotsFormula | null; user_id: string; display_name: string; icon: string; bio: string }
export type Member = CommunityProfile & {
  total: number | null; growth: number | null; dots: number | null; dots_opt_in: boolean
  lifts: Record<'squat' | 'bench' | 'deadlift', number | null>
  points: { lift: string; date: string; value: number }[]
}
export async function listCommunities(): Promise<Community[]> {
  const { data, error } = await supabase.rpc('community_list')
  if (error) throw error
  return data ?? []
}
export async function ranking(id: string): Promise<Member[]> {
  const { data, error } = await supabase.rpc('community_ranking', { p_id: id })
  if (error) throw error
  return data ?? []
}
export async function manage(action: string, value = '', id: string | null = null): Promise<string> {
  const { data, error } = await supabase.rpc('community_manage', { p_action: action, p_value: value, p_id: id })
  if (error) throw error
  return data
}
export async function profile(userId: string): Promise<CommunityProfile | null> {
  const { data, error } = await supabase.from('community_profiles').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}
export async function saveProfile(value: CommunityProfile) {
  // 写真のアイコンはそのまま残す（ランキングへの参加やコミュニティでの保存で消さない）
  const icon = ['muscle','initials','barbell','target','bolt'].includes(value.icon) || isPhoto(value.icon) ? value.icon : 'muscle'
  const { error } = await supabase.rpc('save_glog_profile', { p_name: value.display_name.trim(), p_icon: icon, p_bio: value.bio.trim(), p_global: value.global_ranking ?? false })
  if (error) throw error
}
export async function saveDotsSettings(optIn: boolean, formula: DotsFormula | null) {
  const { error } = await supabase.rpc('save_dots_settings', { p_opt_in: optIn, p_formula: formula })
  if (error) throw error
}
export type RankLift = keyof Member['lifts']

/** The value a row is ranked by: a single lift's best when `lift` is given under the kg total. */
export function rankValue(member: Member, metric: RankMetric, lift: RankLift | null = null): number | null {
  return metric === 'total' && lift ? member.lifts[lift] : member[metric]
}

export function rankMembers(members: Member[], metric: RankMetric, lift: RankLift | null = null) {
  // DOTS shows only members who agreed to expose a bodyweight-derived score.
  const pool = metric === 'dots' ? members.filter((m) => m.dots_opt_in) : members
  const value = (m: Member) => rankValue(m, metric, lift)
  const sorted = [...pool].sort((a, b) => (value(b) ?? -Infinity) - (value(a) ?? -Infinity) || a.user_id.localeCompare(b.user_id))
  let rank: number | null = null
  return sorted.map((member, index) => {
    if (value(member) === null) rank = null
    else if (index === 0 || value(member) !== value(sorted[index - 1])) rank = index + 1
    return { ...member, rank, value: value(member) }
  })
}

export function formatMetric(value: number | null, metric: RankMetric): string {
  if (value === null) return '—'
  if (metric === 'dots') return value.toFixed(1)
  return `${metric === 'growth' ? '+' : ''}${value} kg`
}

export function communityMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null
  if (['PGRST202', 'PGRST205', '42P01'].includes(e?.code ?? '')) return 'コミュニティ機能の準備中です。データベースの更新が必要です。'
  const known = ['ログインが必要です', '先にプロフィールを保存してください', '招待コードが見つかりません', 'コミュニティに参加していません', '作成者はコミュニティの削除を選んでください', 'この操作はできません', 'プロフィールの入力内容を確認してください', 'DOTSの係数を選んでください']
  return known.includes(e?.message ?? '') ? e!.message! : toMessage(error)
}
