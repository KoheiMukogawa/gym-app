import { InputError } from './errors'

export function localDate(value: Date | string = new Date()): string {
  return new Date(value).toLocaleDateString('sv-SE')
}

export function workoutDateISO(date: string, original?: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new InputError('日付を選んでください')
  const result = new Date(date + 'T12:00:00')
  if (!Number.isFinite(result.getTime()) || localDate(result) !== date || date > localDate()) {
    throw new InputError('今日以前の正しい日付を選んでください')
  }
  if (original) {
    const time = new Date(original)
    result.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds())
  }
  return result.toISOString()
}

/** minWeight は自重種目でアシスト（マイナス）を許すときに、体重のマイナス値を渡す。 */
export function validateSet(weight: number, reps: number, minWeight = 0): void {
  if (!Number.isFinite(weight) || weight < minWeight || weight > 9999.9 || Math.abs(weight * 10 - Math.round(weight * 10)) > 1e-7) {
    throw new InputError(minWeight < 0
      ? `加重は${minWeight}〜9999.9kg、小数1桁までで入力してください（アシストはマイナス）`
      : '重量は0〜9999.9kg、小数1桁までで入力してください')
  }
  if (!Number.isInteger(reps) || reps < 0 || reps > 9999) throw new InputError('回数は0〜9999の整数で入力してください')
}
