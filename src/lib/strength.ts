export const MAX_E1RM_REPS = 10

export type StrengthSet = {
  weight_kg: number
  reps: number
}

export type DatedStrengthSet = StrengthSet & {
  performed_at: string
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Brzycki式による推定1RM。
 * 高回数域は誤差が大きいため、1〜10回だけを成長指標として扱う。
 */
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null
  if (!Number.isInteger(reps) || reps < 1 || reps > MAX_E1RM_REPS) return null
  if (reps === 1) return round1(weightKg)
  return round1((weightKg * 36) / (37 - reps))
}

/**
 * 推定1RMから、その重量で挙げられそうな回数を Brzycki 式の逆算で求める。
 * 1RM = w × 36 / (37 − r) を r について解くと r = 37 − 36w / 1RM。
 * 切り捨てて控えめに見積もる。1RM以上の重量は1回、
 * 10回を超える軽い重量は式の有効範囲外なので提案しない。
 */
export function estimateRepsAt(oneRepMax: number, weightKg: number): number | null {
  if (!Number.isFinite(oneRepMax) || oneRepMax <= 0) return null
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null
  const reps = Math.floor(37 - (36 * weightKg) / oneRepMax)
  if (reps > MAX_E1RM_REPS) return null
  return Math.max(1, reps)
}

export function bestSingle(sets: StrengthSet[]): number | null {
  const singles = sets.filter((set) => set.reps === 1).map((set) => set.weight_kg)
  return singles.length === 0 ? null : Math.max(...singles)
}

export function bestEstimatedOneRepMax(sets: StrengthSet[]): number | null {
  const estimates = sets
    .map((set) => estimateOneRepMax(set.weight_kg, set.reps))
    .filter((value): value is number => value !== null)

  return estimates.length === 0 ? null : Math.max(...estimates)
}

export function currentEstimatedOneRepMax(
  sets: DatedStrengthSet[],
  now = new Date(),
  windowDays = 30,
): number | null {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - windowDays)

  return bestEstimatedOneRepMax(
    sets.filter((set) => {
      const performed = new Date(set.performed_at)
      return !Number.isNaN(performed.getTime()) && performed >= cutoff && performed <= now
    }),
  )
}

export function strengthTotal(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null
  return round1((values as number[]).reduce((sum, value) => sum + value, 0))
}


export function repPersonalBest(sets: StrengthSet[], targetReps: number): number | null {
  if (!Number.isInteger(targetReps) || targetReps < 1) return null
  const candidates = sets
    .filter((set) => set.reps >= targetReps)
    .map((set) => set.weight_kg)
  return candidates.length === 0 ? null : Math.max(...candidates)
}

export function estimatedOneRepMaxByDate(
  sets: DatedStrengthSet[],
): { date: string; e1rm: number }[] {
  const byDate = new Map<string, number>()

  for (const set of sets) {
    const estimate = estimateOneRepMax(set.weight_kg, set.reps)
    if (estimate === null) continue

    const date = set.performed_at.slice(0, 10)
    const current = byDate.get(date)
    if (current === undefined || estimate > current) {
      byDate.set(date, estimate)
    }
  }

  return [...byDate.entries()]
    .map(([date, e1rm]) => ({ date, e1rm }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
