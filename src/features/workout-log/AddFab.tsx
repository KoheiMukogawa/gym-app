/** 一覧入力の右下の赤い＋。今日の記録（REC-03）では種目を、記録入力（REC-05）ではセットを足す（どちらも同じボタンID）。 */
export function AddFab({ label, onClick, disabled = false, aboveNavigation = false }: {
  label: string; onClick: () => void; disabled?: boolean
  /** 下のタブが出ている画面（REC-03）では、タブに隠れないようその上に置く */
  aboveNavigation?: boolean
}) {
  return <button type="button" data-button-key="add-list-row" aria-label={label} disabled={disabled} onClick={onClick}
    className={`fixed ${aboveNavigation ? 'bottom-[calc(5rem+max(0.25rem,env(safe-area-inset-bottom)-0.75rem))]' : 'bottom-[calc(1.5rem+env(safe-area-inset-bottom))]'} right-[max(1rem,calc(50%-21rem))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_6px_16px_rgba(0,0,0,0.35)] active:opacity-80 disabled:opacity-40`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
  </button>
}
