import { demoBodyLogs, demoMembers, demoWorkouts, DEMO_ME } from '../features/auth/landingDemoData'
import { landingStrengthGoal, landingStrengthSnapshot } from '../features/auth/landingStrengthSample'
import { DEMO_EXERCISES, DEMO_TODAY, DEMO_USER_ID } from '../lib/demoMode'
import { buildStrengthSnapshot, type Big3ExerciseMapping, type StrengthExercise, type StrengthSet } from '../features/strength/strengthSnapshot'
import type { MuscleGroup } from '../lib/types'

// 見本のアプリ（/demo）が読む表。紹介ページの記録（ある利用者の 2026-10-11 までの実データ、
// 本人の許可済み）をアプリのDBと同じ形に並べ直す。体組成・ほかのメンバー・目標はサンプル。
export type Row = Record<string, unknown>

const GROUPS: Record<string, MuscleGroup> = {
  ベンチプレス: 'chest', インクラインBプレス: 'chest', スクワット: 'legs', ポーズSQ: 'legs', テンポSQ: 'legs',
  デッドリフト: 'back', プーリーロウ: 'back', ミリタリープレス: 'shoulders', ワンハンドプリーチャー: 'arms',
  ポーズBP: 'chest', ポーズDL: 'back', チンニング: 'back', ワンハンドスカルクラッシャー: 'arms', ライングエクステンション: 'arms',
}
// 体重＋加重で数える種目
const BODYWEIGHT = new Set(['チンニング'])
const PRESETS = new Set(['ベンチプレス', 'スクワット', 'デッドリフト'])
const LIFT_EXERCISES = { squat: 'スクワット', bench: 'ベンチプレス', deadlift: 'デッドリフト' } as const

const BIG3_IDS: Record<string, string> = { スクワット: DEMO_EXERCISES.squat, ベンチプレス: DEMO_EXERCISES.bench, デッドリフト: DEMO_EXERCISES.deadlift }
const exerciseId = (name: string) => BIG3_IDS[name] ?? `demo-ex-${[...name].map((c) => c.codePointAt(0)!.toString(36)).join('')}`

/** 実データより前（2024-12〜2026-03）は、記録した推定1RMの推移だけが残っているので、5回のセット1つに戻す */
function earlierWorkouts() {
  const first = demoWorkouts[0].performed_at.slice(0, 10)
  const byDay = new Map<string, { exercise_name: string; weight_kg: number; reps: number }[]>()
  for (const [key, name] of Object.entries(LIFT_EXERCISES)) {
    for (const point of landingStrengthSnapshot.lifts[key as keyof typeof LIFT_EXERCISES].e1rmPoints) {
      if (point.date >= first) continue
      // Brzycki（e1RM = 重量 × 36 ÷ (37 − 回数)）を5回で逆算し、0.5kgに丸める
      const weight = Math.round(point.e1rm * 32 / 36 * 2) / 2
      byDay.set(point.date, [...(byDay.get(point.date) ?? []), { exercise_name: name, weight_kg: weight, reps: 5 }])
    }
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sets]) => ({ workout_id: date, performed_at: `${date}T19:00:00+09:00`, sets }))
}

// 見本の「今日」より後の記録は出さない（未来の記録になるため）
const allWorkouts = [...earlierWorkouts(), ...demoWorkouts.map((w) => ({ workout_id: w.workout_id, performed_at: w.performed_at, sets: w.sets }))]
  .filter((w) => w.performed_at.slice(0, 10) <= DEMO_TODAY)
const names = [...new Set(allWorkouts.flatMap((w) => w.sets.map((s) => s.exercise_name)))]

export const DEMO_PROFILE = { id: DEMO_USER_ID, display_name: 'あなた', icon: 'muscle', created_at: '2024-12-01T00:00:00+09:00' }

export function demoTables(): Record<string, Row[]> {
  const exercises: Row[] = names.map((name) => ({
    id: exerciseId(name), name, name_normalized: name, muscle_group: GROUPS[name] ?? 'chest',
    is_preset: PRESETS.has(name), is_bodyweight: BODYWEIGHT.has(name), created_by: PRESETS.has(name) ? null : DEMO_USER_ID, created_at: '2024-12-01T00:00:00+09:00',
  }))
  const workouts: Row[] = allWorkouts.map((w) => ({
    id: `demo-w-${w.workout_id}`, user_id: DEMO_USER_ID, performed_at: w.performed_at, created_at: w.performed_at,
  }))
  const sets: Row[] = allWorkouts.flatMap((w) => w.sets.map((s, i) => {
    // セットは記録した順に1分ずつずらす（「最近の記録」の並びに使う）
    const at = new Date(Date.parse(w.performed_at) + i * 60_000).toISOString()
    return {
      id: `demo-s-${w.workout_id}-${i}`, workout_id: `demo-w-${w.workout_id}`, exercise_id: exerciseId(s.exercise_name),
      set_index: i, weight_kg: s.weight_kg, reps: s.reps, note: null, created_at: at,
    }
  }))
  return {
    profiles: [DEMO_PROFILE],
    community_profiles: [{ user_id: DEMO_USER_ID, display_name: 'あなた', icon: 'muscle', bio: '', global_ranking: true, dots_opt_in: true, dots_formula: null }],
    exercises,
    workouts,
    workout_sets: sets,
    bodyweight_logs: demoBodyLogs.filter((log) => log.recorded_on <= DEMO_TODAY).map((log) => ({ user_id: DEMO_USER_ID, ...log })),
    strength_goals: [{
      ...landingStrengthGoal, id: 'demo-goal', user_id: DEMO_USER_ID,
      // 種目別の目標と、目標を決めた時点（4月初め）の推定1RM。ホームの棒が進み具合を見せる
      target_squat_kg: 185, target_bench_kg: 130, target_deadlift_kg: 185,
      start_total_kg: 400, start_squat_kg: 150, start_bench_kg: 105, start_deadlift_kg: 145,
      created_at: '2026-04-01T00:00:00+09:00',
    }],
    big3_exercise_mappings: [],
    exercise_preferences: [],
    training_routines: [],
    feedback: [],
    admins: [],
  }
}

function big3Data(tables: Record<string, Row[]>) {
  const performed = new Map(tables.workouts.map((w) => [w.id, w.performed_at]))
  return {
    exercises: tables.exercises.map(({ id, name, name_normalized, is_preset }) => ({ id, name, name_normalized, is_preset })) as StrengthExercise[],
    mappings: [] as Big3ExerciseMapping[],
    sets: tables.workout_sets.map((s) => ({ exercise_id: s.exercise_id, weight_kg: s.weight_kg, reps: s.reps, performed_at: performed.get(s.workout_id) })) as StrengthSet[],
  }
}

/** 本番では関数が返す値。見本で使うものだけ答え、ほかは undefined（何もせずに成功したことにする） */
export function demoRpc(name: string, tables: Record<string, Row[]>): unknown {
  switch (name) {
    case 'my_big3_data': return big3Data(tables)
    case 'global_ranking':
    case 'community_ranking': {
      // 「あなた」のBIG3は、見本の記録から計算する（ホーム・BIG3の画面と同じ数字）
      const data = big3Data(tables)
      const lifts = buildStrengthSnapshot(data.exercises, data.mappings, data.sets).lifts
      const mine = { squat: lifts.squat.allTimeE1rm, bench: lifts.bench.allTimeE1rm, deadlift: lifts.deadlift.allTimeE1rm }
      const myTotal = Math.round(((mine.squat ?? 0) + (mine.bench ?? 0) + (mine.deadlift ?? 0)) * 10) / 10
      // 運営者本人の実際の記録とアイコン（2026-10-31に本番から読み取り、本人の許可済み）
      const owner = {
        user_id: 'demo-owner', display_name: 'Kohei', icon: 'photo:36910569-43bd-4f3e-b8d8-818b3ef8f710/2cadbde4-6005-47ed-8cac-c78a549ffed8.jpg', bio: '',
        total: 497.7, growth: 12.6, dots: 325.1, dots_opt_in: true, lifts: { squat: 185.8, bench: 102.9, deadlift: 209 }, points: [],
      }
      return [owner, ...demoMembers.map((m) => m.user_id === DEMO_ME
        ? { ...m, user_id: DEMO_USER_ID, icon: 'muscle', total: myTotal, lifts: mine }
        : { ...m, lifts: { squat: Math.round((m.total ?? 0) * 0.36), bench: Math.round((m.total ?? 0) * 0.25), deadlift: Math.round((m.total ?? 0) * 0.39) } })]
        .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    }
    // 招待コードで作った、自分たちだけのランキング（サンプル）
    case 'community_list': return [{ id: 'demo-community', name: 'いつものジム仲間', owner_id: 'demo-a', invite_code: null }]
    case 'announcements_seen_until': return new Date().toISOString()
    case 'health_sync_status': return { enabled: false, last_synced_at: null }
    case 'admin_unread_feedback_count': return 0
    default: return undefined
  }
}
