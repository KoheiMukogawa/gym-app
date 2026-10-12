import type { BodyweightLog } from '../../lib/bodyweight'
import type { FeedItem } from '../feed/queries'
import type { Member } from '../community/queries'

// The landing page phone shows the app as a member uses it. Workouts are that
// member's real record (with permission, no notes), read from production on
// 2026-10-12. Body composition and the other community members are made up.

/** The member's last training day stands in for "today" on the demo home screen. */
export const DEMO_TODAY = '2026-10-11'

const NAMES: Record<string, string> = { b: 'ベンチプレス', s: 'スクワット', d: 'デッドリフト' }
// day|exercise,kg,reps ... in the order the sets were done. One letter is a BIG3 lift.
const WORKOUTS = '2026-04-02|b,60,3 b,80,3 b,100,2 b,80,8;2026-04-08|b,60,3 b,80,3 b,90,6 b,95,8 b,85,11;2026-04-10|d,140,3;2026-04-12|b,60,3 b,80,7 b,90,5;2026-04-15|b,60,3 b,80,4 b,90,7 b,85,7;2026-04-17|s,60,5 s,100,3 s,120,5;2026-04-21|b,60,3 b,80,3 b,100,3 b,80,5 b,80,4;2026-04-25|b,60,3 b,80,3 b,100,4 b,100,3;2026-04-28|b,60,3 b,80,3 b,90,3 b,100,5 b,95,5;2026-04-30|s,60,5 s,100,3 s,120,3 s,140,2 s,150,1 s,135,3;2026-05-05|b,60,3 b,80,1 b,80,1 b,80,3;2026-05-07|b,60,3 b,80,2 b,90,2 b,100,5 b,110,2;2026-05-09|s,140,7 s,145,4;2026-05-12|b,95,8 b,100,6;2026-05-15|s,60,3 s,100,3 s,120,3 s,140,1;2026-05-17|d,40,10 b,90,3 d,55,10 b,100,6 b,107.5,4 b,120,1;2026-05-21|s,120,3 s,140,2 s,160,1 s,150,2 s,140,4;2026-05-22|d,120,4 d,135,10;2026-05-25|b,80,2 b,100,2 b,110,4 b,105,5;2026-05-28|s,120,3 s,140,2 s,160,1 s,145,3 s,140,3;2026-06-01|d,120,3 b,100,2 b,110,5 d,140,3 b,110,5 d,160,2 d,160,4;2026-06-05|s,100,1 s,120,1 s,150,1;2026-06-08|b,100,4 s,100,1 s,140,1 s,120,8 s,130,5;2026-06-11|d,110,3 b,60,3 b,80,4 d,140,1;2026-06-15|b,80,2 b,90,2;2026-06-17|b,110,4 d,90,3 b,120,2 d,120,3 d,140,3;2026-06-24|d,100,3 d,120,2 d,140,3;2026-07-07|s,140,2;2026-07-16|d,110,3 d,130,5 d,140,4 d,110,3;2026-07-24|s,120,8;2026-07-31|s,100,5;2026-08-20|b,100,3 b,110,3;2026-08-27|s,120,3 s,140,3 s,160,2 s,150,4;2026-09-07|b,60,3 b,80,3 b,100,2;2026-09-09|s,160,3 s,150,6;2026-09-28|d,150,6 b,100,4 s,140,1;2026-10-01|b,110,2 b,100,5;2026-10-05|b,100,3 b,110,2;2026-10-08|インクラインBプレス,80,5 ミリタリープレス,40,2 d,120,3 プーリーロウ,65,10 ワンハンドプリーチャー,16,10 インクラインBプレス,90,5 d,120,2 ワンハンドプリーチャー,16,10 インクラインBプレス,80,6;2026-10-11|テンポSQ,120,0 ポーズSQ,130,3 テンポSQ,120,4'

export const demoWorkouts: FeedItem[] = WORKOUTS.split(';').map((day) => {
  const [date, sets] = day.split('|')
  return {
    workout_id: date, user_id: 'demo', display_name: 'あなた', performed_at: `${date}T12:00:00+09:00`,
    sets: sets.split(' ').map((set) => {
      const [code, weight, reps] = set.split(',')
      const name = NAMES[code] ?? code
      return { exercise_id: name, exercise_name: name, weight_kg: Number(weight), reps: Number(reps) }
    }),
  }
})

// Ninety days of a made-up, slowly leaner body: about 73 → 71.5 kg and 18 → 16 %.
export const demoBodyLogs: BodyweightLog[] = Array.from({ length: 90 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 6, 14 + i)).toISOString().slice(0, 10)
  const wave = Math.sin(i * 1.7) * 0.35 + Math.sin(i * 0.45) * 0.25
  return { recorded_on: date, bodyweight_kg: Math.round((73 - i * 0.017 + wave) * 10) / 10, body_fat_pct: Math.round((18 - i * 0.022 + wave * 0.6) * 10) / 10 }
}).filter((_, i) => i % 7 !== 3 && i % 11 !== 5) // some days go unmeasured

const member = (id: string, name: string, icon: string, total: number, growth: number, dots: number): Member => ({
  user_id: id, display_name: name, icon, bio: '', total, growth, dots, dots_opt_in: true,
  lifts: { squat: null, bench: null, deadlift: null }, points: [],
})

// "あなた" carries the member's real BIG3 total; everyone else and the growth and DOTS columns are made up.
export const DEMO_ME = 'demo-me'
export const demoMembers: Member[] = [
  member('demo-a', 'たくみ', 'barbell', 512.5, 7.5, 351.2),
  member(DEMO_ME, 'あなた', 'bolt', 478, 12.5, 334.6),
  member('demo-b', 'さくら', 'target', 265, 15, 341.8),
  member('demo-c', 'けんた', 'initials', 445, 2.5, 312.9),
  member('demo-d', 'ゆうき', 'initials', 390, 5, 287.4),
]
