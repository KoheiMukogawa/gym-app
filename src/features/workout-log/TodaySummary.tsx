import { SwipeRow } from '../../components/SwipeRow'
import { formatAddedLoad, totalLoad } from '../../lib/bodyweight'
import { setRm } from './setRm'
import type { LoggedSet } from './logReducer'

/** 一覧入力の今日の記録（REC-03）。種目のカードの見出しか＋を押すと、その種目の記録を開く。セットは左にスワイプで削除（ダイヤルの記録画面と同じ）。 */
export function TodaySummary({ sets, exerciseNames, bodyweightIds, bodyweight, onOpen, onDelete, deletingId }: {
  sets: LoggedSet[]
  exerciseNames: Record<string, string>
  bodyweightIds: string[]
  bodyweight: number | null
  onOpen: (exerciseId: string) => void
  onDelete: (setId: string) => Promise<void>
  deletingId: string | null
}) {
  const ids = [...new Set(sets.map((s) => s.exercise_id))]
  return <section aria-label="今日の記録" className="space-y-4 px-4 py-4">
    {ids.map((id) => {
      const own = sets.filter((s) => s.exercise_id === id).sort((a, b) => a.set_index - b.set_index)
      const bw = bodyweightIds.includes(id)
      const name = exerciseNames[id] ?? '種目'
      return <article key={id} className="overflow-hidden rounded-xl bg-surface">
        <button type="button" onClick={() => onOpen(id)} aria-label={`${name}の記録を開く`}
          className="flex min-h-[1.875rem] w-full items-center justify-between bg-accent px-4 py-1 text-left text-base font-semibold text-white active:opacity-80">
          {name}<span aria-hidden="true">›</span>
        </button>
        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_3rem_4rem] min-[360px]:grid-cols-[2rem_minmax(0,1fr)_3.5rem_4.75rem] gap-x-1.5 px-4 pt-0.5 min-[360px]:gap-x-2 text-xs text-muted">
          <span className="whitespace-nowrap">セット</span><span className="text-right">重さ</span><span className="text-right">回数</span><span className="text-right">RM</span>
        </div>
        <ol className="divide-y divide-border px-4 pb-1">
          {own.map((s, i) => {
            const rm = setRm(bw ? totalLoad(s.weight_kg, bodyweight) : s.weight_kg, s.reps)
            return <SwipeRow key={s.id} label={`${name} ${i + 1}セット目を削除`} disabled={deletingId !== null}
              deleting={deletingId === s.id} onDelete={() => onDelete(s.id)} compact>
              <div className="w-full">
                <div className="grid min-h-10 grid-cols-[1.5rem_minmax(0,1fr)_3rem_4rem] min-[360px]:grid-cols-[2rem_minmax(0,1fr)_3.5rem_4.75rem] items-center gap-x-1.5 tabular-nums min-[360px]:gap-x-2">
                  <span className="text-base">{i + 1}</span>
                  <span className="whitespace-nowrap text-right text-base font-semibold min-[360px]:text-lg">{bw ? formatAddedLoad(s.weight_kg) : <>{s.weight_kg.toFixed(1)}<span className="text-sm font-normal text-muted"> kg</span></>}</span>
                  <span className="whitespace-nowrap text-right text-base font-semibold min-[360px]:text-lg">{s.reps}<span className="text-sm font-normal text-muted"> 回</span></span>
                  <span className="whitespace-nowrap text-right text-xs min-[360px]:text-sm">{rm ? `${rm.value}kg` : '—'}</span>
                </div>
                {s.note && <p className="-mt-1 pb-1 text-center text-xs text-muted">{s.note}</p>}
              </div>
            </SwipeRow>
          })}
        </ol>
        <div className="flex justify-center border-t border-border">
          <button type="button" aria-label={`${name}にセットを追加`} onClick={() => onOpen(id)}
            className="flex h-9 w-11 items-center justify-center rounded-full text-muted active:bg-border">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-border text-base leading-none text-fg">＋</span>
          </button>
        </div>
      </article>
    })}
  </section>
}
