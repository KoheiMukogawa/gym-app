import { bodyweightOn, type BodyweightLog } from './bodyweight'
import { localDate } from './dates'
import { estimateOneRepMax } from './strength'
import type { FeedItem } from '../features/feed/queries'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
const kg = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : value.toFixed(1))

/** 表の中で改行や縦棒が崩れないようにする。 */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' / ').trim()
}

function dateLabel(iso: string): string {
  const date = new Date(iso)
  return `${localDate(iso)}（${WEEKDAYS[date.getDay()]}）`
}

type Row = { set: FeedItem['sets'][number]; load: number; e1rm: number | null }

/**
 * トレーニング記録をMarkdownにする。AIに貼って読ませることを想定し、
 * 期間の要約・種目ごとのベスト・日ごとの全セット（メモ込み）をこの順で並べる。
 * 自重種目は加重と体重を足した総重量も併記する。
 */
export function buildWorkoutMarkdown(input: {
  items: FeedItem[]
  bodyweightLogs: BodyweightLog[]
  from: string
  to: string
  generatedAt?: Date
}): string {
  const { items, bodyweightLogs, from, to } = input
  const days = [...items].sort((a, b) => a.performed_at.localeCompare(b.performed_at))

  const rowsOf = (item: FeedItem): Row[] => {
    const bodyweight = bodyweightOn(bodyweightLogs, localDate(item.performed_at)) ?? 0
    return item.sets.map((set) => {
      const load = set.weight_kg + (set.is_bodyweight ? bodyweight : 0)
      return { set, load, e1rm: estimateOneRepMax(load, set.reps) }
    })
  }

  const all = days.flatMap(rowsOf)
  const volume = all.reduce((sum, r) => sum + r.load * r.set.reps, 0)
  const trainedDays = new Set(days.map((item) => localDate(item.performed_at))).size

  const lines: string[] = [
    '# Glog トレーニング記録',
    '',
    `- 期間: ${from} 〜 ${to}`,
    `- 出力日: ${localDate(input.generatedAt ?? new Date())}`,
    `- トレーニング日数: ${trainedDays}日 / 総セット数: ${all.length} / 総ボリューム: ${Math.round(volume).toLocaleString('en-US')} kg`,
    '- 重量は実際に挙げた重さ、推定1RMは1〜10回のセットをBrzycki式で換算した参考値です。',
    '',
  ]

  // 種目ごとのベスト
  const bests = new Map<string, { name: string; load: number; e1rm: number | null; sets: number }>()
  for (const { set, load, e1rm } of all) {
    const current = bests.get(set.exercise_id)
    if (!current) bests.set(set.exercise_id, { name: set.exercise_name, load, e1rm, sets: 1 })
    else {
      current.load = Math.max(current.load, load)
      current.e1rm = e1rm === null ? current.e1rm : Math.max(current.e1rm ?? 0, e1rm)
      current.sets += 1
    }
  }
  if (bests.size > 0) {
    lines.push('## 期間内のベスト', '', '| 種目 | 最高重量 | 推定1RMの最高 | セット数 |', '| --- | --- | --- | --- |')
    for (const best of [...bests.values()].sort((a, b) => b.load - a.load)) {
      lines.push(`| ${cell(best.name)} | ${kg(best.load)} kg | ${best.e1rm === null ? '—' : `${kg(best.e1rm)} kg`} | ${best.sets} |`)
    }
    lines.push('')
  }

  lines.push('## 日ごとの記録', '')
  if (days.length === 0) lines.push('この期間に記録はありません。', '')

  for (const item of days) {
    const bodyweight = bodyweightOn(bodyweightLogs, localDate(item.performed_at))
    lines.push(`### ${dateLabel(item.performed_at)}`, '')
    if (bodyweight !== null) lines.push(`体重: ${kg(bodyweight)} kg`, '')
    // 種目ごとにまとめる（記録した順）
    const groups: { id: string; name: string; rows: Row[] }[] = []
    for (const row of rowsOf(item)) {
      const group = groups.find((g) => g.id === row.set.exercise_id)
      if (group) group.rows.push(row)
      else groups.push({ id: row.set.exercise_id, name: row.set.exercise_name, rows: [row] })
    }
    for (const group of groups) {
      lines.push(`#### ${cell(group.name)}`, '', '| # | 重量 | 回数 | 推定1RM | メモ |', '| --- | --- | --- | --- | --- |')
      group.rows.forEach((row, i) => {
        const weight = row.set.is_bodyweight
          ? `${row.set.weight_kg >= 0 ? '+' : '−'}${kg(Math.abs(row.set.weight_kg))} kg（総重量 ${kg(row.load)} kg）`
          : `${kg(row.set.weight_kg)} kg`
        lines.push(`| ${i + 1} | ${weight} | ${row.set.reps} | ${row.e1rm === null ? '—' : `${kg(row.e1rm)} kg`} | ${cell(row.set.note ?? '')} |`)
      })
      lines.push('')
    }
  }
  return lines.join('\n')
}
