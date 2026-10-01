export const AVATARS = ['initials', 'barbell', 'target', 'bolt'] as const
export function Avatar({ icon = 'initials', name = '', size = 'h-10 w-10' }: { icon?: string; name?: string; size?: string }) {
  return <span className={`${size} inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-surface text-fg`} aria-hidden="true">
    {icon === 'barbell' ? <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 7v10M8 5v14M16 5v14M19 7v10M8 12h8" /></svg>
      : icon === 'target' ? <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>
      : icon === 'bolt' ? <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m14 3-8 11h6l-2 7 8-11h-6z"/></svg>
      : <span className="text-sm font-semibold">{Array.from(name.trim())[0]?.toUpperCase() || 'G'}</span>}
  </span>
}
export function AvatarPicker({ value, onChange, name, disabled = false }: { value: string; onChange: (value: string) => void; name: string; disabled?: boolean }) {
  return <fieldset disabled={disabled}><legend className="mb-2 text-sm text-muted">アイコン</legend><div className="flex gap-3">{AVATARS.map((icon,index)=><button type="button" key={icon} aria-label={['イニシャル','バーベル','ターゲット','稲妻'][index]} aria-pressed={value===icon} onClick={()=>onChange(icon)} className={`flex h-14 w-14 items-center justify-center rounded-full ${value===icon?'ring-2 ring-accent':''}`}><Avatar icon={icon} name={name}/></button>)}</div></fieldset>
}
