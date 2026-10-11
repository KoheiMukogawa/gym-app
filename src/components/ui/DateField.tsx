type DateFieldProps = { label: string; value: string; max: string; disabled: boolean; onChange: (value: string) => void }

export function DateField({ label, value, max, disabled, onChange }: DateFieldProps) {
  const [year, month, day] = value.split('-')
  const display = value ? `${year}/${Number(month)}/${Number(day)}` : '日付を選択'
  return <label className="flex min-w-0 flex-col gap-2 text-sm text-muted">
    <span>{label}</span>
    <span className={`relative flex min-h-[58px] min-w-0 w-full items-center justify-between gap-2 overflow-hidden rounded-xl border border-border bg-surface px-3 text-base text-fg focus-within:outline-2 focus-within:outline-accent ${disabled ? 'opacity-40' : ''}`}>
      <span aria-hidden="true" className="min-w-0 truncate tabular-nums">{display}</span>
      <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" />
      </svg>
      {/* Keep the native picker over the entire control; its locale-specific text
          stays invisible so the displayed Gregorian date is consistent on iOS. */}
      <input type="date" aria-label={label} lang="ja-JP" value={value} max={max} disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full min-w-0 w-full max-w-full cursor-pointer appearance-none opacity-0" />
    </span>
  </label>
}

