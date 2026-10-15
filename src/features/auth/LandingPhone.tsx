import { useMemo, useState, type MouseEvent } from 'react'
import { combineTrends } from '../../lib/bodyComposition'
import { localDate } from '../../lib/dates'
import { FAT_COLOR, WEIGHT_COLOR, BodyTrendChart } from '../body/BodyTrendChart'
import { MetricTabs } from '../community/RankingParts'
import { formatMetric, rankMembers, type RankMetric } from '../community/queries'
import { WorkoutCard } from '../feed/WorkoutCard'
import { WorkoutSetDetails } from '../feed/WorkoutSetDetails'
import { MonthCalendar } from '../history/MonthCalendar'
import { Big3Column } from '../home/HomePage'
import { Avatar } from '../profile/Avatar'
import { LiftCard } from '../strength/LiftCard'
import { StrengthScore } from '../strength/StrengthScore'
import { DEMO_ME, DEMO_TODAY, demoBodyLogs, demoMembers, demoWorkouts } from './landingDemoData'
import { landingStrengthGoal, landingStrengthSnapshot } from './landingStrengthSample'

export const PHONE_TABS = [
  { id: 'home', label: 'ホーム' }, { id: 'history', label: '履歴' }, { id: 'big3', label: 'BIG3' },
  { id: 'ranking', label: 'ランキング' }, { id: 'body', label: '体組成' },
] as const
export type PhoneTab = typeof PHONE_TABS[number]['id']

const dayOf = (iso: string) => localDate(iso)
const [todayYear, todayMonth] = DEMO_TODAY.split('-').map(Number)

function DemoHome() {
  const trained = demoWorkouts.filter((w) => dayOf(w.performed_at).startsWith(DEMO_TODAY.slice(0, 7))).map((w) => dayOf(w.performed_at))
  const today = demoWorkouts.filter((w) => dayOf(w.performed_at) === DEMO_TODAY)
  return <div className="flex flex-col gap-4 p-4">
    <div className="grid grid-cols-[3fr_2fr] gap-3">
      <section aria-label="今月のトレーニング">
        <h2 className="mb-2 text-xl font-semibold tabular-nums">{todayYear}年{todayMonth}月</h2>
        <MonthCalendar compact year={todayYear} month={todayMonth} activeDates={trained} selectedDate={DEMO_TODAY} maxDate={DEMO_TODAY} />
      </section>
      <section aria-label="BIG3" className="self-start">
        <h2 className="mb-2 text-xl font-semibold">BIG3</h2>
        <Big3Column snapshot={landingStrengthSnapshot} goal={landingStrengthGoal} />
      </section>
    </div>
    <section aria-label="今日のトレーニング" className="space-y-2">
      <h2 className="text-sm font-semibold">今日のトレーニング</h2>
      {today.map((item) => <WorkoutSetDetails key={item.workout_id} item={item} bodyweight={null} />)}
    </section>
  </div>
}

const FIRST_MONTH = demoWorkouts[0].performed_at.slice(0, 7)
function DemoHistory() {
  const [month, setMonth] = useState(DEMO_TODAY.slice(0, 7))
  const inMonth = demoWorkouts.filter((w) => dayOf(w.performed_at).startsWith(month))
  const [selected, setSelected] = useState(() => dayOf(inMonth[inMonth.length - 1].performed_at))
  const [year, number] = month.split('-').map(Number)
  const visible = demoWorkouts.filter((w) => dayOf(w.performed_at) === selected)
  function move(direction: number) {
    const next = new Date(Date.UTC(year, number - 1 + direction, 1)).toISOString().slice(0, 7)
    const days = demoWorkouts.map((w) => dayOf(w.performed_at)).filter((d) => d.startsWith(next))
    setMonth(next); setSelected(days[days.length - 1] ?? '')
  }
  return <div className="flex flex-col gap-6 p-4">
    <h1 className="text-2xl font-semibold">トレーニング履歴</h1>
    <div className="flex items-center justify-between">
      <button type="button" aria-label="前の月" disabled={month <= FIRST_MONTH} className="min-h-14 min-w-14 text-muted disabled:opacity-30" onClick={() => move(-1)}>←</button>
      <h2 className="text-sm text-muted">{year}年{number}月</h2>
      <button type="button" aria-label="次の月" disabled={month >= DEMO_TODAY.slice(0, 7)} className="min-h-14 min-w-14 text-muted disabled:opacity-30" onClick={() => move(1)}>→</button>
    </div>
    <MonthCalendar year={year} month={number} activeDates={inMonth.map((w) => dayOf(w.performed_at))} selectedDate={selected} maxDate={DEMO_TODAY} onSelect={setSelected} />
    <section className="flex flex-col gap-3">
      <h2 className="text-sm text-muted">{selected} の記録</h2>
      {visible.length ? visible.map((item) => <WorkoutCard key={item.workout_id} item={item} detailed />)
        : <p className="py-4 text-center text-sm text-muted">この日の記録はありません</p>}
    </section>
  </div>
}

function DemoBig3() {
  return <div className="flex flex-col gap-6 p-4">
    <h1 className="text-2xl font-bold">BIG3</h1>
    <StrengthScore snapshot={landingStrengthSnapshot} goal={landingStrengthGoal} />
    <section className="flex flex-col gap-3" aria-label="種目ごとの記録">
      <h2 className="text-sm font-semibold">種目ごとの記録</h2>
      {(['squat', 'bench', 'deadlift'] as const).map((key) => <LiftCard key={key} lift={landingStrengthSnapshot.lifts[key]} />)}
    </section>
  </div>
}

function DemoRanking() {
  const [metric, setMetric] = useState<RankMetric>('total')
  return <div className="flex flex-col gap-4 p-4">
    <h1 className="text-2xl font-semibold">ランキング</h1>
    <div className="flex gap-2" role="group" aria-label="ランキングの範囲">
      <span className="flex min-h-11 items-center rounded-full border border-border px-4 text-sm text-muted">全体</span>
      <span className="flex min-h-11 items-center rounded-full bg-fg px-4 text-sm font-semibold text-bg">いつものジム仲間</span>
    </div>
    <MetricTabs value={metric} onChange={setMetric} />
    <ol className="divide-y divide-border">{rankMembers(demoMembers, metric).map((m) => <li key={m.user_id} className={`flex min-h-20 items-center gap-3 px-2 ${m.user_id === DEMO_ME ? 'bg-surface' : ''}`}>
      <span className="w-6 text-sm text-muted">{m.rank ?? '—'}</span>
      <Avatar icon={m.icon} name={m.display_name} />
      <span className="min-w-0 flex-1 break-words text-sm">{m.display_name}{m.user_id === DEMO_ME && <span className="ml-2 text-xs text-muted">自分</span>}</span>
      <strong className="shrink-0 tabular-nums">{formatMetric(m[metric], metric)}</strong>
    </li>)}</ol>
    <p className="text-xs leading-relaxed text-muted">招待コードで仲間を招いて、自分たちだけのランキングを作れます。</p>
  </div>
}

function DemoBody() {
  const points = useMemo(() => combineTrends(demoBodyLogs), [])
  const latest = demoBodyLogs[demoBodyLogs.length - 1]
  return <div className="flex flex-col gap-4 p-4">
    <h1 className="text-2xl font-semibold">体組成</h1>
    <div className="grid grid-cols-2 gap-4">
      {[{ label: '体重', unit: 'kg', value: latest.bodyweight_kg, color: WEIGHT_COLOR }, { label: '体脂肪率', unit: '%', value: latest.body_fat_pct, color: FAT_COLOR }].map((v) =>
        <div key={v.label}><p className="flex items-center gap-1.5 text-xs text-muted"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />{v.label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{v.value}<span className="ml-1 text-sm font-normal text-muted">{v.unit}</span></p></div>)}
    </div>
    <BodyTrendChart points={points} showYear={false} onSelectDay={() => undefined} />
    <p className="text-xs leading-relaxed text-muted">iPhoneのヘルスケアとの連携は準備中です。</p>
  </div>
}

const SCREENS: Record<PhoneTab, () => React.JSX.Element> = { home: DemoHome, history: DemoHistory, big3: DemoBig3, ranking: DemoRanking, body: DemoBody }

/** The app as a member sees it, inside a phone. The bottom tabs work; links inside stay in the phone. */
export function LandingPhone({ tab, onTab }: { tab: PhoneTab; onTab: (tab: PhoneTab) => void }) {
  const Screen = SCREENS[tab]
  const [touched, setTouched] = useState(false)
  // Screens link to pages that need an account. Keep visitors here: exercise and BIG3 links open the BIG3 tab.
  function stayInPhone(event: MouseEvent) {
    const link = (event.target as HTMLElement).closest('a')
    if (!link) return
    event.preventDefault()
    const path = link.getAttribute('href') ?? ''
    if (path.startsWith('/big3') || path.startsWith('/exercises/')) onTab('big3')
  }
  return <div className="landing-phone">
    <div className="landing-phone-header" aria-hidden="true"><span>Glog</span><span className="landing-demo-avatar">G</span></div>
    <div key={tab} className="landing-phone-screen" role="region" aria-label={`${PHONE_TABS.find((t) => t.id === tab)!.label}の画面`} tabIndex={0} onClickCapture={stayInPhone}>
      <Screen />
    </div>
    <nav className="landing-phone-nav" aria-label="アプリの画面">
      {PHONE_TABS.map((t) => <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => { setTouched(true); onTab(t.id) }}>{t.label}</button>)}
      {!touched && <span className="landing-phone-hint" aria-hidden="true">タップして切り替え</span>}
    </nav>
  </div>
}
