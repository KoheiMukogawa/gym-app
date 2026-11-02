import type { ReactNode } from 'react'

/**
 * 各画面の見出し。ホーム（HOME-01）の「◯年◯月」「BIG3」の見出しと上端がそろうよう、見出しの行は28pxの高さで
 * 画面の上の余白（p-4）の直後から始める。右のボタン（action）は押しやすい大きさのまま、上下にはみ出させて
 * 行の高さを変えない（ボタンがあってもなくても見出しの位置が変わらない）。説明文は children に入れる。
 */
export function PageHeader({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return <header>
    <div className="flex min-h-7 items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold leading-7">{title}</h1>
      {action && <div className="-my-3.5 shrink-0">{action}</div>}
    </div>
    {children}
  </header>
}
