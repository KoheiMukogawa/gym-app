import type { ReactNode } from 'react'

/**
 * 各画面の見出し。上の余白と文字の大きさを画面ごとにそろえるため、見出しの行はいつも56pxの高さ
 * （右に再読み込みなどのボタンがあってもなくても、見出しの位置が変わらない）。説明文は children に入れる。
 */
export function PageHeader({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return <header>
    <div className="flex min-h-14 items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {action}
    </div>
    {children}
  </header>
}
