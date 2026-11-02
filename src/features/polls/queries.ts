import { supabase } from '../../lib/supabase'
import { toMessage } from '../../lib/errors'

// vote_poll と list_polls が断る理由は、利用者向けに書いてあるのでそのまま出す
const REASONS = ['ログインが必要です', '投票が見つかりません', 'この投票は締め切りました', '選択肢を選んでください', 'この投票には投票済みです']

export function pollMessage(error: unknown): string {
  const message = (error as { message?: string } | null)?.message
  return message && REASONS.includes(message) ? message : toMessage(error)
}

export type PollOption = { id: string; label: string; /** 投票するか締め切るまでは null */ votes: number | null }

export type Poll = {
  id: string
  question: string
  description: string | null
  starts_at: string
  ends_at: string
  /** 自分が選んだ選択肢（まだなら null） */
  my_option: string | null
  /** 投票するか締め切るまでは null */
  total_votes: number | null
  options: PollOption[]
}

/** 始まっている投票。受付中のものが先。 */
export async function fetchPolls(): Promise<Poll[]> {
  const { data, error } = await supabase.rpc('list_polls')
  if (error) throw error
  return (data as Poll[] | null) ?? []
}

/** 投票する。1人1回で、あとから変えられない。 */
export async function votePoll(pollId: string, optionId: string): Promise<void> {
  const { error } = await supabase.rpc('vote_poll', { p_poll_id: pollId, p_option_id: optionId })
  if (error) throw error
}

export function isOpen(poll: Poll, now = Date.now()): boolean {
  return Date.parse(poll.starts_at) <= now && now < Date.parse(poll.ends_at)
}

/** 結果は、投票した人と、締め切った後に見られる（DBも同じ条件で票数を返す） */
export function showsResults(poll: Poll, now = Date.now()): boolean {
  return poll.my_option !== null || !isOpen(poll, now)
}

/** 受付中で、まだ投票していない */
export function awaitsVote(poll: Poll, now = Date.now()): boolean {
  return poll.my_option === null && isOpen(poll, now)
}

/** 締め切りの表示（ends_at は締め切りの翌日0時なので、1分前の日時を出す） */
export function deadlineLabel(poll: Poll): string {
  const last = new Date(Date.parse(poll.ends_at) - 60_000)
  const date = last.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' })
  const time = last.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
  return `${date} ${time}`
}
