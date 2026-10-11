import { estimateOneRepMax, MAX_E1RM_REPS } from '../../lib/strength'

// Display-only estimate. Never use high-repetition references in strength
// records or rankings. Epley avoids Brzycki's singularity at 37 repetitions.
export function setRm(weight: number | null, reps: number): { value: number; reference: boolean } | null {
  if (weight === null || !Number.isFinite(weight) || weight <= 0 || !Number.isInteger(reps) || reps < 1 || reps > 30) return null
  if (reps <= MAX_E1RM_REPS) {
    const value = estimateOneRepMax(weight, reps)
    return value === null ? null : { value, reference: false }
  }
  const value = Math.round(weight * (1 + reps / 30) * 10) / 10
  return Number.isFinite(value) ? { value, reference: true } : null
}
