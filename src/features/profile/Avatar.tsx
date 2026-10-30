import { useId, useRef, type ChangeEvent } from 'react'
import { isPhoto, photoUrl } from './photo'

// 選べるアイコン。先頭の muscle が新規登録の初期値。'target'・'bolt' は選択肢から外したが、設定済みの人のために表示は残す
export const AVATARS = ['muscle', 'initials', 'barbell'] as const
const AVATAR_LABELS: Record<typeof AVATARS[number], string> = { muscle: '筋肉', initials: 'イニシャル', barbell: 'バーベル' }

/**
 * 初期アイコン。グレーの丸に、筋肉の凹凸が分かる上半身（首・僧帽筋・丸い肩・厚い胸・腹筋の上部）。
 * 明るさの違う色とグラデーションで陰影を付ける。同じ画面に何度も描くので、グラデーションのIDは描くたびに変える。
 */
function MuscleSilhouette() {
  const id = useId().replace(/:/g, '')
  const url = (name: string) => `url(#${id}-${name})`
  return <svg viewBox="0 0 80 80" className="h-full w-full">
    <defs>
      <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C9C9D2" /><stop offset="1" stopColor="#9C9CA7" /></linearGradient>
      <radialGradient id={`${id}-delt`} cx="0.4" cy="0.3" r="0.75"><stop offset="0" stopColor="#D8D8E0" /><stop offset="0.6" stopColor="#B2B2BC" /><stop offset="1" stopColor="#8A8A95" /></radialGradient>
      <linearGradient id={`${id}-pec`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D4D4DC" /><stop offset="0.7" stopColor="#B0B0BA" /><stop offset="1" stopColor="#8C8C97" /></linearGradient>
      <radialGradient id={`${id}-head`} cx="0.42" cy="0.35" r="0.7"><stop offset="0" stopColor="#D2D2DA" /><stop offset="1" stopColor="#A4A4AE" /></radialGradient>
    </defs>
    <rect width="80" height="80" fill="#4A4A52" />
    <path d="M0 80C0.5 64 5 52 15 46.5C21 43.5 27.5 41.5 32.5 38.5L47.5 38.5C52.5 41.5 59 43.5 65 46.5C75 52 79.5 64 80 80Z" fill={url('skin')} />
    <path d="M29 39.5Q40 35 51 39.5L61 46Q40 43 19 46Z" fill="#B8B8C2" />
    <path d="M32.5 31L47.5 31L49 41Q40 44 31 41Z" fill="#ACACB6" />
    <path d="M34 33L38.5 41.5M46 33L41.5 41.5" stroke="#8E8E99" strokeWidth="0.9" fill="none" strokeLinecap="round" />
    <ellipse cx="40" cy="33.5" rx="7.5" ry="2.6" fill="#85858F" opacity="0.7" />
    <ellipse cx="40" cy="22.5" rx="10.5" ry="11.5" fill={url('head')} />
    <ellipse cx="13.5" cy="57" rx="11" ry="14" transform="rotate(-18 13.5 57)" fill={url('delt')} />
    <ellipse cx="66.5" cy="57" rx="11" ry="14" transform="rotate(18 66.5 57)" fill={url('delt')} />
    <path d="M21 52C27 47.5 36 47.5 39.4 49.5L39.4 66.5C32.5 71 23.5 69.5 18.5 64C17 59.5 18 55 21 52Z" fill={url('pec')} />
    <path d="M59 52C53 47.5 44 47.5 40.6 49.5L40.6 66.5C47.5 71 56.5 69.5 61.5 64C63 59.5 62 55 59 52Z" fill={url('pec')} />
    <path d="M18.5 64C23.5 70 32.5 71.5 39.4 67M61.5 64C56.5 70 47.5 71.5 40.6 67" stroke="#6E6E79" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    <path d="M40 50V68M21.5 50.5Q17 57 18.5 64M58.5 50.5Q63 57 61.5 64" stroke="#7E7E89" strokeWidth="1" fill="none" strokeLinecap="round" />
    <path d="M33 70.5Q40 73 47 70.5L47.5 80H32.5Z" fill="#A2A2AD" />
    <path d="M40 69V80M33.5 74.6Q36.7 76 40 74.8Q43.3 76 46.5 74.6M33.8 79Q36.8 80 40 79.2Q43.2 80 46.2 79" stroke="#7A7A85" strokeWidth="0.9" fill="none" strokeLinecap="round" />
  </svg>
}

export function Avatar({ icon = 'muscle', name = '', size = 'h-10 w-10', src }: { icon?: string; name?: string; size?: string; /** 保存前の写真の見本 */ src?: string }) {
  const image = src ?? (isPhoto(icon) ? photoUrl(icon) : null)
  return <span className={`${size} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-fg`} aria-hidden="true">
    {image ? <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      : icon === 'muscle' ? <MuscleSilhouette />
      : icon === 'barbell' ? <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 7v10M8 5v14M16 5v14M19 7v10M8 12h8" /></svg>
      : icon === 'target' ? <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>
      : icon === 'bolt' ? <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m14 3-8 11h6l-2 7 8-11h-6z"/></svg>
      : <span className="text-sm font-semibold">{Array.from(name.trim())[0]?.toUpperCase() || 'G'}</span>}
  </span>
}

/** 用意したアイコンに加えて、写真を選べる。写真は保存するまで端末の中の見本（photoPreview）で見せる */
export function AvatarPicker({ value, onChange, name, disabled = false, photoPreview = null, onPickPhoto }: {
  value: string; onChange: (value: string) => void; name: string; disabled?: boolean
  photoPreview?: string | null; onPickPhoto?: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const photoSelected = photoPreview !== null || isPhoto(value)
  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onPickPhoto?.(file)
  }
  return <fieldset disabled={disabled}><legend className="mb-2 text-sm text-muted">アイコン</legend><div className="flex flex-wrap gap-3">
    {AVATARS.map((icon)=><button type="button" key={icon} aria-label={AVATAR_LABELS[icon]} aria-pressed={!photoSelected&&value===icon} onClick={()=>onChange(icon)} className={`flex h-14 w-14 items-center justify-center rounded-full ${!photoSelected&&value===icon?'ring-2 ring-accent':''}`}><Avatar icon={icon} name={name}/></button>)}
    {onPickPhoto && <button type="button" aria-label={photoSelected ? '写真を選び直す' : '写真を選ぶ'} aria-pressed={photoSelected} onClick={() => input.current?.click()}
      className={`flex h-14 w-14 items-center justify-center rounded-full ${photoSelected ? 'ring-2 ring-accent' : ''}`}>
      {photoSelected ? <Avatar icon={value} name={name} src={photoPreview ?? undefined} />
        : <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-muted text-muted">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
        </span>}
    </button>}
    <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} aria-hidden="true" tabIndex={-1} />
  </div></fieldset>
}
