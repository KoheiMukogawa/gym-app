import { setRm } from './setRm'

export function SetRmLabel({ load, reps }: { load: number | null; reps: number }) {
  const rm = setRm(load, reps)
  return <span className="block text-right text-xs text-muted tabular-nums">
    <span className="block">推定1RM {rm?.value ?? '—'}</span>
    {rm?.reference && <span className="block text-[10px]">参考値</span>}
    {!rm && <span className="block text-[10px]">{reps > 30 ? '30回までが対象' : reps < 1 ? '0回は対象外' : load === null ? '体重未設定' : '重量が対象外'}</span>}
  </span>
}
