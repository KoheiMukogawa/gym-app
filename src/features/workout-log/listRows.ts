import { validateSet } from '../../lib/dates'
import { toMessage } from '../../lib/errors'
import type { LoggedSet } from './logReducer'
import { kgToUnitText, unitToKg, type WeightUnit } from './weightUnit'

/** 一覧入力の1行。打ちかけの値も残せるよう、重量と回数は文字列のまま持つ。重量はそのときの単位（kg／lbs）の値 */
export type ListRow = { id: string; weight: string; reps: string; note: string }

/** どの種目の行か。種目を変えたときに、前の種目の行を取り違えないため。 */
export type ListRows = { exerciseId: string; rows: ListRow[] }

export type ListSavePlan = {
  /** 保存が済んだあとの、この種目のセット（行の順） */
  sets: LoggedSet[]
  /** 追加・変更があったセット（upsert する） */
  upserts: LoggedSet[]
  /** 行が消えた保存済みのセット */
  deletes: string[]
  /** 重量か回数の片方だけが入った行 */
  incomplete: string[]
  /** 範囲外などで保存できない行と、その理由 */
  invalid: { id: string; message: string } | null
}

export function newRow(weight = '', reps = '', note = ''): ListRow {
  return { id: crypto.randomUUID(), weight, reps, note }
}

/**
 * この種目の保存済みのセットを行にする。まだ無ければ空の1行から始める。
 * 初期値を入れておくと、種目を開いただけで行っていないセットが保存されてしまうため、空にする。
 */
export function rowsFromSets(sets: LoggedSet[], exerciseId: string, unit: WeightUnit = 'kg'): ListRows {
  const own = sets.filter((s) => s.exercise_id === exerciseId).sort((a, b) => a.set_index - b.set_index)
  const rows = own.length
    ? own.map((s) => ({ id: s.id, weight: kgToUnitText(s.weight_kg, unit), reps: String(s.reps), note: s.note ?? '' }))
    : [newRow()]
  return { exerciseId, rows }
}

/** 前回の記録をそのまま行にする（「前回の記録を写す」） */
export function rowsFromPrevious(sets: LoggedSet[], unit: WeightUnit = 'kg'): ListRow[] {
  return sets.map((s) => newRow(kgToUnitText(s.weight_kg, unit), String(s.reps), s.note ?? ''))
}

function parseNumber(text: string): number {
  // 端末によっては小数点がカンマになる
  return Number(text.trim().replace(',', '.').replace('−', '-'))
}

/**
 * 行と、DBに保存済みのセットを比べて、保存の内容を決める。
 * 両方とも空の行は保存しない。片方だけの行は incomplete に入れ、ほかの行は保存できるようにする。
 */
export function planListSave(rows: ListRow[], saved: LoggedSet[], exerciseId: string, minWeight: number, unit: WeightUnit = 'kg'): ListSavePlan {
  const byId = new Map(saved.map((s) => [s.id, s]))
  const sets: LoggedSet[] = []
  const upserts: LoggedSet[] = []
  const incomplete: string[] = []
  const kept = new Set<string>()
  let invalid: ListSavePlan['invalid'] = null
  let index = 0
  for (const row of rows) {
    const old = byId.get(row.id)
    const hasWeight = row.weight.trim() !== ''
    const hasReps = row.reps.trim() !== ''
    if (!hasWeight && !hasReps) continue
    // 打ちかけ・範囲外の行は消したわけではないので、保存済みの値があれば消さずに残す
    const keepOld = () => {
      if (!old) return
      kept.add(old.id)
      sets.push(old)
    }
    if (!hasWeight || !hasReps) { incomplete.push(row.id); keepOld(); continue }
    // lbsで打たれた値は、kgに直してから範囲を確かめる
    const weight = unitToKg(parseNumber(row.weight), unit)
    const reps = parseNumber(row.reps)
    try { validateSet(weight, reps, minWeight) }
    catch (e) { invalid ??= { id: row.id, message: toMessage(e) }; keepOld(); continue }
    index = Math.max(index, ...sets.map((s) => s.set_index)) + 1
    const note = row.note.trim() ? row.note.trim().slice(0, 200) : null
    const set: LoggedSet = { id: row.id, exercise_id: exerciseId, set_index: index, weight_kg: weight, reps, ...(note ? { note } : {}) }
    sets.push(set)
    kept.add(set.id)
    if (!old || old.weight_kg !== weight || old.reps !== reps || old.set_index !== index || (old.note ?? null) !== note) upserts.push(set)
  }
  const deletes = saved.filter((s) => !kept.has(s.id)).map((s) => s.id)
  return { sets, upserts, deletes, incomplete, invalid }
}
