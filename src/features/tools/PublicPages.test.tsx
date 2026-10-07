import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAnalyticsSink } from '../../lib/analytics'
import { percentageTable } from './oneRepMaxTable'
import { PUBLIC_PAGES, structuredData } from './pages'
import { parseNumber } from './PublicLayout'
import { PublicPageContent } from './PublicPages'
import vercelJson from '../../../vercel.json?raw'

function open(path: string, signedIn = false) {
  return render(<MemoryRouter initialEntries={[path]}><PublicPageContent path={path} signedIn={signedIn} /></MemoryRouter>)
}

describe('public calculators', () => {
  beforeEach(() => localStorage.clear())

  it('estimates 1RM with the app formula, shows the table, and counts the first result once', async () => {
    const sink = vi.fn()
    setAnalyticsSink(sink)
    open('/calculators/1rm')
    await userEvent.type(screen.getByLabelText('重量'), '80')
    await userEvent.type(screen.getByLabelText('回数'), '8')
    expect(screen.getByText('推定1RM').nextSibling).toHaveTextContent('99.3kg')
    expect(screen.getByRole('table', { name: '推定1RMに対する重量と回数の目安' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('体重（任意）'), '70')
    expect(screen.getByText('体重比').nextSibling).toHaveTextContent('1.42倍')
    expect(screen.getByRole('link', { name: '無料でGlogに記録する' })).toHaveAttribute('href', '/signup?from=calc-1rm')
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith({ name: 'calculator_used', calculator: '1rm' })
    expect(JSON.parse(localStorage.getItem('glog:first-touch')!)).toMatchObject({ source: 'calc-1rm' })
    setAnalyticsSink(null)
  })

  it('refuses more than 10 reps instead of guessing', async () => {
    open('/calculators/1rm')
    await userEvent.type(screen.getByLabelText('重量'), '60')
    await userEvent.type(screen.getByLabelText('回数'), '15')
    expect(screen.getByRole('alert')).toHaveTextContent('11回以上')
    expect(screen.queryByText('推定1RM')).not.toBeInTheDocument()
  })

  it('computes DOTS with the chosen coefficients and sends signed-in people to logging', async () => {
    open('/calculators/dots', true)
    await userEvent.type(screen.getByLabelText('体重'), '80')
    await userEvent.type(screen.getByLabelText('BIG3トータル'), '500')
    expect(screen.getByText('DOTS', { selector: 'dt' }).nextSibling).toHaveTextContent('344.8')
    expect(screen.getByText('目安', { selector: 'dt' }).nextSibling).toHaveTextContent('中級')
    await userEvent.click(screen.getByLabelText('女性用'))
    expect(screen.getByText('DOTS', { selector: 'dt' }).nextSibling).not.toHaveTextContent('344.8')
    expect(screen.getByRole('link', { name: '記録する' })).toHaveAttribute('href', '/log')
  })

  it('lists every tool on the index page', () => {
    open('/calculators')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('筋トレ計算ツール')
    for (const page of PUBLIC_PAGES.filter((p) => p.tool)) {
      expect(screen.getAllByRole('link', { name: new RegExp(page.tool!.name) }).length).toBeGreaterThan(0)
    }
  })
})

describe('public page data', () => {
  it('accepts full-width digits and decimal commas', () => {
    expect(parseNumber('８０，５')).toBe(80.5)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
  })

  it('derives reps from the same formula and stops above 10 reps', () => {
    const rows = percentageTable(100)
    expect(rows[0]).toEqual({ percent: 100, weightKg: 100, reps: 1 })
    expect(rows.find((r) => r.percent === 80)?.reps).toBe(8)
    expect(rows.find((r) => r.percent === 60)?.reps).toBeNull()
  })

  it('describes only visible content: FAQ data exists only where the page shows a FAQ', () => {
    for (const page of PUBLIC_PAGES) {
      const types = structuredData(page).map((d) => (d as { '@type': string })['@type'])
      expect(types).toContain('BreadcrumbList')
      expect(types.includes('FAQPage')).toBe(Boolean(page.faq))
      expect(types.includes('WebApplication')).toBe(Boolean(page.tool))
    }
  })

  it('has a Vercel rewrite for every page, ahead of the SPA catch-all', () => {
    const { rewrites } = JSON.parse(vercelJson) as { rewrites: { source: string; destination: string }[] }
    const catchAll = rewrites.findIndex((r) => r.source === '/(.*)')
    for (const page of PUBLIC_PAGES) {
      const index = rewrites.findIndex((r) => r.source === page.path && r.destination === `${page.path}.html`)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(catchAll)
    }
  })
})
