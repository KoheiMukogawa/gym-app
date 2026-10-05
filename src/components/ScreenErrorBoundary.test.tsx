import { lazy, Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ScreenErrorBoundary } from './ScreenErrorBoundary'

afterEach(() => vi.restoreAllMocks())

it('shows recovery when a screen throws instead of removing the surrounding UI', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  function Broken(): never { throw new Error('render failed') }
  render(<><nav>ナビゲーション</nav><ScreenErrorBoundary><Broken /></ScreenErrorBoundary></>)
  expect(screen.getByRole('alert')).toHaveTextContent('画面を表示できませんでした')
  expect(screen.getByRole('button', { name: '再読み込み' })).toBeVisible()
  expect(screen.getByRole('navigation')).toBeVisible()
})

it('recovers a rejected lazy import and can display another screen', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const Broken = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')))
  const view = render(<ScreenErrorBoundary key="history"><Suspense fallback="読み込み中"><Broken /></Suspense></ScreenErrorBoundary>)
  expect(await screen.findByRole('alert')).toHaveTextContent('画面を表示できませんでした')
  view.rerender(<ScreenErrorBoundary key="home"><h1>ホーム</h1></ScreenErrorBoundary>)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'ホーム' })).toBeVisible()
})
