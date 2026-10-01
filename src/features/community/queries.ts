import { toMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
export type Community = { id: string; name: string; owner_id: string; invite_code: string | null }
export type CommunityProfile = { user_id: string; display_name: string; icon: string; bio: string }
export type Member = CommunityProfile & {
  total: number | null; growth: number | null
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
  const { error } = await supabase.from('community_profiles').upsert({ ...value, display_name: value.display_name.trim(), bio: value.bio.trim() })
  if (error) throw error
}
export function rankMembers(members: Member[], metric: 'total' | 'growth') {
  const sorted = [...members].sort((a, b) => (b[metric] ?? -Infinity) - (a[metric] ?? -Infinity) || a.user_id.localeCompare(b.user_id))
  let rank: number | null = null
  return sorted.map((member, index) => {
    if (member[metric] === null) rank = null
    else if (index === 0 || member[metric] !== sorted[index - 1][metric]) rank = index + 1
    return { ...member, rank }
  })
}

export function communityMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null
  if (['PGRST202', 'PGRST205', '42P01'].includes(e?.code ?? '')) return 'コミュニティ機能の準備中です。データベースの更新が必要です。'
  const known = ['ログインが必要です', '先にプロフィールを保存してください', '招待コードが見つかりません', 'コミュニティに参加していません', '作成者はコミュニティの削除を選んでください', 'この操作はできません']
  return known.includes(e?.message ?? '') ? e!.message! : toMessage(error)
}
