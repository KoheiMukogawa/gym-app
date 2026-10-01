const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

type Props = {
  year: number
  month: number // 1-12
  activeDates: string[] // YYYY-MM-DD
  selectedDate?: string
  onSelect?: (date: string) => void
  maxDate?: string
  /** ホーム用の小さい表示 */
  compact?: boolean
}

export function MonthCalendar({ year, month, activeDates, selectedDate, onSelect, maxDate, compact = false }: Props) {
  // ホームでは小さな丸いマスにする（トレーニングした日は塗りつぶし）
  const cell = compact ? 'aspect-square text-[11px] rounded-full' : 'aspect-square text-sm rounded-lg'
  const selectedRing = compact ? 'ring-1 ring-fg' : 'ring-2 ring-accent ring-offset-2 ring-offset-bg'
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
      <div className={`grid grid-cols-7 text-center text-muted ${compact ? 'mb-1 text-[10px]' : 'mb-2 text-xs'}`}>
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className={`grid grid-cols-7 ${compact ? 'gap-0.5' : 'gap-1'}`}>
        {cells.map((day, i) => {
          if (day === null) return <span key={`pad-${i}`} />
          const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isActive = active.has(key)
          if (onSelect) return <button key={key} type="button"
            aria-label={`${month}月${day}日${isActive ? ' トレーニングあり' : ''}`}
            aria-pressed={selectedDate === key} disabled={!!maxDate && key > maxDate}
            onClick={() => onSelect(key)}
            className={`flex ${cell} items-center justify-center tabular-nums disabled:opacity-30 ${selectedDate === key ? selectedRing : ''} ${isActive ? 'bg-accent font-semibold text-white' : 'text-muted'}`}>{day}</button>
          return (
            <span
              key={key}
              aria-label={isActive ? `${month}月${day}日 トレーニングあり` : undefined}
              className={`flex ${cell} items-center justify-center tabular-nums ${
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
