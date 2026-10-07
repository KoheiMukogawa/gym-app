export type DotsFormula = 'male' | 'female'

// Same polynomial and bodyweight bounds as public.dots_points (OpenPowerlifting's coefficients),
// so the public calculator and the ranking give the same score for the same numbers.
const COEFFICIENTS: Record<DotsFormula, [number, number, number, number, number]> = {
  male: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  female: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706],
}
const BODYWEIGHT_BOUNDS: Record<DotsFormula, [number, number]> = { male: [40, 210], female: [40, 150] }

/** DOTS = 挙上重量 × 500 ÷ 体重の4次多項式。体重は係数の有効範囲に収めてから使う。 */
export function dotsScore(totalKg: number, bodyweightKg: number, formula: DotsFormula): number | null {
  if (!Number.isFinite(totalKg) || totalKg <= 0) return null
  if (!Number.isFinite(bodyweightKg) || bodyweightKg <= 0) return null
  const [min, max] = BODYWEIGHT_BOUNDS[formula]
  const b = Math.min(Math.max(bodyweightKg, min), max)
  const [a, c1, c2, c3, c4] = COEFFICIENTS[formula]
  return (totalKg * 500) / (a + c1 * b + c2 * b ** 2 + c3 * b ** 3 + c4 * b ** 4)
}

/** Glog独自の目安。DOTSに公式のレベル区分はない。下限（以上）と表示用の範囲・名前。 */
export const DOTS_LEVELS = [
  [0, '200未満', '初心者'],
  [200, '200〜300未満', '初級'],
  [300, '300〜350未満', '中級'],
  [350, '350〜400未満', '中級上位'],
  [400, '400〜450未満', '上級'],
  [450, '450〜500未満', '非常に高いレベル'],
  [500, '500以上', 'エリート級'],
] as const

export function dotsLevel(score: number): (typeof DOTS_LEVELS)[number] {
  return [...DOTS_LEVELS].reverse().find(([min]) => score >= min) ?? DOTS_LEVELS[0]
}
