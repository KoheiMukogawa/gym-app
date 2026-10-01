import { describe, expect, it } from 'vitest'
import { buildWorkoutMarkdown } from './exportMarkdown'
import type { FeedItem } from '../features/feed/queries'

// UTCでもJSTでも同じ暦日になる時刻を使う（CIはUTC、手元はJST）
const at = (date: string) => `${date}T03:00:00Z`
const item = (date: string, sets: FeedItem['sets']): FeedItem => ({
  workout_id: 'w-' + date, user_id: 'u1', display_name: 'me', performed_at: at(date), sets,
})
const set = (over: Partial<FeedItem['sets'][number]>): FeedItem['sets'][number] => ({
  exercise_id: 'bench', exercise_name: 'ベンチプレス', weight_kg: 80, reps: 5, ...over,
})

describe('buildWorkoutMarkdown', () => {
  const base = { bodyweightLogs: [], from: '2026-09-01', to: '2026-09-30', generatedAt: new Date(at('2026-10-02')) }

  it('summarises the period and lists every set with its memo', () => {
    const md = buildWorkoutMarkdown({
      ...base,
      items: [item('2026-09-10', [
        set({ weight_kg: 60, reps: 10, note: '軽めに' }),
        set({ weight_kg: 80, reps: 5 }),
      ])],
    })
    expect(md).toContain('- 期間: 2026-09-01 〜 2026-09-30')
    expect(md).toContain('- 出力日: 2026-10-02')
    expect(md).toContain('トレーニング日数: 1日 / 総セット数: 2 / 総ボリューム: 1,000 kg')
    expect(md).toContain('### 2026-09-10')
    expect(md).toContain('#### ベンチプレス')
    expect(md).toContain('| 1 | 60.0 kg | 10 | 80.0 kg | 軽めに |')
    expect(md).toContain('| 2 | 80.0 kg | 5 | 90.0 kg |  |')
  })

  it('lists the best weight and e1RM per exercise', () => {
    const md = buildWorkoutMarkdown({
      ...base,
      items: [
        item('2026-09-10', [set({ weight_kg: 80, reps: 8 })]),
        item('2026-09-20', [set({ weight_kg: 90, reps: 1 }), set({ exercise_id: 'squat', exercise_name: 'スクワット', weight_kg: 120, reps: 3 })]),
      ],
    })
    expect(md).toContain('| スクワット | 120.0 kg | 127.1 kg | 1 |')
    expect(md).toContain('| ベンチプレス | 90.0 kg | 99.3 kg | 2 |')
  })

  it('keeps a multi-line memo inside its table cell', () => {
    const md = buildWorkoutMarkdown({
      ...base,
      items: [item('2026-09-10', [set({ note: 'フォーム意識\n最後は補助あり | 右肩が痛い' })])],
    })
    const row = md.split('\n').find((line) => line.startsWith('| 1 |'))!
    expect(row).toContain('フォーム意識 / 最後は補助あり \\| 右肩が痛い')
    // エスケープしていない縦棒だけが列区切り。メモが表を壊していないこと。
    expect(row.split(/(?<!\\)\|/)).toHaveLength(7)
    expect(row).not.toContain('\n')
  })

  it('shows added load and total weight for bodyweight exercises', () => {
    const md = buildWorkoutMarkdown({
      ...base,
      bodyweightLogs: [{ recorded_on: '2026-09-01', bodyweight_kg: 70 }],
      items: [item('2026-09-10', [
        set({ exercise_id: 'chin', exercise_name: 'チンニング', weight_kg: 10, reps: 8, is_bodyweight: true }),
        set({ exercise_id: 'chin', exercise_name: 'チンニング', weight_kg: -20, reps: 10, is_bodyweight: true }),
      ])],
    })
    expect(md).toContain('体重: 70.0 kg')
    expect(md).toContain('| 1 | +10.0 kg（総重量 80.0 kg） | 8 |')
    expect(md).toContain('| 2 | −20.0 kg（総重量 50.0 kg） | 10 |')
  })

  it('says so when the period has no records', () => {
    const md = buildWorkoutMarkdown({ ...base, items: [] })
    expect(md).toContain('この期間に記録はありません。')
    expect(md).toContain('トレーニング日数: 0日')
  })

  it('puts the oldest day first so progress reads in order', () => {
    const md = buildWorkoutMarkdown({
      ...base,
      items: [item('2026-09-20', [set({})]), item('2026-09-10', [set({})])],
    })
    expect(md.indexOf('### 2026-09-10')).toBeLessThan(md.indexOf('### 2026-09-20'))
  })
})
