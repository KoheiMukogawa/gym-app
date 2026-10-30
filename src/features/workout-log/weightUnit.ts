import { useCallback, useEffect, useState } from 'react'

/** 一覧入力の重さの単位。DBにはいつもkgで保存し、表示と入力だけを変える。 */
export type WeightUnit = 'kg' | 'lbs'

const KG_PER_LB = 0.45359237
const EVENT = 'glog-weight-unit'

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** kgの値を、その単位の表示用の文字にする（lbsは小数1桁に丸める） */
export function kgToUnitText(kg: number, unit: WeightUnit): string {
  return String(unit === 'kg' ? kg : round1(kg / KG_PER_LB))
}

/** その単位で打たれた値をkgにする。numeric(5,1) の列に入るよう小数1桁に丸める */
export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : round1(value * KG_PER_LB)
}

/** 打ちかけの文字も含め、行の重さを別の単位に書き換える。数字として読めない文字はそのまま残す */
export function convertWeightText(text: string, from: WeightUnit, to: WeightUnit): string {
  if (from === to || text.trim() === '') return text
  const value = Number(text.trim().replace(',', '.'))
  return Number.isFinite(value) ? kgToUnitText(unitToKg(value, from), to) : text
}

function keyFor(userId: string): string {
  return `glog:weight-unit:${userId}`
}

function load(userId: string | null): WeightUnit {
  if (!userId) return 'kg'
  try {
    return localStorage.getItem(keyFor(userId)) === 'lbs' ? 'lbs' : 'kg'
  } catch {
    return 'kg'
  }
}

/** 端末ごとに覚える重さの単位 */
export function useWeightUnit(userId: string | null): [WeightUnit, (unit: WeightUnit) => void] {
  const [unit, setUnitState] = useState<WeightUnit>(() => load(userId))
  useEffect(() => {
    setUnitState(load(userId))
    const update = (e: Event) => {
      const detail = (e as CustomEvent<{ userId: string; unit: WeightUnit }>).detail
      if (detail.userId === userId) setUnitState(detail.unit)
    }
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [userId])
  const setUnit = useCallback((next: WeightUnit) => {
    setUnitState(next)
    if (!userId) return
    try { localStorage.setItem(keyFor(userId), next) } catch { /* 保存できなくても開いている間は切り替わる */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId, unit: next } }))
  }, [userId])
  return [unit, setUnit]
}
