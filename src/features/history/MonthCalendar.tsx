const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

type Props = {
  year: number
  month: number // 1-12
  activeDates: string[] // YYYY-MM-DD
}

export function MonthCalendar({ year, month, activeDates }: Props) {
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const leading = first.getDay()
  const active = new Set(activeDates)

  const cells: (number | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 text-center text-xs text-muted">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <span key={`pad-${i}`} />
          const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isActive = active.has(key)
          return (
            <span
              key={key}
              aria-label={isActive ? `${month}月${day}日 トレーニングあり` : undefined}
              className={`flex aspect-square items-center justify-center rounded-lg text-sm tabular-nums ${
                isActive ? 'bg-accent font-semibold text-white' : 'text-muted'
              }`}
            >
              {day}
            </span>
          )
        })}
      </div>
    </div>
  )
}
