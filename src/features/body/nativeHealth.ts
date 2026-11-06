import { supabase } from '../../lib/supabase'
import { localDate } from '../../lib/dates'
import type { BodyweightLog } from '../../lib/bodyweight'

// iPhoneアプリ版だけのヘルスケア連携（設計 docs/superpowers/specs/2026-11-06-healthkit-design.md）。
// アプリの中の部品（ios/App/App/HealthPlugin.swift）がヘルスケアのサンプルを返し、ここで日ごとにまとめて
// 本人の bodyweight_logs に書く。Glogに記録がある日は上書きしない（ショートカット連携の keep と同じ）。

export type HealthSample = { time: number; value: number }
type HealthPluginApi = {
  isAvailable(): Promise<{ available: boolean }>
  requestAuthorization(): Promise<void>
  readBodyMetrics(options: { startDate: number; endDate: number }): Promise<{ weights: HealthSample[]; fats: HealthSample[] }>
}

let plugin: Promise<HealthPluginApi> | null = null
/**
 * Web版のバンドルに @capacitor/core を入れないよう、使うときに読み込む。
 * Capacitorの部品はどの名前にも関数を返すので、そのまま Promise で返すと then を持つものとして扱われ、
 * 返事のない呼び出しで止まる。使う3つだけを持つふつうのオブジェクトに包んで返す。
 */
export function healthPlugin(): Promise<HealthPluginApi> {
  plugin ??= import('@capacitor/core').then(({ registerPlugin }) => {
    const native = registerPlugin<HealthPluginApi>('Health')
    return {
      isAvailable: () => native.isAvailable(),
      requestAuthorization: () => native.requestAuthorization(),
      readBodyMetrics: (options) => native.readBodyMetrics(options),
    }
  })
  return plugin
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * 日ごと（端末の日付）に、最新の体重と、同じ日の最新の体脂肪率を使う。体重のない日は使わない。
 * DBの範囲（体重20〜300kg、体脂肪率1〜70%）の外の値は使わない（体脂肪率だけ外れたら体重だけ使う）。
 */
export function dailyBodyMetrics(weights: HealthSample[], fats: HealthSample[]): BodyweightLog[] {
  const latest = (samples: HealthSample[], ok: (value: number) => boolean) => {
    const byDay = new Map<string, HealthSample>()
    for (const s of samples) {
      if (!Number.isFinite(s.value) || !ok(round1(s.value))) continue
      const day = localDate(new Date(s.time))
      const seen = byDay.get(day)
      if (!seen || s.time >= seen.time) byDay.set(day, s)
    }
    return byDay
  }
  const weightByDay = latest(weights, (v) => v >= 20 && v <= 300)
  const fatByDay = latest(fats, (v) => v >= 1 && v <= 70)
  return [...weightByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, w]) => {
    const fat = fatByDay.get(day)
    return { recorded_on: day, bodyweight_kg: round1(w.value), body_fat_pct: fat ? round1(fat.value) : null }
  })
}

// ---- 端末に残す連携の状態（iOSは読み取りの許可を教えないため、「連携した」ことはこちらで覚える） ----

export type HealthState = { enabled: boolean; lastSyncedAt: string | null }
const key = (userId: string) => `glog:health:${userId}`

export function readHealthState(userId: string): HealthState {
  try {
    const value = JSON.parse(localStorage.getItem(key(userId)) ?? 'null') as Partial<HealthState> | null
    return { enabled: value?.enabled === true, lastSyncedAt: typeof value?.lastSyncedAt === 'string' ? value.lastSyncedAt : null }
  } catch {
    return { enabled: false, lastSyncedAt: null }
  }
}

export function writeHealthState(userId: string, state: HealthState) {
  try { localStorage.setItem(key(userId), JSON.stringify(state)) } catch { /* 保存できない端末でも連携はその場で動く */ }
}

export const HEALTH_SYNCED_EVENT = 'glog-health-synced'
export type SyncResult = { found: number; inserted: number }

const FULL_HISTORY_START = new Date(2000, 0, 1).getTime()
/** 自動の読み込みでは、前回より少し前から読む（ヘルスケアに遅れて入った測定を拾うため）。 */
const RECENT_OVERLAP_MS = 7 * 24 * 60 * 60 * 1000
const CHUNK = 500

/**
 * ヘルスケアの記録を読み、Glogにまだない日だけ加える。since を省くと全期間を読む。
 * 終わったら端末の状態（連携中・最終の読み込み）を更新し、画面に知らせる。
 */
export async function syncFromHealth(userId: string, since: string | null = null): Promise<SyncResult> {
  const health = await healthPlugin()
  const start = since ? Math.max(FULL_HISTORY_START, new Date(since).getTime() - RECENT_OVERLAP_MS) : FULL_HISTORY_START
  const { weights, fats } = await health.readBodyMetrics({ startDate: start, endDate: Date.now() + 60_000 })
  const rows = dailyBodyMetrics(weights ?? [], fats ?? [])
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((row) => ({ user_id: userId, ...row }))
    const { data, error } = await supabase.from('bodyweight_logs')
      .upsert(chunk, { onConflict: 'user_id,recorded_on', ignoreDuplicates: true }).select('recorded_on')
    if (error) throw error
    inserted += (data ?? []).length
  }
  writeHealthState(userId, { enabled: true, lastSyncedAt: new Date().toISOString() })
  const result = { found: rows.length, inserted }
  window.dispatchEvent(new CustomEvent<SyncResult>(HEALTH_SYNCED_EVENT, { detail: result }))
  return result
}
